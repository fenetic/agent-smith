import { describe, expect, it } from "vitest";
import { createLedger } from "../agent/evidence.js";
import type { Ledger, Report } from "../agent/index.js";
import { component, finding } from "../guardrails/fixture.js";
import { gate } from "../guardrails/gate.js";
import type { Collector } from "./collector.js";
import { createCollector } from "./collector.js";

/** What 04 hands over: the caller's version, and a verdict per usage. */
function report(...findings: Report["findings"]): Report {
  return { version: "4.0", findings };
}

/** A run that looked Modal up, and the ref it would have been given for it. */
function runThatLookedUpModal(): { ledger: Ledger; modal: string } {
  const ledger = createLedger();

  return { ledger, modal: component(ledger, "Modal") };
}

/** The verdicts the trace says were proposed, in order. */
function verdicts(collector: Collector) {
  return collector.events().filter((event) => event.type === "finding");
}

/** The gate's rulings, in order. */
function rulings(collector: Collector) {
  return collector.events().filter((event) => event.type === "guardrail");
}

/**
 * The trace records what the model *claimed*, not only what survived.
 *
 * A trace built from the gated report would show four clean verdicts and no sign that a
 * fifth was refused — the run would read as though the model never overreached. That is
 * the same quiet dishonesty 05 refuses to commit when it records rejections rather than
 * dropping them, and the trace has to hold the line in the same place: the proposal is
 * an event, and the ruling on it is a separate one.
 */
describe("the trace carries the verdicts the model proposed", () => {
  it("records a verdict the gate accepted", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const collector = createCollector();
    const proposed = finding({ groundedIn: [modal] });

    gate(report(proposed), ledger, collector.emit);

    expect(verdicts(collector).map((event) => event.finding)).toEqual([proposed]);
  });

  /** The one that would vanish from a trace built out of the report. */
  it("records a verdict the gate refused", () => {
    const { ledger } = runThatLookedUpModal();
    const collector = createCollector();
    const fabricated = finding({ groundedIn: ["r99"] });

    gate(report(fabricated), ledger, collector.emit);

    expect(verdicts(collector).map((event) => event.finding)).toEqual([fabricated]);
  });

  /**
   * A verdict needs a name of its own before anything can be said *about* it. Findings
   * arrive from the model with no id — only a target, which two verdicts about the same
   * usage could share — so the gate mints one as it walks them, the way the ledger mints
   * a ref per retrieval.
   */
  it("gives each verdict a ref of its own", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const collector = createCollector();

    gate(
      report(
        finding({ target: "<Modal> at line 1", groundedIn: [modal] }),
        finding({ target: "<Modal> at line 8", groundedIn: [modal] }),
      ),
      ledger,
      collector.emit,
    );

    const [first, second] = verdicts(collector);

    expect(first?.ref).not.toBe(second?.ref);
  });
});

describe("the trace carries the gate's ruling on each verdict", () => {
  it("records an acceptance", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const collector = createCollector();

    gate(report(finding({ groundedIn: [modal] })), ledger, collector.emit);

    expect(rulings(collector).map((event) => event.outcome)).toEqual(["accepted"]);
  });

  it("records a rejection", () => {
    const { ledger } = runThatLookedUpModal();
    const collector = createCollector();

    gate(report(finding({ groundedIn: ["r99"] })), ledger, collector.emit);

    expect(rulings(collector).map((event) => event.outcome)).toEqual(["rejected"]);
  });

  /** The four checks fail in genuinely different ways, and the trace has to tell them apart. */
  it("names the check that fired", () => {
    const { ledger } = runThatLookedUpModal();
    const collector = createCollector();

    gate(report(finding({ groundedIn: ["r99"] })), ledger, collector.emit);

    expect(rulings(collector)[0]?.check).toBe("real");
  });

  it("says what the check saw", () => {
    const { ledger } = runThatLookedUpModal();
    const collector = createCollector();

    gate(report(finding({ groundedIn: ["r99"] })), ledger, collector.emit);

    expect(rulings(collector)[0]?.reason).toContain("r99");
  });

  /** A finding that passes is simply itself: there is no check to name and no gap to explain. */
  it("gives no reason for a verdict it did not refuse", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const collector = createCollector();

    gate(report(finding({ groundedIn: [modal] })), ledger, collector.emit);

    expect(rulings(collector)[0]?.reason).toBeUndefined();
  });
});

/**
 * This is the chain the whole item is built to make walkable:
 *
 *   guardrail ──findingRef──▶ finding ──groundedIn──▶ retrieval ──▶ args + Resolution
 *
 * Each link is only worth anything if it lands on the right end. A ruling that named the
 * wrong finding would let a reader read an acceptance over a verdict that was refused —
 * the trace agreeing with itself about the wrong thing, which is worse than saying nothing.
 */
describe("a ruling can be followed back to the verdict it judged", () => {
  it("links the ruling to its verdict's ref", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const collector = createCollector();

    gate(report(finding({ groundedIn: [modal] })), ledger, collector.emit);

    expect(rulings(collector)[0]?.findingRef).toBe(verdicts(collector)[0]?.ref);
  });

  /**
   * With one verdict, a ruling that always named `f1` would pass. With an accepted verdict
   * beside a refused one, only a ruling that really tracks its own finding survives.
   */
  it("rules on each verdict separately, and says so against the right ref", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const collector = createCollector();

    gate(
      report(
        finding({ target: "<Modal> at line 1", groundedIn: [modal] }),
        finding({ target: "<Modal> at line 8", groundedIn: ["r99"] }),
      ),
      ledger,
      collector.emit,
    );

    const byRef = new Map(rulings(collector).map((event) => [event.findingRef, event]));

    expect(
      verdicts(collector).map((event) => [
        event.finding.target,
        byRef.get(event.ref)?.outcome,
      ]),
    ).toEqual([
      ["<Modal> at line 1", "accepted"],
      ["<Modal> at line 8", "rejected"],
    ]);
  });

  /** The verdict is proposed, then ruled on. Any other order describes a gate that pre-judged. */
  it("records each verdict before the ruling on it", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const collector = createCollector();

    gate(
      report(
        finding({ target: "<Modal> at line 1", groundedIn: [modal] }),
        finding({ target: "<Modal> at line 8", groundedIn: ["r99"] }),
      ),
      ledger,
      collector.emit,
    );

    expect(collector.events().map((event) => event.type)).toEqual([
      "finding",
      "guardrail",
      "finding",
      "guardrail",
    ]);
  });

  /**
   * The far end of the chain. `groundedIn` must survive into the trace intact, naming the
   * retrieval events by the ledger's own ref — that is what turns "the agent cited a fact"
   * into something a reader can go and check.
   */
  it("keeps the verdict's citation, so it reaches the evidence", () => {
    const { ledger, modal } = runThatLookedUpModal();
    const collector = createCollector();

    gate(report(finding({ groundedIn: [modal] })), ledger, collector.emit);

    expect(verdicts(collector)[0]?.finding.groundedIn).toEqual([modal]);
  });
});
