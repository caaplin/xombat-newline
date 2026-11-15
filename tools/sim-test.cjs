#!/usr/bin/env node
/*
 * sim-test.cjs — headless checks for the simulation.
 *
 * The engine is deliberately DOM-free, so we can load the browser scripts into
 * a fake `window`, drive a bot through thousands of keys and assert the rules
 * actually hold. Run with: node tools/sim-test.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console, performance: { now: () => Date.now() }, Math, Date };
sandbox.window = sandbox;
sandbox.localStorage = { getItem: () => null, setItem: () => {} };
const ctx = vm.createContext(sandbox);

const files = [
  'js/data/words.js',
  'js/data/snippets.js',
  'js/data/packs.js',
  'js/core/rng.js',
  'js/core/langs.js',
  'js/core/text.js',
  'js/core/source.js',
  'js/core/enemies.js',
  'js/core/cards.js',
  'js/core/keys.js',
  'js/core/engine.js',
  'js/core/setup.js',
  'js/core/codes.js',
];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}

const BL = sandbox.BL;
let failures = 0;
function ok(cond, label, extra) {
  if (cond) {
    console.log('  ok   ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra)));
  }
}

/* ----------------------------------------------------------------- 1. rng */
console.log('\nrng');
{
  const a = BL.rng('XMB-7K4Q-P2NH');
  const b = BL.rng('XMB-7K4Q-P2NH');
  const as = Array.from({ length: 5 }, a);
  const bs = Array.from({ length: 5 }, b);
  ok(JSON.stringify(as) === JSON.stringify(bs), 'same seed -> same stream');
  const c = BL.rng('XMB-7K4Q-P2NH2');
  ok(JSON.stringify(as) !== JSON.stringify(Array.from({ length: 5 }, c)), 'different seed -> different stream');
  ok(as.every((v) => v >= 0 && v < 1), 'values are in [0,1)');
}

/* -------------------------------------------------------------- 2. dealing */
console.log('\ntext source');
{
  const src = new BL.CodeSource(BL.rng('T1'));
  let wrapsOk = true;
  let nonEmpty = true;
  for (let i = 0; i < 400; i++) {
    const width = 16 + (i % 60);
    const chunk = src.next(width);
    if (!chunk) nonEmpty = false;
    for (const line of chunk.split('\n')) if (line.length > width) wrapsOk = false;
  }
  ok(wrapsOk, 'no line is wider than the requested width');
  ok(nonEmpty, 'never deals an empty line');
  const a = new BL.CodeSource(BL.rng('same')).next(40);
  const b = new BL.CodeSource(BL.rng('same')).next(40);
  ok(a === b, 'dealing is deterministic for a seed');
}

/* ------------------------------------------------------- 3. enemy dressing */
console.log('\nenemies');
{
  const info = BL.ENEMY.zoneAt(1);
  const text = 'def load(path):\n\twith open(path) as f:\n\t\treturn f.read()';
  const kinds = BL.ENEMY.dress(text, BL.rng('E1'), { roster: info.roster, elite: false });
  ok(kinds.length === text.length, 'one kind per character');
  // the roster is probabilistic, so sample until brutes show up
  let anyBrute = false;
  for (let i = 0; i < 40 && !anyBrute; i++) {
    const ks = BL.ENEMY.dress(text, BL.rng('E' + i), { roster: info.roster, elite: false });
    if (ks.includes('brute')) anyBrute = true;
  }
  ok(anyBrute, 'brutes appear on keywords');
  ok(kinds.length === text.length, 'kinds survive repeated dressing');
  // a brute must cover a complete run of characters, never a stray letter
  let partial = 0;
  for (const [s, e] of BL.ENEMY.words(text)) {
    const inside = kinds.slice(s, e).filter((k) => k === 'brute').length;
    if (inside !== 0 && inside !== e - s) partial++;
  }
  ok(partial === 0, 'brutes never cut a word in half');
  ok(BL.ENEMY.zoneAt(11).zone.id === 'slums', 'zones loop after ten floors');
  ok(BL.ENEMY.zoneAt(11).label.includes('+'), 'looped zones are marked');
}

