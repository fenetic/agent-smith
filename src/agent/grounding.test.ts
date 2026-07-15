import { describe, expect, it } from "vitest";
import type { Resolution } from "../retrieval/index.js";
import { createLedger } from "./evidence.js";
import { registry } from "./fixture.js";
import { runLoop } from "./loop.js";
import type { ModelClient } from "./model.js";
import { callsTools, scripted, toolUse } from "./scripted.js";

function run(model: ModelClient, code = "<Modal>Confirm</Modal>", version = "4.0") {
  const ledger = createLedger();

  return { ledger, report: runLoop({ registry, model, ledger, code, version }) };
}

/** A model that looks Modal up, then cites the ref it was handed for that lookup. */
function citesWhatItRetrieved(ref: string) {
  return scripted(
    callsTools(toolUse("t1", "get_component", { id: "Modal", version: "4.0" })),
    callsTools(
      toolUse("t2", "submit_report", {
        findings: [
          {
            target: "<Modal> at line 1",
            outcome: "violation",
            groundedIn: [ref],
            rationale: "Modal is deprecated as of 4.0; nothing marks this as legacy.",
            suggestedFix: "Dialog",
          },
        ],
      }),
    ),
  );
}

/**
 * The claim the item is really making: a verdict is tied to a fact the agent went and
 * got. Not "the model mentioned a source" — the ref resolves, in this run's evidence,
 * to the actual `Resolution` 02 returned.
 */
describe("a finding is tied to a fact the run really retrieved", () => {
  it("keeps the refs the model cited", async () => {
    const { report } = run(citesWhatItRetrieved("r1"));

    expect((await report).findings[0]?.groundedIn).toEqual(["r1"]);
  });

  it("cites a ref that this run's evidence can corroborate", async () => {
    const { ledger, report } = run(citesWhatItRetrieved("r1"));
    const cited = (await report).findings[0]?.groundedIn ?? [];

    expect(cited.map((ref) => ledger.get(ref) !== undefined)).toEqual([true]);
  });

  /**
   * The citation has to lead back to *the fact the verdict is about*, not merely to
   * some retrieval that happened. A ref that resolved to the wrong lookup would be a
   * verdict grounded in an unrelated truth — which reads as rigour and is not.
   */
  it("cites the very fact the rationale is reasoning from", async () => {
    const { ledger, report } = run(citesWhatItRetrieved("r1"));
    const ref = (await report).findings[0]?.groundedIn[0] ?? "";
    const evidence = ledger.get(ref);
    const result = evidence?.result as Resolution<{ id: string }>;

    expect({
      tool: evidence?.tool,
      asked: evidence?.args.id,
      status: result.status,
    }).toEqual({
      tool: "get_component",
      asked: "Modal",
      status: "deprecated",
    });
  });
});

/**
 * Case D needs two facts before it can be judged at all: the contrast lives in the
 * pair, so the verdict rests on both token values and must cite both. A finding that
 * could only ever cite one fact would make the semantic case ungroundable.
 */
describe("a verdict may rest on more than one fact", () => {
  it("keeps every ref a finding cites", async () => {
    const model = scripted(
      callsTools(
        toolUse("t1", "get_token", { id: "color.slate-400", version: "4.0" }),
        toolUse("t2", "get_token", { id: "color.slate-100", version: "4.0" }),
      ),
      callsTools(
        toolUse("t3", "submit_report", {
          findings: [
            {
              target: "slate-400 text on slate-100 background, line 4",
              outcome: "violation",
              groundedIn: ["r1", "r2"],
              rationale: "#94A3B8 on #F1F5F9 is about 1.9:1, below the 4.5:1 minimum.",
            },
          ],
        }),
      ),
    );

    const { report } = run(model);

    expect((await report).findings[0]?.groundedIn).toEqual(["r1", "r2"]);
  });

  it("can corroborate both of them from this run's evidence", async () => {
    const model = scripted(
      callsTools(
        toolUse("t1", "get_token", { id: "color.slate-400", version: "4.0" }),
        toolUse("t2", "get_token", { id: "color.slate-100", version: "4.0" }),
      ),
      callsTools(
        toolUse("t3", "submit_report", {
          findings: [
            {
              target: "slate-400 text on slate-100 background, line 4",
              outcome: "violation",
              groundedIn: ["r1", "r2"],
              rationale: "#94A3B8 on #F1F5F9 is about 1.9:1, below the 4.5:1 minimum.",
            },
          ],
        }),
      ),
    );

    const { ledger, report } = run(model);
    const cited = (await report).findings[0]?.groundedIn ?? [];

    expect(cited.map((ref) => ledger.get(ref)?.args.id)).toEqual([
      "color.slate-400",
      "color.slate-100",
    ]);
  });
});

/**
 * The 04/05 seam, pinned from 04's side.
 *
 * 04 *populates* grounding; 05 *enforces* it. So an ungrounded or fabricated citation
 * must arrive intact rather than be quietly dropped here — the same shape/enforcement
 * split 01 and 02 use. Silently discarding it would be worse than useless: 05 would
 * have nothing left to reject, and a model that cited nothing would look identical to
 * one that had nothing to say.
 */
describe("04 populates grounding but does not police it", () => {
  it("passes an uncited verdict through for 05 to reject", async () => {
    const model = scripted(
      callsTools(
        toolUse("t1", "submit_report", {
          findings: [
            {
              target: "<Modal> at line 1",
              outcome: "violation",
              groundedIn: [],
              rationale: "Modal feels outdated.",
            },
          ],
        }),
      ),
    );

    expect((await run(model).report).findings[0]?.groundedIn).toEqual([]);
  });

  it("passes a fabricated citation through rather than swallowing it", async () => {
    const { report } = run(citesWhatItRetrieved("r99"));

    expect((await report).findings[0]?.groundedIn).toEqual(["r99"]);
  });

  /**
   * And leaves 05 what it needs to catch it: the ledger cannot corroborate a ref it
   * never minted, which is exactly how a fabricated citation is detected.
   */
  it("leaves a fabricated citation uncorroborated by the evidence", async () => {
    const { ledger, report } = run(citesWhatItRetrieved("r99"));
    await report;

    expect(ledger.get("r99")).toBeUndefined();
  });
});
