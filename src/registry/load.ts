import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Lifecycle, Registry } from "./schema.js";
import { registrySchema } from "./schema.js";

/** Raised when data is shaped correctly but violates an invariant the registry guarantees. */
export class RegistryInvariantError extends Error {
  constructor(violations: string[]) {
    super(`Registry is invalid:\n${violations.map((v) => `  - ${v}`).join("\n")}`);
    this.name = "RegistryInvariantError";
  }
}

/** Every lifecycle in the registry, tagged with a label naming where it came from. */
function lifecycles(registry: Registry): { where: string; lifecycle: Lifecycle }[] {
  return [
    ...registry.components.flatMap((component) => [
      { where: component.id, lifecycle: component.lifecycle },
      ...(component.variants ?? []).map((variant) => ({
        where: `${component.id} variant ${variant.name}`,
        lifecycle: variant.lifecycle,
      })),
    ]),
    ...registry.tokens.map((token) => ({
      where: token.id,
      lifecycle: token.lifecycle,
    })),
  ];
}

/** Invariant 5 — every version reference is a member of meta.versions. */
function checkKnownVersions(registry: Registry): string[] {
  const known = new Set(registry.meta.versions);
  const fields = ["addedIn", "deprecatedIn", "removedIn"] as const;

  return lifecycles(registry).flatMap(({ where, lifecycle }) =>
    fields
      .map((field) => ({ field, version: lifecycle[field] }))
      .filter(({ version }) => version !== undefined && !known.has(version))
      .map(
        ({ field, version }) =>
          `${where}: ${field} "${version}" is not a version in meta.versions`,
      ),
  );
}

/** Invariant 4 — a token carries exactly one of `value` or `alias`. */
function checkTokenValueXorAlias(registry: Registry): string[] {
  return registry.tokens
    .filter((token) => (token.value === undefined) === (token.alias === undefined))
    .map(
      (token) =>
        `${token.id}: a token must carry exactly one of "value" or "alias", not ${
          token.value === undefined ? "neither" : "both"
        }`,
    );
}

/**
 * Invariant 2 — `deprecatedIn` implies `replacedBy`. A deprecation always points
 * somewhere; that is what lets the agent say "use X instead".
 */
function checkReplacementOnDeprecation(registry: Registry): string[] {
  return lifecycles(registry)
    .filter(
      ({ lifecycle }) =>
        lifecycle.deprecatedIn !== undefined && lifecycle.replacedBy === undefined,
    )
    .map(
      ({ where, lifecycle }) =>
        `${where}: deprecated in "${lifecycle.deprecatedIn}" but names no "replacedBy"`,
    );
}

/**
 * Invariant 3 — where both exist, `addedIn <= deprecatedIn <= removedIn` by version
 * order. Ordering is the index in `meta.versions`; comparison logic proper is Work
 * Item 02's, this only rejects a timeline that runs backwards.
 */
function checkOrderedLifecycle(registry: Registry): string[] {
  const orderOf = (version: string) => registry.meta.versions.indexOf(version);
  const pairs = [
    ["addedIn", "deprecatedIn"],
    ["deprecatedIn", "removedIn"],
    ["addedIn", "removedIn"],
  ] as const;

  return lifecycles(registry).flatMap(({ where, lifecycle }) =>
    pairs
      .map(([earlier, later]) => ({
        earlier,
        later,
        from: lifecycle[earlier],
        to: lifecycle[later],
      }))
      // Unknown versions have no position to compare, and checkKnownVersions
      // already reports them. Staying quiet here keeps that error unclouded.
      .filter(
        ({ from, to }) =>
          from !== undefined &&
          to !== undefined &&
          orderOf(from) !== -1 &&
          orderOf(to) !== -1 &&
          orderOf(from) > orderOf(to),
      )
      .map(
        ({ earlier, later, from, to }) =>
          `${where}: ${earlier} "${from}" is after ${later} "${to}"`,
      ),
  );
}

