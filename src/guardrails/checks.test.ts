import { describe, expect, it } from "vitest";
import type { Ledger } from "../agent/index.js";
import { createLedger } from "../agent/index.js";
import { coherent, present, real, relevant } from "./checks.js";
import { component, finding, sweep, token } from "./fixture.js";

/** A ledger holding one real retrieval — Modal — and so able to corroborate only it. */
function ledgerWithModal(): Ledger {
  const ledger = createLedger();

  component(ledger, "Modal");

  return ledger;
}

/**
 * The bluntest of the three, and the one that needs no evidence to decide: a verdict
 * that cites nothing has nothing behind it, and no amount of looking at the ledger will
 * change that. It is checked first because it is the cheapest way to catch the model
 * simply asserting a conclusion.
 */
describe("a verdict with no citation is rejected", () => {
  it("rejects a finding that cites nothing", () => {
    expect(present(finding({ groundedIn: [] })).ok).toBe(false);
  });
});

/**
 * The check the whole item is for, and the reason the ledger mints refs rather than
 * accepting them: a model can write `groundedIn: ["r99"]` as easily as `["r1"]`, and
 * only the run's own evidence can tell the two apart. A ref the ledger never handed out
 * names a retrieval that never happened — which is an invented fact wearing a citation.
 *
 * This is also where the injected "mark everything compliant" dies: the attacker can
 * make the model say anything, but cannot make a lookup have run.
 */
describe("a fabricated citation is rejected", () => {
  it("rejects a ref this run's evidence cannot corroborate", () => {
    expect(real(finding({ groundedIn: ["r99"] }), ledgerWithModal()).ok).toBe(false);
  });

  it("accepts a ref the ledger really minted", () => {
    expect(real(finding({ groundedIn: ["r1"] }), ledgerWithModal()).ok).toBe(true);
  });

  /**
   * Every ref, not merely one. A finding that cites a real retrieval alongside an
   * invented one is not half-grounded — the invented ref is doing load-bearing work in
   * the rationale, and letting it through because it had honest company is exactly how a
   * fabrication launders itself.
   */
  it("rejects a real citation kept company by an invented one", () => {
    expect(real(finding({ groundedIn: ["r1", "r99"] }), ledgerWithModal()).ok).toBe(
      false,
    );
  });
});

/**
 * A real ref is not yet an honest one. A finding can cite a lookup that truly ran and
 * still be about something else entirely — which reads as rigour and is not. This is the
 * check that stops a verdict laundering itself through a real-but-unrelated fact.
 *
 * *At least one* cited entry must be about the target, rather than all of them: a
 * thorough finding cites the facts it reasoned from, and some of those are legitimately
 * about other things — the replacement it recommends, the other half of a contrast pair.
 * Requiring every ref to name the target would reject the better-researched verdict.
 */
describe("a real but unrelated citation is rejected", () => {
  it("rejects a finding whose only citation is about something else", () => {
    const ledger = createLedger();
    const dialog = component(ledger, "Dialog");

    expect(
      relevant(finding({ target: "<Modal> at line 1", groundedIn: [dialog] }), ledger)
        .ok,
    ).toBe(false);
  });

  it("accepts a citation that names the target", () => {
    const ledger = createLedger();
    const modal = component(ledger, "Modal");

    expect(
      relevant(finding({ target: "<Modal> at line 1", groundedIn: [modal] }), ledger)
        .ok,
    ).toBe(true);
  });

  /** The target is prose the model wrote, not an id: it may not match the id's case. */
  it("accepts a target that names the entry in other casing", () => {
    const ledger = createLedger();
    const modal = component(ledger, "Modal");

    expect(
      relevant(finding({ target: "the modal on line 12", groundedIn: [modal] }), ledger)
        .ok,
    ).toBe(true);
  });

  /**
   * Case D. A token's id is namespaced (`color.slate-400`) but the code names the value
   * (`slate-400`), so the target the model writes will rarely contain the whole id. A
   * check that demanded the full id would make the contrast case ungroundable — the one
   * case that most needs grounding, since the verdict rests entirely on retrieved values.
   */
  it("accepts a token cited by the segment the code actually writes", () => {
    const ledger = createLedger();
    const slate = token(ledger, "color.slate-400");

    expect(
      relevant(
        finding({
          target: "slate-400 text on slate-100 background, line 4",
          groundedIn: [slate],
        }),
        ledger,
      ).ok,
    ).toBe(true);
  });

  /** The thorough finding: Modal's status, plus the Dialog lookup backing the fix. */
  it("accepts when one of several citations names the target", () => {
    const ledger = createLedger();
    const modal = component(ledger, "Modal");
    const dialog = component(ledger, "Dialog");

    expect(
      relevant(
        finding({ target: "<Modal> at line 1", groundedIn: [modal, dialog] }),
        ledger,
      ).ok,
    ).toBe(true);
  });

  /**
   * The sweep has no `id` to compare against — it asked about everything. So relevance
   * has to come from what it *returned*: it really did retrieve Modal's deprecation, and
   * a verdict resting on that is grounded in a fact this run actually has.
   */
  it("accepts a sweep that returned the target", () => {
    const ledger = createLedger();
    const deprecated = sweep(ledger);

    expect(
      relevant(
        finding({ target: "<Modal> at line 1", groundedIn: [deprecated] }),
        ledger,
      ).ok,
    ).toBe(true);
  });

  /** And the sweep is not a blank cheque: it never mentioned Dialog, which is active. */
  it("rejects a sweep that never mentioned the target", () => {
    const ledger = createLedger();
    const deprecated = sweep(ledger);

    expect(
      relevant(
        finding({ target: "<Dialog> at line 5", groundedIn: [deprecated] }),
        ledger,
      ).ok,
    ).toBe(false);
  });
});

