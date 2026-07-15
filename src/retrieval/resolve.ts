import type {
  ComponentEntry,
  Lifecycle,
  Meta,
  Registry,
  TokenEntry,
  Version,
} from "../registry/index.js";
import { walkAliases, worstNode } from "./alias.js";
import { statusAt } from "./status.js";
import type { Resolution } from "./types.js";
import { isKnownVersion } from "./version.js";

/**
 * A lookup surface with a version already committed to. Every question asked of it
 * is answered as of `asOf`; there is no way to ask one without.
 */
export interface Resolver {
  readonly asOf: Version;
  component(id: string): Resolution<ComponentEntry>;
  token(id: string): Resolution<TokenEntry>;
  listDeprecated(): Resolution<ComponentEntry | TokenEntry>[];
}

/** An entry the registry knows: an id, and the timeline that gives it a status. */
interface Entry {
  id: string;
  lifecycle: Lifecycle;
}

/**
 * Report `entry`'s standing at `asOf`, taking the status and the lifecycle facts
 * behind it from `source`. The union's shape does the enforcing — `removed` has
 * nowhere to put an entry, so a stale value cannot leak out even by mistake.
 *
 * The two are the same entry for anything unaliased. They part company on an alias
 * chain, where `source` is the worst node found along it: the answer is *about* the
 * entry the caller named, but the facts explaining it — deprecated when, replaced by
 * what — belong to whichever node is actually in trouble.
 */
function resolveEntry<T extends Entry>(
  meta: Meta,
  entry: T,
  asOf: Version,
  source: T = entry,
  via?: T[],
): Resolution<T> {
  const { deprecatedIn, removedIn, replacedBy } = source.lifecycle;
  const status = statusAt(meta, source.lifecycle, asOf);
  const chain = via !== undefined && via.length > 0 ? { via } : {};

  if (status === "not-yet-added") {
    return { status: "unknown", asOf, id: entry.id, reason: "not-yet-added" };
  }

  if (status === "active") return { status: "active", asOf, entry, ...chain };

  if (
    status === "deprecated" &&
    deprecatedIn !== undefined &&
    replacedBy !== undefined
  ) {
    return {
      status: "deprecated",
      asOf,
      entry,
      ...chain,
      deprecatedIn,
      replacedBy,
      ...(removedIn !== undefined && { removedIn }),
    };
  }

  if (status === "removed" && removedIn !== undefined) {
    return {
      status: "removed",
      asOf,
      id: entry.id,
      removedIn,
      ...(replacedBy !== undefined && { replacedBy }),
    };
  }

  // Unreachable via `statusAt`, which only reports `deprecated`/`removed` off the
  // very fields narrowed above — plus 01's invariant 2, which guarantees a
  // deprecation names a replacement. Rather than assert that with a cast, we let
  // the compiler hold us to it and fail loudly if the data ever escapes 01's
  // guarantees: an incoherent timeline must not resolve to a confident answer.
  throw new Error(
    `${source.id} is "${status}" at ${asOf} but its lifecycle does not say when or to what`,
  );
}

/**
 * Find `id` among `entries` and report its standing at `asOf`. An id no entry
 * claims is `unrecognized-id` — the registry's answer to a typo or a hallucinated
 * name, and a different fact from an entry that simply hasn't been added yet.
 *
 * Components and tokens are looked up in their own collection and nowhere else, so
 * the two namespaces cannot bleed into one another.
 */
function lookup<T extends Entry>(
  entries: readonly T[],
  id: string,
  asOf: Version,
  resolve: (entry: T) => Resolution<T>,
): Resolution<T> {
  const entry = entries.find((candidate) => candidate.id === id);

  return entry === undefined
    ? { status: "unknown", asOf, id, reason: "unrecognized-id" }
    : resolve(entry);
}

/**
 * Resolve a token through however many alias edges separate it from a real value,
 * reporting the chain at its worst node.
 *
 * This is what stops a stale alias passing as current: `brand.primary` points at a
 * live colour, so reporting the *target's* status would read "active" and be
 * confidently wrong. Severity travels in the other direction — from whichever node
 * is in the most trouble, back to the answer — so a chain is only ever as sound as
 * its most-broken link. When that link has no value to give, `resolveEntry` returns
 * a variant with nowhere to put one, and the chain collapses with it.
 */
function resolveToken(
  registry: Registry,
  token: TokenEntry,
  asOf: Version,
): Resolution<TokenEntry> {
  const chain = walkAliases(registry, token, asOf);
  const worst = worstNode(chain);

  // The head is what was asked for, not a hop taken to answer it.
  const via = chain.slice(1).map((node) => node.entry);

  return resolveEntry(registry.meta, token, asOf, worst.entry, via);
}

/**
 * Bind a resolver to a point in the registry's history. This is the only entry
 * point into retrieval, which is what makes "no lookup without a version"
 * structural rather than a rule to remember — a caller has nothing to call until
 * they have named a version.
 *
 * Throws on a version the registry never released. That is a malformed question,
 * not a fact about the data, and `unknown` is reserved for the latter: answering a
 * bad version with `unknown` would let a typo read as "this doesn't exist yet".
 */
export function atVersion(registry: Registry, asOf: string): Resolver {
  if (!isKnownVersion(registry.meta, asOf)) {
    throw new RangeError(
      `"${asOf}" is not a version of ${registry.meta.name}. Known versions: ${registry.meta.versions.join(", ")}`,
    );
  }

  // One path per kind, named once and used by both the direct lookups and the
  // listing. Asking the same question two ways cannot give two answers if there is
  // only one thing to call — a listing built off lifecycles instead would miss a
  // healthy token whose alias chain is deprecated, and disagree with `token()`.
  const resolveComponent = (entry: ComponentEntry) =>
    resolveEntry(registry.meta, entry, asOf);
  const resolveTokenEntry = (entry: TokenEntry) => resolveToken(registry, entry, asOf);

  return {
    asOf,

    component: (id) => lookup(registry.components, id, asOf, resolveComponent),

    token: (id) => lookup(registry.tokens, id, asOf, resolveTokenEntry),

    listDeprecated: () => {
      const everything: Resolution<ComponentEntry | TokenEntry>[] = [
        ...registry.components.map(resolveComponent),
        ...registry.tokens.map(resolveTokenEntry),
      ];

      return everything.filter((resolution) => resolution.status === "deprecated");
    },
  };
}
