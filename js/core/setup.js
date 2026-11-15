/*
 * setup.js — one place that decides what an engine is made of.
 *
 * Three ways to get text into a run:
 *   1. the shipped corpus (optionally narrowed to one language pack)
 *   2. code the player pasted
 *   3. nothing usable -> fall back to the corpus rather than crash
 *
 * Everything here is derived, never stored: the share code carries the seed and
 * a fingerprint of the pasted text, and nothing else.
 */
(function (BL) {
  'use strict';

  const PACKS = (window.BL_DATA && window.BL_DATA.packs) || {};

  const NAMES = Object.assign(
    { python: 'python', auto: 'any language', paste: 'pasted' },
    Object.keys(PACKS).reduce((acc, id) => {
      acc[id] = PACKS[id].name;
      return acc;
    }, {})
  );

  /** Turn a stored snippet pack into the shape text.js expects. */
  function poolFor(lang) {
    const pack = PACKS[lang];
    if (!pack) return null;
    // tabs are not typeable on a normal keyboard, so every pack ships spaces
    return pack.snippets.map((lines) => ({
      tag: lang,
      lines: lines.map((l) => l.replace(/\t/g, '    ')),
    }));
  }

  function languages() {
    const out = [{ id: 'auto', name: 'Any language' }, { id: 'python', name: 'Python' }];
    Object.keys(PACKS)
      .sort((a, b) => NAMES[a].localeCompare(NAMES[b]))
      .forEach((id) => out.push({ id, name: NAMES[id] }));
    return out;
  }

  /**
   * Build the engine options for a run.
   *   seed    - string from the run code
   *   text    - pasted code (optional)
   *   lang    - language id for the shipped corpus (optional)
   */
  function engineFor(opts) {
    const seed = opts.seed;
    const text = opts.text ? BL.sourceStore.clean(opts.text) : '';
    const width = opts.lineLength || 44;

    if (text.trim().length >= 8) {
      const detected = BL.langs.detect(text);
      const source = new BL.PastedSource(text, { width, label: detected.name });
      return new BL.Engine({
        seed,
        lineLength: width,
        source,
        lang: detected.name,
        keywords: BL.langs.keywordsFor(detected.id),
      });
    }

    const lang = opts.lang && opts.lang !== 'auto' && PACKS[opts.lang] ? opts.lang : opts.lang === 'python' ? 'python' : null;
    return new BL.Engine({
      seed,
      lineLength: width,
      pool: lang ? poolFor(lang) : null,
      lang: lang && lang !== 'python' ? NAMES[lang] : null,
      keywords: lang ? BL.langs.keywordsFor(lang) : null,
    });
  }

  BL.setup = { engineFor, languages, NAMES, PACKS, poolFor };
})(window.BL = window.BL || {});
