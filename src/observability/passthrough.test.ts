import { describe, expect, it } from "vitest";
import { audit } from "../agent/audit.js";
import { createLedger } from "../agent/evidence.js";
import { registry } from "../agent/fixture.js";
import { runLoop } from "../agent/loop.js";
import type { ScriptedModel } from "../agent/scripted.js";
import { callsTools, says, scripted, toolUse } from "../agent/scripted.js";
import { component, finding } from "../guardrails/fixture.js";
import { gate } from "../guardrails/gate.js";
import { createCollector } from "./collector.js";

const CODE = "// legacy checkout\n<Modal>Confirm</Modal>";

/**
 * A fresh model per run: a scripted model remembers the requests it was handed, so two
 * runs sharing one would be the second reading the first's script off the end.
 */
const looksUpModal = (): ScriptedModel =>
  scripted(
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
          {
            target: "brand.primary at line 2",
            outcome: "violation",
            groundedIn: ["r99"],
            rationale: "A fabricated citation, so the gate has something to refuse.",
          },
        ],
      }),
    ),
  );

/**
 * A characterization test, and honest about it: nothing here drove a line of the design.
 *
 * It could not have. The invariant is enforced by the 350 tests that already ran `runLoop`
 * and `gate` with no observer and had to keep passing while `emit` was added — *those* are
 * what forced the parameter to be optional and the default to be inert. This suite would
 * have passed the moment it was written, which is exactly why it is worth writing down and
 * not worth pretending otherwise: it names a property the design's definition of done calls
 * for, so that a future change breaking it fails with the reason rather than a puzzle.
 *
 * The claim is deliberately stronger than "the no-op observer changes nothing". A no-op
 * observer changing something would be absurd. What matters is that attaching a *real*
 * collector changes nothing either — 06 is record-only, and a trace that perturbed the run
 * it describes would be evidence about a different run.
 */
describe("a run that is being observed is the same run", () => {
  it("reaches the same verdicts with 06 attached as without it", async () => {
    const unobserved = await audit(CODE, "4.0", { registry, model: looksUpModal() });
    const observed = await audit(CODE, "4.0", {
      registry,
      model: looksUpModal(),
      emit: createCollector().emit,
    });

    expect(observed).toEqual(unobserved);
  });

  /** 05 still fails closed, and still says why, with nobody watching and with someone. */
  it("refuses the same verdicts with 06 attached as without it", async () => {
    const unobserved = await audit(CODE, "4.0", { registry, model: looksUpModal() });
    const observed = await audit(CODE, "4.0", {
      registry,
      model: looksUpModal(),
      emit: createCollector().emit,
    });

    expect(observed.rejections).toEqual(unobserved.rejections);
  });

  /** Same conversation, turn for turn: the model is not told it is being watched. */
  it("says the same things to the model", async () => {
    const unobserved = looksUpModal();
    await audit(CODE, "4.0", { registry, model: unobserved });

    const observed = looksUpModal();
    await audit(CODE, "4.0", {
      registry,
      model: observed,
      emit: createCollector().emit,
    });

    expect(observed.requests).toEqual(unobserved.requests);
  });
});

/**
 * The loop on its own, and the gate on its own — because the tests above cannot see this.
 *
 * `audit` always hands an observer down: with no `emit` in its deps it supplies its own
 * no-op, so from the loop's and the gate's side an audit is *always* observed. Comparing
 * two audits therefore compares two observed runs, and a loop that behaved differently the
 * moment someone listened would sail through every assertion above. Only calling `runLoop`
 * and `gate` with no observer at all reaches the default path, which is the one the claim
 * is actually about.
 */
describe("the loop runs the same with nobody listening", () => {
  it("reaches the same report whether or not an observer is attached", async () => {
    const unobserved = await runLoop({
      registry,
      model: looksUpModal(),
      ledger: createLedger(),
      code: CODE,
      version: "4.0",
    });

    const observed = await runLoop({
      registry,
      model: looksUpModal(),
      ledger: createLedger(),
      code: CODE,
      version: "4.0",
      emit: createCollector().emit,
    });

    expect(observed).toEqual(unobserved);
  });

  it("retains the same evidence either way", async () => {
    const quiet = createLedger();
    await runLoop({
      registry,
      model: looksUpModal(),
      ledger: quiet,
      code: CODE,
      version: "4.0",
    });

    const watched = createLedger();
    await runLoop({
      registry,
      model: looksUpModal(),
      ledger: watched,
      code: CODE,
      version: "4.0",
      emit: createCollector().emit,
    });

    expect(watched.entries()).toEqual(quiet.entries());
  });
});

describe("the gate rules the same with nobody listening", () => {
  it("gates identically whether or not an observer is attached", () => {
    const ledger = createLedger();
    const modal = component(ledger, "Modal");
    const findings = [
      finding({ target: "<Modal> at line 1", groundedIn: [modal] }),
      finding({ target: "<Modal> at line 8", groundedIn: ["r99"] }),
    ];

    const unobserved = gate({ version: "4.0", findings }, ledger);
    const observed = gate({ version: "4.0", findings }, ledger, createCollector().emit);

    expect(observed).toEqual(unobserved);
  });
});
