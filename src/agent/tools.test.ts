import { describe, expect, it } from "vitest";
import { atVersion } from "../retrieval/index.js";
import { registry } from "./fixture.js";
import { retrievalTools, retrieve } from "./tools.js";

/** A tool definition as the model receives it, looked up by name. */
function definitionOf(name: string) {
  const tool = retrievalTools.find((candidate) => candidate.name === name);

  if (tool === undefined) throw new Error(`no tool called ${name} is offered`);

  return tool;
}

/** The JSON Schema fields that decide what the model is allowed to send. */
function schemaOf(name: string) {
  const { inputSchema } = definitionOf(name);

  return {
    properties: Object.keys((inputSchema.properties ?? {}) as object).sort(),
    required: [...((inputSchema.required ?? []) as string[])].sort(),
  };
}

describe("the agent offers the model exactly 02's three lookups", () => {
  it("offers the three retrieval tools and nothing it invented", () => {
    expect(retrievalTools.map((tool) => tool.name).sort()).toEqual([
      "get_component",
      "get_token",
      "list_deprecated",
    ]);
  });

  it("describes each tool, so the model knows when to reach for it", () => {
    expect(retrievalTools.every((tool) => tool.description.trim().length > 0)).toBe(
      true,
    );
  });
});

/**
 * "No lookup without a version" restated where the model can be held to it. In
 * process this needs no enforcing — `atVersion` is the only door into 02 — but the
 * model is not in-process, so the schema is what carries the guarantee across. It is
 * the same job 03's schema does over the wire, for the same reason.
 */
describe("no lookup without a version, as the model is told it", () => {
  it("requires a version on every tool, the sweep included", () => {
    expect(
      retrievalTools.every((tool) =>
        ((tool.inputSchema.required ?? []) as string[]).includes("version"),
      ),
    ).toBe(true);
  });

  it("requires an id on a component lookup", () => {
    expect(schemaOf("get_component").required).toEqual(["id", "version"]);
  });

  it("requires an id on a token lookup", () => {
    expect(schemaOf("get_token").required).toEqual(["id", "version"]);
  });

  /**
   * The sweep takes a version and nothing else. Offering it an id it would ignore
   * would invite the model to send one and read meaning into the silence.
   */
  it("asks the sweep for a version and nothing else", () => {
    expect(schemaOf("list_deprecated")).toEqual({
      properties: ["version"],
      required: ["version"],
    });
  });
});

/**
 * The definitions are generated from the very schemas `executeTool` validates
 * against, not written out beside them. A hand-maintained second copy could tell the
 * model a version was optional while validation still refused it — the model would
 * be unable to correct itself, because the contract it was shown was not the one
 * being enforced.
 */
describe("what the model is shown is what is actually enforced", () => {
  it("advertises a schema that refuses exactly what validation refuses", () => {
    expect(schemaOf("get_component").properties).toEqual(["id", "version"]);
  });

  it("hands the model an object schema it can fill in", () => {
    expect(definitionOf("get_component").inputSchema.type).toBe("object");
  });
});

/**
 * The claim 04 inherits from the architecture's dependency line: the agent and the
 * MCP server are two consumers of *one* source of truth. The agent's tools must
 * therefore be adapters over 02 and nothing more — no second opinion, no reasoning
 * of their own.
 *
 * Every expectation here is 02 called directly rather than a literal written out.
 * A hand-copied answer could drift from 02 and still pass, which is exactly the
 * divergence being ruled out.
 */
describe("get_component answers exactly what 02 answers", () => {
  it("matches on an active component", () => {
    expect(
      retrieve(registry, "get_component", { id: "Modal", version: "3.0" }),
    ).toEqual(atVersion(registry, "3.0").component("Modal"));
  });

  it("matches on a deprecated component, replacement and all", () => {
    expect(
      retrieve(registry, "get_component", { id: "Modal", version: "4.0" }),
    ).toEqual(atVersion(registry, "4.0").component("Modal"));
  });

  it("matches on a removed component", () => {
    expect(
      retrieve(registry, "get_component", { id: "Modal", version: "6.0" }),
    ).toEqual(atVersion(registry, "6.0").component("Modal"));
  });

  /**
   * The hallucinated-name case. A model may ask about a component it invented, and
   * the honest answer is 02's `unrecognized-id` — not an error, and not silence.
   */
  it("matches on an id the registry never knew", () => {
    expect(
      retrieve(registry, "get_component", { id: "Carousel", version: "4.0" }),
    ).toEqual(atVersion(registry, "4.0").component("Carousel"));
  });
});

/**
 * Tokens are where 02 works hardest: severity travels back along an alias chain
 * from its worst node. None of that reasoning is redone here — these exist to prove
 * the adapter calls 02's alias-resolving path and hands back what it got, rather
 * than reading a token's own lifecycle and quietly losing the chain.
 */
describe("get_token answers exactly what 02 answers", () => {
  it("matches on a plain token holding a value", () => {
    expect(
      retrieve(registry, "get_token", { id: "color.blue-500", version: "3.0" }),
    ).toEqual(atVersion(registry, "3.0").token("color.blue-500"));
  });

  it("matches on a stale alias whose target is still live", () => {
    expect(
      retrieve(registry, "get_token", { id: "brand.primary", version: "4.0" }),
    ).toEqual(atVersion(registry, "4.0").token("brand.primary"));
  });

  /**
   * Case C, stated as the agent meets it. If this ever reads "active", the agent
   * would go on to reason — correctly — from a false fact, and produce a confidently
   * wrong verdict that no amount of grounding enforcement would catch: the citation
   * would be real, and the fact behind it wrong.
   */
  it("does not let a stale alias read as active just because its target is", () => {
    expect(
      retrieve(registry, "get_token", { id: "brand.primary", version: "4.0" }),
    ).toMatchObject({ status: "deprecated" });
  });

  it("matches on an id the registry never knew", () => {
    expect(
      retrieve(registry, "get_token", { id: "color.puce", version: "4.0" }),
    ).toEqual(atVersion(registry, "4.0").token("color.puce"));
  });
});

describe("the two namespaces stay separate", () => {
  it("does not find a component through get_token", () => {
    expect(
      retrieve(registry, "get_token", { id: "Modal", version: "4.0" }),
    ).toMatchObject({ status: "unknown", reason: "unrecognized-id" });
  });
});

describe("list_deprecated answers exactly what 02 answers", () => {
  it("returns every item deprecated at that version", () => {
    expect(retrieve(registry, "list_deprecated", { version: "4.0" })).toEqual(
      atVersion(registry, "4.0").listDeprecated(),
    );
  });

  it("returns an empty sweep where nothing is deprecated yet", () => {
    expect(retrieve(registry, "list_deprecated", { version: "1.0" })).toEqual([]);
  });
});

/**
 * 02's answers are version-scoped, and the adapter must not flatten that: the same
 * question at two versions is two different facts, which is the whole reason the
 * agent is told which version the code targets.
 */
describe("the version is honoured, not assumed", () => {
  it("calls the same component active at 3.0 and deprecated at 4.0", () => {
    const early = retrieve(registry, "get_component", { id: "Modal", version: "3.0" });
    const late = retrieve(registry, "get_component", { id: "Modal", version: "4.0" });

    expect([early.status, late.status]).toEqual(["active", "deprecated"]);
  });
});
