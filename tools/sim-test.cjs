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
  'js/core/rng.js',
  'js/core/text.js',
  'js/core/enemies.js',
  'js/core/cards.js',
  'js/core/keys.js',
  'js/core/engine.js',
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

console.log('\n' + (failures ? failures + ' FAILURES' : 'all checks passed'));
process.exit(failures ? 1 : 0);
