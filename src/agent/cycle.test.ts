import { describe, expect, it } from "vitest";
import { atVersion } from "../retrieval/index.js";
import { createLedger } from "./evidence.js";
import { registry } from "./fixture.js";
import { runLoop } from "./loop.js";
import type { ModelClient, ToolResultBlock } from "./model.js";
import type { ScriptedModel } from "./scripted.js";
import { callsTools, says, scripted, toolUse } from "./scripted.js";

const CODE = "// legacy checkout\n<Modal>Confirm</Modal>";

function run(model: ModelClient, version = "4.0") {
  const ledger = createLedger();

  return { ledger, report: runLoop({ registry, model, ledger, code: CODE, version }) };
}

/**
 * The tool results the loop had fed back by `turn` — and *only* those.
 *
 * Deliberately not "search the whole conversation for a string": the model's own
 * scripted words are in there too, so a blob search passes on text the fake supplied
 * rather than text the retrieval produced. Every claim below is about what the loop
 * put in front of the model, so it must read only the blocks the loop itself wrote.
 */
function resultsSeenOn(model: ScriptedModel, turn: number): ToolResultBlock[] {
  const messages = model.requests[turn]?.messages ?? [];

  return messages
    .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
    .filter((block): block is ToolResultBlock => block.type === "tool_result");
}

/** What the model was told, as one string — the loop's words only. */
function resultTextOn(model: ScriptedModel, turn: number): string {
  return resultsSeenOn(model, turn)
    .map((result) => result.content)
    .join("\n");
}

const reportOn = (ref: string) =>
  toolUse("t2", "submit_report", {
    findings: [
      {
        target: "<Modal> at line 2",
        outcome: "violation",
        groundedIn: [ref],
        rationale: "Modal is deprecated as of 4.0.",
        suggestedFix: "Dialog",
      },
    ],
  });

/**
 * The cycle the whole item exists to demonstrate: ask, observe, reason, go again.
 * A loop that ran the tool but dropped the answer would still terminate and still
 * produce a report — the model would simply be reasoning blind. So the claim worth
 * pinning is not "a tool ran", it is "what came back reached the next turn".
 */
describe("what the tool returned reaches the model's next turn", () => {
  it("carries 02's answer into the conversation", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(reportOn("r1")),
    );

    await run(model).report;

    // The whole answer, compared against 02 rather than sniffed for a keyword: the
    // model must receive the fact itself, not something that merely mentions it.
    expect(JSON.parse(resultTextOn(model, 1)).result).toEqual(
      JSON.parse(JSON.stringify(atVersion(registry, "4.0").component("Modal"))),
    );
  });

  it("carries the replacement across, so the model can suggest a fix it did not invent", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(reportOn("r1")),
    );

    await run(model).report;

    expect(JSON.parse(resultTextOn(model, 1)).result.replacedBy).toBe("Dialog");
  });

  it("hands over the ref, so the model has something real to cite", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(reportOn("r1")),
    );

    const { ledger, report } = run(model);
    await report;

    // Checked against the ledger, not against the literal "r1": the claim is that the
    // model was handed *this run's* evidence, and a hard-coded ref would still pass if
    // the loop sent something it made up.
    expect(JSON.parse(resultTextOn(model, 1)).ref).toBe(ledger.entries()[0]?.ref);
  });

  /**
   * The API pairs a result to the call that asked for it by id. Getting this wrong
   * would not fail loudly — it would answer the model's question with someone else's
   * answer, which is the worst kind of wrong for an agent that is about to cite it.
   */
  it("addresses the result to the call that asked for it", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(reportOn("r1")),
    );

    await run(model).report;

    expect(resultsSeenOn(model, 1).map((result) => result.toolUseId)).toEqual(["t1"]);
  });

  /**
   * The negative of the above, and the one that catches a loop that runs the tool and
   * throws the answer away: before the lookup there is nothing to see, and after it
   * there is exactly one result. A test that only checked "something arrived
   * eventually" would pass on a loop that answered every question with the same fact.
   */
  it("shows the model nothing before it has asked for anything", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(reportOn("r1")),
    );

    await run(model).report;

    expect(resultsSeenOn(model, 0)).toEqual([]);
  });
});

describe("the loop keeps going until the model reports", () => {
  it("takes as many turns as the model needs", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(toolUse("t2", "get_component", { id: "Dialog", version: "4.0" })),
      callsTools(toolUse("t3", "submit_report", { findings: [] })),
    );

    await run(model).report;

    expect(model.turns).toBe(3);
  });

  it("leaves evidence for every retrieval along the way", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(toolUse("t2", "get_component", { id: "Dialog", version: "4.0" })),
      callsTools(toolUse("t3", "submit_report", { findings: [] })),
    );

    const { ledger, report } = run(model);
    await report;

    expect(ledger.entries().map((entry) => entry.args.id)).toEqual(["Modal", "Dialog"]);
  });
});

