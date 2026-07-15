import type { Finding } from "../agent/index.js";
import type { Version } from "../registry/index.js";

/**
 * The verdict of one check on one finding.
 *
 * A rejection carries its reason rather than being a bare `false`, because the reason is
 * the whole product: 05 fails closed, and a finding that vanishes with no account of why
 * would leave the report quieter but no more honest. `ok: true` carries nothing — a
 * finding that passes is simply itself.
 */
export type GuardrailResult = { ok: true } | { ok: false; reason: string };

/**
 * Which of the four checks rejected a finding.
 *
 * Named rather than folded into the reason string, because the four fail in genuinely
 * different ways and a reader should not have to parse prose to tell them apart: a
 * `real` rejection is a model citing a lookup that never ran, a `relevant` one is a
 * verdict about the wrong thing. 06 renders these and 07 counts them.
 */
export type CheckName = "present" | "real" | "relevant" | "coherent";

/**
 * A verdict the gate refused, and why.
 *
 * The finding is kept whole rather than reduced to its target: what the model *claimed*,
 * and what it cited to support the claim, is the substance of the rejection — a reader
 * deciding whether the gate was right needs to see the verdict it blocked.
 */
export interface RejectionRecord {
  finding: Finding;
  check: CheckName;
  reason: string;
}

/**
 * The audit's answer once the gate has been through it: the verdicts that earned their
 * place, and an account of the ones that did not.
 *
 * `rejections` is not an error channel. A run with rejections is a run that worked — the
 * guardrail fired and the report is honest about the gap, which is the design working as
 * intended rather than failing.
 */
export interface GatedReport {
  version: Version;
  findings: Finding[];
  rejections: RejectionRecord[];
}

/** A check that passes, spelled once so the checks do not each build their own. */
export const passes: GuardrailResult = { ok: true };

/** A check that rejects, and says what it saw. */
export function rejects(reason: string): GuardrailResult {
  return { ok: false, reason };
}
