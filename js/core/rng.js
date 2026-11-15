/*
 * rng.js — deterministic randomness.
 *
 * Everything the game generates (which snippet, where a bomber lands, which
 * cards you are offered) comes out of one seeded stream, so the run code a
 * player pastes fully determines their run.
 */
(function (BL) {
  'use strict';

  /** FNV-1a: string -> uint32, used to turn a run code into a seed. */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** mulberry-ish 32-bit stream. Returns a function producing [0,1). */
  function make(seed) {
    let t = typeof seed === 'number' ? seed >>> 0 : hash(seed);
    return function next() {
      t = (t + 1831565813) >>> 0;
      let e = t;
      e = Math.imul(e ^ (e >>> 15), e | 1);
      e ^= e + Math.imul(e ^ (e >>> 7), e | 61);
      return ((e ^ (e >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Pick from `items` with weights, both drawn from the same stream. */
  function weighted(rng, items, weights) {
    let total = 0;
    for (const w of weights) total += w;
    let roll = rng() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll < 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Same idea, uniform. */
  function pick(rng, items) {
    return items[Math.floor(rng() * items.length)];
  }

  BL.hash = hash;
  BL.rng = make;
  BL.weighted = weighted;
  BL.pick = pick;
})(window.BL = window.BL || {});
