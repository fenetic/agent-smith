import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Fast, offline, deterministic. This is the TDD loop — `npm test`.
        // The agent's model calls are faked here via the ModelClient port.
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        // Touches the real Anthropic API. Needs ANTHROPIC_API_KEY.
        // Opt-in only (`npm run test:integration`); never runs in CI.
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
