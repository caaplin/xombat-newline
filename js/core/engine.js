/*
 * engine.js — the simulation.
 *
 * Headless on purpose: it owns the run state, the trace, the enemies and the
 * scoring, and it never touches the DOM. The renderer reads `engine.state()`
 * and the UI calls `engine.input(ch, t)`. That split is what makes the rules
 * testable from node (see tools/sim-test.cjs).
 *
 * Coordinate system: the visible line is `line`, an array of characters. The
 * player types from the left; `cursor` is how far they got. `fire` is how far
 * the trace has burned. fire >= cursor and something eats you.
 */
(function (BL) {
  'use strict';

  const { DAMAGE, TIMING, zoneAt, dress, dressBoss, bossFor } = BL.ENEMY;

  const HP_MAX = 100;
  const CODE_FIRE_MUL = 0.62; // code is wider than words, so the trace is slower
  const MIN_FIRE_MUL = 0.7;
  const OFFBEAT_TOLERANCE = 0.6; // metronome boss: 60% off the median is "off beat"

  /** Line width per floor: the further down, the longer the line. */
  const WIDTHS = [16, 20, 25, 30, 36, 42, 48, 55, 63, 72];
  function lineWidth(floor) {
    if (floor <= WIDTHS.length) return WIDTHS[Math.max(1, floor) - 1];
    return Math.min(140, WIDTHS[WIDTHS.length - 1] + 7 * (floor - WIDTHS.length));
  }

  /** Trace speed in characters per second, before modifiers. */
  function traceSpeed(floor, wave, chaser) {
    const base = (lineWidth(floor) / 12) * (1 + 0.05 * (wave - 1));
    const lethal = chaser.mode === 'lethal' ? 0.9 : 1;
    return (base * lethal) / chaser.speed;
  }

  /** Damage scale: hurts more the deeper you are. */
  const HURT = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85];

  /** Streak multiplier: 1.0, 1.5, 2.0 ... capped at x5. */
  function combo(streak) {
    return Math.min(5, 1 + 0.5 * Math.floor(streak / 10));
  }
  function hitPoints(streak, mul) {
    return 10 * combo(streak) * (mul || 1);
  }

  /** A brute belongs to a run of adjacent brute characters; returns [start,end). */
  function bruteRun(kinds, i) {
    if (kinds[i] !== 'brute') return null;
    let a = i;
    let b = i + 1;
    while (a > 0 && kinds[a - 1] === 'brute') a--;
    while (b < kinds.length && kinds[b] === 'brute') b++;
    return [a, b];
  }

  class Engine {
    constructor(opts) {
      opts = opts || {};
      this.seed = opts.seed || String(Date.now());
      this.rng = BL.rng(this.seed);
      this.kindRng = BL.rng(this.seed + '|kinds');

      this.code = new BL.CodeSource(this.rng);
      this.keys = new BL.KeyScars();
      this.mods = BL.defaultMods();

      this.maxHp = HP_MAX;
      this.hp = HP_MAX;
      this.lineLength = opts.lineLength || 44;

      // progression
      this.floor = 1;
      this.wave = 1;
      this.lineInWave = 1;
      this.linesCleared = 0;
      this.boss = null;
      this.floorBoss = new Map();
      this.planned = 0;

      // per line
      this.line = '';
      this.kinds = [];
      this.states = [];
      this.scarred = [];
      this.armor = [];
      this.shieldUp = [];
      this.cursor = 0;
      this.fire = -6;
      this.lineClean = true;
      this.wordClean = true;

      // run stats
      this.raw = 0;
      this.streak = 0;
      this.maxStreak = 0;
      this.hits = 0;
      this.misses = 0;
      this.burns = 0;
      this.elapsed = 0;
      this.intervals = [];
      this.lastKeyAt = null;
      this.lastWasMiss = false;
      this.steady = 0;
      this.dead = false;
      this.endReason = null;
      this.deathCause = '';
      this.chewAcc = 0;
      this.frozenUntil = 0;
      this.rootLeft = 0;
      this.sniperT = 0;
      this.sniperAimed = false;
      this.bomb = null;
      this.rush = null;
      this.summonT = 0;
      this.bossT = 0;
      this.bossWound = false;
      this.bruteMissed = new Set();

      // cards
      this.cards = [];
      this.offer = null;

      this.events = [];
      this.queue = [];
      this.populate(this.lineLength);
      this.nextLine(6);
    }

    /* ------------------------------------------------------------------ *
     * derived state
     * ------------------------------------------------------------------ */

    get zoneInfo() {
      return zoneAt(this.floor);
    }
    get chaser() {
      return this.zoneInfo.chaser;
    }
    get frozen() {
      return this.dead || this.offer !== null;
    }
    get fireSpeed() {
      const mul = Math.max(MIN_FIRE_MUL, this.mods.fireMul);
      return (
        traceSpeed(this.floor, this.wave, this.chaser) *
        CODE_FIRE_MUL *
        mul *
        (this.boss ? this.boss.fireMul : 1)
      );
    }
    get bossHealth() {
      let total = 0;
      let left = 0;
      for (let i = 0; i < this.line.length; i++) {
        if (this.kinds[i] === 'boss') {
          total++;
          if (this.states[i] === 'todo') left++;
        }
      }
      if (!total) return null;
      const ratio = left / total;
      return { left, total, phase: ratio > 2 / 3 ? 1 : ratio > 1 / 3 ? 2 : 3 };
    }
    get sniperIndex() {
      for (let i = this.cursor + 1; i < this.line.length; i++) {
        if (this.kinds[i] === 'sniper' && this.states[i] === 'todo') return i;
      }
      return -1;
    }
    get summonerIndex() {
      for (let i = this.cursor + 1; i < this.line.length; i++) {
        if (this.kinds[i] === 'summoner' && this.states[i] === 'todo') return i;
      }
      return -1;
    }
    /** Fog of war and the amnesia boss hide characters ahead of the cursor. */
    hidden(i) {
      if (i <= this.cursor || this.states[i] !== 'todo') return false;
      if (this.mods.fog && i > this.cursor + this.mods.fog) return true;
      if (this.boss && this.boss.id === 'amnesia') {
        return this.elapsed - this.lineStartedAt > 1.2 + this.line.length * 0.05;
      }
      return false;
    }
    shownAt(i) {
      return i;
    }
    hasMinedChar(i) {
      return this.keys.isMined(this.line[i]);
    }

    /* ------------------------------------------------------------------ *
     * scoring
     * ------------------------------------------------------------------ */

    accuracy() {
      const n = this.hits + this.misses;
      return n === 0 ? 1 : this.hits / n;
    }
    wpm() {
      return this.elapsed <= 0 ? 0 : this.hits / 5 / (this.elapsed / 60000);
    }
    rhythm() {
      const iv = this.intervals.filter((t) => t > 0 && t < 2000);
      if (iv.length < 10) return 1;
      const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
      const variance = iv.reduce((a, t) => a + (t - mean) ** 2, 0) / iv.length;
      const cv = Math.sqrt(variance) / mean;
      return Math.max(0.8, Math.min(1.2, 1.2 - cv * 0.8));
    }
    /** Same shape as the original: accuracy^4 x rhythm, floored at what you earned. */
    score() {
      return Math.round(this.raw * Math.pow(this.accuracy(), 4) * this.rhythm());
    }

    /* ------------------------------------------------------------------ *
     * line flow
     * ------------------------------------------------------------------ */

    populate(width) {
      while (this.queue.length < 3) {
        const idx = this.planned++;
        const floor = Math.floor(idx / 9) + 1;
        const wave = Math.floor((idx % 9) / 3) + 1;
        const isBoss = wave === 3;
        let boss = null;
        if (isBoss) {
          if (!this.floorBoss.has(floor)) this.floorBoss.set(floor, bossFor(floor, this.rng));
          boss = this.floorBoss.get(floor);
        }
        const text = this.writeLine(boss);
        const info = zoneAt(floor);
        const slot = idx % 9;
        const elite = (info.roster.elite) && slot === 4;
        const kinds = isBoss
          ? dressBoss(text)
          : dress(text, this.kindRng, { roster: info.roster, elite });
        this.queue.push({ text, boss, kinds });
      }
    }

    writeLine(boss) {
      const width = Math.round(this.lineLength * (boss ? 0.9 : 1));
      let text = this.code.next(Math.max(10, width));
      if (boss && boss.id === 'mirror') text = mirrorText(text);
      return text;
    }

    nextLine(lead) {
      this.populate(this.lineLength);
      const next = this.queue.shift();
      this.line = next.text;
      this.kinds = next.kinds;
      this.bruteMissed.clear();
      this.armor = next.kinds.map((k) => TIMING.armor[k] || 0);
      this.shieldUp = this.armor.map((a) => a > 0);
      this.sniperT = 0;
      this.sniperAimed = false;
      this.rush = null;
      this.summonT = 0;
      this.bossT = 0;
      this.bossWound = false;
      this.rootLeft = 0;
      this.bomb = null;
      this.populate(this.lineLength);
      this.lineStartedAt = this.elapsed;
      this.states = Array.from(this.line, () => 'todo');
      this.scarred = Array.from(this.line, () => false);
      this.cursor = 0;
      this.fire = -Math.max(3, Math.min(this.mods.leadCarryMax, lead == null ? 6 : lead));
      this.lineClean = true;
      this.wordClean = true;
      this.armBomb();
      this.emit({ type: 'lineStart', boss: this.boss });
    }

    finishLine() {
      const lead = Math.max(0, Math.floor(this.cursor - this.fire));
      const bonus = lead * 5 * this.mods.scoreMul;
      this.raw += bonus;
      this.linesCleared++;
      if (this.lineClean) this.heal(5);
      this.emit({ type: 'lineClear', lead, bonus, clean: this.lineClean });

      this.lineInWave++;
      if (this.lineInWave > 3) {
        this.lineInWave = 1;
        this.wave++;
        if (this.wave > 3) {
          this.wave = 1;
          this.floor++;
          this.boss = null;
          this.emit({ type: 'floor', floor: this.floor });
          this.makeOffer();
        }
        this.emit({ type: 'wave', floor: this.floor, wave: this.wave });
        if (this.wave === 3) {
          this.boss = this.floorBoss.get(this.floor) || bossFor(this.floor, this.rng);
          this.emit({ type: 'boss', boss: this.boss });
        }
      }
      this.nextLine(Math.min(this.mods.leadCarryMax, Math.max(3, lead)));
    }

    armBomb() {
      this.rush = null;
      this.bomb = null;
      if (this.kinds[this.cursor] === 'berserker') {
        this.rush = { index: this.cursor, at: this.elapsed };
        this.emit({ type: 'charge', index: this.cursor });
      }
      if (this.kinds[this.cursor] === 'bomber') {
        this.bomb = { index: this.cursor, at: this.elapsed };
        this.emit({ type: 'armed', index: this.cursor });
      }
    }

    /* ------------------------------------------------------------------ *
     * the clock
     * ------------------------------------------------------------------ */

    tick(dt) {
      if (this.frozen) return;
      this.elapsed += dt;

      // bomber: fuse runs out and the character in front of you explodes
      if (this.bomb && this.elapsed - this.bomb.at >= TIMING.bombFuse) {
        const idx = this.bomb.index;
        this.bomb = null;
        this.kinds[idx] = 'grunt';
        this.streak = 0;
        this.lineClean = false;
        this.emit({ type: 'explode', index: idx, damage: DAMAGE.bomb });
        this.damage(DAMAGE.bomb, 'Blown up by a bomber');
        if (this.dead) return;
      }

      // berserker: charge up, then rip into you every 1.2s until you kill it
      if (this.rush && this.elapsed - this.rush.at >= TIMING.rushFuse) {
        this.rush.at = this.elapsed;
        this.streak = 0;
        this.lineClean = false;
        this.emit({ type: 'rush', index: this.rush.index, damage: DAMAGE.rush });
        this.damage(DAMAGE.rush, 'Torn apart by a berserker');
        if (this.dead) return;
      }

      // summoner: armours a grunt ahead of you
      const summoner = this.summonerIndex;
      if (summoner >= 0) {
        this.summonT += dt;
        if (this.summonT >= TIMING.summonerTick) {
          this.summonT = 0;
          const targets = [];
          for (let i = this.cursor + 1; i < summoner; i++) {
            if (
              this.states[i] === 'todo' &&
              this.kinds[i] === 'grunt' &&
              this.armor[i] === 0 &&
              /[\p{L}\p{N}]/u.test(this.line[i])
            ) {
              targets.push(i);
            }
          }
          if (targets.length) {
            const t = BL.pick(this.kindRng, targets);
            this.kinds[t] = 'shield';
            this.armor[t] = 1;
            this.shieldUp[t] = true;
            this.emit({ type: 'summon', index: summoner, target: t });
          }
        }
      }

      // zone boss: a wind-up, then a hit that lands on a fixed cycle
      const boss = this.bossHealth;
      if (boss && boss.left > 0) {
        this.bossT += dt;
        const cycle = TIMING.bossCycle * (boss.phase === 1 ? 1 : boss.phase === 2 ? 0.8 : 0.6);
        if (!this.bossWound && this.bossT >= cycle - TIMING.bossWarn) {
          this.bossWound = true;
          this.emit({ type: 'bossWind', phase: boss.phase });
        }
        if (this.bossT >= cycle) {
          this.bossT = 0;
          this.bossWound = false;
          const dmg = 4 + Math.min(this.floor - 1, 4) + (boss.phase - 1) * 2;
          this.streak = 0;
          this.emit({ type: 'bossHit', damage: dmg, phase: boss.phase });
          this.damage(dmg, 'Crushed by the zone boss');
          if (this.dead) return;
        }
      }

      // sniper: aims for 3.2s, then fires
      const sniper = this.sniperIndex;
      if (sniper >= 0) {
        this.sniperT += dt;
        if (!this.sniperAimed && this.sniperT >= TIMING.sniperAim - 0.9) {
          this.sniperAimed = true;
          this.emit({ type: 'aim', index: sniper });
        }
        if (this.sniperT >= TIMING.sniperAim) {
          this.sniperT = 0;
          this.sniperAimed = false;
          this.emit({ type: 'snipe', index: sniper, damage: DAMAGE.snipe });
          this.damage(DAMAGE.snipe, 'Sniped');
          if (this.dead) return;
        }
      }

      // the trace
      const chaser = this.chaser;
      if (chaser.mode === 'chew') {
        // the swarm doesn't one-shot you, it grinds: stay close and you bleed
        if (this.cursor - this.fire < 1.5) {
          this.fire = Math.min(this.fire, this.cursor - 0.6);
          this.chewAcc += (chaser.dps || 0) * dt;
          if (this.chewAcc >= 1) {
            const n = Math.floor(this.chewAcc);
            this.chewAcc -= n;
            this.streak = 0;
            this.lineClean = false;
            this.emit({ type: 'chew', damage: n });
            this.damage(n, chaser.caught);
          }
        }
        return;
      }

      this.fire += this.fireSpeed * dt;
      if (this.fire >= this.cursor) {
        this.burns++;
        this.streak = 0;
        this.lineClean = false;
        if (chaser.mode === 'lethal') {
          this.emit({ type: 'burn', damage: this.hp, chaser: chaser.id, lethal: true });
          this.damage(this.hp, chaser.caught, true);
          return;
        }
        this.fire = this.cursor - (chaser.knockback || 6);
        this.emit({ type: 'burn', damage: chaser.damage, chaser: chaser.id, lethal: false });
        this.damage(chaser.damage, chaser.caught);
        if (this.dead) return;
        if (chaser.mode === 'freeze') {
          this.frozenUntil = this.elapsed + (chaser.freeze || 1);
          this.emit({ type: 'frozen', seconds: chaser.freeze || 1 });
        }
        if (chaser.mode === 'root') {
          this.rootLeft = chaser.root || 3;
          this.emit({ type: 'rooted', keys: this.rootLeft });
        }
      }
    }

    /* ------------------------------------------------------------------ *
     * typing
     * ------------------------------------------------------------------ */

    /** One keystroke. `t` is a high-resolution timestamp (ms). */
    input(ch, t) {
      if (this.frozen) return;
      if (typeof ch !== 'string' || ch.length !== 1) return;
      if (this.cursor >= this.line.length) return;
      if (this.elapsed < this.frozenUntil) return;

      if (this.lastKeyAt !== null) this.intervals.push(t - this.lastKeyAt);
      this.lastKeyAt = t;

      // metronome boss: a key landing off the beat hurts
      if (this.boss && this.boss.id === 'metronome' && !this.lastWasMiss && this.offBeat()) {
        this.emit({ type: 'offbeat', damage: 2 });
        this.damage(2, 'Lost the beat');
        if (this.dead) return;
      }

      const i = this.cursor;
      const want = this.line[i];
      const mined = this.keys.isMined(want);

      // rooted by the vines: the next keys pay off the root instead
      if (ch === want && this.rootLeft > 0) {
        this.rootLeft--;
        this.lastWasMiss = false;
        if (this.rootLeft === 0) this.emit({ type: 'unrooted' });
        return;
      }

      // armoured characters need two (or three) hits
      if (ch === want && this.armor[i] > 0) {
        this.armor[i]--;
        this.shieldUp[i] = this.armor[i] > 0;
        const pts = hitPoints(this.streak) * this.mods.scoreMul;
        this.hits++;
        this.streak++;
        this.maxStreak = Math.max(this.maxStreak, this.streak);
        this.raw += pts;
        this.lastWasMiss = false;
        if (this.kinds[i] === 'shield') this.emit({ type: 'shield', index: i });
        this.emit({ type: 'armor', index: i, left: this.armor[i] });
        return;
      }

      if (ch === want) {
        const pts = hitPoints(this.streak, mined ? this.mods.minePointsMul : 1) * this.mods.scoreMul;
        this.states[i] = 'hit';
        this.hits++;
        this.streak++;
        this.maxStreak = Math.max(this.maxStreak, this.streak);
        this.raw += pts;
        this.emit({ type: 'hit', index: i, mined, points: pts });
        this.onSpecialHit(i);

        const scar = this.keys.onHit(want);
        if (scar) this.emitScar(scar);
        if (this.mods.heartbeat && this.isSteady(0.25, false)) {
          this.steady++;
          if (this.steady >= 12) {
            this.steady = 0;
            this.heal(2);
          }
        }
      } else {
        // wrong key: brutes and splitlings punish harder, glass cannon kills
        const run = bruteRun(this.kinds, i);
        if (run) this.bruteMissed.add(run[0]);
        const kindMul = run ? DAMAGE.bruteMiss : this.kinds[i] === 'splitling' ? DAMAGE.splitMiss : 1;
        const dmg = this.mods.glass
          ? this.hp
          : this.scaleHurt(
              Math.round((mined ? this.mods.mineDmg : DAMAGE.miss) * this.mods.missDmgMul * kindMul)
            );
        const first = !this.scarred[i];

        this.scarred[i] = true;
        this.misses++;
        this.streak = 0;
        this.wordClean = false;
        this.lineClean = false;
        this.lastWasMiss = true;
        this.emit({ type: 'miss', index: i, expected: want, got: ch, mined, damage: dmg });

        if (first) {
          const scar = this.keys.onMiss(want);
          if (scar) this.emitScar(scar);
        }
        this.damage(dmg, this.mods.glass ? 'Glass cannon: one miss' : 'Beaten down by the enemies', true);
        return;
      }

      // correct, undamaged key: advance
      this.lastWasMiss = false;
      this.cursor++;
      this.armBomb();
      if (want === ' ' || want === '\t' || want === '\n' || this.cursor === this.line.length) {
        if (this.wordClean) this.heal(this.mods.wordHeal);
        this.wordClean = true;
      }
      if (this.cursor === this.line.length) this.finishLine();
    }

    emitScar(evt) {
      this.emit(evt);
      for (let i = this.cursor; i < this.line.length; i++) {
        if (evt.type === 'repair' || evt.type === 'crack' || evt.type === 'break') break;
      }
    }

    /* ------------------------------------------------------------------ *
     * enemy payouts
     * ------------------------------------------------------------------ */

    onSpecialHit(i) {
      const pts = combo(this.streak) * this.mods.scoreMul;
      switch (this.kinds[i]) {
        case 'medic':
          this.emit({ type: 'medic', amount: 4 });
          this.heal(4);
          break;
        case 'cache': {
          const bonus = 60 * pts;
          this.raw += bonus;
          this.emit({ type: 'cache', points: bonus, index: i });
          break;
        }
        case 'bomber':
          if (this.bomb && this.bomb.index === i) {
            const bonus = hitPoints(this.streak) * this.mods.scoreMul;
            this.raw += bonus;
            this.emit({ type: 'defuse', index: i, points: bonus });
          }
          this.bomb = null;
          break;
        case 'splitter': {
          const spawned = [];
          for (let n = i + 1; n < this.line.length && spawned.length < 2; n++) {
            if (this.kinds[n] === 'grunt' && /[\p{L}\p{N}]/u.test(this.line[n])) {
              this.kinds[n] = 'splitling';
              spawned.push(n);
            }
          }
          this.emit({ type: 'split', index: i, spawned });
          break;
        }
        case 'berserker':
          this.rush = null;
          break;
        case 'boss': {
          const bar = this.bossHealth;
          const next =
            (bar.left + 1) / bar.total > 2 / 3 ? 1 : (bar.left + 1) / bar.total > 1 / 3 ? 2 : 3;
          if (bar.left === 0) {
            const bonus = 30 * bar.total * pts;
            this.raw += bonus;
            this.emit({ type: 'bossDown', bonus, heal: 15 });
            this.heal(15);
          } else if (bar.phase !== next) {
            this.emit({ type: 'bossPhase', phase: next });
          }
          break;
        }
        case 'splitling': {
          const bonus = 20 * pts;
          this.raw += bonus;
          this.emit({ type: 'splitling', index: i, points: bonus });
          break;
        }
        case 'brute': {
          const run = bruteRun(this.kinds, i);
          const last = run && i === run[1] - 1;
          const intractable = !run || this.bruteMissed.has(run[0]);
          const bonus = last && !intractable ? 25 * (run[1] - run[0]) * pts : 0;
          this.raw += bonus;
          this.emit({ type: 'brute', index: i, dead: last, bonus });
          break;
        }
        default:
          break;
      }
    }

    /* ------------------------------------------------------------------ *
     * cards & damage
     * ------------------------------------------------------------------ */

    makeOffer() {
      const owned = new Set(this.cards.map((c) => c.id));
      const pool = BL.CARDS.filter((c) => c.stacks || !owned.has(c.id));
      const offer = [];
      while (offer.length < 3 && pool.length) {
        offer.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
      }
      this.offer = offer;
      this.emit({ type: 'offer', cards: offer });
    }

    /** Give a specific card without an offer (used by tests and the debug hook). */
    grant(id) {
      const card = BL.CARDS.find((c) => c.id === id);
      if (!card) return;
      this.offer = [card];
      this.choose(0);
    }

    choose(i) {
      const card = this.offer && this.offer[i];
      if (!card) return;
      this.offer = null;
      this.cards.push(card);
      card.apply(this.mods, this);
      this.emit({ type: 'card', card });
    }

    scaleHurt(amount) {
      if (amount <= 0) return amount;
      const mul = this.floor <= HURT.length ? HURT[this.floor - 1] : 1;
      return Math.max(1, Math.round(amount * mul));
    }

    damage(amount, cause, raw) {
      const dmg = raw ? amount : this.scaleHurt(amount);
      this.hp = Math.max(0, this.hp - dmg);
      this.emit({ type: 'damage', amount: dmg });
      if (this.hp === 0 && !this.dead) {
        this.dead = true;
        this.endReason = 'death';
        this.deathCause = cause || 'Worn down';
        this.emit({ type: 'death', cause: this.deathCause });
      }
    }

    heal(amount) {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + amount);
      if (this.hp > before) this.emit({ type: 'heal', amount: this.hp - before });
    }

    quit() {
      this.offer = null;
      if (!this.dead) {
        this.dead = true;
        this.endReason = 'quit';
        this.deathCause = 'You pulled the plug.';
        this.emit({ type: 'end', reason: 'quit' });
      }
    }

    /* ------------------------------------------------------------------ *
     * rhythm helpers
     * ------------------------------------------------------------------ */

    isSteady(tolerance, fallback) {
      const n = this.intervals.length;
      const slice = this.intervals.slice(Math.max(0, n - 9), n - 1).filter((t) => t < 2000);
      if (slice.length < 4) return fallback;
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      return Math.abs(this.intervals[n - 1] - mean) <= mean * tolerance;
    }

    offBeat() {
      if (this.cursor === 0) return false;
      const prev = this.line[this.cursor - 1];
      if (prev === ' ' || prev === '\t') return false;
      const n = this.intervals.length;
      const slice = this.intervals.slice(Math.max(0, n - 9), n - 1).filter((t) => t < 2000);
      if (slice.length < 4) return false;
      const median = [...slice].sort((a, b) => a - b)[Math.floor(slice.length / 2)];
      return Math.abs(this.intervals[n - 1] - median) > median * OFFBEAT_TOLERANCE;
    }

    /* ------------------------------------------------------------------ *
     * plumbing
     * ------------------------------------------------------------------ */

    emit(evt) {
      this.events.push(evt);
    }
    drain() {
      const out = this.events;
      this.events = [];
      return out;
    }

    /** Everything the renderer needs for one frame. */
    snapshot() {
      const boss = this.bossHealth;
      return {
        t: this.elapsed,
        text: this.line,
        cursor: this.cursor,
        fire: this.fire,
        hp: this.hp,
        floor: this.floor,
        wave: this.wave,
        zone: this.zoneInfo,
        streak: this.streak,
        combo: combo(this.streak),
        score: this.raw,
        lines: this.linesCleared,
        dead: this.dead,
        endReason: this.endReason,
        cause: this.deathCause,
        boss: this.boss,
        bossHealth: boss,
        bomb: this.bomb,
        rush: this.rush,
        sniper: this.sniperIndex,
        sniperAim: Math.min(1, this.sniperT / TIMING.sniperAim),
        frozenUntil: this.frozenUntil,
        rootLeft: this.rootLeft,
        chewAcc: this.chewAcc,
        armor: this.armor,
        shields: this.shieldUp,
        states: this.states,
        scarred: this.scarred,
        mined: this.line.split('').map((c) => this.keys.isMined(c)),
        kinds: this.kinds,
        offer: this.offer,
        heat: clamp01(1 - (this.cursor - this.fire - 1) / 10),
      };
    }
  }

  function mirrorText(text) {
    return text
      .split(' ')
      .map((w) => w.split('').reverse().join(''))
      .join(' ');
  }
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  BL.Engine = Engine;
  BL.lineWidth = lineWidth;
  BL.combo = combo;
})(window.BL = window.BL || {});
