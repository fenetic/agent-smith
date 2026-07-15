export type { AuditDeps } from "./audit.js";
export { audit } from "./audit.js";

/**
 * The evidence surface, exported for 05 and 06 rather than for a caller running an
 * audit. 05 opens a ledger, runs the loop against it and gates each finding on what it
 * can corroborate; 06 lifts the same entries into a trace. Both need the loop and the
 * ledger separately, which is why `runLoop` takes a ledger instead of making one — and
 * why `audit`, which needs neither, hides both.
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
