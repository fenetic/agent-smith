/**
 * What `audit` answers with, re-exported from 05 because `audit` puts every finding
 * through 05's gate before returning it.
 *
 * 05 owns these shapes; they are surfaced here because they are already part of this
 * module's public surface by way of `audit`'s return type, and a caller should not have
 * to know which module minted the type of the thing it was handed.
 */
export type { GatedReport, RejectionRecord } from "../guardrails/index.js";
export type { AuditDeps } from "./audit.js";
export { audit } from "./audit.js";

/**
 * The evidence surface, exported for 05 and 06 rather than for a caller running an
 * audit. 05's checks corroborate a citation against these entries; 06 lifts the same
 * entries into a trace. Both need the loop and the ledger separately, which is why
 * `runLoop` takes a ledger instead of making one — and why `audit`, which makes one and
 * hands it to the gate, still keeps both out of the caller's way.
 */
export type {
  Ledger,
  RetrievalArgs,
  RetrievalEvidence,
  RetrievalRef,
  RetrievalResult,
  ToolName,
} from "./evidence.js";
export { createLedger } from "./evidence.js";
export type { LoopRun } from "./loop.js";
export { IterationCapError, runLoop } from "./loop.js";

/** The port 04 reaches the model through, and the shapes either side of it. */
export type {
  ContentBlock,
  Message,
  ModelClient,
  ModelRequest,
  ModelResponse,
  TextBlock,
  ToolDefinition,
  ToolResultBlock,
  ToolUse,
} from "./model.js";
export type { Finding, Outcome, Report } from "./verdict.js";
export { findingSchema, outcomeSchema, reportSchema } from "./verdict.js";
