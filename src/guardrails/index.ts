/**
 * 05's surface: the gate `audit` puts every finding through, and the shapes it answers
 * with.
 *
 * The checks are exported alongside it because they are the substance of the claim — a
 * reader asking "what does grounded actually mean here?" should be able to read the four
 * of them — but `gate` is the thing a caller wants: the checks are only enforcement once
 * something applies all of them and refuses what fails.
 */
export { coherent, present, real, relevant } from "./checks.js";
export { gate } from "./gate.js";
export type {
  CheckName,
  GatedReport,
  GuardrailResult,
  RejectionRecord,
} from "./types.js";
