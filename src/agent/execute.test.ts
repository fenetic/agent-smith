import { describe, expect, it } from "vitest";
import { atVersion } from "../retrieval/index.js";
import type { RetrievalArgs, ToolName } from "./evidence.js";
import { createLedger } from "./evidence.js";
import { executeTool } from "./execute.js";
import { registry } from "./fixture.js";

/** What the model is handed back after a tool runs, parsed the way the model reads it. */
function outcomeOf(tool: ToolName, args: RetrievalArgs) {
  const ledger = createLedger();
  const outcome = executeTool(registry, ledger, tool, args);

  return {
    ledger,
    outcome,
    seen: JSON.parse(outcome.content) as Record<string, unknown>,
  };
}

/**
 * The moment the grounding claim is actually established. A ref exists only because
 * this code path ran a real lookup — so evidence is minted as a *consequence* of
 * retrieval, never as a thing the model can ask for.
 */
describe("running a tool leaves evidence behind", () => {
  it("records the retrieval that just ran", () => {
    const { ledger } = outcomeOf("get_component", { id: "Modal", version: "4.0" });

    expect(ledger.entries()).toHaveLength(1);
  });

  it("records what 02 actually returned, not a retelling of it", () => {
    const { ledger } = outcomeOf("get_component", { id: "Modal", version: "4.0" });

    expect(ledger.entries()[0]?.result).toEqual(
      atVersion(registry, "4.0").component("Modal"),
    );
  });

  it("records the question that was asked", () => {
    const { ledger } = outcomeOf("get_component", { id: "Modal", version: "4.0" });

    expect(ledger.entries()[0]?.args).toEqual({ id: "Modal", version: "4.0" });
  });

  it("leaves evidence for the sweep too, not only the point lookups", () => {
    const { ledger } = outcomeOf("list_deprecated", { version: "4.0" });

    expect(ledger.entries()[0]?.result).toEqual(
      atVersion(registry, "4.0").listDeprecated(),
    );
  });
});

/**
 * The other half of the link: the model can only cite a ref it was given. Handing
 * the ref back with the answer is what makes an honest citation possible at all —
 * without it, `groundedIn` would be something the model had to invent, and 05 would
 * be gating on a field no one could fill in truthfully.
 */
describe("the answer the model sees carries the ref for it to cite", () => {
  it("hands back the ref the ledger minted", () => {
    const { ledger, seen } = outcomeOf("get_component", {
      id: "Modal",
      version: "4.0",
    });

    expect(seen.ref).toBe(ledger.entries()[0]?.ref);
  });

  it("hands back a ref that resolves to this run's evidence", () => {
    const { ledger, seen } = outcomeOf("get_component", {
      id: "Modal",
      version: "4.0",
    });

    expect(ledger.get(String(seen.ref))?.result).toEqual(
      atVersion(registry, "4.0").component("Modal"),
    );
  });

  it("hands back the fact itself, so the model has something to reason about", () => {
    const { seen } = outcomeOf("get_component", { id: "Modal", version: "4.0" });

    expect(seen.result).toEqual(
      JSON.parse(JSON.stringify(atVersion(registry, "4.0").component("Modal"))),
    );
  });

  it("does not flag a deprecated answer as an error — it is a fact, not a failure", () => {
    const { outcome } = outcomeOf("get_component", { id: "Modal", version: "4.0" });

    expect(outcome.isError).toBeFalsy();
  });
});

/**
 * A `removed` answer has no `entry` field, and that absence is 02's safety property
 * surviving into the model's context — the same guarantee 03 carries over the wire.
 * The model cannot reason from a stale value it was never shown.
 */
describe("02's shape survives the trip into the model's context", () => {
  it("shows a removed component with no value to misread", () => {
    const { seen } = outcomeOf("get_component", { id: "Modal", version: "6.0" });

    expect(seen.result).not.toHaveProperty("entry");
  });
});

describe("each retrieval in a run is its own citable fact", () => {
  it("mints a distinct ref per call so two facts cannot be conflated", () => {
    const ledger = createLedger();
    const first = executeTool(registry, ledger, "get_component", {
      id: "Modal",
      version: "3.0",
    });
    const second = executeTool(registry, ledger, "get_component", {
      id: "Modal",
      version: "4.0",
    });

    expect(JSON.parse(first.content).ref).not.toBe(JSON.parse(second.content).ref);
  });

  it("keeps both retrievals as evidence", () => {
    const ledger = createLedger();
    executeTool(registry, ledger, "get_component", { id: "Modal", version: "3.0" });
    executeTool(registry, ledger, "get_component", { id: "Modal", version: "4.0" });

    // Narrowed rather than cast: a point lookup answers with one resolution and the
    // sweep with many, and the evidence keeps whichever it really was.
    const statuses = ledger
      .entries()
      .map((entry) => (Array.isArray(entry.result) ? "sweep" : entry.result.status));

    expect(statuses).toEqual(["active", "deprecated"]);
  });
});
