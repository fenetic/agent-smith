import { describe, expect, it } from "vitest";
import { loadRegistry } from "../registry/index.js";
import { createLedger } from "./evidence.js";
import { runLoop } from "./loop.js";

/**
 * The one test that genuinely needs the network: a real model, the real registry, a real
 * loop, end to end.
 *
 * **What this asserts, and what it deliberately does not.** Everything here is
 * structural — a report came back, it terminated, every verdict is tied to a retrieval
 * that really happened. None of it asserts that the model *judged well*: whether this
 * snippet earns `violation` rather than `allowed-exception` is a question about a
 * nondeterministic system, and the honest way to answer it is 07's eval, with ground
 * truth and a score. Asserting judgment here would buy nothing and would make the suite
 * fail on model variance — a red build that means "the model phrased it differently
 * today", which is the most expensive kind of false alarm there is.
 *
 * So: this proves the machine runs. 07 proves it is right.
 *
 * Opt-in (`npm run test:integration`) and never in CI, because it costs money and needs
 * a key.
 */

const KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Case A, on active-looking work: `Modal` is deprecated as of 4.0 and replaced by
 * `Dialog`. Planted drift the agent has to go and look up — nothing in the snippet
 * announces it.
 */
const SNIPPET = `export function CheckoutConfirm() {
  return (
    <Modal title="Confirm order">
      <Button size="jumbo">Place order</Button>
    </Modal>
  );
}`;

describe.skipIf(KEY === undefined || KEY === "")("a real run, end to end", () => {
  it("produces a report whose every verdict rests on a fact it retrieved", {
    timeout: 120_000,
  }, async () => {
    const registry = loadRegistry();
    const ledger = createLedger();

    const report = await runLoop({
      registry,
      model: (await import("./anthropic.js")).anthropicClient(),
      ledger,
      code: SNIPPET,
      version: "5.0",
    });

    // It terminated, and it is about the version we asked about.
    expect(report.version).toBe("5.0");

    // It actually judged something. An empty report on planted drift would mean the
    // loop ran and the agent saw nothing — technically a Report, and useless.
    expect(report.findings.length).toBeGreaterThan(0);

    // It went and looked, rather than answering from what it already knew.
    expect(ledger.entries().length).toBeGreaterThan(0);

    // The claim the whole item rests on: every verdict cites refs, and every ref names
    // a retrieval this run really executed. Checked against the ledger rather than
    // against a list written here, because the ledger *is* what happened.
    for (const finding of report.findings) {
      expect(finding.groundedIn.length).toBeGreaterThan(0);

      for (const ref of finding.groundedIn) {
        expect(ledger.get(ref)).toBeDefined();
      }
    }

    // Every verdict says something about why. A citation with no reasoning is a
    // reference, not a judgment.
    for (const finding of report.findings) {
      expect(finding.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * Not a judgment assertion: this only checks the agent *asked about* the drift that was
   * planted. What it concluded is 07's to score — but an agent that never even looked
   * Modal up cannot have grounded a verdict about it, whatever it reported.
   */
  it("looks up the drift that was planted in front of it", {
    timeout: 120_000,
  }, async () => {
    const ledger = createLedger();

    await runLoop({
      registry: loadRegistry(),
      model: (await import("./anthropic.js")).anthropicClient(),
      ledger,
      code: SNIPPET,
      version: "5.0",
    });

    expect(ledger.entries().map((entry) => entry.args.id)).toContain("Modal");
  });
});
