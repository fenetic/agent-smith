import { audit } from "../agent/index.js";
import { createCollector, render, writeTrace } from "../observability/index.js";
import { code, version } from "./snippet.js";

/**
 * Run the compliance agent against the planted snippet and narrate the run — Act 1 of the
 * demo, as a command a stranger can run.
 *
 * Wiring only, like `mcp/index.ts` and `eval/index.ts`: it composes `audit` (the whole of
 * 04, gate included), a 06 collector to keep the trace, the 06 rendering to walk it, and
 * the 06 writer to leave it behind. There is no behaviour here that is not tested a layer
 * down — which is why there is no demo unit test of the run itself.
 *
 * This talks to the real Anthropic API and costs money and a minute: one full agent loop
 * over a five-usage file. That is the price of demonstrating the agent that ships rather
 * than a fake of it — the same trade `eval/index.ts` makes.
 */
const TRACE_FILE = "docs/demo/trace.json";

async function main(): Promise<void> {
  // The collector is an ordinary observer, so the run cannot tell it is being watched:
  // what the trace records is exactly the run that happened, not a run staged for it.
  const collector = createCollector();

  await audit(code, version, { emit: collector.emit });

  const trace = collector.events();

  // The narrative to the human, live. `render` is a view over the trace and never a second
  // account of it — the ids that walk the grounding (r1 minted, r1 cited) travel verbatim.
  console.log(render(trace));

  // The same run persisted as its structured self, so a flaky API call on the day is not
  // the end of the demo: the recorded trace is the same artifact, just not made just now.
  writeTrace(trace, TRACE_FILE);
  console.error(`\nTrace written to ${TRACE_FILE}`);
}

/**
 * A non-zero exit means the harness broke — no key, an API that would not answer, an
 * unreleased version — never that the agent's verdicts were unwelcome. A disappointing
 * audit is still a successful run of the demo. Human-facing lines go to stderr so a reader
 * piping the rendering somewhere gets the trace alone.
 */
main().catch((error: unknown) => {
  console.error("demo: failed to run", error);
  process.exit(1);
});
