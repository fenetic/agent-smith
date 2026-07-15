import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { ComponentEntry, Registry, TokenEntry } from "../registry/index.js";
import { atVersion } from "../retrieval/index.js";
import { createServer } from "./server.js";

/** Mirrors the seed data's shape. Local so 03's wiring is pinned independently of edits to `data/`. */
const modal: ComponentEntry = {
  id: "Modal",
  kind: "component",
  description: "An overlay.",
  lifecycle: {
    addedIn: "1.0",
    deprecatedIn: "4.0",
    replacedBy: "Dialog",
    removedIn: "6.0",
  },
};

const dialog: ComponentEntry = {
  id: "Dialog",
  kind: "component",
  description: "An overlay, but current.",
  lifecycle: { addedIn: "4.0" },
};

const blue: TokenEntry = {
  id: "color.blue-500",
  kind: "token",
  type: "color",
  value: "#2196F3",
  lifecycle: { addedIn: "1.0" },
};

const brandPrimaryV2: TokenEntry = {
  id: "brand.primaryV2",
  kind: "token",
  type: "color",
  alias: "color.blue-500",
  lifecycle: { addedIn: "4.0" },
};

/**
 * A stale alias pointing at a live value — the false-confidence case. Reporting
 * the *target's* status would read "active" and be confidently wrong, so this is
 * the one most worth proving arrives intact.
 */
const brandPrimary: TokenEntry = {
  id: "brand.primary",
  kind: "token",
  type: "color",
  alias: "color.blue-500",
  lifecycle: { addedIn: "1.0", deprecatedIn: "4.0", replacedBy: "brand.primaryV2" },
};

const registry: Registry = {
  meta: {
    name: "Northwind Design System",
    modelledOn: "Material Design",
    versions: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
  },
  components: [modal, dialog],
  tokens: [blue, brandPrimary, brandPrimaryV2],
};

/**
 * A real MCP client, speaking the real protocol to the real server over a linked
 * in-memory pair. Only the transport is not stdio — the client, the server and
 * every message between them are the ones a Claude Code or Cursor would use, so
 * these tests exercise the boundary rather than a stand-in for it.
 */
async function connect(to: Registry = registry): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });

  await Promise.all([
    createServer(to).connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return client;
}

/** The answer as it arrives over the protocol, typed as the SDK types it. */
async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  return await client.callTool({ name, arguments: args });
}

/** The text an MCP client would show a person for a tool result. */
function textOf(result: Awaited<ReturnType<typeof callTool>>): string {
  const blocks = Array.isArray(result.content) ? result.content : [];

  return blocks
    .map((block) => (block.type === "text" ? String(block.text) : ""))
    .join("");
}

/** Read the version resource the way a caller would, before asking anything else. */
async function readVersions(client: Client): Promise<unknown> {
  const { contents } = await client.readResource({ uri: "registry://versions" });
  const first = contents[0];

  // A resource may carry text or binary; this one promises JSON text, and a blob
  // arriving here would mean the promise was broken rather than the test was wrong.
  if (first === undefined || !("text" in first)) {
    throw new Error("the version resource returned no text");
  }

  return JSON.parse(String(first.text));
}

describe("an off-the-shelf client can discover what is on offer", () => {
  it("lists exactly the three tools", async () => {
    const { tools } = await (await connect()).listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_component",
      "get_token",
      "list_deprecated",
    ]);
  });

  it("offers the version line as a resource, not as a fourth tool", async () => {
    const { resources } = await (await connect()).listResources();

    expect(resources.map((resource) => resource.uri)).toEqual(["registry://versions"]);
  });
});

/**
 * A caller must know which versions exist before it can ask a version-scoped
 * question, and blind-guessing one is a poor first use. This is reference data a
 * caller reads, so it lives in the resource channel rather than among the tools —
 * which also stops the version list being mistaken for something you "call".
 */
describe("the version line is readable up front", () => {
  it("hands back the registry's ordered history", async () => {
    expect(await readVersions(await connect())).toEqual(registry.meta);
  });

  it("keeps the versions in release order, which is what gives them meaning", async () => {
    const meta = (await readVersions(await connect())) as { versions: string[] };

    expect(meta.versions).toEqual(["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"]);
  });
});

/**
 * The claim this whole layer exists to make good on: an external tool and our own
 * agent are reading the same source of truth. Each expectation is 02 called
 * directly, computed here rather than written out — a hand-copied literal could
 * drift from 02 and still pass, which is exactly the divergence being ruled out.
 */
