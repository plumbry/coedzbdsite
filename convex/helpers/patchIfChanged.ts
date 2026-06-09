/** Returns patch fields that differ from `existing`, or null if nothing would change. */
export function diffPatch<T extends Record<string, unknown>>(
  existing: T,
  updates: Partial<T>,
): Partial<T> | null {
  const changed: Partial<T> = {};
  for (const key of Object.keys(updates) as (keyof T)[]) {
    const next = updates[key];
    const prev = existing[key];
    if (!valuesEqual(prev, next)) {
      changed[key] = next;
    }
  }
  return Object.keys(changed).length > 0 ? changed : null;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => valuesEqual(item, b[index]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => valuesEqual(aObj[key], bObj[key]));
  }
  return false;
}
