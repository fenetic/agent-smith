// Straight from the modules that declare them, rather than through 04's and 05's barrels:
// each barrel re-exports the module that reaches back here for `Observer`, and importing
// through one would close a cycle for no gain. Type-only throughout, so 04 and 05 are
// compile-time references and none of either is loaded to read a trace.
import type { RetrievalEvidence } from "../agent/evidence.js";
import type { Finding } from "../agent/verdict.js";
import type { CheckName, GatedReport } from "../guardrails/types.js";
import type { Version } from "../registry/index.js";

/** The model's rationale for its next move — the half of the loop evidence cannot show. */
export interface ReasoningEvent {
  type: "reasoning";
  text: string;
}

/**
 * One lookup that really ran, as the ledger recorded it.
 *
 * Spread from {@link RetrievalEvidence} rather than restated, because it *is* that entry:
 * 05 gates citations against the ledger, so a trace carrying its own idea of what was
 * retrieved would let a reader check a citation against a record the guardrail never saw.
 * One account of what happened, wearing a `type` so it can travel in the ordered list.
 */
export type RetrievalEvent = RetrievalEvidence & { type: "retrieval" };

/**
 * The question the run was asked.
 *
 * `code` is the raw snippet. This is the one event that would carry a secret to disk if
 * the input were untrusted, which is why the design names it as where redaction-before-
 * persist belongs: a redacted reference stands in the same slot, and nothing downstream
 * reads the field for anything but display.
 */
export interface RunStartEvent {
  type: "run-start";
  code: string;
  version: Version;
}

/**
 * The answer the caller received.
 *
 * A {@link GatedReport}, deliberately — what survived 05, not what 04 proposed. The loop's
 * report is a proposal, and a trace closing on it would name a verdict the gate refused as
 * the run's answer.
 */
export interface RunEndEvent {
  type: "run-end";
  report: GatedReport;
}

/**
 * A handle on one verdict within a run, so a ruling has something to name.
 *
 * Findings arrive from the model with no id of their own — only a `target`, which two
 * verdicts about the same usage could share. The gate mints these as it walks them, the
 * way the ledger mints a ref per retrieval, and for the same reason: the id must come from
 * the code that watched the thing happen, in the order it happened.
 */
export type FindingRef = string;

/** A verdict as the model proposed it — before the gate has ruled on whether it stands. */
export interface FindingEvent {
  type: "finding";
  ref: FindingRef;
  finding: Finding;
}

/**
 * 05's ruling on one verdict.
 *
 * `check` and `reason` are absent on an acceptance, because a finding that passes is
 * simply itself — there is no gap to explain. On a rejection they are the whole product:
 * 05 fails closed, and a verdict that vanished with no account of why would leave the
 * trace quieter but no more honest.
 */
export interface GuardrailEvent {
  type: "guardrail";
  findingRef: FindingRef;
  outcome: "accepted" | "rejected";
  check?: CheckName;
  reason?: string;
}

/**
 * The loop hit its iteration bound and was stopped.
 *
 * Recorded even though the cap also throws, because the two reach different people at
 * different times: the throw stops the caller now, and this tells whoever reads the trace
 * later why it ends where it does. Without it a runaway and a finished run are the same
 * shape on the page — both simply stop.
 */
export interface CapHitEvent {
  type: "cap-hit";
  iterations: number;
}

/**
 * One thing that happened in a run.
 *
 * Typed and structured rather than free text, because the trace has two readers and
 * prose only serves one of them: a person narrating the demo, and a test asserting
 * that the run really did what it claims. A log line satisfies the first and leaves
 * the second parsing sentences.
 */
export type TraceEvent =
  | RunStartEvent
  | ReasoningEvent
  | RetrievalEvent
  | FindingEvent
  | GuardrailEvent
  | CapHitEvent
  | RunEndEvent;

/**
 * A run, whole: an ordered list of typed events.
 *
 * `readonly` because a trace is a record of what already happened. Nothing downstream —
 * the renderer, the persister — has any business rewriting it, and the type is the
 * cheapest place to say so.
 */
export type Trace = readonly TraceEvent[];

/**
 * The hook the loop and the gate call as they run.
 *
 * The seam is this small on purpose: it is the one place 06 reaches back into 04 and 05,
 * so it had better be a single function they can call and forget. The default is a no-op,
 * which is what keeps observability optional — 04 and 05 run identically with nothing
 * attached, and a collector is just a caller that happens to be listening.
 */
export type Observer = (event: TraceEvent) => void;