describe("get_component answers exactly what 02 answers in-process", () => {
  it("matches on an active component", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_component", { id: "Modal", version: "3.0" }))
        .structuredContent,
    ).toEqual(atVersion(registry, "3.0").component("Modal"));
  });

  it("matches on a deprecated component, replacement and all", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_component", { id: "Modal", version: "4.0" }))
        .structuredContent,
    ).toEqual(atVersion(registry, "4.0").component("Modal"));
  });

  it("matches on a removed component", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_component", { id: "Modal", version: "6.0" }))
        .structuredContent,
    ).toEqual(atVersion(registry, "6.0").component("Modal"));
  });

  it("matches on an id the registry never knew", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_component", { id: "Carousel", version: "4.0" }))
        .structuredContent,
    ).toEqual(atVersion(registry, "4.0").component("Carousel"));
  });
});

/**
 * Tokens are where 02 works hardest: severity travels back along an alias chain
 * from its worst node, so a chain is only ever as sound as its most-broken link.
 * None of that reasoning is redone here — these tests exist to prove the wrapper
 * calls the alias-resolving path and hands back what it got, rather than reaching
 * for a token's lifecycle directly and quietly losing the chain.
 */
describe("get_token answers exactly what 02 answers in-process", () => {
  it("matches on a plain token holding a value", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_token", { id: "color.blue-500", version: "3.0" }))
        .structuredContent,
    ).toEqual(atVersion(registry, "3.0").token("color.blue-500"));
  });

  it("matches on a stale alias whose target is still live", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_token", { id: "brand.primary", version: "4.0" }))
        .structuredContent,
    ).toEqual(atVersion(registry, "4.0").token("brand.primary"));
  });

  it("does not let a stale alias read as active just because its target is", async () => {
    const client = await connect();
    const result = await callTool(client, "get_token", {
      id: "brand.primary",
      version: "4.0",
    });

    expect(result.structuredContent).toMatchObject({ status: "deprecated" });
  });

  it("matches on an id the registry never knew", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_token", { id: "color.puce", version: "4.0" }))
        .structuredContent,
    ).toEqual(atVersion(registry, "4.0").token("color.puce"));
  });
});

/**
 * The two namespaces must not bleed into one another across the wire either: a
 * component id asked of `get_token` is an unrecognised token, not a component.
 */
describe("the two namespaces stay separate over the wire", () => {
  it("does not find a component through get_token", async () => {
    const client = await connect();
    const result = await callTool(client, "get_token", { id: "Modal", version: "4.0" });

    expect(result.structuredContent).toMatchObject({
      status: "unknown",
      reason: "unrecognized-id",
    });
  });
});

/**
 * The sweep. 02 builds it off the same two resolver paths the point lookups use,
 * so asking the same question two ways cannot give two answers — including for a
 * healthy-looking token whose alias chain is deprecated, which a listing built
 * from lifecycles alone would miss.
 */
describe("list_deprecated answers exactly what 02 answers in-process", () => {
  it("returns every item deprecated at that version", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "list_deprecated", { version: "4.0" })).structuredContent,
    ).toEqual({ deprecated: atVersion(registry, "4.0").listDeprecated() });
  });

  it("sweeps components and tokens alike", async () => {
    const client = await connect();
    const result = await callTool(client, "list_deprecated", { version: "4.0" });

    expect(
      (
        result.structuredContent as { deprecated: { entry: { id: string } }[] }
      ).deprecated
        .map((item) => item.entry.id)
        .sort(),
    ).toEqual(["Modal", "brand.primary"]);
  });

  it("returns an empty sweep where nothing is deprecated yet", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "list_deprecated", { version: "1.0" })).structuredContent,
    ).toEqual({ deprecated: [] });
  });
});

describe("the sweep reads plainly for a person", () => {
  it("says so when nothing is deprecated", async () => {
    const client = await connect();

    expect(textOf(await callTool(client, "list_deprecated", { version: "1.0" }))).toBe(
      "Nothing is deprecated as of 1.0.",
    );
  });

  it("lists each deprecation and where to go instead", async () => {
    const client = await connect();

    expect(
      textOf(await callTool(client, "list_deprecated", { version: "4.0" })),
    ).toContain("`Modal` is deprecated as of 4.0 — use `Dialog`.");
  });
});

