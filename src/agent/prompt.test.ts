import { describe, expect, it } from "vitest";
import { systemPrompt, userPrompt } from "./prompt.js";

/**
 * What these tests can and cannot do.
 *
 * They cannot tell you the prompt is *good* — whether it earns the right verdict on an
 * ambiguous case is a question about a nondeterministic system, and measuring it is
 * 07's job, with ground truth and a score. A test that asserted quality here would be
 * asserting an opinion, and would fail on model variance rather than on a defect.
 *
 * What they can do is stop the load-bearing instructions from going missing. The prompt
 * is the file that gets iterated on hardest, and every claim below is one the design
 * turns on — if a rewrite drops the honest non-answer, or stops naming the version,
 * the agent still runs and quietly gets worse. That is the regression worth catching.
 */
describe("the agent is told what it is judging against", () => {
  it("names the version the code targets", () => {
    expect(systemPrompt("4.0")).toContain("4.0");
  });

  it("carries whichever version it was given, rather than a baked-in one", () => {
    expect(systemPrompt("2.0")).toContain("2.0");
  });

  it("does not leak a different version into the framing", () => {
    expect(systemPrompt("2.0")).not.toContain("4.0");
  });
});

/**
 * The four outcomes must each be defined, because the distinction between them is the
 * entire judgment. A model told only the names would have to guess what separates a
 * violation from an allowed exception — which is precisely the guess this design exists
 * to prevent.
 */
describe("the agent is told what each verdict means", () => {
  it.each(["compliant", "violation", "allowed-exception", "needs-review"])(
    "defines %s",
    (outcome) => {
      expect(systemPrompt("4.0")).toContain(outcome);
    },
  );
});

/**
 * The crux of the design: a deprecated status does not mechanically mean "violation".
 * A prompt that failed to say so would turn the agent back into a linter with extra
 * steps — the very thing the work item exists to argue against.
 */
describe("the agent is told that status alone does not settle it", () => {
  it("tells it to weigh intent, not only the retrieved status", () => {
    expect(systemPrompt("4.0").toLowerCase()).toContain("intent");
  });

  it("points at the signals that carry intent, such as comments", () => {
    expect(systemPrompt("4.0").toLowerCase()).toContain("comment");
  });

  it("names legacy code as the case where deprecated use can be correct", () => {
    expect(systemPrompt("4.0").toLowerCase()).toContain("legacy");
  });
});

/**
 * The honest non-answer, which the design calls the deliberate design point: a
 * confident wrong verdict is worse than "a human must decide". The model has to be told
 * that reaching for `needs-review` is the *right* answer under uncertainty rather than
 * a failure to produce one — models default to being helpful, and will guess if the
 * prompt leaves guessing open.
 */
describe("the agent is told to escalate rather than guess", () => {
  it("tells it what to do when the signals do not settle the case", () => {
    expect(systemPrompt("4.0")).toContain("needs-review");
  });

  it("tells it not to guess", () => {
    expect(systemPrompt("4.0").toLowerCase()).toContain("guess");
  });
});

/**
 * Grounding, stated to the model. The harness makes citation *possible* by handing back
 * refs, and 05 makes it *mandatory* by rejecting findings without them — but the model
 * still has to be told to cite, or it will produce verdicts 05 simply throws away.
 */
describe("the agent is told to cite what it retrieved", () => {
  it("tells it to ground each verdict in a retrieved fact", () => {
    expect(systemPrompt("4.0")).toContain("groundedIn");
  });

  it("tells it to look things up rather than rely on what it already knows", () => {
    expect(systemPrompt("4.0").toLowerCase()).toContain("do not rely on");
  });
});

describe("the question puts the code in front of the model", () => {
  it("includes the code to audit", () => {
    expect(userPrompt("<Modal>Hi</Modal>", "4.0")).toContain("<Modal>Hi</Modal>");
  });

  it("names the version the code targets", () => {
    expect(userPrompt("<Modal>Hi</Modal>", "4.0")).toContain("4.0");
  });

  /**
   * The intent signals live in the code's comments and shape, so the snippet has to
   * arrive whole. A prompt that trimmed or summarised it would throw away the evidence
   * the ambiguous cases are decided on.
   */
  it("keeps the code intact, comments and all", () => {
    const code = "// legacy checkout — frozen\n<Modal>Confirm</Modal>";

    expect(userPrompt(code, "4.0")).toContain(code);
  });
});
