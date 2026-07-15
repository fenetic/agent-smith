import { describe, expect, it } from "vitest";

// SCAFFOLD CANARY — delete this file at the first real RED cycle (Work Item 01).
// It exists only to prove the toolchain is wired: Vitest resolves the `unit`
// project, TypeScript's strict settings apply, and ESM imports work.
describe("toolchain", () => {
  it("runs strict-mode TypeScript under the unit project", () => {
    // noUncheckedIndexedAccess is what makes this `string | undefined`
    // rather than `string` — the setting 02's version lookup depends on.
    const versions = ["1.0", "2.0"];
    const missing: string | undefined = versions[99];

    expect(missing).toBeUndefined();
  });
});
