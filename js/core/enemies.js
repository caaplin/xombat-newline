/*
 * enemies.js — the roster.
 *
 * Every character of the current line has a *kind*. `grunt` is a plain
 * character: type it. The rest are enemies you have to type through, and each
 * one does something nasty. The numbers below are the ones the original build
 * uses (1.5x damage on a brute miss, 1.2s berserker fuse, 3.6s boss cycle and
 * so on) so the difficulty curve feels the same.
 */
(function (BL) {
  'use strict';

  const DAMAGE = {
    miss: 4, // a plain wrong key
    bruteMiss: 1.5, // wrong key inside a brute word (multiplier)
    splitMiss: 1.5,
    snipe: 4,
    bomb: 10,
    rush: 8,
    summonShield: 1, // implied armour
  };

  const TIMING = {
    bombFuse: 1.6,
    rushFuse: 1.2,
    sniperAim: 3.2,
    bossCycle: 3.6,
    bossWarn: 0.9,
    summonerTick: 4,
    armor: { shield: 1, juggernaut: 2 },
  };

  /** Zones in the original order, with their enemy mix and their chaser. */
  const BASE = {
    medic: 0.018,
    cache: 0.02,
    bomber: 0,
    splitter: 0,
    shield: 0,
    sniper: 0,
    juggernaut: 0,
    berserker: 0,
    summoner: 0,
    brute: 0.45,
    bruteMax: 2,
    elite: false,
  };

  const ZONES = [
    {
      id: 'slums',
      name: 'Neon Slums',
      tagline: 'Where every run starts. Keep your head down.',
      roster: Object.assign({}, BASE, { brute: 0.35 }),
      chaser: {
        id: 'sentinel',
        name: 'ICE sentinel',
        warning: 'An ICE sentinel is on your trail.',
        caught: 'The sentinel bit you',
        speed: 1,
        mode: 'hit',
        damage: 20,
        knockback: 6,
      },
      palette: {
        accent: '#39ff88',
        sky: ['#000201', '#020904', '#04140a', '#082414', '#124226'],
        wall: '#010603',
        wallEdge: '#0a2416',
        windows: ['#39ff88', '#1d7a45', '#3cf2ff'],
        sign: ['#ff2e88', '#3cf2ff', '#39ff88'],
        rain: '#39ff88',
        ground: '#39ff88',
      },
    },
    {
      id: 'servers',
      name: 'Server Farm',
      tagline: 'Cold racks, hot drones. Watch for bombers.',
      roster: Object.assign({}, BASE, { bomber: 0.03 }),
      chaser: {
        id: 'swarm',
        name: 'drone swarm',
        warning: 'A drone swarm follows. Let it close and it chews you up.',
        caught: 'The swarm is chewing on you',
        speed: 1.05,
        mode: 'chew',
        damage: 0,
        knockback: 0,
        dps: 7,
      },
      palette: {
        accent: '#3cf2ff',
        sky: ['#000105', '#020814', '#041229', '#092245', '#123c70'],
        wall: '#01040c',
        wallEdge: '#0d2e58',
        windows: ['#3cf2ff', '#1f6f9c', '#bfefff'],
        sign: ['#3cf2ff', '#ff2e88', '#bfefff'],
        rain: '#3cf2ff',
        ground: '#3cf2ff',
      },
    },
    {
      id: 'sewer',
      name: 'Sewer Grid',
      tagline: 'Things split down here.',
      roster: Object.assign({}, BASE, { bomber: 0.02, splitter: 0.035, berserker: 0.012 }),
      chaser: {
        id: 'flood',
        name: 'sludge flood',
        warning: 'The sewer is flooding behind you.',
        caught: 'The flood swept over you',
        speed: 1,
        mode: 'hit',
        damage: 15,
        knockback: 5,
      },
      palette: {
        accent: '#a8ff5c',
        sky: ['#050600', '#0a0d02', '#111505', '#1a2008', '#26300c'],
        wall: '#070a02',
        wallEdge: '#33421a',
        windows: ['#a8ff5c', '#6b8a30', '#d8ff9e'],
        sign: ['#a8ff5c', '#ffd23c', '#6b8a30'],
        rain: '#a8ff5c',
        ground: '#a8ff5c',
      },
    },
    {
      id: 'arcology',
      name: 'Arcology',
      tagline: 'Corporate security wears shields. Hit twice.',
      roster: Object.assign({}, BASE, {
        splitter: 0.02,
        shield: 0.05,
        juggernaut: 0.012,
        berserker: 0.012,
      }),
      chaser: {
        id: 'crusher',
        name: 'security press',
        warning: 'A security press is closing in. It hits hard.',
        caught: 'The press slammed you',
        speed: 0.95,
        mode: 'hit',
        damage: 30,
        knockback: 8,
      },
      palette: {
        accent: '#c9a6ff',
        sky: ['#04010a', '#0a0414', '#120720', '#1c0b30', '#2a1145'],
        wall: '#06010c',
        wallEdge: '#3a1b5c',
        windows: ['#c9a6ff', '#7b4ba8', '#ffd23c'],
        sign: ['#c9a6ff', '#ff2e88', '#ffd23c'],
        rain: '#c9a6ff',
        ground: '#c9a6ff',
      },
    },
    {
      id: 'foundry',
      name: 'Foundry',
      tagline: 'Heavy iron and a sniper on the gantry.',
      roster: Object.assign({}, BASE, {
        bomber: 0.02,
        shield: 0.03,
        sniper: 1,
        brute: 0.65,
        bruteMax: 3,
        juggernaut: 0.02,
        berserker: 0.015,
      }),
      chaser: {
        id: 'collapse',
        name: 'collapsing bridge',
        warning: 'The bridge is falling into the lava behind you. If it reaches you, you fall.',
        caught: 'The bridge gave way under you',
        speed: 0.8,
        mode: 'lethal',
        damage: 0,
        knockback: 0,
      },
      palette: {
        accent: '#ffb02f',
        sky: ['#0a0300', '#160700', '#220b01', '#311103', '#451806'],
        wall: '#0d0500',
        wallEdge: '#5c2c0c',
        windows: ['#ffb02f', '#ff7a2f', '#ffd88a'],
        sign: ['#ffb02f', '#ff3b3b', '#ffd88a'],
        rain: '#ff7a2f',
        ground: '#ffb02f',
      },
    },
    {
      id: 'desert',
      name: 'Glitch Desert',
      tagline: 'Dead pixels to the horizon. Snipers love the view.',
      roster: Object.assign({}, BASE, {
        splitter: 0.04,
        sniper: 1,
        shield: 0.02,
        berserker: 0.02,
        summoner: 0.012,
      }),
      chaser: {
        id: 'worm',
        name: 'sandworm',
        warning: 'Something huge moves under the sand.',
        caught: 'The sandworm struck',
        speed: 1,
        mode: 'hit',
        damage: 35,
        knockback: 10,
      },
      palette: {
        accent: '#ffd23c',
        sky: ['#0a0700', '#141004', '#1f1a08', '#2c260c', '#3d3512'],
        wall: '#0b0900',
        wallEdge: '#5c4f18',
        windows: ['#ffd23c', '#ff9a55', '#fff1c9'],
        sign: ['#ffd23c', '#ff2e88', '#fff1c9'],
        rain: '#ffd23c',
        ground: '#ffd23c',
      },
    },
    {
      id: 'frozen',
      name: 'Frozen Cache',
      tagline: 'Everything here is armoured.',
      roster: Object.assign({}, BASE, {
        shield: 0.09,
        bomber: 0.02,
        medic: 0.012,
        juggernaut: 0.025,
        summoner: 0.012,
      }),
      chaser: {
        id: 'avalanche',
        name: 'avalanche',
        warning: 'An avalanche is coming down. It freezes you solid.',
        caught: 'The avalanche froze you',
        speed: 1,
        mode: 'freeze',
        damage: 15,
        knockback: 6,
        freeze: 1,
      },
      palette: {
        accent: '#bfefff',
        sky: ['#000306', '#020a12', '#04121e', '#071c2c', '#0b283c'],
        wall: '#01070c',
        wallEdge: '#1e4a63',
        windows: ['#bfefff', '#6fa8c9', '#ffffff'],
        sign: ['#bfefff', '#3cf2ff', '#ffffff'],
        rain: '#bfefff',
        ground: '#bfefff',
      },
    },
    {
      id: 'jungle',
      name: 'Overgrown Net',
      tagline: 'Old code grew wild. Elite packs roam.',
      roster: Object.assign({}, BASE, {
        splitter: 0.03,
        shield: 0.03,
        bomber: 0.02,
        elite: true,
        berserker: 0.02,
        summoner: 0.015,
      }),
      chaser: {
        id: 'vines',
        name: 'creeping vines',
        warning: 'The vines are creeping after you. They hold on.',
        caught: 'The vines have you',
        speed: 1.05,
        mode: 'root',
        damage: 10,
        knockback: 3,
        root: 3,
      },
      palette: {
        accent: '#7dff9b',
        sky: ['#000401', '#020a04', '#04120a', '#071c10', '#0b2a18'],
        wall: '#010601',
        wallEdge: '#1c5c30',
        windows: ['#7dff9b', '#3f9a67', '#d8ffe4'],
        sign: ['#7dff9b', '#ffd23c', '#3f9a67'],
        rain: '#7dff9b',
        ground: '#7dff9b',
      },
    },
    {
      id: 'orbital',
      name: 'Orbital Relay',
      tagline: 'Low gravity, long falls.',
      roster: Object.assign({}, BASE, {
        bomber: 0.03,
        splitter: 0.03,
        shield: 0.04,
        sniper: 1,
        juggernaut: 0.02,
        summoner: 0.015,
      }),
      chaser: {
        id: 'blackhole',
        name: 'black hole',
        warning: 'A black hole is eating the station. Nothing comes back out.',
        caught: 'The black hole took you',
        speed: 0.75,
        mode: 'lethal',
        damage: 0,
        knockback: 0,
      },
      palette: {
        accent: '#9b7bff',
        sky: ['#000004', '#04020c', '#08051a', '#0f0a2a', '#16103d'],
        wall: '#02010a',
        wallEdge: '#2a1f63',
        windows: ['#9b7bff', '#3cf2ff', '#ffffff'],
        sign: ['#9b7bff', '#ff2e88', '#3cf2ff'],
        rain: '#9b7bff',
        ground: '#9b7bff',
      },
    },
    {
      id: 'kernel',
      name: 'Kernel Core',
      tagline: 'The heart of the net. Everything wants you gone.',
      roster: Object.assign({}, BASE, {
        bomber: 0.03,
        splitter: 0.03,
        shield: 0.05,
        sniper: 1,
        brute: 0.6,
        bruteMax: 3,
        elite: true,
        juggernaut: 0.025,
        berserker: 0.02,
        summoner: 0.02,
      }),
      chaser: {
        id: 'purge',
        name: 'purge',
        warning: 'The kernel is purging everything behind you. One touch deletes you.',
        caught: 'You were purged',
        speed: 0.85,
        mode: 'lethal',
        damage: 0,
        knockback: 0,
      },
      palette: {
        accent: '#ff2e88',
        sky: ['#060001', '#120004', '#1e0008', '#2c000d', '#3d0013'],
        wall: '#080002',
        wallEdge: '#5c0f28',
        windows: ['#ff2e88', '#ff5aa5', '#ffffff'],
        sign: ['#ff2e88', '#ffd23c', '#ff5aa5'],
        rain: '#ff2e88',
        ground: '#ff2e88',
      },
    },
  ];

  /** Python keywords are always worth a brute; anything else needs length. */
  const KEYWORDS = new Set([
    'def', 'class', 'return', 'import', 'from', 'lambda', 'yield', 'while', 'for', 'elif',
    'else', 'try', 'except', 'finally', 'with', 'async', 'await', 'raise', 'assert',
    'global', 'nonlocal', 'None', 'True', 'False', 'print',
  ]);

  /** Every zone is 3 floors x 3 waves; past zone 10 the zones loop and bite harder. */
  function zoneAt(floor) {
    const t = Math.max(0, floor - 1);
    const zone = ZONES[t % ZONES.length];
    const loop = Math.floor(t / ZONES.length);
    const mul = 1 + loop * 0.4;
    const r = zone.roster;
    return {
      zone,
      loop,
      label: loop ? `${zone.name} ${'+'.repeat(Math.min(loop, 3))}` : zone.name,
      chaser: zone.chaser,
      roster: {
        medic: r.medic,
        cache: r.cache,
        bomber: r.bomber * mul,
        splitter: r.splitter * mul,
        shield: r.shield * mul,
        sniper: r.sniper,
        juggernaut: r.juggernaut * mul,
        berserker: r.berserker * mul,
        summoner: r.summoner * mul,
        brute: Math.min(0.9, r.brute * mul),
        bruteMax: r.bruteMax + loop,
        elite: r.elite,
      },
    };
  }

  /** Word boundaries as [start, end) — matches Python identifiers loosely. */
  function words(text) {
    const out = [];
    const re = /[\p{L}\p{N}_]+/gu;
    let m;
    while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
    return out;
  }

  /**
   * Paint the enemy roster onto a line.
   * Returns an array of kinds, one per character.
   */
  function dress(text, rng, opts) {
    const roster = opts.roster;
    const keywords = opts.keywords || KEYWORDS;
    const kinds = Array.from(text, () => 'grunt');
    const maxBrutes = roster.bruteMax;

    // 1. brutes: whole identifiers that die when you finish the last letter
    let brutes = 0;
    for (const [start, end] of words(text)) {
      if (brutes >= maxBrutes) break;
      const word = text.slice(start, end);
      // whitespace-delimited text (prose, pasted docs) has no identifiers, so
      // fall back on length alone when the "words" are ordinary English
      const worthIt = keywords.has(word) || (roster.elite && word.length >= 4) || opts.byLength && word.length >= 6;
      if (worthIt && rng() < roster.brute) {
        for (let i = start; i < end; i++) kinds[i] = 'brute';
        brutes++;
      }
    }

    const free = (i) => kinds[i] === 'grunt' && /[\p{L}\p{N}]/u.test(text[i]);

    // 2. one sniper, always in the back third
    if (roster.sniper > 0 && rng() < roster.sniper * 0.45) {
      const spots = [];
      for (let i = 0; i < text.length; i++) if (i > text.length * 0.66 && free(i)) spots.push(i);
      if (spots.length) kinds[BL.pick(rng, spots)] = 'sniper';
    }

    // 3. the specialists, at most one of each per line
    const table = [
      ['medic', roster.medic],
      ['cache', roster.cache],
      ['bomber', roster.bomber],
      ['splitter', roster.splitter],
      ['shield', roster.shield],
      ['juggernaut', roster.juggernaut],
      ['berserker', roster.berserker],
      ['summoner', roster.summoner],
    ];
    const seen = new Set();
    for (let i = 0; i < text.length; i++) {
      if (!free(i)) continue;
      const roll = rng();
      let acc = 0;
      for (const [kind, weight] of table) {
        acc += weight;
        if (roll < acc) {
          const repeatable = kind === 'shield' || kind === 'juggernaut';
          if (repeatable || !seen.has(kind)) {
            kinds[i] = kind;
            seen.add(kind);
          }
          break;
        }
      }
    }
    return kinds;
  }

  /** Boss lines: every non-space character is part of the boss health bar. */
  function dressBoss(text) {
    return Array.from(text, (ch) => (ch === ' ' || ch === '\t' || ch === '\n' ? 'grunt' : 'boss'));
  }

  const BOSSES = [
    { id: 'amnesia', name: 'Amnesia', rule: 'The line blanks after a moment. Type it from memory.', fireMul: 0.8 },
    { id: 'metronome', name: 'Metronome', rule: 'Keep an even beat. Every off-beat key costs 2 HP.', fireMul: 0.75 },
    { id: 'mirror', name: 'Mirror', rule: 'Every word is written backwards. Type it as you see it.', fireMul: 0.8 },
  ];
  // `onehand` and `shift` need the word/prose packs; the code corpus always wins
  // in this build, so bosses are limited to the three that survive it.
  function bossFor(floor, rng) {
    return BOSSES[(floor - 1) % BOSSES.length];
  }

  BL.ENEMY = { DAMAGE, TIMING, ZONES, zoneAt, dress, dressBoss, bossFor, words, KEYWORDS };
})(window.BL = window.BL || {});