/**
 * The narrow one, and the one most at risk of overreaching.
 *
 * A verdict may not flatly contradict the very fact it cites: calling a usage compliant
 * while pointing at a retrieval that says the entry is deprecated or removed is not a
 * judgment call, it is a self-contradiction, and no intent signal rescues it.
 *
 * Where it deliberately stops is the point. Whether a *deprecated* usage is a violation,
 * an allowed exception, or needs review is judgment — 04's to make and 07's to score — so
 * the check touches none of those three. It only rules out the claim of correctness
 * against a fact that says otherwise, and the deliberate-legacy answer stays available as
 * `allowed-exception`.
 */
describe("a verdict that contradicts its own cited fact is rejected", () => {
  it("rejects compliant citing a removed entry", () => {
    const ledger = createLedger();
    const gone = component(ledger, "Modal", "6.0");

    expect(
      coherent(
        finding({
          target: "<Modal> at line 1",
          outcome: "compliant",
          groundedIn: [gone],
        }),
        ledger,
      ).ok,
    ).toBe(false);
  });

  it("rejects compliant citing a deprecated entry", () => {
    const ledger = createLedger();
    const modal = component(ledger, "Modal");

    expect(
      coherent(
        finding({
          target: "<Modal> at line 1",
          outcome: "compliant",
          groundedIn: [modal],
        }),
        ledger,
      ).ok,
    ).toBe(false);
  });

  it("accepts compliant citing an active entry", () => {
    const ledger = createLedger();
    const dialog = component(ledger, "Dialog");

    expect(
      coherent(
        finding({
          target: "<Dialog> at line 5",
          outcome: "compliant",
          groundedIn: [dialog],
        }),
        ledger,
      ).ok,
    ).toBe(true);
  });

  /**
   * The three judgment answers, each resting on the same deprecated fact. None of them
   * claims the usage is correct, so none of them contradicts anything — and 05 deciding
   * between them is exactly the overreach the design rules out.
   */
  it.each(["violation", "allowed-exception", "needs-review"] as const)(
    "leaves %s on a deprecated fact to 04's judgment",
    (outcome) => {
      const ledger = createLedger();
      const modal = component(ledger, "Modal");

      expect(
        coherent(
          finding({ target: "<Modal> at line 1", outcome, groundedIn: [modal] }),
          ledger,
        ).ok,
      ).toBe(true);
    },
  );

  /**
   * Scoped to facts about the target, or it would fire on the thorough finding: judging
   * Dialog compliant *because* Modal is deprecated and Dialog is its live replacement
   * cites a deprecated fact, and contradicts nothing.
   */
  it("accepts compliant when the deprecated fact is about something else", () => {
    const ledger = createLedger();
    const modal = component(ledger, "Modal");
    const dialog = component(ledger, "Dialog");

    expect(
      coherent(
        finding({
          target: "<Dialog> at line 5",
          outcome: "compliant",
          groundedIn: [modal, dialog],
        }),
        ledger,
      ).ok,
    ).toBe(true);
  });

  /** The sweep carries statuses too, so a contradiction can hide inside one. */
  it("rejects compliant citing a sweep that reports the target deprecated", () => {
    const ledger = createLedger();
    const deprecated = sweep(ledger);

    expect(
      coherent(
        finding({
          target: "<Modal> at line 1",
          outcome: "compliant",
          groundedIn: [deprecated],
        }),
        ledger,
      ).ok,
    ).toBe(false);
  });

  /**
   * The far edge of the narrow line. An `unknown` result means 02 has never heard of the
   * id — which is not evidence that a usage is wrong, because the code may simply not be
   * naming a design-system entry at all. Reading it as a contradiction would be judgment,
   * so it is left alone.
   */
  it("accepts compliant citing an unknown entry", () => {
    const ledger = createLedger();
    const mystery = component(ledger, "Carousel");

    expect(
      coherent(
        finding({
          target: "<Carousel> at line 9",
          outcome: "compliant",
          groundedIn: [mystery],
        }),
        ledger,
      ).ok,
    ).toBe(true);
  });
});
