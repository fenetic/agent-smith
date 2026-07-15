import type { Registry, TokenEntry, Version } from "../registry/index.js";
import type { LifecycleStatus } from "./status.js";
import { statusAt } from "./status.js";

/**
 * How bad each status is. A chain is reported at its worst node, so these need an
 * order: `active` is the only status that adds nothing, and `not-yet-added` sits
 * alongside `removed` at the top — both mean there is no value to read at `asOf`,
 * differing only in which side of the entry's life `asOf` falls on.
 */
const severity: Record<LifecycleStatus, number> = {
  active: 0,
  deprecated: 1,
  removed: 2,
  "not-yet-added": 2,
};

/** One node of an alias chain, paired with how it stands at `asOf`. */
export interface AliasNode {
  entry: TokenEntry;
  status: LifecycleStatus;
}

/**
 * Walk `token`'s alias edges, returning every node from the head to the concrete
 * value, each tagged with its status at `asOf`.
 *
 * 01 guarantees the walk terminates and never dangles: every alias points at a real
 * id (invariant 1), the alias graph is acyclic (invariant 6), and a token carries
 * exactly one of `value` or `alias` (invariant 4). So the only way a chain fails
 * here is temporal — a node not yet added, or already removed — never structural.
 */
export function walkAliases(
  registry: Registry,
  token: TokenEntry,
  asOf: Version,
): AliasNode[] {
  const chain: AliasNode[] = [];
  let at: TokenEntry | undefined = token;

  while (at !== undefined) {
    chain.push({ entry: at, status: statusAt(registry.meta, at.lifecycle, asOf) });

    const next: string | undefined = at.alias;
    at = next === undefined ? undefined : registry.tokens.find(({ id }) => id === next);
  }

  return chain;
}

/**
 * The node a chain must be reported as: the most severe, earliest-wins on a tie.
 *
 * Earliest-wins is what keeps the answer aimed at the caller. When the token you
 * asked for is itself deprecated, its own deprecation is the one you need to act
 * on — being told about some downstream node's replacement instead would send you
 * to fix the wrong thing.
 */
export function worstNode(chain: AliasNode[]): AliasNode {
  return chain.reduce((worst, node) =>
    severity[node.status] > severity[worst.status] ? node : worst,
  );
}
