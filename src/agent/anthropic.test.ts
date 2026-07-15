import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicClient } from "./anthropic.js";
import type { ModelRequest } from "./model.js";

type CreateParams = Anthropic.Messages.MessageCreateParamsNonStreaming;

// The model default reads the environment, so a stub must not outlive its test.
afterEach(() => {
  vi.unstubAllEnvs();
});

/** The SDK's `messages.create`, scripted, so the mapping is testable with no network. */
function fakeApi(reply: Partial<Anthropic.Messages.Message> = {}) {
  const calls: CreateParams[] = [];

  const api = {
    create: (params: CreateParams) => {
      calls.push(params);

      return Promise.resolve({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-4-8",
        content: [],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
        ...reply,
      } as Anthropic.Messages.Message);
    },
  };

  return { api, calls };
}

const request: ModelRequest = {
  system: "You audit code.",
  messages: [{ role: "user", content: "Audit this." }],
  tools: [
    {
      name: "get_component",
      description: "Look a component up.",
      inputSchema: { type: "object", properties: { id: { type: "string" } } },
    },
  ],
};

/**
 * The adapter is a translation, and every one of these is a way a translation can lose
 * something quietly. The scripted fake used everywhere else cannot catch any of them: it
 * speaks the port's language, so a mistranslation between the port and the SDK is
 * exactly what it cannot see. That is the gap these fill.
 */
describe("the request reaches the SDK intact", () => {
  it("passes the system prompt across", async () => {
    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(request);

    expect(calls[0]?.system).toBe("You audit code.");
  });

  it("passes the conversation across", async () => {
    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(request);

    expect(calls[0]?.messages).toEqual([{ role: "user", content: "Audit this." }]);
  });

  /**
   * The port says `inputSchema`; the API says `input_schema`. Getting this wrong would
   * not fail loudly — it would offer the model a tool with no schema, and the model
   * would start guessing arguments.
   */
  it("renames the schema to what the API expects", async () => {
    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(request);

    expect(calls[0]?.tools?.[0]).toEqual({
      name: "get_component",
      description: "Look a component up.",
      input_schema: { type: "object", properties: { id: { type: "string" } } },
    });
  });

  it("names a model to run against", async () => {
    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(request);

    expect(calls[0]?.model).toBeTruthy();
  });

  it("lets the caller choose the model, so 07 can score one against another", async () => {
    const { api, calls } = fakeApi();
    await anthropicClient({ api, model: "claude-sonnet-5" }).createMessage(request);

    expect(calls[0]?.model).toBe("claude-sonnet-5");
  });
});

/**
 * The model is configurable rather than decided, per the architecture: 07 answers "is
 * the cheaper tier good enough here?" with a measurement instead of an opinion. That is
 * only true if the tier can actually be swapped without editing code — `.env.example`
 * documents `COMPLIANCE_AGENT_MODEL`, and a default that ignored it would make the
 * documentation a lie and the comparison a code change.
 */
describe("the model can be swapped without touching the code", () => {
  it("takes the model from the environment", async () => {
    vi.stubEnv("COMPLIANCE_AGENT_MODEL", "claude-haiku-4-5-20251001");

    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(request);

    expect(calls[0]?.model).toBe("claude-haiku-4-5-20251001");
  });

  it("falls back to a capable default when the environment says nothing", async () => {
    vi.stubEnv("COMPLIANCE_AGENT_MODEL", "");

    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(request);

    expect(calls[0]?.model).toBe("claude-opus-4-8");
  });

  it("lets an explicit choice win over the environment", async () => {
    vi.stubEnv("COMPLIANCE_AGENT_MODEL", "claude-haiku-4-5-20251001");

    const { api, calls } = fakeApi();
    await anthropicClient({ api, model: "claude-sonnet-5" }).createMessage(request);

    expect(calls[0]?.model).toBe("claude-sonnet-5");
  });
});

