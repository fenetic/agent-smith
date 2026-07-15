import type { Observer, Trace, TraceEvent } from "./events.js";

/**
 * An observer that keeps what it hears.
 *
 * `emit` is an {@link Observer} like any other, which is the point: the loop and the gate
 * cannot tell a collector from the no-op they call by default, so nothing about how they
 * run changes when 06 is listening.
 */
export interface Collector {
  emit: Observer;
  events(): Trace;
}

/**
 * Open a collector for one run.
 *
 * Per run, like the ledger it sits beside: a trace describes *this* run, and a collector
 * outliving one would narrate two runs as though they were a single sequence of events.
 */
export function createCollector(): Collector {
  const events: TraceEvent[] = [];

  return {
    emit: (event) => {
      events.push(event);
    },

    // A copy, not the live array. The trace is a record of what happened, and handing out
    // the array it is accumulating into would let a reader watch it change underneath them
    // — or edit the run's history in place.
    events: () => [...events],
  };
}
