import type { GatedReport } from "../guardrails/index.js";
import { gate } from "../guardrails/index.js";
import type { Registry, Version } from "../registry/index.js";
import { loadRegistry } from "../registry/index.js";
import { atVersion } from "../retrieval/index.js";
import { createLedger } from "./evidence.js";
import { runLoop } from "./loop.js";
import type { ModelClient } from "./model.js";

/**
 * What an audit runs against. Both have sensible answers, so a caller normally supplies
 * neither — they exist so a test can hand over a scripted model and a known registry,
 * and so 07 can point the same agent at a different model and score the difference.
 */
export interface AuditDeps {
  registry: Registry;
  /** Defaults to the real Anthropic-backed client; a test hands over a scripted one. */
  model: ModelClient;
  maxIterations: number;
}

/**
 * Audit `code` against the design system as of `version`.
 *
 * 04's public surface, and deliberately the whole of it: a caller names the code and the
 * version the code targets, and gets back a verdict per usage with the fact behind each
 * one. Everything else — which tools exist, how the loop turns, what evidence was
 * retained — is machinery this signature keeps out of the caller's way.
 *
 * Every finding leaves through 05's gate, and this is the only door: the loop's report is
 * a *proposal*, and what a caller receives is what survived being checked against the
 * evidence. Wiring it here rather than offering it as something a caller may opt into is
 * the difference between grounding being an invariant and being a convention — an
 * ungrounded verdict is not discouraged, it has nowhere to go. It is also why the ledger
 * is made here and kept: gating needs the very evidence the run produced, and this is the
 * only scope that has both it and the report.
 *
 * The version is checked here, before a single model turn is spent. That is not an
 * optimisation: an unreleased version is a malformed question, and without this the loop
 * would run, every lookup inside it would fail, and the likeliest outcome is a report
 * with no findings — a typo answered with a clean bill of health. 02 draws this line by
 * throwing, and the line is only worth anything if it is drawn before the work starts.
 */
export async function audit(
  code: string,
  version: Version,
  deps: Partial<AuditDeps> = {},
): Promise<GatedReport> {
  const registry = deps.registry ?? loadRegistry();

  // Throws a RangeError naming the versions that do exist. Called for that check alone —
  // the loop builds its own resolvers, per lookup, as the model asks for them.
  atVersion(registry, version);

  const model = deps.model ?? (await defaultModel());

  // The audit owns its evidence: refs name retrievals *within this run*, so a ledger
  // outliving one would let a finding corroborate itself against another audit's facts.
  const ledger = createLedger();

  const proposed = await runLoop({
    registry,
    model,
    ledger,
    code,
    version,
    ...(deps.maxIterations !== undefined && { maxIterations: deps.maxIterations }),
  });

  return gate(proposed, ledger);
}

/**
 * The real model, loaded only when nobody supplied one.
 *
 * Imported lazily so the SDK — and the API key it wants — stay out of the way of every
 * caller that brought its own model. The unit suite never reaches this line, which is
 * what lets it run offline with no key: an `import` at the top of the file would drag
 * the SDK into every test that has no use for it.
 */
async function defaultModel(): Promise<ModelClient> {
  const { anthropicClient } = await import("./anthropic.js");

  return anthropicClient();
}
