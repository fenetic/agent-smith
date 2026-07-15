import { beforeAll, describe, expect, it } from "vitest";
import { audit } from "../agent/audit.js";
import { createLedger } from "../agent/evidence.js";
import { registry } from "../agent/fixture.js";
import { callsTools, says, scripted, toolUse } from "../agent/scripted.js";
import { component, finding } from "../guardrails/fixture.js";
import { gate } from "../guardrails/gate.js";
import { createCollector } from "./collector.js";
import type { Trace } from "./events.js";
import { render } from "./render.js";

const CODE = "// legacy checkout\n<Modal>Confirm</Modal>";

function lines(trace: Trace): string[] {
  return render(trace).split("\n");
}

/** The line the renderer wrote for the one event of `type` in the trace. */
function lineFor(trace: Trace, type: string): string {
  return lines(trace).find((line) => line.trim().startsWith(type)) ?? "";
}

/**
 * A real gate's events, so the rendering is a view over what 05 actually said rather than
 * over a hand-written imitation of it. The reason string in particular is the check's own
 * words — a test that invented one could pass while the renderer dropped the real thing.
 */
function ruledOn(proposed: ReturnType<typeof finding>): Trace {
  const ledger = createLedger();
  component(ledger, "Modal");

  const collector = createCollector();
  gate({ version: "4.0", findings: [proposed] }, ledger, collector.emit);

  return collector.events();
}

/**
 * A whole run's events, from the real thing.
 *
 * The renderer's job is to make *this* legible — what 04 emitted, what 05 ruled, with 02's
 * answers inside it. Rendering a hand-built trace would test the renderer against a shape
 * nothing produces.
 */
async function auditedTrace(): Promise<Trace> {
  const collector = createCollector();

  await audit(CODE, "4.0", {
    registry,
    emit: collector.emit,
    model: scripted(
      callsTools(
        says("Modal looks deprecated; worth checking."),
        toolUse("t1", "get_component", { id: "Modal", version: "4.0" }),
      ),
      callsTools(
        toolUse("t2", "submit_report", {
          findings: [
            {
              target: "<Modal> at line 2",
              outcome: "violation",
              groundedIn: ["r1"],
              rationale: "Modal is deprecated as of 4.0.",
              suggestedFix: "Dialog",
            },
          ],
        }),
      ),
    ),
  });

  return collector.events();
}

let run: Trace;

beforeAll(async () => {
  run = await auditedTrace();
});

/**
 * The rendering is a view over the events, never a second source.
 *
 * Which is why it is tested for what it *carries* rather than for its exact words: the
 * prose should stay free to improve, and a test pinning it character for character would
 * make every improvement a failure. What must not change is that every event reaches the
 * page, in order, with the ids that make the chain walkable.
 */
describe("the narrative accounts for every event", () => {
  it("writes a line for each event in the trace", () => {
    expect(lines(run)).toHaveLength(run.length);
  });

  it("keeps the events in the order they happened", () => {
    expect(lines(run).map((line) => line.trim().split(" ")[0])).toEqual([
      "run-start",
      "reasoning",
      "retrieval",
      "finding",
      "guardrail",
      "run-end",
    ]);
  });

  /** Nothing happened, so there is nothing to narrate — not a page of scaffolding. */
  it("renders an empty trace as nothing at all", () => {
    expect(render([])).toBe("");
  });
});

/**
 * The indentation is what makes it a narrative rather than a list.
 *
 * The run's steps sit inside the run: a reader skimming for where one audit ends and the
 * next begins should find it by shape, without reading a word.
 */
describe("the run's steps sit inside the run", () => {
  it("leaves the question that started the run at the margin", () => {
    expect(lines(run)[0]).toBe(lines(run)[0]?.trimStart());
  });

  it("indents the steps the run took", () => {
    expect(lines(run)[1]).toMatch(/^\s+reasoning/);
  });

  it("brings the run's answer back to the margin", () => {
    expect(lines(run).at(-1)).toBe(lines(run).at(-1)?.trimStart());
  });
});

/**
 * This is the demo, and the reason the item exists: for any verdict, the exact tool call
 * that grounds it — what was asked, what came back, and whether the guardrail accepted it.
 * The ids are what carry that, so they have to survive onto the page.
 */
describe("the narrative can be followed from a verdict to its evidence", () => {
  it("names the ref the retrieval was recorded under", () => {
    expect(lineFor(run, "retrieval")).toContain("r1");
  });

  it("says what was asked of the tool", () => {
    expect(lineFor(run, "retrieval")).toContain("Modal");
  });

  it("says what came back", () => {
    expect(lineFor(run, "retrieval")).toContain("deprecated");
  });

  it("shows the verdict the agent reached", () => {
    expect(lineFor(run, "finding")).toContain("<Modal> at line 2");
  });

  /** Without this the chain breaks at its most important link. */
  it("shows which evidence the verdict cited", () => {
    expect(lineFor(run, "finding")).toContain("r1");
  });

  it("ties the guardrail's ruling to the verdict it judged", () => {
    expect(lineFor(run, "guardrail")).toContain("f1");
  });

  it("says the version the run was about", () => {
    expect(lineFor(run, "run-start")).toContain("4.0");
  });
});

describe("the narrative says why a verdict was refused", () => {
  const refused = ruledOn(finding({ groundedIn: ["r99"] }));

  it("says the guardrail refused it", () => {
    expect(lineFor(refused, "guardrail")).toContain("rejected");
  });

  it("names the check that fired", () => {
    expect(lineFor(refused, "guardrail")).toContain("real");
  });

  /** The check's own words, so a reader can judge whether the gate was right. */
  it("says what the check saw", () => {
    expect(lineFor(refused, "guardrail")).toContain("r99");
  });
});

describe("the narrative says when a run was stopped", () => {
  it("says how many turns a capped run spent", () => {
    expect(lineFor([{ type: "cap-hit", iterations: 25 }], "cap-hit")).toContain("25");
  });
});
