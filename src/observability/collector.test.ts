import { describe, expect, it } from "vitest";
import { createCollector } from "./collector.js";
import type { TraceEvent } from "./events.js";

const noticing: TraceEvent = { type: "reasoning", text: "<Modal> is worth a lookup." };
const deciding: TraceEvent = { type: "reasoning", text: "Deprecated, and not legacy." };

describe("a fresh collector claims nothing happened", () => {
  it("has no events before anything has been emitted", () => {
    expect(createCollector().events()).toEqual([]);
  });
});

describe("the collector keeps what the run emitted", () => {
  it("holds an emitted event", () => {
    const collector = createCollector();
    collector.emit(noticing);

    expect(collector.events()).toEqual([noticing]);
  });
});

/**
 * Order is the whole product. A trace is what happened *in sequence* — the reasoning
 * that led to a lookup, the lookup, the verdict that rests on it — and a collector
 * that shuffled them would still hold every event while saying something untrue about
 * the run.
 */
describe("the collector keeps the events in the order they happened", () => {
  it("lists them in emission order", () => {
    const collector = createCollector();
    collector.emit(noticing);
    collector.emit(deciding);

    expect(collector.events()).toEqual([noticing, deciding]);
  });
});
