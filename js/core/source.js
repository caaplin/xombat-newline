/*
 * source.js — paste any code and play on it.
 *
 * A PastedSource deals the player's own text out line by line, in order,
 * wrapping long lines to the viewport. The text never leaves the browser: it
 * is kept in memory for the run and (if the player asks) in localStorage for
 * next time. Share codes only ever carry a short fingerprint + seed, so you can
 * hand someone a code without handing them your source.
 */
(function (BL) {
  'use strict';

  const MAX_CHARS = 400000; // ~400 KB of code is plenty of run
  const STORE_KEY = 'xombat.source.v1';

  /** Cheap non-cryptographic fingerprint so a code can identify its source. */
  function fingerprint(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36).toUpperCase().slice(0, 6);
  }

  /**
   * Normalise pasted text: unify newlines, expand tabs to 4 columns, strip
   * carriage returns / null bytes / other control junk that can't be typed,
   * and trim trailing whitespace on every line.
   */
  function clean(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\t/g, '    ')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ') // keep word gaps
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .slice(0, MAX_CHARS);
  }

  /** Wrap one line at `width`, preferring to break at a space. */
  function wrap(line, width) {
    if (line.length <= width) return [line];
    const out = [];
    let rest = line;
    while (rest.length > width) {
      let cut = rest.lastIndexOf(' ', width);
      if (cut <= 0) cut = width;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ +/, '');
    }
    if (rest) out.push(rest);
    return out;
  }

  /**
   * Breaks a whole document into playable lines: keeps indentation, drops runs
   * of blank lines (one blank line survives, to keep the shape of the code),
   * and wraps anything too long. Blank lines are kept as a single space so
   * there is still something to hit Enter on.
   */
  function toLines(text, width) {
    const raw = clean(text).split('\n');
    const out = [];
    let blankRun = 0;
    for (const line of raw) {
      if (!line.trim()) {
        blankRun++;
        if (blankRun > 1) continue;
        out.push(' ');
        continue;
      }
      blankRun = 0;
      for (const piece of wrap(line, width)) out.push(piece);
    }
    // trailing blank line is pointless
    while (out.length && out[out.length - 1] === ' ') out.pop();
    return out;
  }

  class PastedSource {
    constructor(text, opts) {
      opts = opts || {};
      this.raw = clean(text);
      this.lines = toLines(this.raw, opts.width || 44);
      this.index = 0;
      this.looped = 0;
      this.label = opts.label || 'pasted';
      this.fingerprint = fingerprint(this.raw);
      this.totalLines = this.lines.length;
    }

    get empty() {
      return !this.lines.length;
    }

    /**
     * Deal the next chunk of code that fits `width` columns, keeping the
     * document in order. When it runs out it loops back to the top — that is
     * what makes "combat till end" work with a finite amount of code.
     */
    next(width) {
      if (!this.lines.length) return null;
      const parts = [];
      let used = 0;
      for (let guard = 0; guard < 80; guard++) {
        if (this.index >= this.lines.length) {
          this.index = 0;
          this.looped++;
        }
        let line = this.lines[this.index];
        if (line.length > width) {
          // a long line got wrapped for a different viewport width: resplit it
          const pieces = wrap(line, width);
          this.lines.splice(this.index, 1, ...pieces);
          this.totalLines = this.lines.length;
          line = this.lines[this.index];
        }
        const cost = line.length + (parts.length ? 1 : 0);
        if (parts.length && used + cost > width) break;
        parts.push(line);
        used += cost;
        this.index++;
        if (used >= width) break;
      }
      return parts.join('\n');
    }

    /** 0..1 through the document, for the HUD. */
    progress() {
      if (!this.totalLines) return 0;
      return Math.min(1, this.index / this.totalLines);
    }
  }

  /** Persist across reloads so "again" works without re-pasting. */
  function save(text) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ text: String(text).slice(0, MAX_CHARS), at: Date.now() }));
      return true;
    } catch (e) {
      return false; // quota / private mode
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj && typeof obj.text === 'string' && obj.text.trim() ? obj : null;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  BL.PastedSource = PastedSource;
  BL.sourceStore = { save, load, clear, fingerprint, clean, toLines, MAX_CHARS };
})(window.BL = window.BL || {});
