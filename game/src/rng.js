// Marina Verde — seeded random helpers. One tiny module so the city, traffic and
// missions all draw from the same deterministic stream for a given seed.
// v2 adds `chance` (a one-line probability roll used by the world builder and
// the pedestrian tourist variants).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

export function range(rand, min, max) {
  return min + rand() * (max - min);
}

export function rangeInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

// One-line probability roll: true with probability p (0..1).
export function chance(rand, p) {
  return rand() < p;
}

// A stable hash of a string, so block (i, j) always seeds the same way.
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
