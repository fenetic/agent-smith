import { describe, expect, it } from "vitest";
import type { Finding, Report } from "../agent/index.js";
import type { EvalCase } from "./cases/types.js";
import { score } from "./score.js";

/** A labelled case, so each test spoils exactly the one thing it is about. */
function evalCase(over: Partial<EvalCase> = {}): EvalCase {
  return {
    id: "modal-on-active-code",
    snippet: "<Modal open />",
    version: "4.0",
    ambiguity: "temporal",
    expected: [],
    notes: "Modal is deprecated at 4.0 and nothing marks this code as legacy.",
    ...over,
  };
}

/** What 04 answers with. `score` reads the findings; the version is the case's fact. */
function report(...findings: Finding[]): Report {
  return { version: "4.0", findings };
}

/**
 * A finding as the agent phrases one — `target` in its own words, per 04's schema, which
 * asks for "the usage as it appears in the code, e.g. `<Modal> at line 12`".
 */
function finding(over: Partial<Finding> = {}): Finding {
  return {
    target: "<Modal> at line 1",
    outcome: "violation",
    groundedIn: ["r1"],
    rationale: "Modal is deprecated as of 4.0.",
    ...over,
  };
}

/**
 * Scoring starts by deciding which finding answers which label — everything else is a
 * consequence of that pairing.
 *
 * The two sides name the same usage differently on purpose. A label is written by a human
 * as the usage itself (`<Modal>`); a finding is written by the model, which is asked to
 * locate it in the code (`<Modal> at line 12`). Requiring those to be equal would score a
 * rephrase as a miss — measuring the agent's wording rather than its judgment — so a
 * label claims the finding that *contains* it.
 */
describe("aligning the agent's findings to the human's labels", () => {
  /** The degenerate case: nothing to say about a case with nothing on either side. */
  it("compares nothing when the case expects nothing and the agent found nothing", () => {
    expect(score(evalCase(), report()).comparisons).toEqual([]);
  });

  it("names the case it scored", () => {
    expect(score(evalCase({ id: "modal-on-legacy-page" }), report()).id).toBe(
      "modal-on-legacy-page",
    );
  });

  it("agrees when the agent's verdict matches the label", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "violation" }] }),
      report(finding({ target: "<Modal> at line 1", outcome: "violation" })),
    );

    expect(result.comparisons[0]?.alignment).toBe("agree");
  });

  /** The whole reason alignment is containment rather than equality. */
  it("matches a label to a finding that names the usage in its own words", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "violation" }] }),
      report(finding({ target: "<Modal> at line 12, inside the legacy header" })),
    );

    expect(result.comparisons[0]?.alignment).toBe("agree");
  });

  /**
   * A usage the human labelled that the agent said nothing about.
   *
   * This is where a gated-away finding surfaces: 05 removes an ungrounded verdict from the
   * report entirely, so from the harness's side it never existed. That is the honest
   * reading — the agent produced no usable verdict for that usage.
   */
  it("records a miss when the agent produced no finding for an expected usage", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "violation" }] }),
      report(),
    );

    expect(result.comparisons[0]?.alignment).toBe("missed");
  });

  it("keeps the label a miss was expecting", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "violation" }] }),
      report(),
    );

    expect(result.comparisons[0]).toMatchObject({ expected: "violation" });
  });

  it("records a spurious finding when the agent judged a usage nobody expected", () => {
    const result = score(
      evalCase({ expected: [] }),
      report(finding({ target: "<Carousel> at line 9" })),
    );

    expect(result.comparisons[0]?.alignment).toBe("spurious");
  });

  it("keeps the verdict a spurious finding reached", () => {
    const result = score(
      evalCase({ expected: [] }),
      report(finding({ target: "<Carousel> at line 9", outcome: "compliant" })),
    );

    expect(result.comparisons[0]).toMatchObject({ actual: "compliant" });
  });

  /**
   * A label claims at most one finding, so two labels cannot both be answered by the same
   * verdict — and a second finding about an already-answered usage is spurious rather than
   * free agreement.
   */
  it("does not let one finding answer two labels", () => {
    const result = score(
      evalCase({
        expected: [
          { target: "<Modal>", outcome: "violation" },
          { target: "<Modal>", outcome: "violation" },
        ],
      }),
      report(finding({ target: "<Modal> at line 1" })),
    );

    expect(result.comparisons.map((c) => c.alignment)).toEqual(["agree", "missed"]);
  });

  it("scores each labelled usage independently", () => {
    const result = score(
      evalCase({
        expected: [
          { target: "<Modal>", outcome: "violation" },
          { target: '<Button size="jumbo">', outcome: "violation" },
        ],
      }),
      report(finding({ target: "<Modal> at line 1" })),
    );

    expect(result.comparisons.map((c) => c.alignment)).toEqual(["agree", "missed"]);
  });
});

