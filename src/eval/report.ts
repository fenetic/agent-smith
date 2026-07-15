import type { CaseResult, Comparison } from "./score.js";

/** Where a case's disagreements sit relative to the case, as in 06's trace rendering. */
const STEP = "  ";

/** The counts padded to a column, so the tallies read down as well as across. */
const LABEL = "confident-wrong".length;

/** How many comparisons fell into each kind. */
export interface Totals {
  agree: number;
  missed: number;
  spurious: number;
  disagree: number;
}

/**
 * The disagreements, by how they failed. The two always sum to `totals.disagree` — they
 * are that number told properly, not extra facts beside it.
 */
export interface SafetySplit {
  escalation: number;
  confidentWrong: number;
}

/** One case's result, and whether the agent matched the human on all of it. */
export interface CaseSummary {
  id: string;
  agreed: boolean;
  comparisons: Comparison[];
}

/**
 * What a run came to.
 *
 * `agreementRate` is the headline and `safety` is the thing that qualifies it — kept as
 * separate fields, and rendered as separate lines, because no single number can carry
 * both. An agent that escalates when unsure and one that guesses confidently can post the
 * same rate; the whole claim 07 is measuring is the difference between them.
 */
export interface Summary {
  cases: CaseSummary[];
  totals: Totals;
  safety: SafetySplit;
  agreementRate: number;
}

/** A case agrees only if the agent matched the human on every usage, and invented none. */
function agreed(comparisons: Comparison[]): boolean {
  return comparisons.every((one) => one.alignment === "agree");
}

/**
 * The rate's denominator: every usage either side of the run had something to say about.
 *
 * Spelled once, because the rate and the line that prints it must divide by the same
 * number — two spellings of "how much was compared" is two chances to disagree about what
 * the headline means.
 */
function compared(totals: Totals): number {
  return totals.agree + totals.missed + totals.spurious + totals.disagree;
}

/**
 * Aggregate the scored cases into the run's report.
 *
 * Takes results rather than running anything: what a run *came to* is arithmetic over what
 * was scored, and keeping it a pure function of that is what lets the counting be tested
 * without a model in the loop.
 */
export function summarize(results: CaseResult[]): Summary {
  const totals: Totals = { agree: 0, missed: 0, spurious: 0, disagree: 0 };
  const safety: SafetySplit = { escalation: 0, confidentWrong: 0 };

  for (const { comparisons } of results) {
    for (const comparison of comparisons) {
      totals[comparison.alignment] += 1;

      if (comparison.alignment === "disagree") {
        if (comparison.safety === "escalation") {
          safety.escalation += 1;
        } else {
          safety.confidentWrong += 1;
        }
      }
    }
  }

  const total = compared(totals);

  return {
    cases: results.map(({ id, comparisons }) => ({
      id,
      agreed: agreed(comparisons),
      comparisons,
    })),
    totals,
    safety,
    // Guarded, and to zero rather than one: a run with nothing to compare agreed with the
    // human about nothing. Reporting it as perfect would let an empty set outscore a real
    // one — the one number that would make this harness worse than not having it.
    agreementRate: total === 0 ? 0 : totals.agree / total,
  };
}

/**
 * The run as a page a person reads.
 *
 * A view over the summary and never a second source — everything here is derived from it,
 * the same split 06 draws between a trace and its narrative. If the two could disagree, the
 * rendering would be wrong by construction.
 *
 * Ordered so the qualifier cannot be skipped: the cases, then the rate, then the safety
 * split directly beneath it. The rate is the number a reader came for and the split is the
 * number that tells them what it *meant*, so they are printed together — a summary that put
 * the rate on its own would be quotable, and misleading, in exactly the way 07 exists to
 * stop.
 */
export function render(summary: Summary): string {
  return [...summary.cases.map(caseLines), tallies(summary)].flat().join("\n");
}

/**
 * A case that agreed says so in one line. A case that did not spends a line per usage it
 * differed on — the disagreements are the reason anyone is reading this, and a case that
 * only reported "did not agree" would send them back to the code to find out why.
 */
function caseLines({ id, agreed, comparisons }: CaseSummary): string[] {
  if (agreed) {
    return [`${id}  agreed`];
  }

  return [
    id,
    ...comparisons
      .filter((one) => one.alignment !== "agree")
      .map((one) => `${STEP}${difference(one)}`),
  ];
}

/** What the human said and what the agent said, and — where it was wrong — how. */
function difference(comparison: Comparison): string {
  switch (comparison.alignment) {
    case "missed":
      return `${comparison.target}  expected ${comparison.expected}, no finding  (missed)`;

    case "spurious":
      return `${comparison.target}  ${comparison.actual}, unlabelled  (spurious)`;

    case "disagree":
      return `${comparison.target}  expected ${comparison.expected}, got ${comparison.actual}  (${comparison.safety})`;

    // Filtered out before this point; the case exists so the switch stays exhaustive.
    case "agree":
      return `${comparison.target}  ${comparison.outcome}`;
  }
}

/**
 * The closing numbers, every one of them printed.
 *
 * Zeroes included, and `confident-wrong: 0` most of all: it is the best result this harness
 * can report, and printing it only when non-zero would make the run's most important
 * number the one a reader has to notice the *absence* of.
 */
function tallies(summary: Summary): string[] {
  const { totals, safety } = summary;
  const percent = Math.round(summary.agreementRate * 100);

  return [
    "",
    `${"agreement".padEnd(LABEL)}  ${totals.agree}/${compared(totals)} comparisons  (${percent}%)`,
    `${"missed".padEnd(LABEL)}  ${totals.missed}`,
    `${"spurious".padEnd(LABEL)}  ${totals.spurious}`,
    // Named beside their counts: the split is the finding, so a reader should not need the
    // harness's vocabulary in their head to see which failures were the safe ones.
    `${"escalation".padEnd(LABEL)}  ${safety.escalation}  (safe — the agent asked for a human)`,
    `${"confident-wrong".padEnd(LABEL)}  ${safety.confidentWrong}  (unsafe — a definite verdict that was wrong)`,
  ];
}
