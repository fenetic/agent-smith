import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Trace } from "./events.js";

/**
 * Write a run's trace where the caller says, as JSON.
 *
 * The structured artifact is the source of truth and the rendering is a view over it —
 * the same split 03 draws across the MCP result payload, and for the same reason: a run
 * persisted as prose would have to be parsed back out of its own presentation, and the two
 * accounts would be free to disagree about what happened.
 *
 * The file is the caller's to name, deliberately. "Per-run" is a fact about the *run* —
 * which snippet, which version, which attempt — and this function knows none of that; a
 * name minted here from a timestamp would be unique without being meaningful, and the
 * caller that knows what the run was is the one that can say.
 *
 * Sync, like 01's loader: this runs once at the end of a run, and an async write would buy
 * nothing but a promise for every caller to thread. Nothing is caught — a trace that could
 * not be written is worth failing over, because the alternative is a run reporting success
 * while the record a reviewer was promised is quietly absent.
 */
export function writeTrace(trace: Trace, file: string): void {
  // The first run of a demo is exactly the case this exists for: the run works, and the
  // record of it would otherwise be lost to a directory nobody had made yet.
  mkdirSync(dirname(file), { recursive: true });

  // Indented, because a person opens this. It is the source of truth rather than the
  // rendering, but "structured" and "unreadable" are not the same claim, and the bytes are
  // cheap next to a reviewer who cannot skim the file they were handed.
  writeFileSync(file, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
}
