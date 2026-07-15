import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { audit } from "../agent/audit.js";
import { registry } from "../agent/fixture.js";
import { callsTools, says, scripted, toolUse } from "../agent/scripted.js";
import { createCollector } from "./collector.js";
import type { Trace } from "./events.js";
import { writeTrace } from "./persist.js";

/** A directory of this test's own, so one run's artifact cannot be another's. */
function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "trace-"));
}

/** The artifact as anything else would find it: bytes on disk, parsed as JSON. */
function readBack(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

const thinking: Trace = [
  { type: "reasoning", text: "<Modal> is worth a lookup." },
  { type: "cap-hit", iterations: 3 },
];

/**
 * The structured trace is the source of truth, and JSON is the whole of the contract.
 *
 * Written as data rather than as the rendered narrative, because the two have different
 * jobs: the rendering is a view a person reads once, and this is what a test asserts
 * against and what 07 draws on. A run persisted only as prose would have to be parsed back
 * out of its own presentation.
 */
describe("a trace survives being written down", () => {
  it("writes the events as JSON", () => {
    const file = join(tempDir(), "run.json");

    writeTrace(thinking, file);

    expect(readBack(file)).toEqual(thinking);
  });

  /** The one property the whole artifact exists to carry. */
  it("keeps the events in the order they happened", () => {
    const file = join(tempDir(), "run.json");

    writeTrace(thinking, file);

    expect((readBack(file) as Trace).map((event) => event.type)).toEqual([
      "reasoning",
      "cap-hit",
    ]);
  });

  /** A run that did nothing is still a run, and its trace is still an artifact. */
  it("writes a trace with no events at all", () => {
    const file = join(tempDir(), "run.json");

    writeTrace([], file);

    expect(readBack(file)).toEqual([]);
  });

  /**
   * A trace is written where the caller says, whether or not anything is there yet. The
   * first run of a demo is exactly the case that would otherwise fail — the run works, and
   * the record of it is lost to a missing directory.
   */
  it("creates the directory it was pointed at", () => {
    const file = join(tempDir(), "runs", "today", "run.json");

    writeTrace(thinking, file);

    expect(readBack(file)).toEqual(thinking);
  });
});

/**
 * The artifact has to survive the round trip *whole* — every event a real run emits, not
 * only the ones with primitive fields. The retrieval events carry 02's `Resolution`s
 * verbatim, and those are the fields a reader follows a citation into: a trace that
 * flattened them on the way to disk would persist a record no one could check.
 */
describe("a real run's trace survives the round trip", () => {
  it("writes back every event the run emitted", async () => {
    const collector = createCollector();

    await audit("// legacy\n<Modal>Confirm</Modal>", "4.0", {
      registry,
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
      emit: collector.emit,
    });

    const file = join(tempDir(), "run.json");
    writeTrace(collector.events(), file);

    expect(readBack(file)).toEqual(collector.events());
  });
});
