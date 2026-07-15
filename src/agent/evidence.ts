import type { ComponentEntry, TokenEntry, Version } from "../registry/index.js";
import type { Resolution } from "../retrieval/index.js";

/** Anything 02 resolves, and so anything a retrieval can be evidence of. */
type Entry = ComponentEntry | TokenEntry;

/**
 * A handle on one retrieval that actually ran. Opaque on purpose: its only
 * meaning is "the ledger minted this", and the moment it carries readable
 * structure a model could assemble one that looks right without a tool ever
 * having run. It is a string because it has to survive a round trip through the
 * model — cited back to us in a finding — and that channel carries only JSON.
 */
export type RetrievalRef = string;

/** The three lookups 02 offers, and the only things that can produce evidence. */
export type ToolName = "get_component" | "get_token" | "list_deprecated";

/**
 * What was asked. `id` is absent for the sweep, which takes a version and nothing
 * else; `version` never is, because 02 has no lookup that does not name one.
 */
export interface RetrievalArgs {
  id?: string;
  version: Version;
}

/** A point lookup answers with one resolution; the sweep answers with many. */
export type RetrievalResult = Resolution<Entry> | Resolution<Entry>[];

/**
 * One executed retrieval, whole: what was asked, what 02 said, under the ref that
 * names it. This is the record 05 checks citations against and 06 lifts into a
 * trace — the same entry serving both, because there is only ever one account of
 * what happened.
 */
export interface RetrievalEvidence {
  ref: RetrievalRef;
  tool: ToolName;
  args: RetrievalArgs;
  result: RetrievalResult;
}

/**
 * The turn's memory of the retrievals it ran.
 *
 * This is retained evidence, not logging: the loop simply does not discard the
 * `Resolution`s it already observed. Nothing here persists, renders, or judges —
 * 06 does the first two, 05 the third.
 */
export interface Ledger {
  /** Mint a ref for a retrieval that *has already run*, and keep its result. */
  record(tool: ToolName, args: RetrievalArgs, result: RetrievalResult): RetrievalRef;
  get(ref: RetrievalRef): RetrievalEvidence | undefined;
  entries(): readonly RetrievalEvidence[];
}

/**
 * Open a ledger for one audit run.
 *
 * The whole grounding claim rests on where this function sits: `record` is
 * reachable only from the code path that just executed a tool, so a ref exists if
 * and only if a retrieval really happened. The model never mints one — it can only
 * cite a ref we handed it, and a ref we never handed out is one this ledger cannot
 * corroborate. That is what turns "the agent cited a fact" from a claim taken on
 * faith into something checkable, and it is why 05 can be a gate rather than a
 * plea.
 *
 * Refs are minted per ledger and per run, deliberately: they name a retrieval
 * *within this turn*, and a ref outliving the run it belongs to would let one
 * audit's finding corroborate itself against another audit's evidence.
 */
export function createLedger(): Ledger {
  const evidence = new Map<RetrievalRef, RetrievalEvidence>();

  // Counts refs handed out, not entries held. The two are the same number today,
  // but only one of them is allowed to go backwards — deriving the ref from the
  // map's size would make uniqueness a fact about nothing ever being removed.
  let minted = 0;

  return {
    record(tool, args, result) {
      // Sequential rather than random: a ref is read by a person in 06's trace and
      // quoted by the model in a citation, and `r3` survives both better than a
      // UUID. Uniqueness only has to hold within the run, and a counter that never
      // rewinds gives exactly that — the same question asked twice is two facts,
      // and gets two refs.
      const ref = `r${++minted}`;

      evidence.set(ref, { ref, tool, args, result });

      return ref;
    },

    get: (ref) => evidence.get(ref),

    // Insertion order, which a Map guarantees for string keys — so the entries come
    // back in the order the retrievals ran, ready for 06 to lift into a trace.
    entries: () => [...evidence.values()],
  };
}