/**
 * A model may ask for several facts at once — the contrast case needs two token values
 * before it can reason at all. Every call in a turn must be answered, because the API
 * requires it and because a silently dropped one is a fact the model thinks it has.
 */
describe("a turn may ask for more than one fact", () => {
  it("runs every tool call in the turn", async () => {
    const model = scripted(
      callsTools(
        toolUse("t1", "get_token", { id: "color.slate-400", version: "4.0" }),
        toolUse("t2", "get_token", { id: "color.slate-100", version: "4.0" }),
      ),
      callsTools(toolUse("t3", "submit_report", { findings: [] })),
    );

    const { ledger, report } = run(model);
    await report;

    expect(ledger.entries()).toHaveLength(2);
  });

  it("answers each call with its own result", async () => {
    const model = scripted(
      callsTools(
        toolUse("t1", "get_token", { id: "color.slate-400", version: "4.0" }),
        toolUse("t2", "get_token", { id: "color.slate-100", version: "4.0" }),
      ),
      callsTools(toolUse("t3", "submit_report", { findings: [] })),
    );

    await run(model).report;

    // Case D: both values must arrive for the contrast to be reasoned about at all.
    // Neither token announces the problem — it exists only in the pair, so a loop that
    // answered both calls with one token's value would leave the case unjudgeable.
    const values = resultsSeenOn(model, 1).map(
      (result) => JSON.parse(result.content).result.entry.value,
    );

    expect(values).toEqual(["#94A3B8", "#F1F5F9"]);
  });
});

/**
 * The recovery path, end to end. A fumbled call is not a dead run: the model reads the
 * complaint, asks again, and the audit finishes with a real fact behind it.
 */
describe("the run recovers from a call the model got wrong", () => {
  it("keeps going after a bad version and reports", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "9.9" })),
      callsTools(toolUse("t2", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(toolUse("t3", "submit_report", { findings: [] })),
    );

    await expect(run(model).report).resolves.toMatchObject({ version: "4.0" });
  });

  it("tells the model what was wrong with the call", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "9.9" })),
      callsTools(toolUse("t2", "submit_report", { findings: [] })),
    );

    await run(model).report;

    expect(resultTextOn(model, 1)).toContain("1.0, 2.0, 3.0, 4.0, 5.0, 6.0");
  });

  it("marks the complaint as an error, so the model reads it as one", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "9.9" })),
      callsTools(toolUse("t2", "submit_report", { findings: [] })),
    );

    await run(model).report;

    expect(resultsSeenOn(model, 1).map((result) => result.isError)).toEqual([true]);
  });

  it("counts only the lookup that really resolved as evidence", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "9.9" })),
      callsTools(toolUse("t2", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(toolUse("t3", "submit_report", { findings: [] })),
    );

    const { ledger, report } = run(model);
    await report;

    expect(ledger.entries()).toHaveLength(1);
  });
});

/**
 * The model's own reasoning has to survive the round trip. It is what 06 turns into the
 * trace, and — more immediately — a model that cannot see what it was thinking last
 * turn is starting over on every one.
 */
describe("the model's reasoning survives the round trip", () => {
  it("carries the model's own words back into the next turn", async () => {
    const model = scripted(
      callsTools(
        says("Modal looks deprecated; the comment says legacy, so I must weigh both."),
        toolUse("t1", "get_component", { id: "Modal", version: "4.0" }),
      ),
      callsTools(reportOn("r1")),
    );

    await run(model).report;

    const spoken = (model.requests[1]?.messages ?? [])
      .filter((message) => message.role === "assistant")
      .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
      .filter((block) => block.type === "text")
      .map((block) => block.text);

    expect(spoken).toEqual([
      "Modal looks deprecated; the comment says legacy, so I must weigh both.",
    ]);
  });
});

/**
 * The evidence is 02's answer itself, not the loop's retelling. If the two could ever
 * disagree, 05 would be gating citations against a paraphrase — and the fact the agent
 * reasoned from would be one nothing actually vouches for.
 */
describe("the evidence is exactly what 02 said", () => {
  it("retains 02's answer verbatim", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(reportOn("r1")),
    );

    const { ledger, report } = run(model);
    await report;

    expect(ledger.entries()[0]?.result).toEqual(
      atVersion(registry, "4.0").component("Modal"),
    );
  });
});
