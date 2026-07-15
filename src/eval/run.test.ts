import { describe, expect, it } from "vitest";
import { registry } from "../agent/fixture.js";
import { callsTools, scripted, toolUse } from "../agent/scripted.js";
import type { EvalCase } from "./cases/types.js";
import { runCase, runSet } from "./run.js";

/**
 * A verdict the gate will pass: it cites `r1`, which is the ref the ledger mints for the
 * run's first retrieval. Scripted rather than reasoned — the model's judgment is what the
 * *real* run measures, and a fake imitating it would be testing an opinion about Claude
 * instead of this module's wiring.
 */
const modalFinding = {
  target: "<Modal> at line 1",
  outcome: "violation",
  groundedIn: ["r1"],
  rationale: "Modal is deprecated as of 4.0.",
};

/** One case's worth of script: look Modal up, then report on it. */
function auditsModal() {
  return [
    callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
    callsTools(toolUse("t2", "submit_report", { findings: [modalFinding] })),
  ];
}

/** The registry is 04's fixture, so an edit to the seed data cannot fail these. */
function deps(...turns: ReturnType<typeof callsTools>[]) {
  return { registry, model: scripted(...turns) };
}

function modalCase(over: Partial<EvalCase> = {}): EvalCase {
  return {
    id: "modal-on-active-code",
    snippet: "<Modal>Confirm</Modal>",
    version: "4.0",
    ambiguity: "temporal",
    expected: [{ target: "<Modal>", outcome: "violation" }],
    notes: "Deprecated at 4.0, and nothing in the code marks it as deliberate legacy.",
    ...over,
  };
}

/**
 * The harness's one job: put a case in front of the agent and score what comes back.
 *
 * It runs `audit` — the whole of 04, gate included — rather than reaching past it. A
 * harness that scored the loop's *proposal* would be measuring an agent nobody ships: what
 * a caller receives is what survived 05, and that is what ground truth is owed.
 */
describe("running one case", () => {
  it("scores the agent's verdict against the case's labels", async () => {
    const run = await runCase(modalCase(), deps(...auditsModal()));

    expect(run.result.comparisons[0]?.alignment).toBe("agree");
  });

  it("scores it under the case's id", async () => {
    const run = await runCase(
      modalCase({ id: "modal-legacy" }),
      deps(...auditsModal()),
    );

    expect(run.result.id).toBe("modal-legacy");
  });

  it("audits the case's own snippet", async () => {
    const run = await runCase(modalCase(), deps(...auditsModal()));

    expect(run.trace[0]).toMatchObject({
      type: "run-start",
      code: "<Modal>Confirm</Modal>",
    });
  });

  /** Half of what makes a case a case: the same usage is compliant at 3.0 and not at 4.0. */
  it("audits at the version the case names", async () => {
    const run = await runCase(modalCase(), deps(...auditsModal()));

    expect(run.trace[0]).toMatchObject({ type: "run-start", version: "4.0" });
  });
});

/**
 * A disagreement is a question — "why did it say that?" — and the trace is the only thing
 * that answers it without running the case again.
 *
 * Re-running is not an answer, because the agent is model-driven: the second run is a
 * different run, and the verdict being investigated may not reappear. Keeping the trace is
 * what makes a failing case something a person can open and read.
 */
describe("keeping the run behind each verdict", () => {
  it("keeps the retrievals the case's run made", async () => {
    const run = await runCase(modalCase(), deps(...auditsModal()));

    expect(run.trace.some((event) => event.type === "retrieval")).toBe(true);
  });

  it("keeps the verdicts the case's run produced", async () => {
    const run = await runCase(modalCase(), deps(...auditsModal()));

    expect(run.trace.some((event) => event.type === "finding")).toBe(true);
  });

  /**
   * One collector per case, not one per set. A trace that spanned two cases would narrate
   * them as a single sequence of events — and a reader opening the second case's run would
   * find the first case's retrievals in it.
   */
  it("does not let one case's trace run into the next", async () => {
    const runs = await runSet(
      [modalCase({ id: "first" }), modalCase({ id: "second" })],
      deps(...auditsModal(), ...auditsModal()),
    );

    expect(runs[1]?.trace.filter((event) => event.type === "run-start")).toHaveLength(
      1,
    );
  });
});

describe("running the set", () => {
  it("runs every case in it", async () => {
    const runs = await runSet(
      [modalCase({ id: "first" }), modalCase({ id: "second" })],
      deps(...auditsModal(), ...auditsModal()),
    );

    expect(runs).toHaveLength(2);
  });

  it("keeps the cases in the order the set names them", async () => {
    const runs = await runSet(
      [modalCase({ id: "first" }), modalCase({ id: "second" })],
      deps(...auditsModal(), ...auditsModal()),
    );

    expect(runs.map((run) => run.result.id)).toEqual(["first", "second"]);
  });

  it("has nothing to report for an empty set", async () => {
    expect(await runSet([], deps())).toEqual([]);
  });
});
