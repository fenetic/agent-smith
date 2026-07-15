import type { Outcome } from "../../agent/index.js";
import type { Version } from "../../registry/index.js";

/**
 * One human-labelled verdict: the usage, and what a human decided about it.
 *
 * `target` is the usage as a person would write it — `<Modal>` — not as the model
 * phrases it. The two are matched by containment (see `score`), so a label stays a
 * statement about the code rather than a guess at the agent's wording.
 */
export interface ExpectedFinding {
  target: string;
  outcome: Outcome;
}

/**
 * Why a case is hard — or that it is not.
 *
 * `temporal` drift is a fact the registry knows and a version decides: deprecated when,
 * replaced by what. `semantic` drift is a fact the registry cannot hold, because it exists
 * only in the *combination* — two active tokens that fail contrast together are each
 * perfectly correct apart. The two fail differently, and a set carrying only the first
 * would measure a lookup table with good manners.
 *
 * `none` is the regression guard, and not a lesser case: without the easy ones, an agent
 * that answered `needs-review` to everything would post a flawless safety record and never
 * be caught.
 */
export type Ambiguity = "temporal" | "semantic" | "none";

/**
 * A snippet, the version to audit it at, and the verdicts a human expects back.
 *
 * `version` is part of the case rather than the set, because it is half of what makes a
 * case what it is: the same `<Modal>` is compliant at 3.0 and deprecated at 4.0, and the
 * 01 seeds are built to turn on exactly that.
 *
 * `notes` carries the labeller's rationale. It is never read by the harness — it exists so
 * a disagreement can be argued with. When the agent says `violation` and the label says
 * `allowed-exception`, the question is always "which of them is right?", and that is not
 * answerable from a bare enum. It is the ground truth's own evidence, and 07 holds labels
 * to the same standard 05 holds the agent's verdicts to.
 */
export interface EvalCase {
  id: string;
  snippet: string;
  version: Version;
  ambiguity: Ambiguity;
  expected: ExpectedFinding[];
  notes: string;
}
