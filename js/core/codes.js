/*
 * codes.js — run codes.
 *
 * A run code is a short, human-shareable handle for a seed. Anything the
 * player types is accepted (it gets hashed), so people can also paste a full
 * word or phrase and get a stable run out of it. Codes avoid look-alike
 * characters so they survive being read aloud.
 */
(function (BL) {
  'use strict';

  const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I

  /** e.g. "XMB-7K4Q-P2NH" */
  function generate() {
    let out = 'XMB';
    for (let g = 0; g < 2; g++) {
      out += '-';
      for (let i = 0; i < 4; i++) {
        out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      }
    }
    return out;
  }

  /**
   * Normalise whatever was pasted into a code we can print back:
   * uppercase, strip spaces, keep letters/digits/dashes, cap the length.
   */
  function normalize(raw) {
    const s = String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 40);
    return s;
  }

  /** Every code maps to a seed string; the engine hashes it into a stream. */
  function toSeed(code) {
    return 'xombat:' + normalize(code);
  }

  function looksLikeCode(code) {
    return /^[A-Z0-9-]{4,40}$/.test(normalize(code));
  }

  BL.codes = { generate, normalize, toSeed, looksLikeCode, ALPHABET };
})(window.BL = window.BL || {});
