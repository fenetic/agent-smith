import type { RetrievalArgs, RetrievalResult } from "../agent/evidence.js";
import type { GatedReport } from "../guardrails/types.js";
import type { Trace, TraceEvent } from "./events.js";

/**
 * Where the run's steps sit relative to the run itself.
 *
 * The indentation is doing real work: it is how a reader finds where one audit ends and
 * the next begins without reading a word. `run-start` and `run-end` are the run; the rest
 * is what it did.
 */
const STEP = "  ";

/** The labels padded to a column, so the narrative reads down as well as across. */
const LABEL = "run-start".length;

/**
 * A run as an ordered narrative.
 *
 * A view over the events, never a second source: everything here is derived from the trace
 * and nothing is known that the trace does not carry. That is the same split 03 draws
 * across its result payload — the JSON is the contract, and this is one way of looking at
 * it. If the two ever disagreed, the rendering would be the wrong one by construction.
 *
 * Line-oriented, one line per event, because the thing being narrated is a *sequence* and
 * a reader following it live is scanning downward. The ids travel onto the page verbatim —
 * `r1` in the retrieval that minted it, `r1` again in the verdict that cites it — because
 * they are what make the chain walkable, and a rendering that prettied them away would
 * describe the grounding without letting anyone check it.
 */
export function render(trace: Trace): string {
  return trace.map(line).join("\n");
}

function line(event: TraceEvent): string {
  const label = event.type.padEnd(LABEL);

  switch (event.type) {
    // At the margin: the run's boundaries, not steps within it.
    case "run-start":
      return `${label}  ${event.version}  (${lineCount(event.code)})`;

    case "run-end":
      return `${label}  ${tally(event.report)}`;

    case "reasoning":
      return `${STEP}${label}  ${event.text}`;

    case "retrieval":
      return `${STEP}${label}  [${event.ref}] ${event.tool}(${asked(event.args)}) → ${answered(event.result)}`;

    case "finding":
      return `${STEP}${label}  [${event.ref}] ${event.finding.outcome}  ${event.finding.target}  ← ${cited(event.finding.groundedIn)}`;

    case "guardrail":
      return `${STEP}${label}  [${event.findingRef}] ${event.outcome}${refusal(event)}`;

    case "cap-hit":
      return `${STEP}${label}  stopped after ${event.iterations} turns without a report`;
  }
}

/**
 * The code by size rather than by content.
 *
 * The snippet is in the structured trace, whole, for anyone who wants it. Spilling it into
 * the narrative would bury the run's first step under the file it was about — and this is
 * read while the run is being talked through, by someone who is already looking at the code.
 */
function lineCount(code: string): string {
  const count = code.split("\n").length;

  return `${count} line${count === 1 ? "" : "s"}`;
}

/** What was asked, as it was asked. `id` is absent for the sweep, which takes a version alone. */
function asked(args: RetrievalArgs): string {
  return Object.entries(args)
    .map(([field, value]) => `${field}=${value}`)
    .join(" ");
}

/**
 * What came back, to the depth a reader following a citation needs: the standing, and the
 * replacement where the fact names one.
 *
 * Deliberately not the whole `Resolution`. The status is what a verdict turns on, and the
 * full answer is in the JSON for anyone checking the rendering against the record.
 */
function answered(result: RetrievalResult): string {
  if (Array.isArray(result)) {
    return `${result.length} ${result.length === 1 ? "entry" : "entries"}`;
  }

  const replacement =
    "replacedBy" in result && result.replacedBy !== undefined
      ? `, replacedBy ${result.replacedBy}`
      : "";

  return `${result.status}${replacement}`;
}

/** A verdict citing nothing is the `present` check's business; here it is simply visible. */
function cited(groundedIn: string[]): string {
  return groundedIn.length === 0 ? "nothing" : groundedIn.join(", ");
}

/** Only a refusal has anything to add: a verdict that passed is simply itself. */
function refusal(event: { check?: string; reason?: string }): string {
  return event.check === undefined ? "" : `  (${event.check}: ${event.reason})`;
}

/**
 * The run's answer in one line: what stood, and what was refused.
 *
 * Rejections are counted rather than left implicit, because a run where the guardrail fired
 * is a run that worked — and a closing line that mentioned only the findings would read as a
 * clean bill of health for an audit that had refused half its verdicts.
 */
function tally(report: GatedReport): string {
  const findings = `${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`;

  return `${findings}, ${report.rejections.length} rejected`;
}
