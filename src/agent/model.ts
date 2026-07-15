/**
 * The seam between 04's loop and the model.
 *
 * The loop depends on this port, never on the Anthropic SDK: a loop that reaches the
 * network cannot be red-green cycled — not quickly, not deterministically, and not
 * without a key. Behind this interface, tests script the model's turns and the loop's
 * real work (minting evidence, carrying `groundedIn`, the iteration cap, terminating)
 * becomes testable in milliseconds and offline. Production puts a thin adapter over
 * `@anthropic-ai/sdk` here, and that adapter is the only file in the repo importing it.
 *
 * Dependencies point inward, the same way they do for 06's observer: the loop owns
 * the port; the SDK implements it.
 *
 * The types are deliberately narrower than the Messages API. This is only what the
 * loop actually needs — one turn, some blocks back — so what the loop depends on
 * stays legible, and the SDK's surface stops at the adapter rather than leaking
 * through the module.
 */

/** A tool as the model is told about it. `inputSchema` is JSON Schema. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** The model asking to run a tool. `id` is the model's, and pairs the result back to it. */
export interface ToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/** The model thinking out loud. Kept because 06 turns these into the reasoning trace. */
export interface TextBlock {
  type: "text";
  text: string;
}

export type ContentBlock = TextBlock | ToolUse;

/** One tool's answer, addressed back to the call that asked for it. */
export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface Message {
  role: "user" | "assistant";
  content: string | (ContentBlock | ToolResultBlock)[];
}

export interface ModelRequest {
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
}

/**
 * One turn back from the model.
 *
 * The loop branches on the `tool_use` blocks in `content`, not on `stopReason`: the two
 * say the same thing, and the blocks are the thing that actually has to be answered. A
 * turn carrying tool calls must have every one of them answered whatever the API called
 * the stop, so reading the content directly cannot desync from what is really there.
 *
 * `stopReason` is carried anyway because it is part of an honest turn and says things
 * the blocks cannot — `max_tokens` means the turn was cut off rather than finished — and
 * because 06 renders it. The full set the API can return is kept rather than a narrowed
 * one, so the adapter never has to launder an unfamiliar reason into a familiar-looking
 * lie.
 */
export interface ModelResponse {
  stopReason:
    | "tool_use"
    | "end_turn"
    | "max_tokens"
    | "stop_sequence"
    | "pause_turn"
    | "refusal";
  content: ContentBlock[];
}

/** One turn, and nothing more. The loop is ours; this only takes a turn. */
export interface ModelClient {
  createMessage(request: ModelRequest): Promise<ModelResponse>;
}
