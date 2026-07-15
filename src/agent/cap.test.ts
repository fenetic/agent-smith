import { describe, expect, it } from "vitest";
import { createLedger } from "./evidence.js";
import { registry } from "./fixture.js";
import { IterationCapError, runLoop } from "./loop.js";
import type { ModelClient } from "./model.js";
import { alwaysCalls, callsTools, says, scripted, stops, toolUse } from "./scripted.js";

function run(model: ModelClient, maxIterations?: number) {
  const ledger = createLedger();

  return {
    ledger,
    report: runLoop({
      registry,
      model,
      ledger,
      code: "<Modal>Confirm</Modal>",
      version: "4.0",
      ...(maxIterations !== undefined && { maxIterations }),
    }),
  };
}

/** A model with no intention of ever finishing. */
const neverReports = () =>
  alwaysCalls("get_component", { id: "Modal", version: "4.0" });

/**
 * The termination guarantee. A model that keeps asking and never concludes is the
 * failure mode a bounded loop exists for — without the cap this call never returns.
 */
describe("a run that will not finish is stopped", () => {
  it("stops instead of looping forever", async () => {
    await expect(run(neverReports(), 5).report).rejects.toThrow(IterationCapError);
  });

  it("stops at the cap rather than somewhere near it", async () => {
    let turns = 0;
    const counting: ModelClient = {
      createMessage: () => {
        turns++;

        return Promise.resolve(
          callsTools(
            toolUse(`c${turns}`, "get_component", { id: "Modal", version: "4.0" }),
          ),
        );
      },
    };

    await run(counting, 3).report.catch(() => undefined);

    expect(turns).toBe(3);
  });
});

/**
 * "A reported condition, not a silent stop." A capped run never reached a verdict, so
 * there is no honest report to hand back — returning the findings so far would present
 * a truncated audit as a finished one, and nothing downstream could tell the
 * difference. The distinct error type is what makes that impossible to miss.
 */
describe("hitting the cap is loud, not silent", () => {
  it("refuses to pass a runaway run off as a finished audit", async () => {
    await expect(run(neverReports(), 5).report).rejects.toThrow(IterationCapError);
  });

  it("says how many turns were spent, so the cap can be judged", async () => {
    const error = await run(neverReports(), 5).report.catch(
      (thrown: unknown) => thrown,
    );

    expect((error as IterationCapError).turns).toBe(5);
  });

  it("says plainly that this is a runaway rather than an answer", async () => {
    await expect(run(neverReports(), 5).report).rejects.toThrow(/not a finished audit/);
  });
});

/**
 * The cap must not fire on a run that was working. A model that finishes inside its
 * budget gets its report — the cap is a backstop, not a deadline.
 */
describe("the cap does not touch a run that finishes", () => {
  it("lets a model that reports on the last allowed turn through", async () => {
    const model = scripted(
      callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
      callsTools(toolUse("t2", "submit_report", { findings: [] })),
    );

    await expect(run(model, 2).report).resolves.toMatchObject({ version: "4.0" });
  });
});

/**
 * A model that stops talking without reporting has not finished either — it has
 * wandered off. It gets told to finish the job, which turns a dead end back into a
 * turn; if it will not, the cap is what ends the run rather than an infinite silence.
 */
describe("a model that trails off is asked to finish", () => {
  it("prompts a model that neither calls a tool nor reports", async () => {
    const model = scripted(
      stops(says("That all looks fine to me.")),
      callsTools(toolUse("t1", "submit_report", { findings: [] })),
    );

    await expect(run(model, 3).report).resolves.toMatchObject({ findings: [] });
  });

  it("tells it what it still owes", async () => {
    const model = scripted(
      stops(says("That all looks fine to me.")),
      callsTools(toolUse("t1", "submit_report", { findings: [] })),
    );

    await run(model, 3).report;

    expect(JSON.stringify(model.requests[1]?.messages)).toContain("submit_report");
  });

  it("still gives up if it never finishes", async () => {
    const trailsOff: ModelClient = {
      createMessage: () => Promise.resolve(stops(says("Nothing to add."))),
    };

    await expect(run(trailsOff, 4).report).rejects.toThrow(IterationCapError);
  });
});
