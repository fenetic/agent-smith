import type { Outcome, Report } from "../agent/index.js";
import type { EvalCase } from "./cases/types.js";

/**
 * How a disagreement failed — and the reason 07 reports more than a rate.
 *
 * An escalation is the agent saying "a human must decide" where a human had in fact
 * decided. It is undesirable — the agent was supposed to save that trip — but it costs
 * only the reviewer's time, and it is 04's design working: `needs-review` is meant to be
 * easy to reach.
 *
 * Confident-wrong is a definite verdict that was false. Its cost is not one bad line in a
 * report; it is the reviewer's trust in every *other* verdict, which is the asset the
 * whole system runs on. An agent failing mostly by escalating is behaving as designed. One
 * failing by confident-wrong is not, however good its headline rate looks.
 */
export type Safety = "escalation" | "confident-wrong";

/**
 * What one labelled usage and the agent's answer to it came to.
 *
 * A union rather than one shape with optional fields, because the four know genuinely
 * different things: a miss has a label and no verdict, a spurious finding has a verdict
 * and no label. Optional fields would let a reader ask a miss what the agent said and get
 * `undefined` back as though that were an answer.
 */
export type Comparison =
  | { alignment: "agree"; target: string; outcome: Outcome }
  | { alignment: "missed"; target: string; expected: Outcome }
  | { alignment: "spurious"; target: string; actual: Outcome }
  | {
      alignment: "disagree";
      target: string;
      expected: Outcome;
      actual: Outcome;
      safety: Safety;
    };

/**
 * Which kind of failure a disagreement was.
 *
 * Keyed on what the agent *said*, not on the distance between the two verdicts. The agent
 * either declined to give a definite answer or it gave one and was wrong, and only the
 * first of those is safe. Notably a label of `needs-review` answered with `violation` is
 * unsafe: the human's judgment was that the signals do not settle it, so a definite verdict
 * there is a guess, however plausible — which is the exact behaviour `needs-review` exists
 * to make unnecessary.
 */
function safetyOf(actual: Outcome): Safety {
  return actual === "needs-review" ? "escalation" : "confident-wrong";
}

/** How one case went: the case, and a comparison per usage on either side of it. */
export interface CaseResult {
  id: string;
  comparisons: Comparison[];
}

/**
 * Score one case: pair each label with the finding that answers it, and say what each
 * pairing came to.
 *
 * Alignment is by containment — a label (`<Modal>`) claims a finding whose target names
 * it (`<Modal> at line 12`). Equality would be measuring the model's phrasing: 04 asks for
 * the usage *as it appears in the code*, so the line number is the schema working, not the
 * model being loose, and scoring a rephrase as a miss would report a wording difference as
 * a judgment failure.
 *
 * A label claims at most one finding, and a claimed finding is spent. Without that, one
 * verdict could answer every label that resembles it — an agent that emitted a single
 * `<Modal>` finding would score full agreement on a snippet with four Modals in it.
 *
 * Nothing here judges whether the agent was *right*: the label is taken as truth by
 * definition, which is what makes this a measurement rather than a second opinion.
 */
export function score(evalCase: EvalCase, report: Report): CaseResult {
  // Copied, and spliced from as labels claim their answers. What is left when every label
  // has been through is exactly the set of findings nobody asked for.
  const unclaimed = [...report.findings];
  const comparisons: Comparison[] = [];

  for (const expected of evalCase.expected) {
    const index = unclaimed.findIndex((finding) =>
      finding.target.includes(expected.target),
    );
    const found = index === -1 ? undefined : unclaimed[index];

    if (found === undefined) {
      comparisons.push({
        alignment: "missed",
        target: expected.target,
        expected: expected.outcome,
      });
      continue;
    }

    unclaimed.splice(index, 1);

    comparisons.push(
      found.outcome === expected.outcome
        ? { alignment: "agree", target: expected.target, outcome: found.outcome }
        : {
            alignment: "disagree",
            target: expected.target,
            expected: expected.outcome,
            actual: found.outcome,
            safety: safetyOf(found.outcome),
          },
    );
  }

  // Reported under the model's own target: there is no label to borrow a name from, and
  // what the agent thought it was judging is the useful thing to show.
  for (const leftover of unclaimed) {
    comparisons.push({
      alignment: "spurious",
      target: leftover.target,
      actual: leftover.outcome,
    });
  }

  return { id: evalCase.id, comparisons };
}
