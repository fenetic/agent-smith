import { describe, expect, it } from "vitest";
import { audit } from "../agent/audit.js";
import { registry } from "../agent/fixture.js";
import { callsTools, says, scripted, toolUse } from "../agent/scripted.js";
import { createCollector } from "./collector.js";

const CODE = "// legacy checkout\n<Modal>Confirm</Modal>";

const verdict = {
  target: "<Modal> at line 2",
  outcome: "violation",
  groundedIn: ["r1"],
  rationale: "Modal is deprecated as of 4.0; nothing marks this as legacy.",
  suggestedFix: "Dialog",
};

/** A model that thinks out loud, looks Modal up, and reports on it. */
const looksUpModal = () =>
  scripted(
    callsTools(
      says("Modal looks deprecated; worth checking."),
      toolUse("t1", "get_component", { id: "Modal", version: "4.0" }),
    ),
    callsTools(
      says("Deprecated as of 4.0, and the comment is not a legacy marker."),
      toolUse("t2", "submit_report", { findings: [verdict] }),
    ),
  );

/**
 * The run's boundaries are `audit`'s to draw, not the loop's.
 *
 * `run-end` carries what the *caller* received, which only exists once the gate has ruled —
 * the loop's report is a proposal, and a trace closing on it would name a verdict the gate
 * may have refused as the run's answer. `audit` is the only scope holding the code, the
 * version and the gated report, so it is the only one that can honestly bookend the run.
 */
describe("the trace opens with the question the run was asked", () => {
  it("carries the code under audit", async () => {
    const collector = createCollector();

    await audit(CODE, "4.0", { registry, model: looksUpModal(), emit: collector.emit });

    expect(collector.events().filter((event) => event.type === "run-start")).toEqual([
      { type: "run-start", code: CODE, version: "4.0" },
    ]);
  });

  /** First, because nothing in the run precedes being asked. */
  it("opens before anything the run did", async () => {
    const collector = createCollector();

    await audit(CODE, "4.0", { registry, model: looksUpModal(), emit: collector.emit });

    expect(collector.events()[0]?.type).toBe("run-start");
  });
});

describe("the trace closes with the answer the caller received", () => {
  it("carries the report the audit returned", async () => {
    const collector = createCollector();

    const report = await audit(CODE, "4.0", {
      registry,
      model: looksUpModal(),
      emit: collector.emit,
    });

    expect(collector.events().filter((event) => event.type === "run-end")).toEqual([
      { type: "run-end", report },
    ]);
  });

  /**
   * The gated report, not the proposal. A trace closing on the loop's findings would
   * present a refused verdict as the run's answer — the one thing 05 exists to prevent,
   * reintroduced in the record a reader trusts to check it.
   */
  it("closes with what survived the gate, not what the model proposed", async () => {
    const collector = createCollector();
    const fabricating = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(
        toolUse("t2", "submit_report", {
          findings: [{ ...verdict, groundedIn: ["r99"] }],
        }),
      ),
    );

    await audit(CODE, "4.0", { registry, model: fabricating, emit: collector.emit });

    const [closing] = collector.events().filter((event) => event.type === "run-end");

    expect(closing?.report.findings).toEqual([]);
  });

  it("closes after everything the run did", async () => {
    const collector = createCollector();

    await audit(CODE, "4.0", { registry, model: looksUpModal(), emit: collector.emit });

    expect(collector.events().at(-1)?.type).toBe("run-end");
  });
});

/**
 * The work item's definition of done, as one assertion.
 *
 * "Running the agent once yields an ordered trace covering every reasoning step and tool
 * call in that run." Every layer is here in the order it happened: the question, the
 * thought that led to a lookup, the lookup, the thought it produced, the verdict, the
 * ruling on the verdict, and the answer — one run, one legible sequence.
 */
describe("a single run yields a complete ordered trace", () => {
  it("records every step of the loop, in the order it happened", async () => {
    const collector = createCollector();

    await audit(CODE, "4.0", { registry, model: looksUpModal(), emit: collector.emit });

    expect(collector.events().map((event) => event.type)).toEqual([
      "run-start",
      "reasoning",
      "retrieval",
      "reasoning",
      "finding",
      "guardrail",
      "run-end",
    ]);
  });

  /**
   * The payoff, walked end to end: from the run's verdict back to the exact tool call that
   * grounds it. This is the chain narrated live in the demo, and it is only a chain if
   * every link lands — a `groundedIn` naming a ref no retrieval event carries would look
   * grounded and lead nowhere.
   */
  it("lets a verdict be followed to the lookup that grounds it", async () => {
    const collector = createCollector();

    await audit(CODE, "4.0", { registry, model: looksUpModal(), emit: collector.emit });

    const events = collector.events();
    const [proposed] = events.filter((event) => event.type === "finding");
    const retrieved = events.filter((event) => event.type === "retrieval");

    const grounds = retrieved.filter((event) =>
      proposed?.finding.groundedIn.includes(event.ref),
    );

    expect(grounds.map((event) => event.args)).toEqual([
      { id: "Modal", version: "4.0" },
    ]);
  });
});
