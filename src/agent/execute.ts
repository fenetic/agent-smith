import type { Registry } from "../registry/index.js";
import type { Ledger, RetrievalRef } from "./evidence.js";
import { isToolName, parseArgs, retrieve, toolNames } from "./tools.js";

/**
 * What goes back to the model as the result of a tool call: the text it reads, and
 * whether the call failed. `isError` is the model's cue to correct itself rather
 * than reason on — a domain condition (deprecated, removed, unknown) is never one,
 * because the question was valid and the answer is correct.
 *
 * `ref` is present exactly when this call left evidence, which is what lets the loop
 * say so without inspecting the ledger for entries it did not put there. A refused
 * call carries none, because nothing was retrieved to name.
 */
export interface ToolOutcome {
  content: string;
  isError?: boolean;
  ref?: RetrievalRef;
}

/** A complaint the model is meant to read and act on, rather than a fact to reason from. */
function refuse(complaint: string): ToolOutcome {
  return { content: complaint, isError: true };
}

/**
 * Run a tool the model asked for, and keep what it returned.
 *
 * The order here is the whole point: the lookup runs *first*, and the ref is minted
 * from its result. There is no path to a ref that does not go through a real call to
 * 02, so the refs the model can cite are exactly the retrievals that actually
 * happened — and every early return below leaves the ledger untouched, because
 * nothing was retrieved to leave evidence of. The model receives evidence; it never
 * mints it. That single asymmetry is what lets 05 be a gate rather than a request,
 * and it is why this function — not the prompt — is where grounding is established.
 *
 * Nothing here throws. A model gets tool calls wrong: it invents tools, guesses
 * versions, forgets arguments. In a loop, that is an ordinary event with an obvious
 * recovery — tell it what was wrong and let it ask again — so every one of these
 * comes back as a readable answer. Killing an audit over a fumbled call would be a
 * worse failure than the fumble.
 *
 * The answer itself is JSON rather than prose, deliberately: 02's answer is already
 * plain data whose *shape* is the safety property, so handing it over untouched
 * means a `removed` result arrives with no value field to misread, exactly as it
 * does across 03's wire. Summarising it into a sentence here would be a second
 * description of the same fact, free to drift from the first — and the thing the
 * model reasons about must be the fact itself.
 */
export function executeTool(
  registry: Registry,
  ledger: Ledger,
  tool: string,
  input: unknown,
): ToolOutcome {
  if (!isToolName(tool)) {
    // Naming the real tools rather than only rejecting: a model that hallucinated a
    // tool name usually wants one of these, and can recover in a turn if told so.
    return refuse(
      `There is no tool called "${tool}". The tools available are: ${toolNames.join(", ")}.`,
    );
  }

  const parsed = parseArgs(tool, input);

  if (!parsed.ok) return refuse(parsed.complaint);

  try {
    const result = retrieve(registry, tool, parsed.args);
    const ref = ledger.record(tool, parsed.args, result);

    return { content: JSON.stringify({ ref, result }), ref };
  } catch (error) {
    // `atVersion` raises a RangeError for a version the registry never released —
    // a malformed question, and the model's to fix. 02's message already names the
    // versions that do exist, which is the model's way out, so it is passed through
    // as-is. Anything else is a defect rather than a bad question: no message would
    // help the model and no retry would fix it, so it goes up rather than being
    // dressed up as something the model can act on.
    if (!(error instanceof RangeError)) throw error;

    return refuse(error.message);
  }
}
