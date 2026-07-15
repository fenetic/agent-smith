/**
 * 06's surface: the vocabulary of a trace, and the collector that assembles one.
 *
 * The observer is the whole seam. 04 and 05 take an `emit` and call it as they run; this
 * module supplies something worth handing them, and never the reverse — nothing here is
 * reachable from the loop or the gate at runtime, which is what keeps a run that is not
 * being observed identical to a run from before there was anything to observe with.
 */
export type { Collector } from "./collector.js";
export { createCollector } from "./collector.js";
export type {
  CapHitEvent,
  FindingEvent,
  FindingRef,
  GuardrailEvent,
  Observer,
  ReasoningEvent,
  RetrievalEvent,
  RunEndEvent,
  RunStartEvent,
  Trace,
  TraceEvent,
} from "./events.js";
export { writeTrace } from "./persist.js";
export { render } from "./render.js";
