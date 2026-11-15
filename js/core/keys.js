/*
 * keys.js — scars.
 *
 * Keys you get wrong get scarred, and scarred keys come back to haunt you:
 * once a key is *mined* every instance of it on the line is underlined and a
 * miss on it costs double. Thirty clean characters in a row repairs one.
 * This is also what makes a run feel personal — the game learns your hands.
 */
(function (BL) {
  'use strict';

  const SHIFTED = {
    '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8',
    '(': '9', ')': '0', _: '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';',
    '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
  };

  /** Fold shifted characters onto the physical key you actually press. */
  function keyOf(ch) {
    return SHIFTED[ch] || ch.toLowerCase();
  }

  class KeyScars {
    constructor() {
      this.levels = new Map(); // key -> 1 (cracked) | 2 (broken/mined)
      this.hits = new Map();
      this.misses = new Map();
      this.cleanStreak = 0;
      this.repairStreak = 30;
    }

    level(ch) {
      return this.levels.get(keyOf(ch)) || 0;
    }

    isMined(ch) {
      return this.level(ch) === 2;
    }

    /** A wrong key cracks the key, then breaks it. Returns an event or null. */
    onMiss(ch) {
      const k = keyOf(ch);
      this.misses.set(k, (this.misses.get(k) || 0) + 1);
      this.cleanStreak = 0;
      const level = this.level(k);
      if (level === 2) return null;
      const next = level + 1;
      this.levels.set(k, next);
      return { type: next === 1 ? 'crack' : 'break', key: k };
    }

    /** A clean key chips away at a scar every `repairStreak` hits. */
    onHit(ch) {
      const k = keyOf(ch);
      this.hits.set(k, (this.hits.get(k) || 0) + 1);
      this.cleanStreak++;
      if (this.cleanStreak < this.repairStreak) return null;
      this.cleanStreak = 0;
      const worst = this.mostDamaged();
      if (!worst) return null;
      const next = this.level(worst) - 1;
      if (next === 0) this.levels.delete(worst);
      else this.levels.set(worst, next);
      return { type: 'repair', key: worst, level: next };
    }

    mostDamaged() {
      let best = null;
      for (const [k, lvl] of this.levels) {
        if (best === null) {
          best = k;
          continue;
        }
        const bl = this.levels.get(best);
        if (lvl > bl || (lvl === bl && (this.misses.get(k) || 0) > (this.misses.get(best) || 0))) {
          best = k;
        }
      }
      return best;
    }

    /** How much a word leans on your weak keys — drives adaptive line choice. */
    weakness(ch) {
      const k = keyOf(ch);
      const misses = this.misses.get(k) || 0;
      if (!misses) return 0;
      const hits = this.hits.get(k) || 0;
      return this.level(k) * 1.5 + (misses / (misses + hits)) * 4;
    }

    brokenKeys() {
      return [...this.levels].filter(([, lvl]) => lvl === 2).map(([k]) => k);
    }

    snapshot() {
      return [...this.levels].map(([k, lvl]) => ({ key: k, level: lvl }));
    }
  }

  BL.KeyScars = KeyScars;
  BL.keyOf = keyOf;
})(window.BL = window.BL || {});
