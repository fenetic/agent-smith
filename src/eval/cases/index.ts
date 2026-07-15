import type { EvalCase } from "./types.js";

export type { Ambiguity, EvalCase, ExpectedFinding } from "./types.js";

/**
 * The labelled set: one human's ground truth, written down.
 *
 * Every label here was decided by a person and is taken as truth by the harness. Nothing in
 * this file was generated, and nothing may be: an eval that model-generates its own correct
 * answers measures a model against itself and calls the agreement evidence. The labels are
 * argued for in `notes` rather than asserted, so a disagreement is a conversation someone
 * can have — including one where the *label* turns out to be wrong.
 *
 * The set realizes the seeds planted in `registry/cases.md`. 01 supplies the ingredients —
 * Modal's lifecycle, the jumbo variant, the stale alias, the undeclared slate pair — and
 * deliberately stops there, because the ambiguity lives in the *usage context*, which is
 * these snippets. The same registry fact appears below labelled three different ways, and
 * the only thing that differs is what the code says about its own intent. That is the whole
 * argument for the project: if the registry alone settled it, no judgment would be needed.
 *
 * Most cases audit at 5.0 — the version where Modal is deprecated but not yet removed and
 * the jumbo variant has just been deprecated, so the interesting facts are all live at once.
 *
 * Deliberately small and single-labelled. Real eval wants several labellers and an
 * inter-annotator agreement number; this is one person's judgment on nine cases, chosen to
 * be illustrative rather than statistically powered — a scope cut named in the design and
 * repeated here where someone reading the data will meet it.
 */
