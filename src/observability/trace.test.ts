import { describe, expect, it } from "vitest";
import { createLedger } from "../agent/evidence.js";
import { registry } from "../agent/fixture.js";
import { runLoop } from "../agent/loop.js";
import type { ModelClient } from "../agent/model.js";
import { alwaysCalls, callsTools, says, scripted, toolUse } from "../agent/scripted.js";
import { atVersion } from "../retrieval/index.js";
import type { Collector } from "./collector.js";
import { createCollector } from "./collector.js";

const CODE = "// legacy checkout\n<Modal>Confirm</Modal>";

/**
 * A run with 06 listening.
 *
 * The real loop, the real registry, a scripted model: the claim under test is that the
 * loop leaves a trail, so a fake loop would be testing the fake.
 */
function run(
  model: ModelClient,
  collector: Collector,
  version = "4.0",
  maxIterations?: number,
) {
  const ledger = createLedger();

  return {
    ledger,
    report: runLoop({
      registry,
      model,
      ledger,
      code: CODE,
      version,
      emit: collector.emit,
      ...(maxIterations !== undefined && { maxIterations }),
    }),
  };
}

/** What the trace says the model was thinking, in order. */
function reasoning(collector: Collector): string[] {
  return collector
    .events()
    .filter((event) => event.type === "reasoning")
    .map((event) => event.text);
}

/** What the trace says the run looked up, in order. */
function retrievals(collector: Collector) {
  return collector.events().filter((event) => event.type === "retrieval");
}

const reports = toolUse("t9", "submit_report", { findings: [] });
const finishes = callsTools(reports);

const looksUpModal = toolUse("t1", "get_component", { id: "Modal", version: "4.0" });

/**
 * Reasoning is the half of the loop the evidence cannot show.
 *
 * 04's ledger already retains every tool call, so a trace built from evidence alone would
 * show *what was asked* and never *why* — a list of lookups with the thinking between them
 * cut out. That thinking is precisely what the demo narrates and what makes a verdict
 * legible rather than merely correct, and 06 is the first thing that needs it, which is
 * why nothing before this captured it.
 */
describe("the trace carries the model's reasoning", () => {
  it("records what the model said on its way to a tool call", async () => {
    const collector = createCollector();
    const model = scripted(
      callsTools(says("Modal looks deprecated; worth checking."), looksUpModal),
      finishes,
    );

    await run(model, collector).report;

    expect(reasoning(collector)).toEqual(["Modal looks deprecated; worth checking."]);
  });

  /**
   * Across turns, not just within one. The reasoning that matters is the reasoning that
   * *developed* — what the model thought before the lookup and what it concluded after
   * seeing the answer — and a trace holding only the last turn's words would lose the
   * step the whole loop exists to demonstrate.
   */
  it("keeps the reasoning of every turn, in the order it was said", async () => {
    const collector = createCollector();
    const model = scripted(
      callsTools(says("Modal looks deprecated; worth checking."), looksUpModal),
      callsTools(says("Deprecated as of 4.0, and nothing marks this legacy."), reports),
    );

    await run(model, collector).report;

    expect(reasoning(collector)).toEqual([
      "Modal looks deprecated; worth checking.",
      "Deprecated as of 4.0, and nothing marks this legacy.",
    ]);
  });

  /**
   * A turn with nothing spoken leaves nothing in the trace. The trace is a record of what
   * happened, so a loop that invented an empty reasoning step per turn would be padding
   * the narrative with silence the model never uttered.
   */
  it("records no reasoning for a turn the model spent silent", async () => {
    const collector = createCollector();
    const model = scripted(callsTools(looksUpModal), finishes);

    await run(model, collector).report;

    expect(reasoning(collector)).toEqual([]);
  });
});

/**
 * The retrieval events *are* 04's ledger entries, lifted into the ordered trace.
 *
 * Lifted rather than rebuilt, deliberately: the ledger is what 05 gates citations against,
 * so a trace that assembled its own account of what was retrieved would be a second
 * description of the same event — free to drift from the one the guardrail actually used,
 * and a reader following a citation would be checking it against the wrong record.
 */
