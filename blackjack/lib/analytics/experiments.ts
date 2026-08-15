import { analytics } from "./client";
import { STORAGE_KEYS } from "./config";
import { getAnonId } from "./identity";

type Assignments = Record<string, string>;
const exposed = new Set<string>();

function readAssignments(): Assignments {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.experiments) || "{}") as Assignments;
  } catch {
    return {};
  }
}

function persist(assignments: Assignments): void {
  try {
    localStorage.setItem(STORAGE_KEYS.experiments, JSON.stringify(assignments));
  } catch {
    // A deterministic in-memory assignment still works when storage is blocked.
  }
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/** Stable first-party experiment assignment with one exposure per page lifetime. */
export function experimentVariant<T extends string>(experiment: string, variants: readonly T[]): T {
  if (!variants.length) throw new Error("experimentVariant requires at least one variant");
  const assignments = readAssignments();
  const stored = assignments[experiment];
  const variant = variants.includes(stored as T)
    ? stored as T
    : variants[hash(`${getAnonId()}:${experiment}`) % variants.length];
  if (assignments[experiment] !== variant) {
    assignments[experiment] = variant;
    persist(assignments);
  }
  const key = `experiment:${experiment}:${variant}`;
  if (!exposed.has(key)) {
    exposed.add(key);
    analytics.track("experiment_exposure", { experiment, variant });
  }
  return variant;
}

/** Records the effective value when product code evaluates a feature flag. */
export function exposeFeatureFlag(flag: string, variation: string): void {
  const key = `flag:${flag}:${variation}`;
  if (exposed.has(key)) return;
  exposed.add(key);
  analytics.track("feature_flag_exposure", { flag, variation });
}