/**
 * Invariant 1 — every `Ref` resolves, in the scope of whatever owns it. A
 * component's or token's `replacedBy`, and a token's `alias`, resolve against entry
 * ids. A variant's `replacedBy` resolves against its own component's variant names:
 * a variant is not a top-level entry and has no id, and no consumer ever resolves a
 * variant ref without the component already in hand.
 */
function checkReferentialIntegrity(registry: Registry): string[] {
  const entryIds = new Set([
    ...registry.components.map((component) => component.id),
    ...registry.tokens.map((token) => token.id),
  ]);

  const danglingEntryRefs = [
    ...registry.components.map((component) => ({
      where: component.id,
      field: "replacedBy",
      ref: component.lifecycle.replacedBy,
    })),
    ...registry.tokens.flatMap((token) => [
      { where: token.id, field: "replacedBy", ref: token.lifecycle.replacedBy },
      { where: token.id, field: "alias", ref: token.alias },
    ]),
  ]
    .filter(({ ref }) => ref !== undefined && !entryIds.has(ref))
    .map(({ where, field, ref }) => `${where}: ${field} "${ref}" matches no entry id`);

  const danglingVariantRefs = registry.components.flatMap((component) => {
    const siblingNames = new Set(
      (component.variants ?? []).map((variant) => variant.name),
    );

    return (component.variants ?? [])
      .filter(
        (variant) =>
          variant.lifecycle.replacedBy !== undefined &&
          !siblingNames.has(variant.lifecycle.replacedBy),
      )
      .map(
        (variant) =>
          `${component.id} variant ${variant.name}: replacedBy "${variant.lifecycle.replacedBy}" matches no variant of ${component.id}`,
      );
  });

  return [...danglingEntryRefs, ...danglingVariantRefs];
}

/**
 * Invariant 6 — the alias graph is acyclic. Not one of the design's original five:
 * Work Item 02 walks alias chains and states that a cycle is "a load-time invariant
 * violation surfaced by 01, not a runtime concern here". This is 01 holding up that
 * end. Note a cycle passes referential integrity untouched — every ref in one
 * resolves — so it needs its own check.
 */
function checkAcyclicAliases(registry: Registry): string[] {
  const aliasOf = new Map<string, string>();
  for (const token of registry.tokens) {
    if (token.alias !== undefined) aliasOf.set(token.id, token.alias);
  }

  const cycles = new Set<string>();

  for (const start of aliasOf.keys()) {
    const seen: string[] = [];
    let at: string | undefined = start;

    while (at !== undefined) {
      if (seen.includes(at)) {
        // Name the cycle by its members, sorted, so each distinct cycle is
        // reported once however many of its nodes we happen to enter it from.
        const loop = seen.slice(seen.indexOf(at));
        cycles.add([...loop].sort().join(" -> "));
        break;
      }
      seen.push(at);
      at = aliasOf.get(at);
    }
  }

  return [...cycles].map((cycle) => `alias cycle between: ${cycle}`);
}

/**
 * Validate assembled registry data: shape first, then the invariants the layer
 * guarantees. Throws rather than returning a result — malformed lifecycle
 * metadata must fail loudly and early, not resolve to something misleading.
 */
export function parseRegistry(raw: unknown): Registry {
  const registry = registrySchema.parse(raw);
  const violations = [
    ...checkKnownVersions(registry),
    ...checkTokenValueXorAlias(registry),
    ...checkReplacementOnDeprecation(registry),
    ...checkOrderedLifecycle(registry),
    ...checkReferentialIntegrity(registry),
    ...checkAcyclicAliases(registry),
  ];

  if (violations.length > 0) throw new RegistryInvariantError(violations);

  return registry;
}

function readData(file: string): unknown {
  const path = fileURLToPath(new URL(`data/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * The layer's single surface: read the three data files, reassemble them into one
 * registry, validate it, return it typed.
 *
 * The three-file split mirrors the real seam — tokens are exported from design,
 * components published from engineering, often as separate packages — and maps onto
 * 03's two MCP tools. Reassembly is this function's job so that no consumer ever
 * sees the split.
 */
export function loadRegistry(): Registry {
  return parseRegistry({
    meta: readData("meta.json"),
    components: readData("components.json"),
    tokens: readData("tokens.json"),
  });
}
