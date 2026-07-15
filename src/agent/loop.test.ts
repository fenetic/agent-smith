import { describe, expect, it } from "vitest";
import { createLedger } from "./evidence.js";
import { registry } from "./fixture.js";
import { runLoop } from "./loop.js";
import { callsTools, says, scripted, toolUse } from "./scripted.js";

/** A clean verdict the model might submit, with no retrieval behind it. */
const compliantFinding = {
  target: "<Dialog> at line 3",
  outcome: "compliant",
  groundedIn: ["r1"],
  rationale: "Dialog is active as of 4.0.",
};

/** Run the loop the way `audit` will, with a model whose turns are written in advance. */
function run(model: Parameters<typeof runLoop>[0]["model"], version = "4.0") {
  const ledger = createLedger();

  return {
    ledger,
    report: runLoop({
      registry,
      model,
      ledger,
      code: "<Dialog>Hello</Dialog>",
      version,
    }),
  };
}

/**
 * The simplest run there is: the model looks, judges, reports. No retrieval, no
 * second turn. It proves the loop can finish at all — everything else is this plus
 * more turns.
 */
describe("a model that reports straight away gets a report back", () => {
  it("returns the findings the model submitted", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "submit_report", { findings: [compliantFinding] })),
    );

    const { report } = run(model);

    expect((await report).findings).toEqual([compliantFinding]);
  });

  it("stops as soon as the report is in, rather than asking for another turn", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "submit_report", { findings: [compliantFinding] })),
    );

    await run(model).report;

    expect(model.turns).toBe(1);
  });

  /**
   * An audit that found nothing is a real answer — clean code exists. It must not be
   * confused with an audit that failed to run, which is why the empty report is worth
   * pinning rather than treating as a degenerate accident.
   */
  it("accepts an empty report as a finished audit of clean code", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "submit_report", { findings: [] })),
    );

    expect((await run(model).report).findings).toEqual([]);
  });
});

/**
 * The version is the caller's fact, not the model's. Taking it from the audit rather
 * than from what the model submitted means a report cannot claim to be about 4.0 while
 * the lookups behind it were resolved at 3.0 — the version scopes the retrieval, so it
 * has to be the same one throughout.
 */
describe("the report names the version that was actually audited", () => {
  it("reports the version the audit was asked for", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "submit_report", { findings: [] })),
    );

    expect((await run(model, "4.0").report).version).toBe("4.0");
  });

  it("does not let the model restate the version as something else", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "submit_report", { findings: [], version: "1.0" })),
    );

    expect((await run(model, "4.0").report).version).toBe("4.0");
  });
});

/**
 * What the loop tells the model on the first turn. The code and the version are the
 * whole question — an agent that was never shown the code, or never told which version
 * to resolve against, would be reasoning about nothing.
 */
describe("the model is given the question", () => {
  it("puts the code in front of the model", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "submit_report", { findings: [] })),
    );
    await run(model).report;

    expect(JSON.stringify(model.requests[0]?.messages)).toContain(
      "<Dialog>Hello</Dialog>",
    );
  });

  it("tells the model which version the code targets", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "submit_report", { findings: [] })),
    );
    await run(model, "4.0").report;

    expect(JSON.stringify(model.requests[0])).toContain("4.0");
  });

  it("offers the retrieval tools alongside the way to report", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "submit_report", { findings: [] })),
    );
    await run(model).report;

    expect(model.requests[0]?.tools.map((tool) => tool.name).sort()).toEqual([
      "get_component",
      "get_token",
      "list_deprecated",
      "submit_report",
    ]);
  });
});

/**
 * A model may narrate before it acts. That text is 06's raw material for the reasoning
 * trace, and must not confuse the loop on the way past.
 */
describe("the model may think out loud on its way to the report", () => {
  it("still reports when the model talks first", async () => {
    const model = scripted(
      callsTools(
        says("The code uses Dialog, which I should check."),
        toolUse("t1", "submit_report", { findings: [compliantFinding] }),
      ),
    );

    expect((await run(model).report).findings).toHaveLength(1);
  });
});
