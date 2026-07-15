import type { Ref, Version } from "../registry/index.js";

/**
 * The answer to "what is `id` as of `asOf`". Discriminated on `status`, and the
 * shape *is* the safety property: `entry` exists only on the variants where reading
 * it is sound, so a caller cannot reach a value without first confronting its
 * standing. Reaching for `entry` on a `removed` result is a compile error, and —
 * because the guarantee lives in which fields are present, not only in the type —
 * survives serialisation across 03's MCP boundary as a missing field rather than a
 * misleading one.
 *
 * `via` is the alias chain walked to reach a concrete value, terminal node last.
 * `entry` stays the entry that was *asked for*, so a consumer quoting it never
 * reports a name the developer did not write — the chain is where the value lives,
 * `entry` is where the question was aimed. Absent when nothing was aliased.
 */
export type Resolution<T> =
  | { status: "active"; asOf: Version; entry: T; via?: T[] }
  | {
      status: "deprecated";
      asOf: Version;
      entry: T;
      via?: T[];
      deprecatedIn: Version;
      replacedBy: Ref;
      removedIn?: Version;
    }
  | {
      status: "removed";
      asOf: Version;
      id: string;
      removedIn: Version;
      /**
       * Optional, unlike the sibling variants' — 01 guarantees a replacement only
       * where there is a `deprecatedIn`, and an entry may be removed without ever
       * having been deprecated. Requiring it here would be a promise the data does
       * not keep.
       */
      replacedBy?: Ref;
    }
  | {
      status: "unknown";
      asOf: Version;
      id: string;
      reason: "not-yet-added" | "unrecognized-id";
    };
