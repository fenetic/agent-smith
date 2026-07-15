import { evaluate } from "./evaluate.js";
import { render } from "./report.js";

/**
 * Run the eval and print what it came to.
 *
 * The one command the work item asks for. Thin on purpose — it composes the set, the run,
 * the score and the rendering and adds nothing of its own, so there is no behaviour here
 * that is not tested one layer down. That is the same split `mcp/index.ts` draws: the
 * entry point is wiring, and the substance lives beside it.
 *
 * This talks to the real Anthropic API and costs money and minutes: nine cases, each a full
 * agent loop, run one after another. That is the price of measuring the agent that ships
 * rather than a fake of it.
 */
async function main(): Promise<void> {
  const { summary } = await evaluate();

  console.log(render(summary));
}

/**
 * A disagreement is a *result*, not a failure — so the command succeeds even when the agent
 * did badly. 07 measures and reports; failing a build on the number is a policy decision,
 * and deliberately Work Item 09's: this is the harness a CI hook would call, not the hook.
 *
 * A non-zero exit therefore means the harness itself broke — an unreleased version, an API
 * that would not answer — and never that the agent scored poorly. Conflating the two would
 * make a red run ambiguous exactly when someone needs to know which of the two happened.
 */
main().catch((error: unknown) => {
  console.error("eval: failed to run", error);
  process.exit(1);
});
