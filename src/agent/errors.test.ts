import { describe, expect, it } from "vitest";
import { atVersion } from "../retrieval/index.js";
import { createLedger } from "./evidence.js";
import { executeTool } from "./execute.js";
import { registry } from "./fixture.js";

/** Run a tool call the way the loop will, with whatever the model happened to send. */
function attempt(tool: string, input: unknown) {
  const ledger = createLedger();
  const outcome = executeTool(registry, ledger, tool, input);

  return { ledger, outcome };
}

/**
 * A model asks for tools that do not exist. That is an ordinary event in a tool-use
 * loop, not a crash: the run must survive it and the model must be told enough to
 * correct itself, because a thrown error here would take down an audit over a
 * recoverable mistake.
 */
describe("a tool the agent does not have is an answer, not a crash", () => {
  it("reports an unknown tool as an error the model can read", () => {
    expect(attempt("get_page", { version: "4.0" }).outcome.isError).toBe(true);
  });

  it("names the tools that do exist, so the model can correct itself", () => {
    const { outcome } = attempt("get_page", { version: "4.0" });

    expect(outcome.content).toContain("get_component");
  });

  it("leaves no evidence behind for a tool that never ran", () => {
    expect(attempt("get_page", { version: "4.0" }).ledger.entries()).toEqual([]);
  });
});

/**
 * 02's other seam, met here rather than over a wire. A version the registry never
 * released is a malformed question, not a fact about the data — and crucially not
 * `unknown`, which would let a guessed version read to the model as "this doesn't
 * exist yet" and earn a confident, wrong verdict.
 */
describe("a version the registry never released is an error, not an answer", () => {
  it("reports an unreleased version as an error", () => {
    expect(
      attempt("get_component", { id: "Modal", version: "9.9" }).outcome.isError,
    ).toBe(true);
  });

  it("names the versions that do exist, so the model can correct itself", () => {
    const { outcome } = attempt("get_component", { id: "Modal", version: "9.9" });

    expect(outcome.content).toContain("1.0, 2.0, 3.0, 4.0, 5.0, 6.0");
  });

  it("does not mistake a bad version for an item that does not exist yet", () => {
    const { outcome } = attempt("get_component", { id: "Modal", version: "9.9" });

    expect(outcome.content).not.toContain("not-yet-added");
  });

  it("leaves no evidence behind for a lookup that never resolved", () => {
    expect(
      attempt("get_component", { id: "Modal", version: "9.9" }).ledger.entries(),
    ).toEqual([]);
  });
});

/**
 * "No lookup without a version" is 02's structural guarantee — `atVersion` is the
 * only door in, so in-process there is nothing to call without one. A model can send
 * any JSON it likes, so here the schema is what carries that guarantee across, the
 * same job it does for 03 over the wire.
 */
describe("no lookup without a version, as the model meets it", () => {
  it("refuses a component lookup that names no version", () => {
    expect(attempt("get_component", { id: "Modal" }).outcome.isError).toBe(true);
  });

  it("refuses a sweep that names no version", () => {
    expect(attempt("list_deprecated", {}).outcome.isError).toBe(true);
  });

  it("refuses a version that is not even a string", () => {
    expect(attempt("get_component", { id: "Modal", version: 4 }).outcome.isError).toBe(
      true,
    );
  });

  it("stops the call at the schema rather than letting 02 field it", () => {
    const { outcome } = attempt("get_component", { id: "Modal" });

    expect(outcome.content).not.toContain("is not a version of");
  });
});

/**
 * A point lookup with no id has nothing to look up. The danger is not the error —
 * it is the guess: an empty id resolves to `unrecognized-id`, a real-looking answer
 * about a question nobody asked, which the model would then reason from.
 */
describe("a point lookup with nothing to look up is refused", () => {
  it("refuses a component lookup with no id", () => {
    expect(attempt("get_component", { version: "4.0" }).outcome.isError).toBe(true);
  });

  it("refuses a token lookup with an empty id rather than resolving it", () => {
    const { outcome } = attempt("get_token", { id: "", version: "4.0" });

    expect(outcome.isError).toBe(true);
  });

  it("does not answer a missing id with a plausible-looking miss", () => {
    const { outcome } = attempt("get_component", { version: "4.0" });

    expect(outcome.content).not.toContain("unrecognized-id");
  });

  it("still allows the sweep, which needs no id", () => {
    expect(attempt("list_deprecated", { version: "4.0" }).outcome.isError).toBeFalsy();
  });
});

/**
 * The point of all of the above: the loop keeps going. A model that fumbles a call,
 * reads the complaint and asks again must end up with a real fact and real evidence
 * — the recovery path is the reason these are answers rather than exceptions.
 */
describe("the run survives a fumbled call", () => {
  it("answers a corrected call after a bad one, on the same ledger", () => {
    const ledger = createLedger();
    executeTool(registry, ledger, "get_component", { id: "Modal", version: "9.9" });
    const outcome = executeTool(registry, ledger, "get_component", {
      id: "Modal",
      version: "4.0",
    });

    expect(JSON.parse(outcome.content).result).toEqual(
      JSON.parse(JSON.stringify(atVersion(registry, "4.0").component("Modal"))),
    );
  });

  it("counts only the retrieval that actually ran as evidence", () => {
    const ledger = createLedger();
    executeTool(registry, ledger, "get_component", { id: "Modal", version: "9.9" });
    executeTool(registry, ledger, "get_component", { id: "Modal", version: "4.0" });

    expect(ledger.entries()).toHaveLength(1);
  });
});
