import type { AuditDeps } from "../agent/index.js";
import { audit } from "../agent/index.js";
import type { Trace } from "../observability/index.js";
import { createCollector } from "../observability/index.js";
import type { EvalCase } from "./cases/types.js";
import type { CaseResult } from "./score.js";
import { score } from "./score.js";

/**
 * What the harness runs the agent with — everything `audit` takes, except where it listens.
 *
 * `emit` is withheld rather than defaulted: the trace is the harness's own product, and a
 * caller who supplied an observer would silently take the run's record away from the case
 * it belongs to. Everything else is left open so the same set can be pointed at a different
 * model and the difference scored, which is what `AuditDeps` exists for.
 */
export type RunDeps = Omit<Partial<AuditDeps>, "emit">;

/**
 * A case, scored, with the run that produced it kept beside the score.
 *
 * The trace is retained because a disagreement is a question — "why did it say that?" — and
 * re-running is not an answer. The agent is model-driven, so the second run is a different
 * run and the verdict under investigation may not reappear. Keeping it makes a failing case
 * something a person can open and read.
 */
export interface CaseRun {
  result: CaseResult;
  trace: Trace;
}

/**
 * Run one case through the agent and score what comes back.
 *
 * Through `audit` — the whole of 04, gate included — rather than around it. A harness that
 * scored the loop's *proposal* would be measuring an agent nobody ships: what a caller
 * receives is what survived 05, and that is the thing ground truth is owed. It is also why
 * a verdict the gate refused scores as a miss rather than vanishing — from here, a rejected
 * finding is simply a usage the agent produced no usable answer for.
 *
 * The case supplies both the code and the version, because the version is half of what
 * makes a case what it is: the same `<Modal>` is compliant at 3.0 and deprecated at 4.0.
 */
export async function runCase(
  evalCase: EvalCase,
  deps: RunDeps = {},
): Promise<CaseRun> {
  // Per case, like the ledger inside the run it is watching. A collector spanning the set
  // would narrate every case as one sequence, and a reader opening the second case's run
  // would find the first case's retrievals in it.
  const collector = createCollector();

  const report = await audit(evalCase.snippet, evalCase.version, {
    ...deps,
    emit: collector.emit,
  });

  return { result: score(evalCase, report), trace: collector.events() };
}

/**
 * Run the whole set, in order.
 *
 * Sequentially, and deliberately: the cases share one model, a real run is talking to a
 * rate-limited API, and the harness has nothing to gain from finishing sooner. Running them
 * at once would trade a reproducible, readable run for a fistful of seconds.
 */
export async function runSet(
  cases: EvalCase[],
  deps: RunDeps = {},
): Promise<CaseRun[]> {
  const runs: CaseRun[] = [];

  for (const evalCase of cases) {
    runs.push(await runCase(evalCase, deps));
  }

  return runs;
}