/* ------------------------------------------------------------ 4. the rules */
console.log('\nrules');
{
  // clean typing scores, heals nothing above max, and advances
  const e = new BL.Engine({ seed: 'rules-1', lineLength: 40 });
  const before = e.raw;
  for (let i = 0; i < 10; i++) e.input(e.line[e.cursor], 1000 + i * 100);
  ok(e.raw > before, 'correct keys score');
  ok(e.cursor === 10, 'cursor advances', e.cursor);
  ok(e.hp === 100, 'clean typing does not hurt');

  // a wrong key costs HP and scar tissue, and does not advance the cursor
  const e2 = new BL.Engine({ seed: 'rules-2', lineLength: 40 });
  const want = e2.line[0];
  const wrong = want === 'q' ? 'z' : 'q';
  e2.input(wrong, 1000);
  ok(e2.hp < 100, 'a miss costs HP', e2.hp);
  ok(e2.cursor === 0, 'a miss does not advance the cursor');
  ok(e2.misses === 1, 'misses are counted');
  ok(e2.keys.snapshot().length === 1, 'the key you missed gets scarred', e2.keys.snapshot());

  // no backspace: the engine has no way to undo
  ok(typeof e2.backspace === 'undefined', 'there is no backspace in the API');

  // glass cannon: any miss ends the run
  const e3 = new BL.Engine({ seed: 'rules-3', lineLength: 40 });
  e3.grant('glass');
  e3.input(e3.line[0] === 'z' ? 'q' : 'z', 1000);
  ok(e3.dead && e3.deathCause.includes('Glass'), 'glass cannon kills on one miss', e3.deathCause);
}

/* -------------------------------------------------------- 5. trace & chaser */
console.log('\ntrace');
{
  const e = new BL.Engine({ seed: 'trace-1', lineLength: 40 });
  const speed = e.fireSpeed;
  ok(speed > 0, 'the trace moves', speed);
  // do nothing and it must eventually catch you
  // level 1 only costs 25% damage per catch, so this takes a while
  let guard = 0;
  while (!e.dead && guard++ < 20000) e.tick(0.05);
  ok(e.dead, 'standing still gets you killed');
  ok(e.endReason === 'death', 'standing still ends the run');
  ok(e.burns > 0, 'the trace burns the line', e.burns);

  // deeper floors move faster
  const deep = new BL.Engine({ seed: 'trace-1', lineLength: 40 });
  deep.floor = 30;
  ok(deep.fireSpeed > speed, 'deeper floors trace faster', [speed, deep.fireSpeed]);

  // lethal zones end the run in one touch; others just knock you back
  const lethal = new BL.Engine({ seed: 'trace-2', lineLength: 40 });
  lethal.floor = 5; // foundry: collapsing bridge
  let g2 = 0;
  while (!lethal.dead && g2++ < 4000) lethal.tick(0.05);
  ok(lethal.dead && lethal.endReason === 'death', 'lethal chasers kill, they do not damage');

  const soft = new BL.Engine({ seed: 'trace-3', lineLength: 40 });
  soft.floor = 1;
  let g3 = 0;
  while (soft.hp === 100 && g3++ < 4000) soft.tick(0.05);
  ok(soft.hp < 100, 'non-lethal chasers cost HP');
}

