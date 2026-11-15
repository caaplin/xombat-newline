/*
 * audio.js — all sound is synthesised with WebAudio, no audio files needed.
 *
 * Keystrokes are short clicks, the trace is a low drone that rises as it gets
 * close, hits are blips that climb with your combo, and the zone boss gets a
 * two-note warning. Music is one looping track from assets/music if it loads
 * and silence otherwise, so the game works from a bare file:// open.
 */
(function (BL) {
  'use strict';

  class Audio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.musicEl = null;
      this.musicVolume = 0.35;
      this.droneNodes = null;
    }

    /** Lazily created on the first user gesture (browsers require that). */
    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    }

    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.5 : 0;
      if (this.musicEl) this.musicEl.volume = on ? this.musicVolume : 0;
    }

    /** A single shaped blip. */
    blip(freq, dur, type, gain, slideTo) {
      const ctx = this.ensure();
      if (!ctx || !this.enabled) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(gain || 0.14, ctx.currentTime + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g).connect(this.master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    }

    /** Noise burst, for impacts and explosions. */
    noise(dur, gain, filterHz) {
      const ctx = this.ensure();
      if (!ctx || !this.enabled) return;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterHz || 900;
      const g = ctx.createGain();
      g.gain.value = gain || 0.2;
      src.connect(filter).connect(g).connect(this.master);
      src.start();
    }

    key() {
      this.blip(520 + Math.random() * 90, 0.035, 'square', 0.05);
    }
    miss() {
      this.blip(150, 0.16, 'sawtooth', 0.12, 70);
    }
    hit(combo) {
      this.blip(420 + Math.min(combo, 5) * 90, 0.05, 'triangle', 0.08);
    }
    enemy() {
      this.blip(700, 0.09, 'square', 0.1, 1200);
    }
    damage() {
      this.noise(0.18, 0.26, 700);
      this.blip(90, 0.22, 'sawtooth', 0.16, 50);
    }
    heal() {
      this.blip(660, 0.1, 'sine', 0.1, 990);
    }
    lineClear() {
      this.blip(520, 0.08, 'triangle', 0.09, 780);
      setTimeout(() => this.blip(780, 0.1, 'triangle', 0.08, 1040), 70);
    }
    warn() {
      this.blip(300, 0.12, 'square', 0.1, 220);
    }
    floorUp() {
      [440, 587, 740].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 'triangle', 0.1), i * 90));
    }
    death() {
      this.noise(0.5, 0.3, 400);
      this.blip(200, 0.7, 'sawtooth', 0.2, 40);
    }

    /** Low drone whose pitch tracks how close the trace is. */
    setTension(level) {
      const ctx = this.ensure();
      if (!ctx || !this.enabled) return;
      if (!this.droneNodes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 55;
        g.gain.value = 0.0001;
        osc.connect(g).connect(this.master);
        osc.start();
        this.droneNodes = { osc, g };
      }
      const { osc, g } = this.droneNodes;
      osc.frequency.setTargetAtTime(48 + level * 60, ctx.currentTime, 0.1);
      g.gain.setTargetAtTime(level > 0.15 ? 0.02 + level * 0.06 : 0.0001, ctx.currentTime, 0.15);
    }

    startMusic(src) {
      if (!src) return;
      if (!this.musicEl) {
        this.musicEl = new window.Audio();
        this.musicEl.loop = true;
        this.musicEl.volume = this.enabled ? this.musicVolume : 0;
        this.musicSrc = '';
      }
      if (this.musicSrc !== src) {
        this.musicSrc = src;
        this.musicEl.src = src;
      }
      const p = this.musicEl.play();
      if (p && p.catch) p.catch(() => {}); // autoplay blocked until a gesture
    }
    duckMusic(on) {
      if (this.musicEl) this.musicEl.volume = !this.enabled ? 0 : on ? this.musicVolume * 0.35 : this.musicVolume;
    }
    stopMusic() {
      if (this.musicEl) this.musicEl.pause();
    }
  }

  BL.Audio = new Audio();
})(window.BL = window.BL || {});
