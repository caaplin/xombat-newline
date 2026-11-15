/*
 * game.js — the shell: screens, the render loop, keyboard capture, persistence.
 *
 * The engine knows nothing about the DOM; this file owns the modes
 * (gate -> play -> pause -> result), paints the terminal from engine state,
 * and turns keypresses into engine.input() calls.
 */
(function (BL) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STORE = {
    best: 'xombat.best.v1',
    runs: 'xombat.runs.v1',
    sound: 'xombat.sound.v1',
  };

  const SPEEDS = [7, 9, 11, 13, 16, 20, 24]; // line widths -> font-size buckets

  const ui = {
    screens: { game: $('game'), gate: $('gate'), pause: $('pause'), result: $('result') },
    score: $('score'),
    combo: $('combo'),
    depth: $('depth'),
    zoneName: $('zone-name'),
    cardsTag: $('cards-tag'),
    hp: $('hp'),
    hpBar: $('hp-bar'),
    hpV: $('hp-v'),
    term: $('term'),
    line: $('line'),
    history: $('history'),
    upcoming: $('upcoming'),
    kb: $('kb'),
    toast: $('toast'),
    banner: $('banner'),
    announce: $('announce'),
    bossbar: $('bossbar'),
    bbName: $('bb-name'),
    bbFill: $('bb-fill'),
    bbPhase: $('bb-phase'),
    cards: $('cards'),
    cardsRow: $('cards-row'),
    kbd: $('kbd'),
    hint: $('hint'),
  };

  const state = {
    mode: 'gate', // gate | play | pause | result | cards
    code: '',
    engine: null,
    lastFrame: 0,
    raf: 0,
    spans: [],
    spanText: '',
    lastHp: 100,
    hpCells: [],
    historyLines: [],
    lastElapsed: 0,
    debug: false,
  };

  /* ------------------------------------------------------------------ *
   * persistence — best score and run count, nothing else leaves the page
   * ------------------------------------------------------------------ */

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* private mode, ignore */
    }
  }

  /* ------------------------------------------------------------------ *
   * sound
   * ------------------------------------------------------------------ */

  function initSound() {
    const on = read(STORE.sound, true);
    BL.Audio.setEnabled(on);
    const btn = $('btn-mute');
    btn.textContent = on ? 'sound on' : 'sound off';
    btn.setAttribute('aria-pressed', String(!on));
    btn.addEventListener('click', () => {
      const next = !BL.Audio.enabled;
      BL.Audio.setEnabled(next);
      write(STORE.sound, next);
      btn.textContent = next ? 'sound on' : 'sound off';
      btn.setAttribute('aria-pressed', String(!next));
      if (next) BL.Audio.startMusic('assets/music/neon-loop.mp3');
    });
  }

  /* ------------------------------------------------------------------ *
   * layout: pick a font size that fits the viewport, like the original
   * ------------------------------------------------------------------ */

  function fitLine() {
    // Measure a monospace advance at 100px once, then solve for a size that
    // fits both the viewport width and a sane character count per line.
    const probe = document.createElement('span');
    probe.style.cssText =
      'position:absolute;visibility:hidden;white-space:pre;font:400 100px var(--f-mono)';
    probe.textContent = 'x'.repeat(20);
    document.body.appendChild(probe);
    const advance = probe.getBoundingClientRect().width / 2000 || 0.6;
    probe.remove();

    // the terminal box has its own padding; keep the glyphs inside it
    const pad = window.innerWidth <= 720 ? 28 : 46;
    const avail = Math.max(120, document.documentElement.clientWidth - 28 - pad);
    const maxCols = Math.max(14, Math.min(44, Math.floor(avail / (16 * advance))));
    const size = Math.max(11, Math.min(46, avail / (maxCols * advance), window.innerHeight * 0.058));
    document.documentElement.style.setProperty('--line-size', size.toFixed(2) + 'px');
    document.documentElement.style.setProperty('--line-max', Math.round(maxCols * advance * size + pad) + 'px');
    return maxCols;
  }
  let lineCols = 40;
  window.addEventListener('resize', () => {
    lineCols = fitLine();
  });

  /* ------------------------------------------------------------------ *
   * screens
   * ------------------------------------------------------------------ */

  function show(name) {
    Object.keys(ui.screens).forEach((k) => {
      ui.screens[k].hidden = k !== name;
    });
  }

  function gateScreen() {
    state.mode = 'gate';
    show('gate');
    ui.cards.hidden = true;
    BL.Audio.stopMusic();
    const best = read(STORE.best, 0);
    const runs = read(STORE.runs, 0);
    $('best-line').textContent = 'best: ' + (best ? best.toLocaleString('en-US') : '—');
    $('runs-line').textContent = 'runs: ' + runs;
    const input = $('code-input');
    if (state.code) input.value = state.code;
    setTimeout(() => input.focus(), 30);
  }

  /* ------------------------------------------------------------------ *
   * the run
   * ------------------------------------------------------------------ */

  function startRun(code) {
    const normalized = BL.codes.normalize(code) || BL.codes.generate();
    state.code = normalized;
    const seed = BL.codes.toSeed(normalized);
    lineCols = fitLine();
    state.engine = new BL.Engine({ seed, lineLength: lineCols });
    state.spans = [];
    state.spanText = '';
    state.historyLines = [];
    state.lastElapsed = 0;
    state.lastHp = state.engine.hp;
    ui.history.textContent = '';
    ui.toast.textContent = '';
    ui.banner.className = 'banner';
    ui.cards.hidden = true;

    const palette = state.engine.zoneInfo.zone.palette;
    document.documentElement.style.setProperty('--ember', palette.accent);
    BL.world.setZone(state.engine.zoneInfo.zone.id, BL.hash(seed));

    show('game');
    state.mode = 'play';
    ui.kbd.value = '';
    ui.kbd.focus();
    BL.Audio.ensure();
    BL.Audio.startMusic('assets/music/neon-loop.mp3');
    announce(state.engine.zoneInfo.label, false);
    state.lastFrame = performance.now();
    if (!state.raf) state.raf = requestAnimationFrame(loop);
  }

  function endRun() {
    const e = state.engine;
    if (!e) return;
    state.mode = 'result';
    ui.cards.hidden = true; // a death can land while the offer is up
    ui.kbd.blur();
    BL.Audio.stopMusic();
    BL.Audio.setTension(0);

    const score = e.score();
    const best = read(STORE.best, 0);
    const isBest = score > best;
    if (isBest) write(STORE.best, score);
    write(STORE.runs, read(STORE.runs, 0) + 1);

    $('result-kicker').textContent = e.endReason === 'quit' ? 'disconnected' : 'combat ended';
    $('result-title').textContent =
      e.endReason === 'quit' ? 'Disconnected' : e.endReason === 'death' ? 'Traced' : 'Run over';
    $('result-cause').textContent = e.deathCause || '';
    $('result-score').textContent = score.toLocaleString('en-US');
    $('result-best').hidden = !isBest;
    $('result-depth').textContent = e.floor + '–' + e.wave;
    $('result-wpm').textContent = Math.round(e.wpm());
    $('result-acc').textContent = (e.accuracy() * 100).toFixed(1) + '%';
    $('result-streak').textContent = '×' + BL.combo(e.maxStreak);
    $('result-lines').textContent = e.linesCleared;
    $('result-keys').textContent = e.keys.brokenKeys().length;

    const cards = e.cards.map((c) => c.name);
    $('result-cards').innerHTML = cards.length
      ? 'cards: <b>' + cards.join('</b> · <b>') + '</b>'
      : 'no cards taken — you died too early for the fun stuff';

    $('share-code').value = state.code;
    show('result');
    BL.Audio.death();
  }

  function pauseRun() {
    if (state.mode !== 'play') return;
    state.mode = 'pause';
    ui.kbd.blur();
    $('pause-code').textContent = 'run code ' + state.code;
    show('pause');
    BL.Audio.duckMusic(true);
  }

  function resumeRun() {
    if (state.mode !== 'pause') return;
    state.mode = 'play';
    show('game');
    ui.kbd.focus();
    state.lastFrame = performance.now();
    BL.Audio.duckMusic(false);
  }

  /* ------------------------------------------------------------------ *
   * rendering
   * ------------------------------------------------------------------ */

  function cellClass(snap, i, shown) {
    const st = snap.states[shown];
    let cls = 'c-' + st;
    if (st === 'todo' && snap.mined[shown]) cls += ' c-mine';
    if (shown < snap.fire - 0.5) cls += ' c-ash';
    else if (state.engine.hidden(shown)) cls += ' c-fog';
    if (shown === snap.cursor && state.mode === 'play') cls += ' c-cur';
    if (snap.scarred[shown]) cls += st === 'hit' ? ' c-scar' : ' c-wounded';
    const kind = snap.kinds[shown];
    if (kind && kind !== 'grunt' && st === 'todo') {
      cls += ' c-k-' + kind;
      if (snap.bomb && snap.bomb.index === shown) cls += ' c-armed';
      if (snap.sniper === shown) cls += ' c-aimed';
    }
    return cls;
  }

  function renderLine(snap) {
    // Rebuild spans only when the text changes; otherwise patch classes.
    // A real newline becomes a zero-height block so the row actually breaks,
    // and the character before it gets an end-of-line marker.
    if (snap.text !== state.spanText) {
      ui.line.textContent = '';
      state.spans = Array.from(snap.text, (ch, i) => {
        const s = document.createElement('span');
        if (ch === '\n') {
          s.className = 'c-brk';
        } else {
          s.textContent = ch === '\t' ? '\t' : ch;
          s.style.setProperty('--r', ((Math.random() - 0.5) * 22).toFixed(2) + 'deg');
          if (snap.text[i + 1] === '\n') s.dataset.eol = '1';
        }
        ui.line.appendChild(s);
        return s;
      });
      state.spanText = snap.text;
    }
    for (let i = 0; i < state.spans.length; i++) {
      const span = state.spans[i];
      if (state.spans[i].className.indexOf('c-brk') !== -1) continue;
      let cls = cellClass(snap, i, state.engine.shownAt(i));
      if (span.dataset.eol) cls += ' c-eol';
      if (span.className !== cls) span.className = cls;
    }
  }
  function renderUpcoming(snap) {
    const lines = state.engine.queue.slice(0, 3);
    const html = lines
      .map((l, i) => {
        const first = l.text.split('\n')[0] || '';
        const cls = 'uline' + (l.boss ? ' boss' : '');
        return '<div class="' + cls + '">' + escapeHtml(first.slice(0, 200)) + '</div>';
      })
      .join('');
    if (ui.upcoming.innerHTML !== html) ui.upcoming.innerHTML = html;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function renderHistory(snap) {
    // keep the last two finished lines as a fading trail
    if (state.engine.linesCleared !== state.lastElapsed) {
      const prev = state.spanTextPrev;
      if (prev) {
        state.historyLines.push(prev.split('\n')[0]);
        if (state.historyLines.length > 2) state.historyLines.shift();
        ui.history.innerHTML = state.historyLines
          .map((l) => '<div class="hline">' + escapeHtml(l) + '</div>')
          .join('');
        ui.term.classList.remove('scroll');
        void ui.term.offsetWidth;
        ui.term.classList.add('scroll');
      }
      state.lastElapsed = state.engine.linesCleared;
    }
    state.spanTextPrev = snap.text;
  }

  function renderHp(snap) {
    if (!state.hpCells.length) {
      ui.hpBar.textContent = '';
      state.hpCells = Array.from({ length: 20 }, () => {
        const i = document.createElement('i');
        ui.hpBar.appendChild(i);
        return i;
      });
    }
    const lit = Math.ceil((snap.hp / 100) * 20);
    state.hpCells.forEach((cell, i) => {
      const on = i < lit;
      if (cell.classList.contains('on') !== on) cell.classList.toggle('on', on);
    });
    if (snap.hp !== state.lastHp) {
      if (snap.hp < state.lastHp) {
        ui.hp.classList.remove('hit');
        void ui.hp.offsetWidth;
        ui.hp.classList.add('hit');
      }
      state.lastHp = snap.hp;
    }
    ui.hpV.textContent = snap.hp;
    ui.hp.classList.toggle('low', snap.hp <= 30);
    ui.hp.setAttribute('aria-valuenow', String(snap.hp));
  }

  function renderHud(snap) {
    ui.term.setAttribute('data-level', 'level ' + snap.floor + '-' + snap.wave);
    ui.score.textContent = Math.round(snap.score).toLocaleString('en-US');
    const c = snap.combo;
    ui.combo.textContent = '×' + c;
    ui.combo.classList.toggle('hot', c >= 3);
    ui.depth.textContent = snap.floor + '–' + snap.wave;
    ui.zoneName.textContent = snap.zone.label;
    const cards = state.engine.cards.map((c2) => c2.name);
    ui.cardsTag.textContent = cards.length ? ' · ' + cards.join(' · ') : '';
  }

  function renderBoss(snap) {
    if (snap.bossHealth) {
      ui.bossbar.hidden = false;
      ui.bbName.textContent = snap.boss ? snap.boss.name : 'boss';
      ui.bbFill.style.width = ((snap.bossHealth.left / snap.bossHealth.total) * 100).toFixed(1) + '%';
      ui.bbPhase.textContent = ['I', 'II', 'III'][snap.bossHealth.phase - 1];
    } else {
      ui.bossbar.hidden = true;
    }
  }

  function renderScars() {
    const scars = state.engine.keys.snapshot();
    const html = scars
      .map(
        (s) =>
          '<span class="chip' +
          (s.level === 2 ? ' broken' : '') +
          '">' +
          escapeHtml(s.key === ' ' ? 'space' : s.key) +
          '</span>'
      )
      .join('');
    if (ui.kb.innerHTML !== html) ui.kb.innerHTML = html;
  }

  /* ------------------------------------------------------------------ *
   * events
   * ------------------------------------------------------------------ */

  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.remove('flash');
    void ui.toast.offsetWidth;
    ui.toast.classList.add('flash');
  }

  function announce(text, hazard) {
    ui.announce.textContent = text;
    ui.announce.className = 'announce' + (hazard ? ' hazard' : '');
    void ui.announce.offsetWidth;
    ui.announce.classList.add('show');
  }

  function banner(text) {
    ui.banner.textContent = text;
    ui.banner.className = 'banner';
    void ui.banner.offsetWidth;
    ui.banner.classList.add('show');
  }

  function handleEvents(events) {
    for (const evt of events) {
      switch (evt.type) {
        case 'hit':
          BL.Audio.hit(state.engine ? BL.combo(state.engine.streak) : 1);
          break;
        case 'miss':
          BL.Audio.miss();
          break;
        case 'damage':
          break;
        case 'heal':
          BL.Audio.heal();
          break;
        case 'cache':
          toast('cache hit +' + Math.round(evt.points));
          BL.Audio.enemy();
          break;
        case 'medic':
          toast('medic +' + evt.amount + ' HP');
          BL.Audio.heal();
          break;
        case 'defuse':
          toast('bomb defused +' + Math.round(evt.points));
          BL.Audio.heal();
          break;
        case 'explode':
          toast('the bomber went off');
          BL.Audio.damage();
          break;
        case 'charge':
          toast('berserker charging');
          BL.Audio.warn();
          break;
        case 'rush':
          toast('berserker hits you');
          BL.Audio.damage();
          break;
        case 'aim':
          BL.Audio.warn();
          break;
        case 'snipe':
          toast('sniped');
          BL.Audio.damage();
          break;
        case 'frozen':
          toast('frozen for ' + evt.seconds + 's');
          BL.Audio.warn();
          break;
        case 'rooted':
          toast('rooted: ' + evt.keys + ' keys to shake it');
          BL.Audio.warn();
          break;
        case 'unrooted':
          toast('shaken off');
          break;
        case 'shield':
          break;
        case 'brute':
          if (evt.dead) toast('brute down +' + Math.round(evt.bonus));
          break;
        case 'split':
          toast('splitter spawned two');
          BL.Audio.enemy();
          break;
        case 'splitling':
          BL.Audio.enemy();
          break;
        case 'summon':
          toast('summoner armoured a letter');
          BL.Audio.warn();
          break;
        case 'defuse' && 'lineClear':
          break;
        case 'lineClear':
          BL.Audio.lineClear();
          if (evt.clean) toast('clean line +' + Math.round(evt.bonus));
          else toast('line cleared +' + Math.round(evt.bonus));
          break;
        case 'wave':
          banner('wave ' + evt.wave);
          break;
        case 'floor':
          announce(evt.floor + ' deep');
          BL.Audio.floorUp();
          break;
        case 'boss':
          announce(evt.boss.name, true);
          BL.Audio.warn();
          break;
        case 'bossHit':
          BL.Audio.damage();
          break;
        case 'bossDown':
          toast('boss down +' + Math.round(evt.bonus));
          BL.Audio.floorUp();
          break;
        case 'offer':
          openCards(evt.cards);
          break;
        case 'card':
          toast('card: ' + evt.card.name);
          break;
        case 'death':
          BL.Audio.death();
          break;
        case 'burn':
          toast(evt.lethal ? 'the trace caught you' : 'burned');
          BL.Audio.damage();
          break;
        case 'chew':
          BL.Audio.damage();
          break;
        case 'crack':
          toast('key cracked: ' + evt.key);
          break;
        case 'break':
          toast('key broken: ' + evt.key + ' — mined');
          BL.Audio.warn();
          break;
        case 'repair':
          toast('repaired: ' + evt.key);
          BL.Audio.heal();
          break;
        default:
          break;
      }
    }
  }

  function openCards(cards) {
    state.mode = 'cards';
    ui.kbd.blur();
    ui.cardsRow.innerHTML = '';
    cards.forEach((card, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card';
      btn.innerHTML =
        '<span class="card-num">' + (i + 1) + '</span>' +
        '<h3 class="card-name">' + escapeHtml(card.name) + '</h3>' +
        '<p class="card-text">' + escapeHtml(card.text) + '</p>';
      btn.addEventListener('click', () => pickCard(i));
      ui.cardsRow.appendChild(btn);
    });
    ui.cards.hidden = false;
  }

  function pickCard(i) {
    if (!state.engine || !state.engine.offer) return;
    state.engine.choose(i);
    handleEvents(state.engine.drain());
    ui.cards.hidden = true;
    if (state.engine.dead) {
      endRun();
      return;
    }
    state.mode = 'play';
    show('game');
    ui.kbd.focus();
    state.lastFrame = performance.now();
  }

  /* ------------------------------------------------------------------ *
   * the loop
   * ------------------------------------------------------------------ */

  function loop(now) {
    state.raf = requestAnimationFrame(loop);
    const e = state.engine;
    let dt = (now - state.lastFrame) / 1000;
    if (!e) {
      // no run yet: keep the city alive behind the gate
      state.lastFrame = now;
      BL.world.update(Math.min(Math.max(dt, 0), 0.05), 0, 0);
      BL.world.draw();
      return;
    }
    state.lastFrame = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.05); // a backgrounded tab must not kill you

    if (state.mode === 'play' && !e.dead) {
      e.tick(dt);
      handleEvents(e.drain());
      if (e.dead) {
        endRun();
        return;
      }
    }

    const snap = e.snapshot();
    BL.world.setZone(snap.zone.zone.id, BL.hash(e.seed));
    BL.world.update(dt, snap.heat, Math.max(0, 1 - (snap.cursor - snap.fire) / 14));
    BL.world.draw();

    if (state.mode === 'play' || state.mode === 'cards' || state.mode === 'pause') {
      renderLine(snap);
      renderUpcoming(snap);
      renderHistory(snap);
      renderHp(snap);
      renderHud(snap);
      renderBoss(snap);
      renderScars();
      if (state.mode === 'play') BL.Audio.setTension(snap.heat);
    }
  }

  /* ------------------------------------------------------------------ *
   * keyboard
   * ------------------------------------------------------------------ */

  function typingKey(ch) {
    const e = state.engine;
    if (!e) return;
    if (ch === '§') {
      // the original's stand-in for a wrong key
      e.input('\u00a7', performance.now());
    } else {
      e.input(ch, performance.now());
    }
    BL.Audio.key();
    handleEvents(e.drain());
    if (e.dead) endRun();
  }

  function bindKeys() {
    document.addEventListener('keydown', (ev) => {
      // modals first
      if (state.mode === 'cards') {
        if (['1', '2', '3'].includes(ev.key)) {
          ev.preventDefault();
          pickCard(Number(ev.key) - 1);
        }
        return;
      }
      if (state.mode === 'result') {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          startRun(state.code);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          gateScreen();
        }
        return;
      }
      if (state.mode === 'pause') {
        if (ev.key === 'Escape' || ev.key === 'Enter') {
          ev.preventDefault();
          resumeRun();
        }
        return;
      }
      if (state.mode === 'gate') {
        if (ev.key === 'Enter' && document.activeElement === $('code-input')) {
          ev.preventDefault();
          startRun($('code-input').value);
        }
        return;
      }
      if (state.mode !== 'play') return;

      if (ev.key === 'Escape') {
        ev.preventDefault();
        pauseRun();
        return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === 'Backspace' || ev.key === 'Delete') {
        // no backspace. it says so on the tin.
        ev.preventDefault();
        toast('no backspace');
        return;
      }
      if (ev.key.length === 1) {
        ev.preventDefault();
        typingKey(ev.key);
      }
    });

    // mobile: keep a focused input so the soft keyboard opens
    const focusInput = () => {
      if (state.mode === 'play') ui.kbd.focus();
    };
    document.addEventListener('pointerdown', (ev) => {
      if (state.mode !== 'play') return;
      const t = ev.target;
      if (t.closest && t.closest('button, a, input, textarea, select')) return;
      focusInput();
    });
    ui.kbd.addEventListener('input', () => {
      const v = ui.kbd.value;
      ui.kbd.value = '';
      if (state.mode !== 'play' || !v) return;
      for (const ch of v) typingKey(ch === '\n' ? ' ' : ch);
    });
    window.addEventListener('blur', () => {
      if (state.mode === 'play') pauseRun();
    });
  }

  /* ------------------------------------------------------------------ *
   * wiring
   * ------------------------------------------------------------------ */

  function boot() {
    BL.world = new BL.World($('world'));
    lineCols = fitLine();
    initSound();
    bindKeys();

    $('btn-start').addEventListener('click', () => startRun($('code-input').value));
    $('btn-random').addEventListener('click', () => {
      const code = BL.codes.generate();
      $('code-input').value = code;
      startRun(code);
    });
    $('btn-paste').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          $('code-input').value = BL.codes.normalize(text);
          $('code-input').focus();
        }
      } catch (e) {
        $('code-input').focus();
        toast('clipboard blocked — paste it yourself');
      }
    });
    $('code-input').addEventListener('input', (ev) => {
      ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
    });

    $('btn-resume').addEventListener('click', resumeRun);
    $('btn-quit').addEventListener('click', () => {
      if (!state.engine) return;
      state.engine.quit();
      handleEvents(state.engine.drain());
      endRun();
    });
    $('btn-pause').addEventListener('click', () => (state.mode === 'play' ? pauseRun() : resumeRun()));

    $('btn-again').addEventListener('click', () => startRun(state.code));
    $('btn-newcode').addEventListener('click', () => {
      state.code = BL.codes.generate();
      startRun(state.code);
    });
    $('btn-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('share-code').value);
        $('btn-copy').textContent = 'copied';
        setTimeout(() => ($('btn-copy').textContent = 'copy'), 1200);
      } catch (e) {
        $('share-code').select();
      }
    });

    // URL ?code=XXXX lets people share a link instead of pasting
    const params = new URLSearchParams(location.search);
    const fromUrl = BL.codes.normalize(params.get('code') || '');
    if (fromUrl) {
      $('code-input').value = fromUrl;
      state.code = fromUrl;
    }
    gateScreen();
    state.raf = requestAnimationFrame(loop);
  }

  // Small hook for tests and for players who want to poke at the run.
  window.XOMBAT = {
    get state() {
      return state;
    },
    startRun: startRun,
    endRun: endRun,
    openCards: openCards,
    version: '1.0.0',
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.BL = window.BL || {});
