import type { Registry, Version } from "../registry/index.js";
import type { Ledger } from "./evidence.js";
import { executeTool } from "./execute.js";
import type { ContentBlock, Message, ModelClient, ToolResultBlock } from "./model.js";
import { systemPrompt, userPrompt } from "./prompt.js";
import { retrievalTools } from "./tools.js";
import type { Report } from "./verdict.js";
import { reportSchema, submitReport } from "./verdict.js";

export interface LoopRun {
  registry: Registry;
  model: ModelClient;
  /** The turn's evidence. The caller owns it, so 05 can gate findings against it. */
  ledger: Ledger;
  code: string;
  version: Version;
  maxIterations?: number;
}

/**
 * How many turns a run may take before we stop it.
 *
 * Generous on purpose: the cap is a backstop against a model that will never finish,
 * not a budget for one that is working. A snippet with a dozen usages spends a turn or
 * two each, and hitting this means something has gone wrong rather than that the code
 * was unusually busy.
 */
const MAX_ITERATIONS = 25;

/**
 * A run that would not stop on its own.
 *
 * Thrown rather than reported as an empty `Report`, because a capped run never reached
 * a verdict and there is no honest report to give: handing back findings-so-far would
 * present a truncated audit as a finished one, which is precisely the silent stop the
 * design rules out. Loud here is cheap; a quietly incomplete audit is not.
 */
export class IterationCapError extends Error {
  constructor(readonly turns: number) {
    super(
      `the agent took ${turns} turns without submitting a report, and was stopped. This is a runaway run, not a finished audit.`,
    );
    this.name = "IterationCapError";
  }
}

/** The tools the model may call: 02's three lookups, plus the way to finish. */
const tools = [...retrievalTools, submitReport];

/**
 * Drive the model until it has judged every usage and reported.
 *
 * The cycle is the deliverable, which is why it is written out rather than handed to a
 * library: the model reads the code, asks for a fact, observes what came back, reasons
 * about what it means *for this usage*, and goes again. Everything the loop knows about
 * the design system arrives through `executeTool` — so the agent reasons about facts it
 * retrieved, and the refs it can cite are exactly the retrievals that really ran.
 */
export async function runLoop({
  registry,
  model,
  ledger,
  code,
  version,
  maxIterations = MAX_ITERATIONS,
}: LoopRun): Promise<Report> {
  const messages: Message[] = [{ role: "user", content: userPrompt(code, version) }];

  for (let turn = 0; turn < maxIterations; turn++) {
    const response = await model.createMessage({
      system: systemPrompt(version),
      messages,
      tools,
    });

    const calls = response.content.filter((block) => block.type === "tool_use");

    // Nothing asked for and nothing reported: the model has stopped talking without
    // finishing. Prompting it to either use a tool or report turns a dead end back
    // into a turn — and if it will not, the cap is what ends the run.
    if (calls.length === 0) {
      messages.push(
        { role: "assistant", content: response.content },
        { role: "user", content: NUDGE },
      );
      continue;
    }

    // The model's whole turn goes back verbatim, reasoning included: the next turn has
    // to see what this one was thinking, and every tool call it made needs its result.
    messages.push({ role: "assistant", content: response.content });

    const report = calls.find((call) => call.name === submitReport.name);

    if (report !== undefined) {
      const parsed = reportSchema.safeParse(report.input);

      // A malformed report is the model's to fix, and it is still mid-run — so it gets
      // told what was wrong and keeps its turn, exactly as with a fumbled lookup.
      if (!parsed.success) {
        messages.push(resultsFor([complaintFor(report.id, parsed.error.message)]));
        continue;
      }

      // The version is the caller's, not the model's. It scoped every lookup in this
      // run, so it is the only version this report can honestly be about.
      return { version, findings: parsed.data.findings };
    }

    messages.push(resultsFor(calls.map((call) => resultFor(registry, ledger, call))));
  }

  throw new IterationCapError(maxIterations);
}

const NUDGE =
  "You did not call a tool or submit a report. Use the retrieval tools to check any usage you have not yet judged, then call submit_report.";

/** Run one tool call and address the answer back to the call that asked for it. */
function resultFor(
  registry: Registry,
  ledger: Ledger,
  call: Extract<ContentBlock, { type: "tool_use" }>,
): ToolResultBlock {
  const outcome = executeTool(registry, ledger, call.name, call.input);

  return {
    type: "tool_result",
    toolUseId: call.id,
    content: outcome.content,
    ...(outcome.isError === true && { isError: true }),
  };
}

function complaintFor(toolUseId: string, complaint: string): ToolResultBlock {
  return {
    type: "tool_result",
    toolUseId,
    content: `The report was not accepted: ${complaint}`,
    isError: true,
  };
}

/**
 * Tool results go back as one user turn. The API requires every `tool_use` in a turn
 * to be answered in the next message, so they travel together rather than one apiece.
 */
function resultsFor(results: ToolResultBlock[]): Message {
  return { role: "user", content: results };
}
