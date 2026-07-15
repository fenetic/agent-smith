import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  Message,
  ModelClient,
  ModelRequest,
  ModelResponse,
  ToolResultBlock,
} from "./model.js";

/**
 * The real model behind 04's port — and the only file in the repo that imports the
 * Anthropic SDK.
 *
 * Everything it does is translation. The loop, the evidence, the judgment and the
 * grounding all live behind the port and know nothing about this file; what is here is
 * the difference between the port's spelling and the API's. That is the whole point of
 * the seam: the interesting code is testable offline because none of it is in here, and
 * this file is boring enough to read in one sitting.
 */

/**
 * The slice of the SDK this adapter uses. Injectable so the mapping can be tested
 * against a scripted API — the loop's own fake speaks the *port's* language, so it is
 * structurally unable to catch a mistranslation on this side of it.
 */
export interface MessagesApi {
  create(
    params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Messages.Message>;
}

export interface AnthropicOptions {
  api?: MessagesApi;
  model?: string;
  maxTokens?: number;
}

/**
 * Opus, per the architecture's call: the ambiguous cases are reasoning-heavy judgment,
 * which is what this tier is for. It is a default rather than a decision — 07 scores one
 * model against another and settles it with a measurement instead of an opinion.
 */
const DEFAULT_MODEL = "claude-opus-4-8";

/** Room for a full report of findings, each carrying a rationale. */
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Which model to drive, in order of who gets the last word: an explicit argument, then
 * the environment, then the default.
 *
 * The environment is what makes "decided by eval" true in practice rather than on paper
 * — swapping tiers to compare them has to be a config change, not a code change, or the
 * comparison costs a commit and nobody runs it. `.env.example` documents the variable.
 * An empty value is treated as unset, because that is what an untouched `.env` line
 * looks like and it should mean "I did not choose", not "run the empty model".
 */
function chooseModel(explicit?: string): string {
  const configured = process.env.COMPLIANCE_AGENT_MODEL?.trim();

  // `||` rather than `??`, and deliberately: an untouched `.env` line leaves an empty
  // string, not an absent variable, and "" must read as "I did not choose" rather than
  // be passed to the API as a model name.
  return explicit ?? (configured || DEFAULT_MODEL);
}

export function anthropicClient({
  api,
  model,
  maxTokens = DEFAULT_MAX_TOKENS,
}: AnthropicOptions = {}): ModelClient {
  const chosen = chooseModel(model);
  // Constructed lazily so that supplying an `api` needs no key: the SDK reads
  // ANTHROPIC_API_KEY at construction, and a test has no business needing one.
  const messages = api ?? new Anthropic().messages;

  return {
    async createMessage(request: ModelRequest): Promise<ModelResponse> {
      const response = await messages.create({
        model: chosen,
        max_tokens: maxTokens,
        system: request.system,
        messages: request.messages.map(toApiMessage),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
        })),
      });

      return {
        // `null` while a turn is streaming, which this call never is. "The turn ended" is
        // the only honest reading of a finished call that named no other reason.
        stopReason: response.stop_reason ?? "end_turn",
        content: response.content.flatMap(fromApiBlock),
      };
    },
  };
}

function toApiMessage(message: Message): Anthropic.Messages.MessageParam {
  return {
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map(toApiBlock),
  };
}

function toApiBlock(
  block: ContentBlock | ToolResultBlock,
): Anthropic.Messages.ContentBlockParam {
  if (block.type === "tool_result") {
    return {
      type: "tool_result",
      tool_use_id: block.toolUseId,
      content: block.content,
      // Spread rather than set: the API reads a present `is_error: false` as a claim
      // that the call succeeded, and a result that simply did not fail should say
      // nothing at all rather than assert it.
      ...(block.isError === true && { is_error: true }),
    };
  }

  if (block.type === "tool_use") {
    return { type: "tool_use", id: block.id, name: block.name, input: block.input };
  }

  return { type: "text", text: block.text };
}

/**
 * Read a block the model sent, keeping the two kinds the loop acts on.
 *
 * Anything else is dropped rather than passed along or thrown over: the API can add
 * block types at any time, and a turn carrying an unfamiliar one must not take an audit
 * down. Nothing is lost that could have been acted on — the loop answers tool calls and
 * reads text, and a block that is neither was never going to change a verdict.
 *
 * `flatMap` over an empty array is what does the dropping, so an unknown block
 * contributes nothing instead of an `undefined` for someone downstream to trip on.
 */
function fromApiBlock(block: Anthropic.Messages.ContentBlock): ContentBlock[] {
  if (block.type === "text") return [{ type: "text", text: block.text }];

  if (block.type === "tool_use") {
    return [{ type: "tool_use", id: block.id, name: block.name, input: block.input }];
  }

  return [];
}
