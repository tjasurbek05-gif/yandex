// Deterministic seeded RNG (mulberry32) — same seed, same run. Logic uses this, never Math.random.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Calendar-day seed (YYYYMMDD as an integer) for the daily challenge.
export function dailySeed(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return y * 10000 + m * 100 + d;
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Whole-day difference between two YYYY-MM-DD keys.
export function daysBetween(aKey, bKey) {
  if (!aKey || !bKey) return Infinity;
  const a = Date.parse(aKey + 'T00:00:00');
  const b = Date.parse(bKey + 'T00:00:00');
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  return Math.round((b - a) / 86400000);
}