export const cases: EvalCase[] = [
  /**
   * Case A, reading 1 of 3. The deprecated component on code that says it is frozen.
   *
   * The comment is the whole case: it says this page is not being modernised and is headed
   * for deletion. A rule cannot read that, so a rule must call this a violation and file a
   * ticket nobody will action. The right answer is that the drift is real and deliberate.
   */
  {
    id: "modal-on-frozen-legacy",
    version: "5.0",
    ambiguity: "temporal",
    snippet: [
      "// LEGACY — frozen for the 2019 checkout flow. Do not modernise: this page is",
      "// deleted the day the new checkout ships. Pinned to the v3 design on purpose.",
      "export function LegacyCheckoutConfirm() {",
      '  return <Modal title="Confirm order">Your order is ready to place.</Modal>;',
      "}",
    ].join("\n"),
    expected: [{ target: "Modal", outcome: "allowed-exception" }],
    notes:
      "Modal is deprecated as of 4.0, so the fact is not in question — the intent is. The code states outright that it is frozen legacy scheduled for deletion, which is exactly the situation deprecation tolerates: migrating a page that is about to be deleted is work for no one's benefit. A violation here would be technically true and practically wrong, and a reviewer who saw it would learn to skim past this agent's output.",
  },

  /**
   * Case A, reading 2 of 3. The identical usage on code that says it is new.
   *
   * Same component, same version, same registry fact, opposite verdict. The pair of this
   * and the case above is the project's argument in two snippets.
   */
  {
    id: "modal-on-active-feature",
    version: "5.0",
    ambiguity: "temporal",
    snippet: [
      "// Billing revamp — first shipped this sprint, actively maintained.",
      "export function BillingUpgradePrompt() {",
      '  return <Modal title="Upgrade your plan">Pick a plan to continue.</Modal>;',
      "}",
    ].join("\n"),
    expected: [{ target: "Modal", outcome: "violation" }],
    notes:
      "The same deprecated fact as modal-on-frozen-legacy, and the opposite call. This is new work that shipped after Dialog existed, so it is not legacy to be tolerated — it is fresh code reaching for a component that was superseded a version ago, and Dialog is the named replacement. Nothing here signals a deliberate exception, which is what makes it a plain violation.",
  },

  /**
   * Case A, reading 3 of 3. The identical usage with nothing to go on.
   *
   * The most important label in the set. There is no signal either way, so the honest answer
   * is that a human must look — and an agent that picks a definite verdict here is guessing
   * and calling it judgment, which is the failure 04 is built to avoid.
   */
  {
    id: "modal-unsignalled",
    version: "5.0",
    ambiguity: "temporal",
    snippet: [
      "export function Confirm({ onAccept }) {",
      '  return <Modal title="Are you sure?">This cannot be undone.</Modal>;',
      "}",
    ].join("\n"),
    expected: [{ target: "Modal", outcome: "needs-review" }],
    notes:
      "Deliberately stripped of intent signals: no legacy marker, no dating, no hint whether this is maintained. The deprecated fact is identical to the two cases above and the context that decides them is simply absent, so neither `violation` nor `allowed-exception` is supportable. A human must decide. This is the case that separates an agent that knows what it does not know from one that always has an answer — and either definite verdict here scores confident-wrong, which is the point.",
  },

  /**
   * The unambiguous failure. Not a judgment call: at 6.0 the component is gone.
   */
  {
    id: "modal-after-removal",
    version: "6.0",
    ambiguity: "none",
    snippet: [
      "export function ArchiveWarning() {",
      '  return <Modal title="Archive this project?">You can restore it later.</Modal>;',
      "}",
    ].join("\n"),
    expected: [{ target: "Modal", outcome: "violation" }],
    notes:
      "Modal is removed as of 6.0, so this does not run — intent cannot rescue a component that no longer exists, and there is no reading of this that is an allowed exception. Here to prove the agent does not regress into escalating the easy cases while reasoning carefully about the hard ones: an agent that answers needs-review here is not being safe, it is being useless.",
  },

  /**
   * Case B. Drift inside an entry that is itself perfectly healthy.
   *
   * A component-level check asks "is Button deprecated?", hears no, and moves on. The whole
   * case is that the answer is yes and no at once, depending on the granularity you ask at.
   */
  {
    id: "button-jumbo-variant-drift",
    version: "5.0",
    ambiguity: "temporal",
    snippet: [
      "// Pricing page CTA — actively maintained, rebuilt this quarter.",
      "export function UpgradeCta() {",
      '  return <Button size="jumbo">Upgrade now</Button>;',
      "}",
      "",
    ].join("\n"),
    expected: [{ target: "jumbo", outcome: "violation" }],
    notes:
      "Button is active and has never been deprecated; its size=jumbo variant is deprecated as of 5.0 in favour of size=xl. The drift is one level below where a component check looks, which is why a naive lookup passes this and why it is in the set. The code is actively maintained and says so, so there is no legacy defence — this is a plain violation with a named replacement.",
  },

  /**
   * Case C. The false-confidence case: a stale alias pointing at a live value.
   */
  {
    id: "stale-brand-alias",
    version: "5.0",
    ambiguity: "temporal",
    snippet: [
      "// Marketing banner — rebuilt this quarter, actively maintained.",
      "export const bannerStyle = {",
      '  color: "brand.primary",',
      "};",
    ].join("\n"),
    expected: [{ target: "brand.primary", outcome: "violation" }],
    notes:
      "brand.primary is deprecated as of 4.0 for brand.primaryV2, but it still resolves to color.blue-500 — a real, live, entirely plausible colour. Nothing about the value announces that the alias is stale, which is exactly the trap: a resolver that follows the edge and reports the target's status reads `active` and is confidently wrong. Active code, deprecated token, named replacement, so: violation.",
  },

  /**
   * Case D. The case a lookup table cannot reach, in either direction.
   *
   * Both tokens are active and ordinary. The registry holds no relationship between them
   * and no rule to fire, because the problem is not a property of either one — it exists
   * only in the combination, which is not a fact the data models.
   */
  {
    id: "slate-contrast-fails",
    version: "5.0",
    ambiguity: "semantic",
    snippet: [
      "// Order summary caption.",
      "export const captionStyle = {",
      '  color: "color.slate-400",',
      '  background: "color.slate-100",',
      "};",
    ].join("\n"),
    expected: [
      { target: "color.slate-400", outcome: "violation" },
      { target: "color.slate-100", outcome: "compliant" },
    ],
    notes:
      "#94A3B8 on #F1F5F9 is 2.34:1 (WCAG 2.x) — nowhere near the 4.5:1 body text wants, and short even of the 3:1 allowed for large text. Both tokens are active, neither is deprecated, and the registry declares no relationship between them, so no lookup surfaces this and no rule fires: it takes reasoning about what the code does with the two values together. The violation is attributed to the foreground, because that is the half that has to change — slate-100 is an unremarkable surface and is labelled compliant on its own terms.",
  },

  /**
   * Case D's control, and the reason the case above proves anything.
   *
   * The same *shape* of usage — two active, undeclared tokens combined — that is simply
   * fine. Without it, an agent could learn "undeclared pair ⇒ violation", score full marks
   * on the case above, and have reasoned about nothing at all.
   */
  {
    id: "slate-contrast-passes",
    version: "5.0",
    ambiguity: "semantic",
    snippet: [
      "// Order summary heading.",
      "export const headingStyle = {",
      '  color: "color.slate-900",',
      '  background: "color.slate-100",',
      "};",
    ].join("\n"),
    expected: [
      { target: "color.slate-900", outcome: "compliant" },
      { target: "color.slate-100", outcome: "compliant" },
    ],
    notes:
      "#0F172A on #F1F5F9 is 16.30:1 (WCAG 2.x) — comfortably past every threshold. Structurally identical to slate-contrast-fails: two active tokens, combined, with no declared relationship between them. That is what makes it the control. If the agent flags this it has learned that an undeclared pairing is itself the signal, which would mean its success on the failing case was luck rather than reasoning about the actual colours.",
  },

  /**
   * The unambiguous pass. The current component, used correctly, on active code.
   */
  {
    id: "dialog-current",
    version: "5.0",
    ambiguity: "none",
    snippet: [
      "export function SaveConfirm({ onSave }) {",
      '  return <Dialog title="Save changes?">Your edits will be published.</Dialog>;',
      "}",
    ].join("\n"),
    expected: [{ target: "Dialog", outcome: "compliant" }],
    notes:
      "Dialog was added in 4.0, is not deprecated, and is the named replacement for Modal — this is precisely what the design system wants at 5.0. There is nothing to find. It is here because an agent tuned toward caution can score well on the hard cases by hedging everywhere, and the only way to catch that is to include code where the correct answer is that everything is fine.",
  },
];
