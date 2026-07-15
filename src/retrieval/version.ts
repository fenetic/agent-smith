import type { Meta, Version } from "../registry/index.js";

/** Is `version` a point on the registry's declared history? */
export function isKnownVersion(meta: Meta, version: string): version is Version {
  return meta.versions.includes(version);
}

/**
 * Order two versions by their position in `meta.versions`, which is the registry's
 * single source of chronology — "10.0" follows "9.0" there, though it precedes it
 * as a string.
 *
 * Throws on a version outside the history rather than ordering it. `indexOf` would
 * hand back -1, quietly seating an unknown version before all of recorded time and
 * reading it as not-yet-added. An unrecognised version here is a caller bug: 01
 * guarantees every version a lifecycle names is known, and `atVersion` validates the
 * one the caller supplies.
 */
export function compareVersions(meta: Meta, a: Version, b: Version): number {
  const positionOf = (version: Version) => {
    const index = meta.versions.indexOf(version);
    if (index === -1) {
      throw new RangeError(`"${version}" is not a version in this registry's history`);
    }
    return index;
  };

  return Math.sign(positionOf(a) - positionOf(b));
}
