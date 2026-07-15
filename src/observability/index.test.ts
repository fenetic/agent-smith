import { describe, expect, it } from "vitest";
import * as observability from "./index.js";

/**
 * The barrel is the module's actual surface, and the tests beside it are not.
 *
 * Every other test here imports from the file that declares what it is testing, which is
 * right — a test should name the thing it is about. The cost is that none of them would
 * notice the barrel failing to export it: the module would be complete, fully tested, and
 * unusable from outside. This is the one test that reads it the way a caller does.
 */
describe("06's surface is reachable", () => {
  it("offers the collector a run attaches", () => {
    expect(observability.createCollector).toBeTypeOf("function");
  });

  it("offers the renderer the demo narrates from", () => {
    expect(observability.render).toBeTypeOf("function");
  });

  it("offers the writer that persists a run", () => {
    expect(observability.writeTrace).toBeTypeOf("function");
  });
});
