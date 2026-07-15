import { registry } from "../agent/fixture.js";
import type { Finding, Ledger, RetrievalRef } from "../agent/index.js";
import type { Version } from "../registry/index.js";
import { atVersion } from "../retrieval/index.js";

/**
 * Evidence to check findings against, for 05's tests.
 *
 * The registry is 04's, deliberately: 05 gates what 04 produced, so the two must be
 * talking about the same design system — a second registry here would let 05's tests pass
 * against facts the agent could never have retrieved. This module adds only the missing
 * half, which is the *ledger* — the retrievals a run actually ran.
 *
 * Nothing here fakes a `Resolution`. Every one comes through 02, so the evidence a check
 * sees is the same shape the loop would have recorded; a hand-written one would be a
 * second opinion about what 02 says, free to drift from the first — the same reason
 * `executeTool` hands 02's answer to the model untouched.
 */

/**
 * Unless a test says otherwise, lookups run as of 4.0 — the version the planted cases
 * turn on: Modal is deprecated there, Dialog is the replacement that arrived there, and
 * the slate pair is ordinary and active. Modal is `removed` only at 6.0, which is why the
 * coherence tests name a version and the rest do not.
 */
export const DEFAULT_VERSION = "4.0";

/**
 * Record a retrieval that really ran, in the order `executeTool` does it: the lookup
 * first, the ref minted from its result. Each hands back the ref the ledger minted, so a
 * test cites what it retrieved rather than guessing that it got `r1`.
 */
export function component(
  ledger: Ledger,
  id: string,
  version: Version = DEFAULT_VERSION,
): RetrievalRef {
  return ledger.record(
    "get_component",
    { id, version },
    atVersion(registry, version).component(id),
  );
}

export function token(
  ledger: Ledger,
  id: string,
  version: Version = DEFAULT_VERSION,
): RetrievalRef {
  return ledger.record(
    "get_token",
    { id, version },
    atVersion(registry, version).token(id),
  );
}

/** The sweep: no id, and an answer about many entries at once. */
export function sweep(
  ledger: Ledger,
  version: Version = DEFAULT_VERSION,
): RetrievalRef {
  return ledger.record(
    "list_deprecated",
    { version },
    atVersion(registry, version).listDeprecated(),
  );
}

/**
 * A well-grounded finding, so each test can spoil exactly one thing about it.
 *
 * Built here rather than taken from a real run: a check is a function of a finding and
 * the evidence, and driving the model to *produce* a malformed finding would test 04's
 * loop on the way to testing 05's check. The loop already has its own tests for that.
 */
export function finding(over: Partial<Finding> = {}): Finding {
  return {
    target: "<Modal> at line 1",
    outcome: "violation",
    groundedIn: ["r1"],
    rationale: "Modal is deprecated as of 4.0; nothing marks this as legacy.",
    ...over,
  };
}
