import { describe, expect, it } from "vitest";
import { render, summarize } from "./report.js";
import type { CaseResult, Comparison } from "./score.js";

/**
 * Comparisons built directly rather than driven through `score`.
 *
 * Aggregation is a function of the comparisons, and going through `score` to obtain them
 * would test the alignment rules again on the way past — so a change to containment
 * matching would break the counting tests, which are not about it.
 */
const agree: Comparison = {
  alignment: "agree",
  target: "<Modal>",
  outcome: "violation",
};

const missed: Comparison = {
  alignment: "missed",
  target: "<Button>",
  expected: "violation",
};

const spurious: Comparison = {
  alignment: "spurious",
  target: "<Carousel>",
  actual: "compliant",
};

const escalation: Comparison = {
  alignment: "disagree",
  target: "<Modal>",
  expected: "violation",
  actual: "needs-review",
  safety: "escalation",
};

const confidentWrong: Comparison = {
  alignment: "disagree",
  target: "<Modal>",
  expected: "violation",
  actual: "compliant",
  safety: "confident-wrong",
};

function result(id: string, ...comparisons: Comparison[]): CaseResult {
  return { id, comparisons };
}

describe("counting what a run came to", () => {
  /** A run over nothing has proved nothing, and every count says so. */
  it("counts nothing for a run with no cases", () => {
    expect(summarize([]).totals).toEqual({
      agree: 0,
      missed: 0,
      spurious: 0,
      disagree: 0,
    });
  });

  it("counts agreements across every case", () => {
    const summary = summarize([result("a", agree), result("b", agree, agree)]);

    expect(summary.totals.agree).toBe(3);
  });

  it("counts misses", () => {
    expect(summarize([result("a", agree, missed)]).totals.missed).toBe(1);
  });

  it("counts spurious findings", () => {
    expect(summarize([result("a", spurious)]).totals.spurious).toBe(1);
  });

  it("counts disagreements regardless of how they failed", () => {
    const summary = summarize([result("a", escalation, confidentWrong)]);

    expect(summary.totals.disagree).toBe(2);
  });
});

/**
 * The headline number, and deliberately not the whole report.
 *
 * It is a share of *comparisons*, not of cases: a case with four labels that the agent got
 * three right on is not a binary failure, and rolling it up to one would throw away three
 * quarters of what the run measured.
 */
describe("the agreement rate", () => {
  it("is the share of comparisons the agent agreed on", () => {
    expect(summarize([result("a", agree, agree, agree, missed)]).agreementRate).toBe(
      0.75,
    );
  });

  it("counts every kind of failure against it", () => {
    const summary = summarize([result("a", agree, missed, spurious, confidentWrong)]);

    expect(summary.agreementRate).toBe(0.25);
  });

  /**
   * Not 1, and not NaN.
   *
   * A run with nothing to compare has not agreed with the human about anything, and
   * reporting perfect agreement for it would be the single most misleading number this
   * harness could print — an empty set would score better than a real one.
   */
  it("is zero, not perfect, when there was nothing to compare", () => {
    expect(summarize([]).agreementRate).toBe(0);
  });
});

/**
 * The safety split — reported beside the rate, never folded into it.
 *
 * Two runs can share an agreement rate and mean opposite things: one that failed by asking
 * for a human is working as designed, one that failed by being confidently wrong is the
 * thing 04 exists to prevent. A single number cannot tell them apart, so the harness does
 * not try to.
 */
describe("splitting the disagreements by safety", () => {
  it("counts the safe failures", () => {
    const summary = summarize([result("a", escalation, escalation, confidentWrong)]);

    expect(summary.safety.escalation).toBe(2);
  });

  it("counts the unsafe failures", () => {
    const summary = summarize([result("a", escalation, confidentWrong)]);

    expect(summary.safety.confidentWrong).toBe(1);
  });

  it("counts no safety failures for a run that only agreed", () => {
    expect(summarize([result("a", agree)]).safety).toEqual({
      escalation: 0,
      confidentWrong: 0,
    });
  });

  /** A miss is not a wrong verdict — it is the absence of one, and is not typed by safety. */
  it("does not type a miss as a safety failure", () => {
    expect(summarize([result("a", missed)]).safety).toEqual({
      escalation: 0,
      confidentWrong: 0,
    });
  });
});

