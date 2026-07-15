import type {
  ContentBlock,
  ModelClient,
  ModelRequest,
  ModelResponse,
} from "./model.js";

/**
 * A model whose turns are written in advance.
 *
 * This is what makes the loop testable at all: the loop's own work — running tools,
 * minting evidence, carrying citations, stopping — is deterministic given the model's
 * turns, so scripting the turns leaves exactly that work under test, offline and in
 * milliseconds. Nothing here imitates the real model's *judgment*; a fake that tried
 * to would be testing an opinion about Claude rather than our loop.
 *
 * The requests are kept because half of what the loop must get right is what it
 * *says* to the model: the code, the version, the tools, and the results of what it
 * ran.
 */
export interface ScriptedModel extends ModelClient {
  readonly requests: ModelRequest[];
  readonly turns: number;
}

/** The model asking for a tool by name. */
export function toolUse(id: string, name: string, input: unknown): ContentBlock {
  return { type: "tool_use", id, name, input };
}

/** The model thinking out loud. */
export function says(text: string): ContentBlock {
  return { type: "text", text };
}

/** One scripted turn in which the model calls tools. */
export function callsTools(...blocks: ContentBlock[]): ModelResponse {
  return { stopReason: "tool_use", content: blocks };
}

/** One scripted turn in which the model stops without calling anything. */
export function stops(...blocks: ContentBlock[]): ModelResponse {
  return { stopReason: "end_turn", content: blocks };
}

/**
 * Play `responses` back, one per turn.
 *
 * Running past the end of the script is an error rather than a default turn: a loop
 * that took one more turn than the test scripted has done something the test did not
 * describe, and the test should say so rather than quietly absorb it.
 */
export function scripted(...responses: ModelResponse[]): ScriptedModel {
  const requests: ModelRequest[] = [];

  return {
    requests,

    get turns() {
      return requests.length;
    },

    createMessage(request) {
      const response = responses[requests.length];

      // Snapshotted, not kept by reference. The loop builds the conversation by
      // pushing onto one array, so holding the live object would make every captured
      // request point at the finished conversation — and a test asking "what did the
      // model see on turn 1?" would be reading the end state and passing on strings
      // that had not been said yet.
      requests.push(structuredClone(request));

      if (response === undefined) {
        throw new Error(
          `the loop asked for turn ${requests.length}, but only ${responses.length} were scripted`,
        );
      }

      return Promise.resolve(response);
    },
  };
}

/** A model that never reports, for proving the loop stops on its own. */
export function alwaysCalls(name: string, input: unknown): ModelClient {
  let call = 0;

  return {
    createMessage: () =>
      Promise.resolve(callsTools(toolUse(`call-${++call}`, name, input))),
  };
}