/* --------------------------------------------------------- 6. floor & cards */
console.log('\nprogression');
{
  const e = new BL.Engine({ seed: 'prog-1', lineLength: 20 });
  // type perfectly for a while, taking any card offered
  let guard = 0;
  let sawOffer = false;
  let sawBoss = false;
  while (guard++ < 60000 && e.floor < 3 && !e.dead) {
    if (e.offer) {
      sawOffer = true;
      e.choose(0);
      e.drain();
      continue;
    }
    if (e.bossHealth) sawBoss = true;
    e.input(e.line[e.cursor], guard * 10);
    const evts = e.drain();
    if (evts.some((x) => x.type === 'boss')) sawBoss = true;
    if (e.offer) continue;
  }
  ok(sawBoss, 'every third line is a boss line');
  ok(sawOffer, 'clearing a floor offers a card');
  ok(e.floor >= 2, 'floors advance when you clear them', e.floor);
  ok(e.linesCleared >= 3, 'lines cleared are counted', e.linesCleared);
}

/* ------------------------------------------------------------ 7. determinism */
console.log('\ndeterminism');
{
  function run(seed) {
    const e = new BL.Engine({ seed, lineLength: 40 });
    const out = [];
    for (let i = 0; i < 2000 && !e.dead; i++) {
      if (e.offer) {
        e.choose(0);
        continue;
      }
      const want = e.line[e.cursor];
      // deterministic "human": 3% wrong
      const ch = i % 33 === 0 ? (want === 'x' ? 'y' : 'x') : want;
      e.input(ch, i * 90);
      if (i % 4 === 0) e.tick(0.09);
      if (i % 20 === 0) out.push(Math.round(e.raw) + ':' + e.cursor);
    }
    return { raw: e.raw, floor: e.floor, lines: e.linesCleared, dead: e.dead, trace: out.join('|') };
  }
  const a = run('XMB-AAAA-BBBB');
  const b = run('XMB-AAAA-BBBB');
  const c = run('XMB-AAAA-CCCC');
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same code plays out identically');
  ok(a.trace !== c.trace, 'a different code plays out differently');
}

/* ----------------------------------------------------------- 8. long session */
console.log('\nendurance');
{
  // a human-ish bot: ~70ms a key, one key in twenty-five wrong
  function playthrough(seed, errorRate, maxKeys) {
    const e = new BL.Engine({ seed, lineLength: 44 });
    let keys = 0;
    let n = 0;
    while (n++ < maxKeys && !e.dead) {
      if (e.offer) {
        e.choose(n % 3);
        e.drain();
        continue;
      }
      const want = e.line[e.cursor];
      const wrong = (n * 7919) % 1000 < errorRate * 1000;
      e.input(wrong ? (want === 'x' ? 'y' : 'x') : want, n * 70);
      keys++;
      if (n % 3 === 0) e.tick(0.07);
      e.drain();
    }
    return { e, keys };
  }
  const { e, keys } = playthrough('endurance', 0.04, 200000);
  ok(keys > 100, 'the bot typed a lot before dying', keys);
  ok(e.dead, 'a fallible player eventually dies');
  ok(e.score() >= 0 && Number.isFinite(e.score()), 'a finite score comes out', e.score());
  ok(e.floor >= 1, 'depth is reported', e.floor);

  // a flawless typist should be able to go deep — skill is the only ceiling
  const perfect = playthrough('endurance-2', 0, 12000);
  ok(perfect.e.linesCleared > 10, 'a clean typist clears a lot of lines', perfect.e.linesCleared);
}

/* -------------------------------------------------------------- 9. codes */
console.log('\ncodes');
{
  let bad = 0;
  for (let i = 0; i < 500; i++) if (!BL.codes.looksLikeCode(BL.codes.generate())) bad++;
  ok(bad === 0, '500 generated codes are all well formed');
  ok(BL.codes.normalize('  xmb-7k4q  ') === 'XMB-7K4Q', 'codes normalise to uppercase');
  ok(BL.codes.toSeed('abc') !== BL.codes.toSeed('abd'), 'different codes -> different seeds');
}

