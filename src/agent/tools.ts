import { z } from "zod";
import type { ComponentEntry, Registry, TokenEntry } from "../registry/index.js";
import type { Resolution } from "../retrieval/index.js";
import { atVersion } from "../retrieval/index.js";
import type { RetrievalArgs, RetrievalResult, ToolName } from "./evidence.js";
import type { ToolDefinition } from "./model.js";

type Entry = ComponentEntry | TokenEntry;

/**
 * Every tool takes a version, and the schema is what enforces it.
 *
 * In-process, "no lookup without a version" needs no enforcing: `atVersion` is the
 * only door into 02, so there is nothing to call without one. The model is not
 * in-process — it can ask for any JSON it likes — so the guarantee has to be
 * restated in a form that reaches it. This is 02's structural property wearing the
 * model's clothes, the same job 03's schema does over the wire.
 */
const version = z
  .string()
  .describe('The design-system version the code targets, e.g. "4.0".');

/**
 * `min(1)` rather than a bare string: an empty id is not a lookup, and 02 would
 * answer it with `unrecognized-id` — a real-looking miss to a question nobody
 * asked, which the model would then reason from. Refusing it is cheaper than
 * explaining it.
 */
const id = z.string().min(1).describe("The entry's id, exactly as written in code.");

const pointArgs = z.object({ id, version });
const sweepArgs = z.object({ version });

/** The input each tool accepts. The sweep takes a version and nothing else. */
const argsSchema: Record<ToolName, z.ZodType<RetrievalArgs>> = {
  get_component: pointArgs,
  get_token: pointArgs,
  list_deprecated: sweepArgs,
};

/** The tools that exist, as data — so "is this a tool?" has one answer, asked once. */
export const toolNames = Object.keys(argsSchema) as ToolName[];

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(argsSchema, name);
}

/** What each tool is for, in the terms the model needs to pick between them. */
const descriptions: Record<ToolName, string> = {
  get_component:
    "Look up a component's standing as of a version: whether it is active, deprecated (and what replaced it), removed, or unknown. Call this for every component the code uses.",
  get_token:
    "Look up a design token's standing as of a version, following any alias chain to report it at its worst node. Returns the token's real value, so this is also how you get the values to reason about a colour pairing.",
  list_deprecated:
    "List every component and token that is deprecated as of a version, with its replacement. Useful for orienting, but not a substitute for looking up each usage you actually found.",
};

/**
 * The three lookups as the model is told about them.
 *
 * Each schema is generated from the very object `executeTool` validates against,
 * rather than written out again here. That is what keeps the contract the model is
 * *shown* identical to the one it is *held to*: a hand-maintained second copy could
 * come to say a version was optional while validation still refused it, and the model
 * would have no way to correct itself — the rules it was given would not be the rules
 * being applied.
 */
export const retrievalTools: ToolDefinition[] = toolNames.map((name) => ({
  name,
  description: descriptions[name],
  inputSchema: z.toJSONSchema(argsSchema[name]) as Record<string, unknown>,
}));

/**
 * Read the model's input for `tool`, or say what was wrong with it.
 *
 * Validation failure is a message, not a throw: the model can read the complaint
 * and ask again, and an audit should not die because a tool call was fumbled once.
 */
export function parseArgs(
  tool: ToolName,
  input: unknown,
): { ok: true; args: RetrievalArgs } | { ok: false; complaint: string } {
  const parsed = argsSchema[tool].safeParse(input);

  return parsed.success
    ? { ok: true, args: parsed.data }
    : {
        ok: false,
        complaint: `${tool} was called with invalid arguments: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"} — ${issue.message}`)
          .join("; ")}`,
      };
}

/**
 * Run one of 02's lookups as of `args.version`.
 *
 * This is the *internal* adapter over 02, the twin of 03's external one: the agent
 * and an MCP client ask the same module the same questions and get the same
 * answers, which is the project's central claim made structural rather than
 * asserted. Nothing is interpreted on the way through — no status is re-derived, no
 * answer is softened — because a second opinion formed here would be a second source
 * of truth, and the agent would be reasoning about something other than what 02 said.
 *
 * `atVersion` is the only door into 02, so naming a version is not a rule this
 * function remembers to follow — there is nothing else to call.
 */
export function retrieve(
  registry: Registry,
  tool: "get_component" | "get_token",
  args: RetrievalArgs,
): Resolution<Entry>;
export function retrieve(
  registry: Registry,
  tool: "list_deprecated",
  args: RetrievalArgs,
): Resolution<Entry>[];
export function retrieve(
  registry: Registry,
  tool: ToolName,
  args: RetrievalArgs,
): RetrievalResult;
export function retrieve(
  registry: Registry,
  tool: ToolName,
  args: RetrievalArgs,
): RetrievalResult {
  const resolver = atVersion(registry, args.version);

  switch (tool) {
    case "get_component":
      return resolver.component(requireId(tool, args));

    // 02's alias-resolving path, deliberately — reading a token's own lifecycle
    // would be quicker and wrong: a stale alias pointing at a live value would
    // report "active", which is the false confidence 02 exists to prevent.
    case "get_token":
      return resolver.token(requireId(tool, args));

    case "list_deprecated":
      return resolver.listDeprecated();
  }
}

/**
 * The id a point lookup cannot work without.
 *
 * Reaching here means the model sent `get_component` with no id — a malformed
 * question, and the same kind of thing as naming a version that was never
 * released. Both are the caller's to fix, so both are thrown and both are turned
 * into an answer the model can read and correct itself from at the boundary. What
 * must not happen is a guess: an empty id would resolve to `unrecognized-id`, and
 * the agent would go on to reason about a component that was never asked about.
 */
function requireId(tool: ToolName, args: RetrievalArgs): string {
  if (args.id === undefined || args.id === "") {
    throw new RangeError(
      `${tool} needs an id — the entry to look up, as written in code.`,
    );
  }

  return args.id;
}
