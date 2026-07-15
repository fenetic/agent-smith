import type { Lifecycle, Meta, Version } from "../registry/index.js";
import { compareVersions } from "./version.js";

/**
 * Where an entry stands at some version. `not-yet-added` is one of the two things
 * 02 reports as `unknown` — the other, an unrecognised id, isn't a lifecycle
 * question and is settled by the resolver.
 */
export type LifecycleStatus = "not-yet-added" | "active" | "deprecated" | "removed";

/**
 * An entry's status at `asOf`, from its timeline alone. Pure: a `Lifecycle` plus a
 * version in, one status out.
 *
 * Boundaries are inclusive at both ends — an entry deprecated in 4.0 is deprecated
 * *at* 4.0, not from 5.0 — so each test is "has this version arrived yet", read
 * latest-first.
 */
export function statusAt(
  meta: Meta,
  lifecycle: Lifecycle,
  asOf: Version,
): LifecycleStatus {
  const reached = (version: Version | undefined) =>
    version !== undefined && compareVersions(meta, asOf, version) >= 0;

  if (reached(lifecycle.removedIn)) return "removed";
  if (reached(lifecycle.deprecatedIn)) return "deprecated";
  if (reached(lifecycle.addedIn)) return "active";

  return "not-yet-added";
}