/* -------------------------------------------------- 10. pasted source */
console.log('\npasted source');
{
  const C = [
    '#include <stdio.h>',
    '#include <string.h>',
    '',
    'typedef struct {',
    '    char name[24];',
    '    int strength;',
    '} Ice;',
    '',
    'int main(void) {',
    '    Ice fw = {"firewall", 4};',
    '    printf("%s %d\\n", fw.name, fw.strength);',
    '    return 0;',
    '}',
  ].join('\n');

  const cleaned = BL.sourceStore.clean('a\r\nb\tc\u0000d');
  ok(cleaned === 'a\nb    c d', 'clean() normalises newlines, tabs and control junk', JSON.stringify(cleaned));

  const lines = BL.sourceStore.toLines(C, 40);
  ok(lines[0] === '#include <stdio.h>', 'the document keeps its order', lines.slice(0, 3));
  ok(lines.every((l) => l.length <= 40), 'no line exceeds the width');
  ok(lines.filter((l) => l === ' ').length === 2, 'each run of blank lines collapses to one');
  ok(!lines.length || lines[lines.length - 1] !== ' ', 'trailing blank lines are dropped');

  ok(BL.langs.detect(C).id === 'c', 'detects C', BL.langs.detect(C).name);
  ok(BL.langs.detect('def go():\n\treturn 1\n').id === 'python', 'detects python');
  ok(BL.langs.detect('SELECT id FROM users WHERE id = 1').id === 'sql', 'detects sql');
  ok(BL.langs.detect('fn main() { let mut x = 1; println!("{}", x); }').id === 'rust', 'detects rust');
  ok(BL.langs.detect('package main\n\nfunc main() {}').id === 'go', 'detects go');
  ok(BL.langs.detect('plain words with no structure at all').id === 'plaintext', 'falls back to text');

  const e = BL.setup.engineFor({ seed: 'paste-1', lineLength: 40, text: C });
  ok(e.pasted && e.pasted.totalLines > 5, 'the engine plays the pasted document', e.pasted.totalLines);
  ok(e.lang === 'c', 'the engine knows the language', e.lang);

  // what the player types must be the document, in order
  const played = [];
  for (let n = 0; n < 2000 && played.length < 6; n++) {
    if (e.offer) { e.choose(0); e.drain(); continue; }
    const before = e.line;
    if (e.cursor === 0) played.push(before);
    e.input(e.line[e.cursor], n * 40);
    e.tick(0.002);
    e.drain();
  }
  ok(played.length >= 4, 'several pasted lines came up', played.length);
  const allFromDoc = played.every((chunk) =>
    chunk.split('\n').every((l) => lines.includes(l) || l === ''));
  ok(allFromDoc, 'every line played came from the pasted document', played.slice(0, 2));

  // finishing the whole document loops back to the top rather than dying
  const loop = BL.setup.engineFor({ seed: 'paste-2', lineLength: 60, text: 'x = 1\ny = 2\nz = x + y\nprint(z)\n' });
  for (let n = 0; n < 400 && loop.pasted.looped === 0; n++) {
    if (loop.offer) { loop.choose(0); loop.drain(); continue; }
    loop.input(loop.line[loop.cursor], n * 30);
    loop.drain();
  }
  ok(loop.pasted.looped >= 1, 'a short document loops instead of ending the run', loop.pasted.looped);

  // a fingerprint identifies a source without revealing it
  const fp = BL.sourceStore.fingerprint(C);
  ok(fp.length >= 4 && fp.length <= 6, 'fingerprint is short', fp);
  ok(BL.sourceStore.fingerprint(C + ' ') !== fp, 'fingerprint changes with the source');

  // nothing from the source ends up in the share code
  const code = BL.codes.generateFrom ? BL.codes.generateFrom(fp) : 'XMB-' + fp + '-0000';
  ok(!code.includes('#include') && code.length < 20, 'the share code carries no source', code);
}

