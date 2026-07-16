import { describe, expect, it } from "vitest";
import { loadRegistry } from "../registry/index.js";
import { atVersion } from "../retrieval/index.js";
import { code, version } from "./snippet.js";

/**
 * Pins the planted demo file against the range the demo claims to walk.
 *
 * The demo runs a model, so its verdicts cannot be asserted here — that is 04's integration
 * test and 07's job. What *can* be pinned, offline, is that the input is well-formed: it
 * audits a real version, and it actually contains each usage the walk-through points at. If
 * a fragment were dropped, the trace would simply be missing that beat and nothing else
 * would notice — the same gap `eval/cases/index.test.ts` closes for the labelled set.
 */
const registry = loadRegistry();

describe("the demo snippet is a well-formed input", () => {
  /** An unreleased version is a malformed question — `audit` throws before a model turn. */
  it("audits a version the registry actually released", () => {
    expect(() => atVersion(registry, version)).not.toThrow();
  });

  /**
   * Every beat of the walk-through is a usage in the file. `Modal` three times, because the
   * whole argument is one deprecated fact read three ways by intent; `Dialog` for the clean
   * bill of health; the slate pair for the undeclared-relationship catch.
   */
  it("contains each usage the trace walk points at", () => {
    expect(code).toContain("<Dialog");

    // The three Modal usages — deliberate-legacy, active-new-work, and no-signal — carrying
    // the intent markers that make the verdicts diverge on identical registry facts.
    expect(code.match(/<Modal/g)).toHaveLength(3);
    expect(code.toLowerCase()).toContain("legacy");

    expect(code).toContain("color.slate-400");
    expect(code).toContain("color.slate-100");
  });
});
