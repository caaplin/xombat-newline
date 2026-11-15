/*
 * world.js — the pixel-art city behind the terminal.
 *
 * A tiny software renderer: a gradient sky, a two-layer skyline, rain, a
 * scrolling ground grid, and a wall of "brew" (the rising trace) on the left
 * that climbs as the fire gets closer. Everything is drawn in chunky pixels so
 * it reads like the original's canvas art, and it costs almost nothing.
 */
(function (BL) {
  'use strict';

  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  class World {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.palette = BL.ENEMY.ZONES[0].palette;
      this.seed = 1;
      this.time = 0;
      this.heat = 0;
      this.brew = 0;
      this.dead = false;
      this.rain = [];
      this.buildings = null;
      this.dpr = 1;
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    setZone(zoneId, seed) {
      const z = BL.ENEMY.ZONES.find((x) => x.id === zoneId);
      if (!z) return;
      if (this.palette !== z.palette) {
        this.palette = z.palette;
        this.buildings = null;
      }
      if (this.seed !== seed) {
        this.seed = seed;
        this.buildings = null;
      }
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.w = w;
      this.h = h;
      this.buildings = null;
      this.makeRain();
    }

    makeRain() {
      const rng = BL.rng(this.seed + '|rain');
      this.rain = Array.from({ length: 90 }, () => ({
        x: rng() * this.w,
        y: rng() * this.h,
        len: 6 + rng() * 16,
        sp: 180 + rng() * 260,
      }));
    }

    layout() {
      // two deterministic skyline layers, rebuilt on resize/zone change
      const rng = BL.rng(this.seed + '|city');
      const mk = (count, minH, maxH, width) => {
        const out = [];
        let x = -40;
        for (let i = 0; i < count; i++) {
          const bw = width * (0.6 + rng() * 0.9);
          const bh = minH + rng() * (maxH - minH);
          out.push({ x, w: bw, h: bh, flag: rng(), win: rng() });
          x += bw + 4 + rng() * 14;
        }
        return out;
      };
      const count = Math.ceil(this.w / 70) + 2;
      this.buildings = {
        far: mk(count + 4, 40, Math.max(90, this.h * 0.3), 60),
        near: mk(count, 60, Math.max(140, this.h * 0.45), 80),
      };
    }

    update(dt, heat, brew) {
      this.time += dt;
      this.heat = heat;
      this.brew = brew;
      for (const r of this.rain) {
        r.y += r.sp * dt;
        r.x -= r.sp * 0.18 * dt;
        if (r.y > this.h) {
          r.y = -r.len;
          r.x = Math.random() * this.w;
        }
        if (r.x < -10) r.x = this.w + 10;
      }
    }

    draw() {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      if (!this.buildings) this.layout();
      const p = this.palette;
      const groundY = h * 0.72;

      // sky
      const grad = ctx.createLinearGradient(0, 0, 0, groundY);
      p.sky.forEach((c, i) => grad.addColorStop(i / (p.sky.length - 1), c));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, groundY);

      // a sun/moon disc with dithering
      const cx = w * 0.82;
      const cy = groundY * 0.26;
      const cr = Math.min(w, h) * 0.085;
      ctx.save();
      ctx.globalAlpha = 0.28;
      for (let y = -cr; y < cr; y += 4) {
        for (let x = -cr; x < cr; x += 4) {
          const d = Math.sqrt(x * x + y * y);
          if (d > cr) continue;
          const b = BAYER[((y / 4) | 0) & 3][((x / 4) | 0) & 3];
          if (d / cr < b / 16) continue;
          ctx.fillStyle = p.accent;
          ctx.fillRect(cx + x, cy + y, 4, 4);
        }
      }
      ctx.restore();

      // far skyline
      this.drawSkyline(this.buildings.far, groundY, p.wall, p.wallEdge, 0.35);
      // near skyline
      this.drawSkyline(this.buildings.near, groundY, p.wall, p.wallEdge, 1);

      // ground
      ctx.fillStyle = '#010603';
      ctx.fillRect(0, groundY, w, h - groundY);
      ctx.strokeStyle = p.ground + '33';
      ctx.lineWidth = 1;
      const scroll = (this.time * 26) % 40;
      for (let x = -40 + scroll; x < w + 40; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x - 60, h);
        ctx.stroke();
      }
      for (let y = groundY; y < h; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // the trace wall: rises from the left as the fire closes in
      const wallW = Math.max(0, this.brew * w * 0.55);
      if (wallW > 0) {
        const g2 = ctx.createLinearGradient(0, 0, wallW, 0);
        g2.addColorStop(0, p.accent + 'cc');
        g2.addColorStop(1, p.accent + '00');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, wallW, h);
        // chewed edge
        ctx.fillStyle = p.accent;
        for (let y = 0; y < h; y += 6) {
          const wob = Math.sin(this.time * 9 + y * 0.11) * 6;
          ctx.fillRect(wallW + wob - 3, y, 3, 6);
        }
      }

      // rain
      ctx.strokeStyle = p.rain + '55';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const r of this.rain) {
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x - 2, r.y + r.len);
      }
      ctx.stroke();

      // vignette + danger tint
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      if (this.heat > 0.05) {
        const dg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
        dg.addColorStop(0, 'rgba(255,46,136,0)');
        dg.addColorStop(1, 'rgba(255,46,136,' + (0.28 * this.heat).toFixed(3) + ')');
        ctx.fillStyle = dg;
        ctx.fillRect(0, 0, w, h);
      }
    }

    drawSkyline(list, groundY, wall, edge, alpha) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = alpha;
      const p = this.palette;
      for (const b of list) {
        const top = groundY - b.h;
        ctx.fillStyle = wall;
        ctx.fillRect(b.x, top, b.w, b.h);
        ctx.fillStyle = edge;
        ctx.fillRect(b.x, top, b.w, 2);
        ctx.fillRect(b.x, top, 2, b.h);
        // lit windows
        const cols = Math.max(1, Math.floor(b.w / 12));
        const rows = Math.max(1, Math.floor(b.h / 14));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const flick = Math.sin(this.time * 2 + b.win * 30 + r * 3 + c) > (b.flag > 0.6 ? 0.55 : 0.85);
            if (!flick) continue;
            ctx.fillStyle = p.windows[(r + c) % p.windows.length];
            ctx.globalAlpha = alpha * 0.6;
            ctx.fillRect(b.x + 4 + c * 12, top + 6 + r * 14, 4, 5);
            ctx.globalAlpha = alpha;
          }
        }
        // antenna / sign
        if (b.flag > 0.7) {
          ctx.fillStyle = p.sign[Math.floor(b.win * p.sign.length)];
          const sh = this.time * 6 + b.win * 10;
          if (Math.sin(sh) > 0) ctx.fillRect(b.x + b.w * 0.5 - 2, top - 10, 4, 10);
        }
      }
      ctx.restore();
    }
  }

  BL.World = World;
})(window.BL = window.BL || {});
