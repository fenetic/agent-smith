import { z } from "zod";
import type { Ref, Version } from "../registry/index.js";
import type { RetrievalRef } from "./evidence.js";
import type { ToolDefinition } from "./model.js";

/**
 * What the agent concluded about one usage.
 *
 * The four are not severities on a scale — they are different *kinds* of answer, and
 * the distinction between the middle two is the reason this is an agent. A deprecated
 * status does not mechanically mean "violation": the same fact is a violation on
 * active work and an intentional exception on a frozen legacy page, and only intent
 * tells them apart.
 *
 * `needs-review` is the one that has to be easy to reach. A confident wrong verdict is
 * worse than an honest "a human must decide" — it costs a reviewer's trust in every
 * other verdict too — so when the signals do not settle it, this is the correct answer
 * rather than a failure to produce one.
 */
export const outcomeSchema = z.enum([
  "compliant",
  "violation",
  "allowed-exception",
  "needs-review",
]);

export type Outcome = z.infer<typeof outcomeSchema>;

export const findingSchema = z.object({
  target: z
    .string()
    .describe(
      'The usage being judged, as it appears in the code, e.g. "<Modal> at line 12".',
    ),

  outcome: outcomeSchema.describe(
    "compliant: the usage is correct at this version. violation: it conflicts with a retrieved fact and nothing suggests that is intentional. allowed-exception: it conflicts, but the code shows this is deliberate legacy. needs-review: the facts and the intent signals do not settle it — prefer this over guessing.",
  ),

  /**
   * The load-bearing field. 04 populates it; 05 enforces that it is present and that
   * every ref names a retrieval that truly ran. That split — the shape defined where
   * it is produced, the enforcement added on top — is the same one 01 and 02 use.
   */
  groundedIn: z
    .array(z.string())
    .describe(
      "The `ref` values from the tool results this verdict rests on. Cite the refs you were actually given; a verdict that cites nothing, or cites a ref you were not handed, is rejected.",
    ),

  rationale: z
    .string()
    .describe(
      "Why, in terms of the retrieved fact and the code's context — including the intent signal, where one decided it.",
    ),

  suggestedFix: z
    .string()
    .exactOptional()
    .describe("What to use instead, where the retrieved fact names a replacement."),
});

/**
 * The schema is the source of the type, as it is in 01 — so what the model is allowed
 * to send and what the rest of the code reads are one definition, and a change to
 * either is a change to both.
 *
 * `groundedIn` types as `string[]` because a {@link RetrievalRef} *is* a string —
 * deliberately opaque, so that nothing can assemble one that looks right without a
 * lookup having run. `suggestedFix` is a {@link Ref} for the same reason.
 */
export type Finding = z.infer<typeof findingSchema>;

/** The audit's answer: the version it was asked about, and a verdict per usage. */
export interface Report {
  version: Version;
  findings: Finding[];
}

/**
 * What the model sends to finish the audit.
 *
 * Only `findings`: the version is the caller's fact, not the model's. Letting it be
 * restated here would let a report claim to be about one version while the lookups
 * behind it were resolved at another — and the version is what scopes retrieval, so
 * the two cannot be allowed to disagree.
 */
export const reportSchema = z.object({ findings: z.array(findingSchema) });

/**
 * The report is submitted as a tool call rather than parsed out of prose.
 *
 * It costs a fourth tool, and buys a typed boundary: the verdict arrives as data the
 * schema has already checked, so a malformed one is a complaint the model can read and
 * fix rather than a parse error at the end of a run. It also gives 05 the seam it
 * needs — findings exist as values before they are a Report, which is where a gate can
 * stand. (04's design tables the three *retrieval* tools; this is emission, not
 * retrieval, which is why it is a tool the table does not list.)
 */
export const submitReport: ToolDefinition = {
  name: "submit_report",
  description:
    "Submit the finished audit: one finding per design-system usage you judged. Call this once, when every usage in the code has a verdict.",
  inputSchema: z.toJSONSchema(reportSchema) as Record<string, unknown>,
};