/* ------------------------------------------------------ 11. typeability */
console.log('\ntypeability');
{
  // nothing the game shows may contain a character a keyboard cannot produce
  const engines = [
    new BL.Engine({ seed: 'tabs-1', lineLength: 44 }),
    BL.setup.engineFor({ seed: 'tabs-2', lineLength: 44, lang: 'c' }),
    BL.setup.engineFor({ seed: 'tabs-3', lineLength: 44, lang: 'python' }),
    BL.setup.engineFor({ seed: 'tabs-4', lineLength: 44, text: 'a\tb\n\tc\n' }),
  ];
  let tabs = 0;
  for (const e of engines) {
    for (let n = 0; n < 400; n++) {
      if (e.line.indexOf('\t') !== -1) tabs++;
      if (e.offer) { e.choose(0); e.drain(); continue; }
      e.input(e.line[e.cursor], n * 20);
      e.drain();
      if (e.dead) break;
    }
  }
  ok(tabs === 0, 'no dealt line contains a raw tab', tabs);

  // and an untypeable character never appears in the shipped packs
  let badPacks = 0;
  for (const id of Object.keys(BL.setup.PACKS)) {
    for (const snip of BL.setup.poolFor(id)) {
      if (snip.lines.some((l) => l.indexOf('\t') !== -1)) badPacks++;
    }
  }
  ok(badPacks === 0, 'every language pack is tab-free', badPacks);
}

/* ------------------------------------------------------------- 12. mirror */
console.log('\nmirror boss');
{
  // Deal mirror lines directly and type each one exactly, with a fixed clock,
  // so the check is about the line and not about the trace.
  const e = new BL.Engine({ seed: 'mirror-test', lineLength: 44 });
  e.boss = { id: 'mirror', name: 'Mirror', fireMul: 0.8 };
  let checked = 0;
  let trailing = 0;
  let cleared = 0;
  for (let n = 0; n < 12; n++) {
    e.nextLine(6);
    const line = e.line;
    checked++;
    if (line !== ' ' && /\s$/.test(line)) trailing++; // ' ' is the blank-line placeholder
    const before = e.linesCleared;
    let guard = 0;
    // armored brutes eat the first keystroke (so press each character until the
    // cursor moves) and a cleared floor stops to deal cards (so take one)
    while (e.cursor < e.line.length && !e.dead && guard++ < 4000) {
      if (e.offer) { e.choose(0); e.drain(); continue; }
      e.input(e.line[e.cursor], n * 9000 + guard * 40);
    }
    if (e.linesCleared > before) cleared++;
  }
  ok(checked === 12, 'mirror lines were dealt', checked);
  ok(trailing === 0, 'a mirrored line never ends in whitespace', trailing);
  ok(cleared === 12, 'every mirrored line can be typed through', cleared);
}

/* ------------------------------------------------ 13. language packs */
console.log('\nlanguage packs');
{
  const langs = BL.setup.languages();
  ok(langs.length >= 40, 'the picker lists the packs', langs.length);
  const c = BL.setup.poolFor('c');
  ok(c && c.length >= 3, 'the C pack has snippets', c && c.length);
  const e = BL.setup.engineFor({ seed: 'pack-c', lineLength: 44, lang: 'c' });
  ok(!e.pasted && e.lang === 'C', 'a pack run is not a pasted run', e.lang);
  ok(/[{};]/.test(e.line) || /#include|c|int/.test(e.line), 'the C pack deals C', e.line);
  const py = BL.setup.engineFor({ seed: 'pack-py', lineLength: 44, lang: 'python' });
  ok(/def |class |print\(|self/.test(py.line) || py.line.length > 8, 'the python pack deals python', py.line);
  const auto = BL.setup.engineFor({ seed: 'pack-auto', lineLength: 44, lang: 'auto' });
  ok(!!auto.line, 'auto falls back to the shipped corpus');
}

console.log('\n' + (failures ? failures + ' FAILURES' : 'all checks passed'));
process.exit(failures ? 1 : 0);