/** The work item's own words: "reports per-case agreement against human ground truth". */
describe("per-case agreement", () => {
  it("agrees on a case where every comparison agreed", () => {
    expect(summarize([result("a", agree, agree)]).cases[0]?.agreed).toBe(true);
  });

  it("does not agree on a case that missed a labelled usage", () => {
    expect(summarize([result("a", agree, missed)]).cases[0]?.agreed).toBe(false);
  });

  /** An extra verdict is a disagreement with the human about what is even there. */
  it("does not agree on a case that judged a usage nobody labelled", () => {
    expect(summarize([result("a", agree, spurious)]).cases[0]?.agreed).toBe(false);
  });

  /** Safe or not, an escalation is still not what the human said. */
  it("does not agree on a case the agent escalated", () => {
    expect(summarize([result("a", escalation)]).cases[0]?.agreed).toBe(false);
  });

  /** A case with nothing to find, where the agent found nothing, is agreement. */
  it("agrees on a clean case where nothing was expected and nothing was found", () => {
    expect(summarize([result("a")]).cases[0]?.agreed).toBe(true);
  });

  it("keeps the cases in the order they ran", () => {
    const summary = summarize([result("first", agree), result("second", missed)]);

    expect(summary.cases.map((one) => one.id)).toEqual(["first", "second"]);
  });
});

/**
 * The rendering is a view over the summary, never a second source — the same split 06
 * draws over a trace. Nothing is stated here that the structured result does not carry, so
 * the two cannot drift into disagreeing about how the run went.
 *
 * These tests assert what a reader must be able to *find*, not where it sits on the line.
 * Pinning the exact layout would make every cosmetic change a test failure while proving
 * nothing about whether the run was reported honestly.
 */
describe("rendering the run for a human", () => {
  it("names every case it ran", () => {
    const text = render(summarize([result("modal-on-legacy-page", agree)]));

    expect(text).toContain("modal-on-legacy-page");
  });

  it("shows what a disagreement was, both sides", () => {
    const text = render(summarize([result("modal-on-active-code", confidentWrong)]));

    expect(text).toMatch(/violation.*compliant/);
  });

  it("names the usage a disagreement was about", () => {
    const text = render(summarize([result("modal-on-active-code", confidentWrong)]));

    expect(text).toContain("<Modal>");
  });

  it("names the usage that was missed", () => {
    expect(render(summarize([result("a", missed)]))).toContain("<Button>");
  });

  it("reports the agreement rate as a percentage", () => {
    const text = render(summarize([result("a", agree, agree, agree, missed)]));

    expect(text).toContain("75%");
  });

  /**
   * The two failure kinds are named on the page, in the run's own summary.
   *
   * A reader should not have to know the harness's vocabulary to see the difference — the
   * split is the finding, so the words for it belong where the numbers are.
   */
  it("counts the safe failures under their own name", () => {
    const text = render(summarize([result("a", escalation)]));

    expect(text).toContain("escalation");
  });

  it("counts the unsafe failures under their own name", () => {
    const text = render(summarize([result("a", confidentWrong)]));

    expect(text).toContain("confident-wrong");
  });

  /**
   * Zero unsafe failures is a *result*, and the best one this harness can report. Printing
   * the line only when it is non-zero would make the run's most important number the one a
   * reader has to notice the absence of.
   */
  it("states a clean safety record rather than staying silent about it", () => {
    expect(render(summarize([result("a", agree)]))).toContain("confident-wrong");
  });

  it("says which cases agreed outright", () => {
    const text = render(summarize([result("clean-case", agree)]));

    expect(text).toContain("agreed");
  });

  /** A run over nothing still renders — and says nothing that suggests it went well. */
  it("renders an empty run without claiming agreement", () => {
    expect(render(summarize([]))).toContain("0%");
  });
});