/** A verdict that answered the right usage with the wrong answer. */
describe("a verdict that differs from the label is a disagreement", () => {
  it("disagrees when the agent reached a different verdict", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "violation" }] }),
      report(finding({ outcome: "compliant" })),
    );

    expect(result.comparisons[0]?.alignment).toBe("disagree");
  });

  it("keeps both sides of the disagreement", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "violation" }] }),
      report(finding({ outcome: "compliant" })),
    );

    expect(result.comparisons[0]).toMatchObject({
      expected: "violation",
      actual: "compliant",
    });
  });

  /** `needs-review` is a verdict like any other when it is the one that was wanted. */
  it("agrees when the label itself expected needs-review", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "needs-review" }] }),
      report(finding({ outcome: "needs-review" })),
    );

    expect(result.comparisons[0]?.alignment).toBe("agree");
  });
});

/**
 * The measurement the whole harness exists for.
 *
 * The headline agreement rate hides the thing that matters: *how* the agent fails when it
 * is wrong. 04 is built on the claim that a confident wrong verdict is worse than an
 * honest "a human must decide" — an agent that declines to guess is behaving as designed,
 * one that is confidently wrong is the failure the system exists to avoid. Scoring those
 * two the same would grade away the entire design philosophy, so a disagreement carries
 * which kind it was.
 *
 * The line is drawn on what the *agent* said, not on how far apart the two verdicts are:
 * `needs-review` is the one answer that costs a reviewer nothing but time, because it
 * asks for the judgment rather than pre-empting it.
 */
describe("a disagreement is typed by how safely it failed", () => {
  it("calls it an escalation when the agent declined to guess", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "violation" }] }),
      report(finding({ outcome: "needs-review" })),
    );

    expect(result.comparisons[0]).toMatchObject({ safety: "escalation" });
  });

  it("calls it an escalation even where a compliant call was expected", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Dialog>", outcome: "compliant" }] }),
      report(finding({ target: "<Dialog> at line 3", outcome: "needs-review" })),
    );

    expect(result.comparisons[0]).toMatchObject({ safety: "escalation" });
  });

  /** The one this system exists to avoid: a clean bill of health over a real violation. */
  it("calls it confident-wrong when the agent passed a violation as compliant", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "violation" }] }),
      report(finding({ outcome: "compliant" })),
    );

    expect(result.comparisons[0]).toMatchObject({ safety: "confident-wrong" });
  });

  /**
   * Definite-but-wrong in either direction. Waving through a violation is the worst of
   * these, but flagging deliberate legacy as a violation is also a confident wrong answer
   * — it spends the reviewer's trust, which is the currency 04 is protecting.
   */
  it("calls it confident-wrong when the agent flagged deliberate legacy", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "allowed-exception" }] }),
      report(finding({ outcome: "violation" })),
    );

    expect(result.comparisons[0]).toMatchObject({ safety: "confident-wrong" });
  });

  /**
   * The mirror of an escalation, and not a safe failure.
   *
   * The human said the signals do not settle it; the agent settled it anyway. That is a
   * guess wearing a definite verdict's clothes — exactly the behaviour `needs-review`
   * exists to make unnecessary — so it is graded as unsafe even though nothing was
   * "missed".
   */
  it("calls it confident-wrong when the agent settled a case the human could not", () => {
    const result = score(
      evalCase({ expected: [{ target: "<Modal>", outcome: "needs-review" }] }),
      report(finding({ outcome: "violation" })),
    );

    expect(result.comparisons[0]).toMatchObject({ safety: "confident-wrong" });
  });
});
