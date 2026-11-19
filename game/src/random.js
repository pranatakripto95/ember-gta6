// Ember Vice — random.js
// One job: a tiny seeded RNG (mulberry32) so the city, traffic and screenshot
// poses are reproducible from a seed, plus small pick helpers.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function rangeInt(rng, lo, hi) { return Math.floor(range(rng, lo, hi + 1)); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function chance(rng, p) { return rng() < p; }
