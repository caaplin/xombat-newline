/*
 * stage.js — the fighters.
 *
 * Burnline is a brawler wearing a typing game: the runner throws a punch for
 * every character of the line, and each character is a creature standing on the
 * wire. The original drew all of that from ASCII pixel matrices baked into the
 * bundle (no PNGs at all), so `js/data/sprites.js` carries those matrices
 * verbatim and this file is the renderer that was missing.
 *
 * Everything is painted into one absolutely-positioned canvas stacked under the
 * terminal, in the same coordinate space as the text: a cell's centre is
 * measured from the real DOM spans, so a creature stands on the exact glyph it
 * belongs to and the hero walks along the characters as they are typed.
 *
 * Rendering is integer-scaled software sprite blitting, like the original:
 * each unique (matrix, palette, scale) is baked into an offscreen canvas once,
 * then drawImage'd per frame.
 */
(function (BL) {
  'use strict';

  const DATA = BL.SPRITE_DATA;
  if (!DATA) return;

  // which creature appears for which kind of character, per zone
  const ROLE = {
    grunt: ['0', '1', '2'],
    brute: ['*'],
    shield: ['1'],
    juggernaut: ['*'],
    sniper: ['^'],
    bomber: ['2'],
    medic: ['1'],
    splitter: ['1'],
    splitling: ['1'],
    chaser: ['2'],
    armored: ['*'],
    cache: ['1'],
  };

  const HERO_ORDER = ['operator', 'ronin', 'titan', 'glitch'];
  const BLANK = '.';

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** A magenta pulse behind the boss so it reads as the thing to be afraid of. */
  function ctxglow(ctx, x, y, w, h) {
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(255,46,136,0.22)');
    g.addColorStop(1, 'rgba(255,46,136,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w * 0.5, y - h * 0.5, w * 2, h * 2);
  }

  class Stage {
    constructor(canvas, host) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.host = host; // the positioned element the canvas covers
      this.cache = new Map();
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.time = 0;
      this.px = 2;
      this.dpr = 1;
      this.actors = []; // { el, x, y, w, kind, slot }
      this.hero = { x: 0, y: 0, pose: 'idle', facing: 1, alpha: 1, hurt: 0, down: false };
      this.zones = DATA.zones;
      this.resize();
    }

    /* ---------------------------------------------------------------- data */

    /** Every foe that belongs to a zone, biggest/boss ones last. */
    foesFor(zone) {
      if (!this._foes || this._zone !== zone) {
        this._zone = zone;
        this._foes = DATA.foes.filter((f) => f.zone === zone);
      }
      return this._foes;
    }

    /**
     * Pick the creature for one character. Deterministic in (zone, index, char)
     * and the kind drives it, so a brute always looks like a brute.
     */
    foe(zone, kind, index, ch) {
      const list = this.foesFor(zone);
      if (!list.length) return null;
      const roles = ROLE[kind] || ROLE.grunt;
      // '^' = flyer, '*' = big/armoured, '0..2' = ordinary mooks
      let pool = [];
      for (const r of roles) {
        if (r === '^') pool = pool.concat(list.filter((f) => f.fly));
        else if (r === '*') pool = pool.concat(list.filter((f) => f.big));
        else pool = pool.concat(list.filter((f) => !f.fly && !f.big));
      }
      if (!pool.length) pool = list;
      const h = hashStr(zone + '|' + index + '|' + ch + '|' + kind);
      return pool[h % pool.length];
    }

    heroFighter(code) {
      const h = hashStr(String(code || 'xombat'));
      const id = HERO_ORDER[h % HERO_ORDER.length];
      return DATA.heroes.find((x) => x.id === id) || DATA.heroes[0];
    }

    /* ------------------------------------------------------------- sprites */

    /** Bake a matrix into a canvas. One per (matrix, palette, scale). */
    bake(rows, pal, scale, rim, flip) {
      const w = rows[0].length;
      const h = rows.length;
      const key = (rim ? 'r' : '') + (flip ? 'f' : '') + scale + '|' + w + 'x' + h + '|' + hashStr(rows.join('/') + JSON.stringify(pal));
      let cv = this.cache.get(key);
      if (cv) return cv;

      cv = document.createElement('canvas');
      cv.width = (w + 2) * scale;
      cv.height = (h + 2) * scale;
      const c = cv.getContext('2d');
      if (flip) {
        c.translate(cv.width, 0);
        c.scale(-1, 1);
      }
      // rim: a 1px halo behind the sprite, the way the original outlined its
      // characters so they read against the city
      if (rim) {
        c.fillStyle = rim;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (rows[y][x] === BLANK) continue;
            c.fillRect((x + 1) * scale - scale, (y + 1) * scale, scale * 3, scale * 3);
          }
        }
      }
      for (let y = 0; y < h; y++) {
        const row = rows[y];
        for (let x = 0; x < w; x++) {
          const ch = row[x];
          if (ch === BLANK) continue;
          const col = pal[ch];
          if (!col) continue;
          c.fillStyle = col;
          c.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
        }
      }
      this.cache.set(key, cv);
      return cv;
    }

    /** Hurt/burn variant: every pixel replaced with reds, like the original. */
    hotPal(pal, scar) {
      const out = {};
      for (const k of Object.keys(pal)) out[k] = k === 'W' ? '#ffffff' : scar;
      return out;
    }

    /* --------------------------------------------------------------- layout */

    resize() {
      const host = this.host;
      if (!host) return;
      const box = host.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      this.w = Math.max(1, Math.round(box.width));
      this.h = Math.max(1, Math.round(box.height));
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.origin = { x: box.left, y: box.top };
      // 2px per sprite pixel on phones, 3 on mid, 4 on a wide stage
      this.px = this.w < 560 ? 2 : this.w < 1000 ? 3 : 4;
      // tallest matrix in the set is 20 rows: give the strip that much room
      this.strip = this.px * 22 + 10;
      document.documentElement.style.setProperty('--stage-h', this.strip + 'px');
    }

    /* ---------------------------------------------------------------- frame */

    /**
     * @param {object} snap     engine snapshot
     * @param {object} info     { spans, lineEl, zoneId, slot, code, typed }
     */
    frame(dt, snap, info) {
      if (!this.w) return;
      this.time += dt;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      if (!snap || !info || !info.spans || !info.spans.length) {
        // keep the canvas aligned even when there is nothing to draw
        this.resizeIfStale();
        return;
      }
      this.resizeIfStale();

      const box = this.host.getBoundingClientRect();
      const dx = this.origin ? box.left - this.origin.x : 0;
      const dy = this.origin ? box.top - this.origin.y : 0;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        this.origin = { x: box.left, y: box.top };
        if (this.origin.x || this.origin.y) this.resize();
      }

      const zoneId = (snap.zone && snap.zone.zone && snap.zone.zone.id) || 'slums';
      const slot = info.slot || 12;
      const reduced = this.reduced;

      // The strip the fighters stand on: just above the code line, so they never
      // sit on top of the text the player is reading.
      // The wire follows the row being typed, so the fight happens where the
      // cursor is rather than always on the first physical row.
      let floorY = this.h * 0.5;
      if (info.lineEl) {
        const lr = info.lineEl.getBoundingClientRect();
        floorY = lr.top - box.top - 2;
      }
      this.wireY = floorY;
      const spans = info.spans;
      // the line element holds the whole queued chunk; only the first physical
      // row is on the wire, the rest is the look-ahead text below it
      let rowTop = null;
      const cursorSp = spans[Math.max(0, Math.min(spans.length - 1, snap.cursor))];
      if (cursorSp && !cursorSp.dataset.brk) {
        const cr = cursorSp.getBoundingClientRect();
        if (cr.width > 1) rowTop = cr.top;
      }
      if (rowTop === null) {
        for (const sp of spans) {
          if (!sp || sp.dataset.brk) continue;
          const r = sp.getBoundingClientRect();
          if (r.width > 1) { rowTop = r.top; break; }
        }
      }
      if (rowTop !== null) floorY = rowTop - box.top - 2;

      // ---- where the fighter is standing ----------------------------------
      const heroCx = this.heroAnchor(snap, spans, box);
      const heroReach = this.px * 11; // half a fighter, roughly

      // a near-black band behind the rank keeps the previous row legible when
      // the fight moves down to a later line
      if (this.strip) {
        const g = ctx.createLinearGradient(0, floorY - this.strip, 0, floorY);
        g.addColorStop(0, 'rgba(2,6,4,0)');
        g.addColorStop(0.35, 'rgba(2,6,4,0.72)');
        g.addColorStop(1, 'rgba(2,6,4,0.86)');
        ctx.fillStyle = g;
        ctx.fillRect(0, floorY - this.strip, this.w, this.strip);
      }

      // ---- collect the cells that are still standing -----------------------
      // a cell is ~18px wide but a sprite is ~50px, so one creature stands every
      // few cells rather than all of them overlapping into a smear
      let cellW = 0;
      for (const sp of spans) {
        if (!sp || sp.dataset.brk) continue;
        const r = sp.getBoundingClientRect();
        if (r.width > 1) { cellW = r.width; break; }
      }
      const spriteW = this.px * 15;
      this.step = Math.max(1, Math.round(spriteW / Math.max(1, cellW * 1.05)));
      this.cellW = cellW;
      this.lastGap = -1e9;

      for (let i = 0; i < spans.length; i++) {
        const sp = spans[i];
        if (!sp || sp.dataset.brk) continue;
        const kind = snap.kinds[i];
        if (!kind) continue;
        const state = snap.states[i];
        if (state === 'hit') {
          // it just died: remember where, so a puff can be drawn for a moment
          if (this.prev && this.prev[i] !== 'hit') {
            const rr = sp.getBoundingClientRect();
            this.puffs = this.puffs || [];
            this.puffs.push({ x: rr.left - box.left + rr.width / 2, y: floorY - this.px * 4, t: 0 });
            if (this.puffs.length > 40) this.puffs.shift();
          }
          continue;
        }
        const r = sp.getBoundingClientRect();
        if (r.width < 1) continue;
        if (rowTop !== null && Math.abs(r.top - rowTop) > 6) continue; // wrapped row
        // the hero's cell always gets a creature; the rest are spaced along the
        // wire so they never overlap, and gaps in the text are skipped
        const cx = r.left - box.left + r.width / 2;
        if (i !== snap.cursor) {
          if (snap.text[i] === ' ') continue; // nothing to stand on
          if (cx - this.lastGap < spriteW * 0.8) continue;
        }
        // never draw a creature through the fighter
        if (heroCx !== null && Math.abs(cx - heroCx) < heroReach + spriteW * 0.25) continue;
        this.lastGap = cx;
        const baseline = floorY; // they stand on a wire above the code, not in it
        const ch = snap.text[i];
        const foe = this.foe(zoneId, kind, i, ch);
        if (!foe) continue;
        const want = foe.big ? this.px + 1 : this.px;
        const scale = Math.max(1, Math.min(want, Math.floor((this.strip - 8) / (foe.rows.length + 2))));
        const hurt = state === 'wounded' || (snap.states[i] === 'armored' && false);
        const isCursor = i === snap.cursor;
        const bob = reduced ? 0 : Math.round(Math.sin(this.time * 4 + i * 0.7) * this.px);
        const fly = foe.fly ? this.px * 7 + (reduced ? 0 : Math.round(Math.sin(this.time * 4 + i) * 2) * this.px) : 0;
        const pal = hurt ? this.hotPal(foe.pal, '#ff2e88') : foe.pal;
        const img = this.bake(foe.rows, pal, scale, hurt ? null : '#0b1a12', false);

        // the cursor's own creature leans in, the way the original telegraphed it
        const lunge = isCursor && !reduced ? Math.round(Math.sin(this.time * 10) * this.px) : 0;
        const x = Math.round(cx - img.width / 2 + lunge);
        const y = Math.round(baseline - img.height - bob - fly);
        // a soft shadow so they read as standing on the wire
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + img.width * 0.2, Math.round(baseline) - 2, img.width * 0.6, 3);
        ctx.globalAlpha = 1;
        ctx.drawImage(img, x, y);
        // shields get a plate of ICE in front of them
        if (snap.shields && snap.shields[i] && snap.states[i] !== 'hit') {
          ctx.globalAlpha = 0.55 + (reduced ? 0 : 0.15 * Math.sin(this.time * 6));
          ctx.fillStyle = '#7fe6ff';
          ctx.fillRect(x - 1, y + img.height * 0.28, img.width + 2, 3);
        }
        ctx.globalAlpha = 1;
      }

      // ---- puffs where creatures just died --------------------------------
      if (this.puffs && this.puffs.length) {
        const keep = [];
        for (const pf of this.puffs) {
          pf.t += dt || 0.016;
          const life = 0.28;
          if (pf.t > life) continue;
          const k = 1 - pf.t / life;
          ctx.globalAlpha = k * 0.9;
          ctx.fillStyle = '#ff2e88';
          const r = (1 - k) * this.px * 7 + this.px;
          for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * Math.PI * 2;
            ctx.fillRect(Math.round(pf.x + Math.cos(ang) * r), Math.round(pf.y + Math.sin(ang) * r), this.px, this.px);
          }
          ctx.globalAlpha = 1;
          keep.push(pf);
        }
        this.puffs = keep;
      }

      // ---- the boss, standing at the far end ------------------------------
      if (snap.boss) {
        const bigs = DATA.foes.filter((f) => f.zone === zoneId && f.big);
        const pick = bigs[hashStr(zoneId + '|boss|' + snap.boss.id) % Math.max(1, bigs.length)];
        if (pick) {
          const img = this.bake(pick.rows, pick.pal, this.px, '#3a0a18', true);
          const bx = Math.round(this.w - img.width - 6);
          const by = Math.round(floorY - img.height - (reduced ? 0 : Math.sin(this.time * 2) * 2));
          ctxglow(ctx, bx, by, img.width, img.height);
          ctx.drawImage(img, bx, by);
        }
      }

      // ---- the wire they are standing on ----------------------------------
      if (this.wireY !== undefined) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#1b4a31';
        ctx.fillRect(0, Math.round(this.wireY), this.w, 1);
        ctx.globalAlpha = 1;
      }

      this.prev = snap.states.slice(); // engine hands back the live array

      // ---- the hero -------------------------------------------------------
      this.drawHero(snap, info, box, slot, dx, dy);
    }

    /** Wipe the fighters (gate, pause, result). */
    clear() {
      if (!this.w) return;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.clearRect(0, 0, this.w, this.h);
    }

    resizeIfStale() {
      const box = this.host.getBoundingClientRect();
      if (Math.abs(box.width - (this.w / this.dpr)) > 2 || Math.abs(box.height - (this.h / this.dpr)) > 2) {
        this.resize();
      }
    }

    /** The x the fighter stands at: the cell being typed, left of the wire. */
    heroAnchor(snap, spans, box) {
      const cursor = Math.max(0, Math.min(spans.length - 1, snap.cursor));
      for (let i = cursor; i < spans.length; i++) {
        const sp = spans[i];
        if (sp && !sp.dataset.brk && sp.getBoundingClientRect().width > 1) {
          const r = sp.getBoundingClientRect();
          return r.left - box.left + r.width / 2;
        }
      }
      return null;
    }

    drawHero(snap, info, box, slot, dx, dy) {
      const spans = info.spans;
      const fighter = info.fighter || this.heroFighter(info.code);
      const cx = this.heroAnchor(snap, spans, box);
      if (cx === null) return;
      const r = spans[Math.max(0, Math.min(spans.length - 1, snap.cursor))].getBoundingClientRect();
      const lr = info.lineEl ? info.lineEl.getBoundingClientRect() : null;
      const baseline = lr ? lr.top - box.top - 2 : r.bottom - box.top;

      // pose: hurt if it just got hit, punch on every keystroke, otherwise idle
      const hitting = snap.hp < this.lastHp;
      this.lastHp = snap.hp;
      const sinceKey = snap.t - (info.lastKeyAt || 0);
      let pose = 'idle';
      if (snap.dead) pose = 'hurt';
      else if (hitting) pose = 'hurt';
      else if (sinceKey < 0.16) pose = info.lastKeyAlt ? 'cross' : 'jab';
      else if (sinceKey < 0.32) pose = 'guard';
      // fighters call their punches different things, so fall through the
      // roster's own vocabulary before giving up on the pose
      const ATTACK = { jab: ['jab', 'iai', 'haymaker', 'zap', 'thrust', 'palm'],
                       cross: ['cross', 'crosscut', 'uppercut', 'whip', 'slam', 'spike'] };
      const want = ATTACK[pose] ? ATTACK[pose] : [pose];
      let sheet = null;
      for (const p of want) { if (fighter.poses[p]) { sheet = fighter.poses[p]; break; } }
      if (!sheet) sheet = fighter.poses.idle || Object.values(fighter.poses)[0];
      if (!sheet) return;

      const wantScale = this.px + 1; // the fighter is a head taller than a mook
      const scale = Math.max(1, Math.min(wantScale, Math.floor((this.strip - 8) / (sheet.length + 2))));
      const dead = snap.dead;
      const pal = dead ? this.hotPal(fighter.pal, '#ff2e88') : fighter.pal;
      const img = this.bake(sheet, pal, scale, dead ? null : fighter.rim, false);
      // stand just left of the glyph being typed, so the code stays readable
      const cellW = info.cellW || this.cellW || 14;
      // keep the fighter inside the canvas even when the cursor is at column 0
      const x = Math.max(2, Math.min(this.w - img.width - 2, Math.round(cx - cellW / 2 - img.width + scale * 3)));
      const y = Math.round(baseline - img.height + scale);
      this.ctx.globalAlpha = 0.35;
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(x + img.width * 0.2, Math.round(baseline) - 2, img.width * 0.6, 3);
      this.ctx.globalAlpha = 1;
      this.ctx.drawImage(img, x, y);
      this.lastPose = pose;
      this.lastFighter = fighter.id;
    }
  }

  BL.Stage = Stage;
})(window.BL = window.BL || {});