/**
 * 02 makes "no lookup without a version" structural: `atVersion` is the only way
 * in, so a caller has nothing to call until they have named one. Over the wire
 * there is no such thing as an uncallable function — anyone can send any JSON —
 * so the schema is what carries the guarantee across, and it must turn the same
 * requirement back into something a caller cannot get around.
 */
describe("no lookup without a version, over the wire as in-process", () => {
  it("refuses a component lookup that names no version", async () => {
    const client = await connect();

    expect((await callTool(client, "get_component", { id: "Modal" })).isError).toBe(
      true,
    );
  });

  it("refuses a token lookup that names no version", async () => {
    const client = await connect();

    expect((await callTool(client, "get_token", { id: "brand.primary" })).isError).toBe(
      true,
    );
  });

  it("refuses a deprecation sweep that names no version", async () => {
    const client = await connect();

    expect((await callTool(client, "list_deprecated", {})).isError).toBe(true);
  });

  it("refuses a version that is not even a string", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_component", { id: "Modal", version: 4 })).isError,
    ).toBe(true);
  });

  /**
   * The "before it ever reaches 02" half of the claim, and the reason it is
   * checkable at all: had the call got through, 02 would have thrown about
   * `undefined` not being a version of Northwind. Seeing validation's complaint
   * instead — and never 02's — is what proves the schema stopped it at the door.
   */
  it("stops the call at the schema rather than letting 02 field it", async () => {
    const client = await connect();
    const complaint = textOf(await callTool(client, "get_component", { id: "Modal" }));

    expect(complaint).toContain("validation");
  });

  it("never lets a versionless question reach 02 at all", async () => {
    const client = await connect();
    const complaint = textOf(await callTool(client, "get_component", { id: "Modal" }));

    expect(complaint).not.toContain("is not a version of");
  });
});

/**
 * The other half of 02's seam, over the wire. A version the registry never
 * released is a malformed question rather than a fact about the data, so it comes
 * back as a tool error — and, crucially, not as `unknown`, which would let a typo
 * read as "this doesn't exist yet". The caller is told which versions do exist,
 * so a wrong guess is self-correcting even for a caller that skipped the resource.
 */
describe("a version the registry never released is a tool error", () => {
  it("reports an unreleased version as an error rather than an answer", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_component", { id: "Modal", version: "9.9" }))
        .isError,
    ).toBe(true);
  });

  it("names the versions that do exist, so the caller can correct itself", async () => {
    const client = await connect();

    expect(
      textOf(await callTool(client, "get_component", { id: "Modal", version: "9.9" })),
    ).toContain("1.0, 2.0, 3.0, 4.0, 5.0, 6.0");
  });

  it("does not mistake a bad version for an item that does not exist yet", async () => {
    const client = await connect();
    const result = await callTool(client, "get_component", {
      id: "Modal",
      version: "9.9",
    });

    expect(result.structuredContent).toBeUndefined();
  });

  it("rejects a bad version on every tool, not just the point lookups", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "list_deprecated", { version: "9.9" })).isError,
    ).toBe(true);
  });

  /**
   * The design's word is "crash": a malformed question must fail loudly to the
   * caller without taking the process down. If the throw escaped instead, the
   * connection would die and this next call would never be answered.
   */
  it("leaves the server usable afterwards", async () => {
    const client = await connect();
    await callTool(client, "get_component", { id: "Modal", version: "9.9" });

    expect(
      (await callTool(client, "get_component", { id: "Modal", version: "4.0" }))
        .structuredContent,
    ).toEqual(atVersion(registry, "4.0").component("Modal"));
  });
});

/**
 * A domain condition is an answer, not a failure. 02 reports "removed" by
 * returning a status, and the boundary must not promote that into an error —
 * a caller asking about a stale component got a correct answer to a valid
 * question, and needs to read it rather than handle it.
 */
describe("a stale component is a successful answer, not an error", () => {
  it("does not flag a removed component as a tool error", async () => {
    const client = await connect();

    expect(
      (await callTool(client, "get_component", { id: "Modal", version: "6.0" }))
        .isError,
    ).toBeFalsy();
  });

  it("sends a removed component across with no value field to misread", async () => {
    const client = await connect();
    const result = await callTool(client, "get_component", {
      id: "Modal",
      version: "6.0",
    });

    expect(result.structuredContent).not.toHaveProperty("entry");
  });
});