describe("the trace carries the lookups that ran", () => {
  it("records the lookup under the ref the ledger minted", async () => {
    const collector = createCollector();
    const model = scripted(callsTools(looksUpModal), finishes);

    const { ledger, report } = run(model, collector);
    await report;

    // Checked against the ledger rather than the literal "r1": the claim is that the
    // trace names *this run's* evidence, and a hard-coded ref would pass on a trace
    // that invented one.
    expect(retrievals(collector).map((event) => event.ref)).toEqual([
      ledger.entries()[0]?.ref,
    ]);
  });

  it("names the tool that was called and what was asked of it", async () => {
    const collector = createCollector();
    const model = scripted(callsTools(looksUpModal), finishes);

    await run(model, collector).report;

    expect(retrievals(collector)[0]).toMatchObject({
      tool: "get_component",
      args: { id: "Modal", version: "4.0" },
    });
  });

  /** The fact itself, so a reader can see what the verdict rests on rather than a label. */
  it("carries what 02 answered, not a retelling of it", async () => {
    const collector = createCollector();
    const model = scripted(callsTools(looksUpModal), finishes);

    await run(model, collector).report;

    expect(retrievals(collector)[0]?.result).toEqual(
      atVersion(registry, "4.0").component("Modal"),
    );
  });

  /**
   * The interleaving is the whole point of one ordered list rather than two.
   *
   * The ledger already holds the lookups in order; what it cannot show is the thought that
   * led to each one. A trace that grouped all the reasoning and then all the retrievals
   * would hold every event and still lose the only thing it was built to show.
   */
  it("places the reasoning before the lookup it led to", async () => {
    const collector = createCollector();
    const model = scripted(
      callsTools(says("Modal looks deprecated; worth checking."), looksUpModal),
      callsTools(says("Deprecated as of 4.0."), reports),
    );

    await run(model, collector).report;

    expect(collector.events().map((event) => event.type)).toEqual([
      "reasoning",
      "retrieval",
      "reasoning",
    ]);
  });

  /**
   * A call that never resolved left no evidence, so it must leave no retrieval event.
   *
   * This is the trace's half of the grounding claim. `executeTool` mints a ref only when a
   * lookup truly ran, and the trace has to inherit that discipline exactly — an event
   * announcing a retrieval that never happened would be the trace telling the same lie 05
   * exists to reject, in the record a reader trusts to check it.
   */
  it("records no retrieval for a call that never resolved", async () => {
    const collector = createCollector();
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "9.9" })),
      finishes,
    );

    await run(model, collector).report;

    expect(retrievals(collector)).toEqual([]);
  });
});

/**
 * A run that was stopped must say so in the record.
 *
 * The cap throws rather than returning a truncated report, so the *caller* cannot miss it
 * — but the trace is read after the fact, by someone asking what happened. A trace that
 * ended on an ordinary-looking retrieval, with no note that the loop was cut off, would
 * describe a runaway exactly the way it describes a run that finished: it would simply
 * stop. The event is what makes the difference legible.
 */
describe("the trace says when a run was stopped at the cap", () => {
  it("records the cap being hit", async () => {
    const collector = createCollector();
    const model = alwaysCalls("get_component", { id: "Modal", version: "4.0" });

    await run(model, collector, "4.0", 3).report.catch(() => undefined);

    expect(collector.events().filter((event) => event.type === "cap-hit")).toHaveLength(
      1,
    );
  });

  /** The count is the point: it is what tells a reader whether the cap was too tight. */
  it("says how many turns were spent before it gave up", async () => {
    const collector = createCollector();
    const model = alwaysCalls("get_component", { id: "Modal", version: "4.0" });

    await run(model, collector, "4.0", 3).report.catch(() => undefined);

    expect(
      collector
        .events()
        .filter((event) => event.type === "cap-hit")
        .map((event) => event.iterations),
    ).toEqual([3]);
  });

  /** Last, because it is the last thing that happened. */
  it("records it after the work the run managed to do", async () => {
    const collector = createCollector();
    const model = alwaysCalls("get_component", { id: "Modal", version: "4.0" });

    await run(model, collector, "4.0", 2).report.catch(() => undefined);

    expect(collector.events().map((event) => event.type)).toEqual([
      "retrieval",
      "retrieval",
      "cap-hit",
    ]);
  });

  /** A run that finished was never capped, and must not claim it was. */
  it("records no cap-hit for a run that reported on its own", async () => {
    const collector = createCollector();
    const model = scripted(callsTools(looksUpModal), finishes);

    await run(model, collector).report;

    expect(collector.events().filter((event) => event.type === "cap-hit")).toEqual([]);
  });
});
