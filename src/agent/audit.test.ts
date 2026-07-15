import { describe, expect, it } from "vitest";
import { loadRegistry } from "../registry/index.js";
import { atVersion } from "../retrieval/index.js";
import { audit } from "./audit.js";
import type { ToolResultBlock } from "./model.js";
import type { ScriptedModel } from "./scripted.js";
import { callsTools, scripted, toolUse } from "./scripted.js";

const finding = {
  target: "<Modal> at line 1",
  outcome: "violation",
  groundedIn: ["r1"],
  rationale: "Modal is deprecated as of 4.0.",
  suggestedFix: "Dialog",
};

/** A model that looks Modal up and reports on it. */
const looksUpModal = () =>
  scripted(
    callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
    callsTools(toolUse("t2", "submit_report", { findings: [finding] })),
  );

/** The tool results the model was handed on `turn`. */
function resultsSeenOn(model: ScriptedModel, turn: number): ToolResultBlock[] {
  return (model.requests[turn]?.messages ?? [])
    .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
    .filter((block): block is ToolResultBlock => block.type === "tool_result");
}

describe("audit answers with a report", () => {
  it("hands back the findings the run produced", async () => {
    const report = await audit("<Modal>Confirm</Modal>", "4.0", {
      model: looksUpModal(),
    });

    expect(report.findings).toEqual([finding]);
  });

  it("reports on the version it was asked about", async () => {
    const report = await audit("<Modal>Confirm</Modal>", "4.0", {
      model: looksUpModal(),
    });

    expect(report.version).toBe("4.0");
  });

  it("puts the caller's code in front of the model", async () => {
    const model = looksUpModal();
    await audit("<Modal>Confirm</Modal>", "4.0", { model });

    expect(JSON.stringify(model.requests[0]?.messages)).toContain(
      "<Modal>Confirm</Modal>",
    );
  });
});

/**
 * The wiring that matters: with nothing injected, the agent must be reading the real
 * registry — the same file 03 serves. A default quietly pointing somewhere else would
 * make every test in this module a claim about a fixture rather than about production,
 * and the project's "two consumers, one source of truth" would be untrue exactly where
 * it counts.
 */
describe("audit reads the real registry by default", () => {
  it("answers the model from the registry on disk", async () => {
    const model = looksUpModal();
    await audit("<Modal>Confirm</Modal>", "4.0", { model });

    expect(JSON.parse(resultsSeenOn(model, 1)[0]?.content ?? "{}").result).toEqual(
      JSON.parse(JSON.stringify(atVersion(loadRegistry(), "4.0").component("Modal"))),
    );
  });

  it("offers the model 02's lookups and a way to report", async () => {
    const model = looksUpModal();
    await audit("<Modal>Confirm</Modal>", "4.0", { model });

    expect(model.requests[0]?.tools.map((tool) => tool.name).sort()).toEqual([
      "get_component",
      "get_token",
      "list_deprecated",
      "submit_report",
    ]);
  });
});

/**
 * A version the registry never released is the caller's mistake, and 02 already draws
 * that line by throwing. `audit` must not soften it into an empty report — a caller who
 * typed the version wrong needs to hear about it, not receive a clean bill of health.
 */
describe("audit refuses a version the registry never released", () => {
  it("fails rather than auditing against a version that does not exist", async () => {
    await expect(
      audit("<Modal>Confirm</Modal>", "9.9", { model: looksUpModal() }),
    ).rejects.toThrow(RangeError);
  });

  it("names the versions that do exist", async () => {
    await expect(
      audit("<Modal>Confirm</Modal>", "9.9", { model: looksUpModal() }),
    ).rejects.toThrow(/1\.0, 2\.0, 3\.0, 4\.0, 5\.0, 6\.0/);
  });

  it("does not spend a model turn on a question it cannot answer", async () => {
    const model = looksUpModal();

    await audit("<Modal>Confirm</Modal>", "9.9", { model }).catch(() => undefined);

    expect(model.turns).toBe(0);
  });
});
