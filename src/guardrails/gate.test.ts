import { describe, expect, it } from "vitest";
import type { Ledger, Report } from "../agent/index.js";
import { createLedger } from "../agent/index.js";
import { component, finding } from "./fixture.js";
import { gate } from "./gate.js";

/** What 04 hands over: the caller's version, and a verdict per usage. */
function report(...findings: Report["findings"]): Report {
  return { version: "4.0", findings };
}

/** A run that looked Modal up, and the ref it would have been given for it. */
function runThatLookedUpModal(): { ledger: Ledger; modal: string } {
  const ledger = createLedger();

  return { ledger, modal: component(ledger, "Modal") };
}

/**
 * The gate is where the checks stop being opinions and start being enforcement.
 *
 * Fail-closed: a finding is in the report only if it passed. Nothing here re-judges the
 * verdict — a rejected finding is not downgraded to `needs-review` or sent back to the
 * model, it is simply not part of the output.
 */
describe("only a grounded finding reaches the report", () => {
  it("lets a well-grounded finding through", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const gated = gate(report(finding({ groundedIn: [modal] })), ledger);

    expect(gated.findings).toHaveLength(1);
  });

  it("keeps an ungrounded finding out of the report", () => {
    const { ledger } = runThatLookedUpModal();
    const gated = gate(report(finding({ groundedIn: ["r99"] })), ledger);

    expect(gated.findings).toEqual([]);
  });

  /**
   * At the finding level, not the report level. One bad verdict does not condemn the good
   * ones beside it: they are separately grounded, separately checked, and an audit that
   * threw away four honest findings because a fifth was fabricated would be a worse
   * answer than the one it was protecting.
   */
  it("rejects only the finding that failed, not its honest neighbours", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const gated = gate(
      report(
        finding({ target: "<Modal> at line 1", groundedIn: [modal] }),
        finding({ target: "<Modal> at line 8", groundedIn: ["r99"] }),
      ),
      ledger,
    );

    expect(gated.findings.map((kept) => kept.target)).toEqual(["<Modal> at line 1"]);
  });

  /** The version is the caller's fact, and passes through untouched. */
  it("carries the report's version through", () => {
    const { ledger } = runThatLookedUpModal();

    expect(gate(report(), ledger).version).toBe("4.0");
  });
});

/**
 * The other half of failing closed, and the half that keeps it honest.
 *
 * A rejected finding is *recorded*, not silently dropped. A gate that quietly deleted
 * ungrounded verdicts would leave a report that looks clean because the evidence of its
 * gaps was removed — which is the same dishonesty the guardrail exists to prevent, just
 * relocated. The run should surface that a guardrail fired.
 */
describe("a rejection is recorded rather than swallowed", () => {
  it("records the rejected finding", () => {
    const { ledger } = runThatLookedUpModal();
    const gated = gate(report(finding({ groundedIn: ["r99"] })), ledger);

    expect(gated.rejections).toHaveLength(1);
  });

  /** Kept whole, so a reader can see what was claimed and judge the gap for themselves. */
  it("keeps the finding it rejected, as the model proposed it", () => {
    const { ledger } = runThatLookedUpModal();
    const proposed = finding({ groundedIn: ["r99"] });

    expect(gate(report(proposed), ledger).rejections[0]?.finding).toEqual(proposed);
  });

  it("names the check that fired", () => {
    const { ledger } = runThatLookedUpModal();
    const gated = gate(report(finding({ groundedIn: ["r99"] })), ledger);

    expect(gated.rejections[0]?.check).toBe("real");
  });

  it("says what the check saw", () => {
    const { ledger } = runThatLookedUpModal();
    const gated = gate(report(finding({ groundedIn: ["r99"] })), ledger);

    expect(gated.rejections[0]?.reason).toContain("r99");
  });

  it("records nothing when every finding is grounded", () => {
    const { ledger, modal } = runThatLookedUpModal();

    expect(gate(report(finding({ groundedIn: [modal] })), ledger).rejections).toEqual(
      [],
    );
  });
});

/**
 * The checks run cheapest-first, and the first failure is the one reported.
 *
 * Order matters for the *account*, not the outcome — a finding that fails two checks is
 * rejected either way. But a verdict citing nothing has failed to cite, not failed to
 * cite something relevant, and reporting the downstream symptom would misdescribe it.
 */
describe("a rejection names the first thing that was wrong", () => {
  it("blames the missing citation, not what the absent citation would have been about", () => {
    const { ledger } = runThatLookedUpModal();
    const gated = gate(report(finding({ groundedIn: [] })), ledger);

    expect(gated.rejections[0]?.check).toBe("present");
  });

  /** A fabricated ref is a fabrication first; that it grounds nothing follows from it. */
  it("blames the fabrication, not the irrelevance that follows from it", () => {
    const { ledger } = runThatLookedUpModal();
    const gated = gate(
      report(finding({ target: "<Carousel> at line 9", groundedIn: ["r99"] })),
      ledger,
    );

    expect(gated.rejections[0]?.check).toBe("real");
  });
});
