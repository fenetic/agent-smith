import { cases } from "./cases/index.js";
import type { Summary } from "./report.js";
import { summarize } from "./report.js";
import type { CaseRun, RunDeps } from "./run.js";
import { runSet } from "./run.js";

/**
 * What one pass over the set produced: the score, and the runs it was derived from.
 *
 * Both, because they answer different questions. `summary` is how the agent did; `runs` is
 * why — each carrying the trace of the audit behind it. A harness that returned only the
 * score would report a disagreement and leave no way to interrogate it, which is the
 * position 06 exists to prevent anyone being in.
 */
export interface Evaluation {
  runs: CaseRun[];
  summary: Summary;
}

/**
 * Run the agent over the whole labelled set and score it.
 *
 * The work item's first line of done — "runs the agent over the full labelled set in one
 * command" — as the function that command calls. `deps` is open so the same set can be
 * pointed at a different model and the difference scored; the *cases* are not a parameter,
 * because running the whole set is the entire claim. A harness that accepted a subset would
 * let a caller evaluate against three easy cases and report the number as though it were
 * the run. Anyone genuinely wanting a subset can call `runSet`, which does not pretend to
 * be the eval.
 *
 * With nothing injected this audits against the registry on disk — the same file 03 serves.
 * A default pointing at a fixture would make the eval a measurement of a toy.
 *
 * One pass. The agent is model-driven, so this is a snapshot and not a fixed value: running
 * it twice can produce two scores. Re-running each case N times and reporting outcome
 * stability is the natural extension, deliberately not built — the baseline is a single
 * pass with the nondeterminism named rather than hidden.
 */
export async function evaluate(deps: RunDeps = {}): Promise<Evaluation> {
  const runs = await runSet(cases, deps);

  return { runs, summary: summarize(runs.map((run) => run.result)) };
}
