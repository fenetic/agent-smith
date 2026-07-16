import type { Version } from "../registry/index.js";

/**
 * The planted file the live demo audits, and the whole of Act 1's input.
 *
 * One file, read at a single version, carrying the full range of outcomes so that one
 * trace walks the entire argument in a single sitting. Each function is lifted from an
 * already-argued 07 eval snippet — the labels and the reasoning behind them live in
 * `src/eval/cases/index.ts` — and assembled here so the money moment is visible side by
 * side: `Modal` is one registry fact (deprecated as of 4.0, replaced by `Dialog`, not yet
 * removed at 5.0), and it comes back three different verdicts below depending only on what
 * the code says about its own intent. If the registry alone settled it, no judgment would
 * be needed and this would be a linter.
 *
 * This combined file is demo-only and is deliberately not in the labelled set: 07 keeps its
 * cases separate and single-usage so each verdict is scored against one intent in isolation.
 * The demo trades that isolation for a single narrative, which is the presentation's job,
 * not the harness's.
 *
 * Read at 5.0 — the version where every interesting fact is live at once: `Modal` deprecated
 * but not removed, `Dialog` present as its replacement, and the slate tokens all active so
 * the contrast case turns on reasoning rather than on a lifecycle status.
 */
export const version: Version = "5.0";

export const code = [
  "// Current component, used correctly on active code. Nothing to find — the demo",
  "// opens on a clean bill of health so 'catches drift' does not read as 'cries wolf'.",
  "export function SaveConfirm({ onSave }) {",
  '  return <Dialog title="Save changes?">Your edits will be published.</Dialog>;',
  "}",
  "",
  "// Billing revamp — first shipped this sprint, actively maintained.",
  "export function BillingUpgradePrompt() {",
  '  return <Modal title="Upgrade your plan">Pick a plan to continue.</Modal>;',
  "}",
  "",
  "// LEGACY — frozen for the 2019 checkout flow. Do not modernise: this page is",
  "// deleted the day the new checkout ships. Pinned to the v3 design on purpose.",
  "export function LegacyCheckoutConfirm() {",
  '  return <Modal title="Confirm order">Your order is ready to place.</Modal>;',
  "}",
  "",
  "// No marker either way: not dated, not flagged legacy, no sign whether it is maintained.",
  "export function Confirm({ onAccept }) {",
  '  return <Modal title="Are you sure?">This cannot be undone.</Modal>;',
  "}",
  "",
  "// Order summary caption — active code.",
  "export const captionStyle = {",
  '  color: "color.slate-400",',
  '  background: "color.slate-100",',
  "};",
].join("\n");
