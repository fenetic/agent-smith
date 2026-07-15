import type { Finding, Ledger, RetrievalEvidence } from "../agent/index.js";
import type { ComponentEntry, TokenEntry } from "../registry/index.js";
import type { Resolution } from "../retrieval/index.js";
import type { GuardrailResult } from "./types.js";
import { passes, rejects } from "./types.js";

/** Anything 02 resolves, and so anything a retrieval can be evidence of. */
type Entry = ComponentEntry | TokenEntry;

/**
 * Does the finding cite anything at all?
 *
 * The one check that needs no evidence: an empty `groundedIn` is a conclusion with
 * nothing behind it, and no lookup in the ledger would change that.
 */
export function present(finding: Finding): GuardrailResult {
  return finding.groundedIn.length === 0
    ? rejects("the verdict cites no retrieval at all")
    : passes;
}

/**
 * Does every ref name a retrieval that actually ran?
 *
 * The ledger is the authority here for a structural reason, not a stylistic one: it
 * mints a ref only from the code path that has just executed a tool, so a ref it cannot
 * corroborate is a citation to a lookup that never happened. The model can write any
 * string into `groundedIn`; it cannot make this map contain it.
 *
 * Every ref must resolve, not merely one — an invented ref does not become honest by
 * being listed next to a real one.
 */
export function real(finding: Finding, ledger: Ledger): GuardrailResult {
  const fabricated = finding.groundedIn.filter((ref) => ledger.get(ref) === undefined);

  return fabricated.length === 0
    ? passes
    : rejects(
        `the verdict cites ${quote(fabricated)}, which this run's evidence cannot corroborate — no such retrieval ran`,
      );
}

/**
 * Is any cited fact about the thing the finding judges?
 *
 * *Any*, not all: a finding cites what it reasoned from, and some of that is
 * legitimately about something else — the replacement it recommends, the other half of a
 * contrast pair. Demanding that every ref name the target would reject the more thorough
 * verdict, which is precisely backwards.
 *
 * Refs the ledger cannot corroborate are ignored rather than counted against the finding:
 * a fabricated ref is {@link real}'s to reject, and letting it fail here too would report
 * one problem as two.
 */
export function relevant(finding: Finding, ledger: Ledger): GuardrailResult {
  const cited = finding.groundedIn
    .map((ref) => ledger.get(ref))
    .filter((evidence) => evidence !== undefined);

  if (cited.some((evidence) => isAbout(evidence, finding.target))) return passes;

  const subjects = cited.flatMap(subjectsOf);

  return rejects(
    `the verdict judges "${finding.target}", but nothing it cites is about that — the retrievals it cites are about ${subjects.length === 0 ? "nothing this run retrieved" : quote(subjects)}`,
  );
}

/**
 * The match is a substring test against prose, and so a heuristic — the one place in 05
 * that is. `target` is a phrase the model wrote ("the modal on line 12"), not an id, so
 * there is nothing exact to compare. It is deliberately the loose end of the three
 * checks: it errs toward accepting, because a false rejection silently drops an honest
 * verdict, while the structural work — that the fact was really retrieved, and that the
 * verdict does not contradict it — is done by {@link real} and {@link coherent}, which do
 * not guess.
 */
function isAbout(evidence: RetrievalEvidence, target: string): boolean {
  return resolutionsAbout(evidence, target).length > 0;
}

/**
 * The facts in one piece of evidence that speak to `target`.
 *
 * A point lookup answers about the id it asked for, so it is either about the target or
 * it is not. The sweep answers about many entries at once, so only the part of it that
 * names the target is evidence about the target — the rest of that same result is about
 * other entries entirely, and a verdict cannot be held to it.
 */
function resolutionsAbout(
  evidence: RetrievalEvidence,
  target: string,
): Resolution<Entry>[] {
  const results = Array.isArray(evidence.result) ? evidence.result : [evidence.result];

  // A point lookup asked about one id, so its answer is either about the target or it is
  // not — there is nothing to sift.
  if (evidence.args.id !== undefined) {
    return names(target, evidence.args.id) ? results : [];
  }

  return results.filter((resolution) => names(target, idOf(resolution)));
}