/**
 * Tool results are the loop's whole output into the model, and the API's shape for them
 * differs from the port's in both spelling and nesting. A result that failed to map
 * would strand the model's question unanswered — which the API rejects outright.
 */
describe("tool results reach the SDK in the shape it expects", () => {
  const withResult: ModelRequest = {
    ...request,
    messages: [
      { role: "user", content: "Audit this." },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "get_component", input: { id: "Modal" } },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            toolUseId: "t1",
            content: '{"ref":"r1"}',
            isError: true,
          },
        ],
      },
    ],
  };

  it("addresses the result to the call that asked for it", async () => {
    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(withResult);

    expect(calls[0]?.messages[2]?.content).toMatchObject([{ tool_use_id: "t1" }]);
  });

  it("carries the error flag across, so the model knows it must correct itself", async () => {
    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(withResult);

    expect(calls[0]?.messages[2]?.content).toMatchObject([{ is_error: true }]);
  });

  it("does not invent an error flag on a result that succeeded", async () => {
    const clean: ModelRequest = {
      ...request,
      messages: [
        {
          role: "user",
          content: [{ type: "tool_result", toolUseId: "t1", content: "{}" }],
        },
      ],
    };
    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(clean);

    expect(calls[0]?.messages[0]?.content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: "{}" },
    ]);
  });

  it("sends the model's own tool call back as the API spells it", async () => {
    const { api, calls } = fakeApi();
    await anthropicClient({ api }).createMessage(withResult);

    expect(calls[0]?.messages[1]?.content).toEqual([
      { type: "tool_use", id: "t1", name: "get_component", input: { id: "Modal" } },
    ]);
  });
});

describe("the answer comes back in the port's shape", () => {
  it("carries the model's tool call through", async () => {
    const { api } = fakeApi({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "get_component",
          input: { id: "Modal", version: "4.0" },
        } as Anthropic.Messages.ContentBlock,
      ],
    });

    const response = await anthropicClient({ api }).createMessage(request);

    expect(response.content).toEqual([
      {
        type: "tool_use",
        id: "t1",
        name: "get_component",
        input: { id: "Modal", version: "4.0" },
      },
    ]);
  });

  it("carries the model's reasoning through", async () => {
    const { api } = fakeApi({
      content: [
        { type: "text", text: "Checking Modal." } as Anthropic.Messages.ContentBlock,
      ],
    });

    const response = await anthropicClient({ api }).createMessage(request);

    expect(response.content).toEqual([{ type: "text", text: "Checking Modal." }]);
  });

  it("reports why the turn stopped", async () => {
    const { api } = fakeApi({ stop_reason: "tool_use" });
    const response = await anthropicClient({ api }).createMessage(request);

    expect(response.stopReason).toBe("tool_use");
  });

  /**
   * The API may add block types we have never heard of, and a turn carrying one must not
   * take the run down. Dropping what we cannot use is safe — the loop reads tool calls
   * and text, and anything else was never going to be acted on.
   */
  it("ignores a block type it does not understand rather than choking", async () => {
    const { api } = fakeApi({
      content: [
        {
          type: "server_tool_use",
          id: "s1",
        } as unknown as Anthropic.Messages.ContentBlock,
        { type: "text", text: "Still here." } as Anthropic.Messages.ContentBlock,
      ],
    });

    const response = await anthropicClient({ api }).createMessage(request);

    expect(response.content).toEqual([{ type: "text", text: "Still here." }]);
  });

  /**
   * `stop_reason` is null while a turn is streaming, and the SDK types it as nullable.
   * The port does not have a null, so the adapter has to decide — and "the turn ended"
   * is the only honest reading of a finished non-streaming call.
   */
  it("reads a missing stop reason as an ended turn", async () => {
    const { api } = fakeApi({ stop_reason: null });
    const response = await anthropicClient({ api }).createMessage(request);

    expect(response.stopReason).toBe("end_turn");
  });
});
