/*
 * text.js — line generation.
 *
 * Burnline feeds you Python: a snippet is cut into lines that fit the visible
 * line width, and a small fraction of positions are marked as enemies
 * (see enemies.js). This file owns the cutting and the fallback word chains.
 */
(function (BL) {
  'use strict';

  const SNIPPETS = (window.BL_DATA && window.BL_DATA.python) || [];
  const WORDS = (window.BL_DATA && window.BL_DATA.words) || 'the of and a to in'.split(' ');

  /** Wrap one snippet line at `width` characters, preferring space breaks. */
  function wrap(line, width) {
    if (line.length <= width) return [line];
    const out = [];
    let rest = line;
    while (rest.length > width) {
      let cut = rest.lastIndexOf(' ', width);
      if (cut <= 0) cut = width;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ /, '');
    }
    if (rest) out.push(rest);
    return out;
  }

  /**
   * Deals snippet lines out in chunks that fit `width`, the way the original
   * does: fill the visible area, remember where we stopped, continue the code
   * next time. Never repeats a snippet until the pool is exhausted.
   */
  class CodeSource {
    constructor(rng) {
      this.rng = rng;
      this.pending = [];
      this.used = new Set();
      this.snippet = null;
    }

    nextSnippet() {
      if (this.used.size >= SNIPPETS.length) this.used.clear();
      const pool = SNIPPETS.filter((s) => !this.used.has(s));
      const s = BL.pick(this.rng, pool.length ? pool : SNIPPETS);
      this.used.add(s);
      this.snippet = s;
      return s;
    }

    /** Returns a newline-joined chunk of code no wider than `width`. */
    next(width) {
      const parts = [];
      let used = 0;
      for (let guard = 0; guard < 60; guard++) {
        if (!this.pending.length) {
          this.pending = this.nextSnippet().lines.flatMap((l) => wrap(l, width));
        }
        if (this.pending[0].length > width) {
          // a single token is wider than the viewport: hard-split it
          this.pending.splice(0, 1, ...wrap(this.pending[0], width));
        }
        const head = this.pending[0];
        const cost = head.length + (parts.length ? 1 : 0);
        if (used + cost > width || (parts.length && used + cost > width)) break;
        parts.push(head);
        used += cost;
        this.pending.shift();
        if (!this.pending.length && parts.length) break;
      }
      if (!parts.length) parts.push(this.pending.shift() || 'pass');
      return parts.join('\n');
    }
  }

  /**
   * Fallback filler: short common English words chained into one line.
   * Used when the snippet pool is missing, and for the word-chain warm-ups.
   */
  function wordChain(rng, width) {
    const out = [];
    let len = 0;
    let last = '';
    for (let guard = 0; guard < 40; guard++) {
      const w = BL.pick(rng, WORDS);
      if (w === last) continue;
      const cost = w.length + (out.length ? 1 : 0);
      if (len + cost > width) break;
      out.push(w);
      len += cost;
      last = w;
    }
    return out.join(' ') || 'pass';
  }

  BL.CodeSource = CodeSource;
  BL.wordChain = wordChain;
  BL.wrap = wrap;
})(window.BL = window.BL || {});
