import type { Finding, Ledger, Report } from "../agent/index.js";
import type { Observer } from "../observability/events.js";
import { coherent, present, real, relevant } from "./checks.js";
import type {
  CheckName,
  GatedReport,
  GuardrailResult,
  RejectionRecord,
} from "./types.js";

/**
 * The four checks, in the order a finding meets them.
 *
 * Ordered cheapest and most fundamental first, which is also the order that describes a
 * failure best: a verdict citing nothing has failed to cite, not failed to cite something
 * relevant. Each check assumes the ones before it have passed — `relevant` and `coherent`
 * read the evidence a ref names, which only means anything once `real` has established
 * the ref names one. The order changes the account, not the outcome: a finding that fails
 * two checks is rejected either way.
 */
const CHECKS: readonly [
  CheckName,
  (finding: Finding, ledger: Ledger) => GuardrailResult,
][] = [
  ["present", (finding) => present(finding)],
  ["real", real],
  ["relevant", relevant],
  ["coherent", coherent],
];

/**
 * Apply the checks to every finding: the grounded ones into the report, the rest into the
 * record of what was refused.
 *
 * This is the seam the whole item is built on. 04 produces findings as values before they
 * are a `Report`, so there is a place to stand between the model's claim and the output —
 * and standing there means an ungrounded verdict does not need to be *discouraged*,
 * because it has nowhere to go.
 *
 * It fails closed at the finding level, and it neither re-judges nor re-prompts. A
 * rejected verdict is not downgraded to `needs-review` and not handed back to the model
 * to try again: 05 decides whether a verdict is grounded, and what a verdict *should* say
 * is 04's to reason about and 07's to score. Reject-and-record is the whole behaviour.
 */
export function gate(
  report: Report,
  ledger: Ledger,
  /**
   * Where the gate says what it refused and why. Optional and discarded by default, so 05
   * enforces identically with nobody listening — {@link Observer} is imported for its type
   * alone, and the no-op default is spelled here rather than borrowed from 06, which keeps
   * the observability layer out of this module at runtime.
   */
  emit: Observer = () => {},
): GatedReport {
  const findings: Finding[] = [];
  const rejections: RejectionRecord[] = [];

  // Counts verdicts named, the way the ledger counts refs handed out: a verdict needs a
  // handle before anything can be said about it, and the number that names it has to come
  // from the walk that saw it rather than from the length of a list that only holds the
  // survivors.
  let named = 0;

  for (const finding of report.findings) {
    const failure = firstFailure(finding, ledger);
    const ref = `f${++named}`;

    // The proposal, then the ruling on it — in that order, because that is the order they
    // happened. What the model claimed is recorded whether or not it survives: a trace
    // holding only the verdicts that passed would show a run that never overreached, which
    // is the same silence 05 refuses when it records rejections rather than dropping them.
    emit({ type: "finding", ref, finding });

    if (failure === undefined) {
      findings.push(finding);
      emit({ type: "guardrail", findingRef: ref, outcome: "accepted" });
    } else {
      rejections.push({ finding, ...failure });
      emit({ type: "guardrail", findingRef: ref, outcome: "rejected", ...failure });
    }
  }

  // The version is the caller's fact throughout: it scoped every lookup in the run, and
  // gating changes which verdicts survive, never what they were about.
  return { version: report.version, findings, rejections };
}

/**
 * The first check this finding fails, if any.
 *
 * Stops at the first, rather than collecting all four. A finding needs one reason to be
 * refused, and the first is the truest — the later checks would be describing the
 * consequences of the earlier failure rather than problems of their own.
 */
function firstFailure(
  finding: Finding,
  ledger: Ledger,
): { check: CheckName; reason: string } | undefined {
  for (const [check, run] of CHECKS) {
    const result = run(finding, ledger);

    if (!result.ok) return { check, reason: result.reason };
  }

  return undefined;
}