/**
 * What one retrieval is about: for a point lookup, the id it asked for; for the sweep,
 * every id it answered with.
 *
 * The sweep has no `id` — it asked about everything — so the only honest account of what
 * it is evidence *of* is what came back. That keeps it from being a blank cheque: it
 * grounds a verdict about Modal because it really did return Modal's deprecation, and
 * grounds nothing about an entry it never mentioned.
 */
function subjectsOf(evidence: RetrievalEvidence): string[] {
  if (evidence.args.id !== undefined) return [evidence.args.id];

  const results = Array.isArray(evidence.result) ? evidence.result : [evidence.result];

  return results.map(idOf);
}

/**
 * Every resolution names its subject, but only the variants that found something carry an
 * `entry` to name it — `removed` and `unknown` answer with the bare id, which is the
 * shape 02 uses to keep a caller from reading a value that should not exist.
 */
function idOf(resolution: Resolution<Entry>): string {
  return "entry" in resolution ? resolution.entry.id : resolution.id;
}

/** Does `target` name this entry — by its id, or by the part of it the code writes? */
function names(target: string, id: string): boolean {
  const haystack = target.toLowerCase();

  return haystack.includes(id.toLowerCase()) || haystack.includes(segmentOf(id));
}

/**
 * A token's id is namespaced (`color.slate-400`) but the code writes the last part of it
 * (`slate-400`), and the target quotes the code. Components have no dot, so this is the
 * whole id and the rule costs them nothing.
 */
function segmentOf(id: string): string {
  return id.slice(id.lastIndexOf(".") + 1).toLowerCase();
}

/**
 * The two statuses a claim of correctness cannot survive.
 *
 * Not a severity scale — a list of the facts that `compliant` directly denies. `unknown`
 * is absent on purpose: it means 02 never heard of the id, which is not evidence that the
 * usage is wrong, since the code may not be naming a design-system entry at all. Reading
 * it as a contradiction would be a judgment, and judgment is not 05's.
 */
const CONTRADICTS_COMPLIANT: ReadonlySet<string> = new Set(["deprecated", "removed"]);

/**
 * Does the verdict contradict the fact it rests on?
 *
 * Deliberately narrow, and only `compliant` can trip it: calling a usage correct while
 * citing a retrieval that says the entry is deprecated or removed is not a defensible
 * reading of the fact, it is a denial of it. Every other outcome passes untouched —
 * whether a deprecated usage is a `violation`, an `allowed-exception`, or `needs-review`
 * is judgment, which 04 makes and 07 scores. 05 checks that a verdict rests on a real,
 * relevant fact and does not contradict it; it never checks that it is the right call.
 *
 * Scoped to facts *about the target*, or it would fire on the thorough finding: judging
 * Dialog compliant because Modal is deprecated and Dialog is its live replacement cites a
 * deprecated fact and contradicts nothing.
 */
export function coherent(finding: Finding, ledger: Ledger): GuardrailResult {
  if (finding.outcome !== "compliant") return passes;

  const denied = finding.groundedIn
    .map((ref) => ledger.get(ref))
    .filter((evidence) => evidence !== undefined)
    .flatMap((evidence) => resolutionsAbout(evidence, finding.target))
    .filter((resolution) => CONTRADICTS_COMPLIANT.has(resolution.status));

  if (denied.length === 0) return passes;

  return rejects(
    `the verdict calls "${finding.target}" compliant while citing a fact that says it is ${quote([...new Set(denied.map((resolution) => resolution.status))])} as of ${denied[0]?.asOf} — a verdict cannot contradict its own evidence`,
  );
}

/** Refs, ids and statuses as a person reads them: `"r99"`, or `"r7", "r99"`. */
function quote(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}
