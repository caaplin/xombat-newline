/*
 * cards.js — the upgrade deck.
 *
 * After each floor you pick one of three. The modifiers are the original's:
 * they stack where it makes sense and each one is a real trade-off, because a
 * run that never ends only gets harder.
 */
(function (BL) {
  'use strict';

  const CARDS = [
    {
      id: 'glass',
      name: 'Glass cannon',
      text: 'All points x3. Any miss ends the run.',
      apply(m) {
        m.scoreMul *= 3;
        m.glass = true;
      },
    },
    {
      id: 'heartbeat',
      name: 'Heartbeat',
      text: 'Keep an even rhythm: every 12 steady keys heal 2 HP.',
      apply(m) {
        m.heartbeat = true;
      },
    },
    {
      id: 'fog',
      name: 'Low bandwidth',
      text: 'You only see 5 characters ahead. All points x1.6.',
      apply(m) {
        m.fog = 5;
        m.scoreMul *= 1.6;
      },
    },
    {
      id: 'vampire',
      name: 'Leech',
      stacks: true,
      text: 'Clean words heal 3 HP more. Misses hurt 50% more.',
      apply(m) {
        m.wordHeal += 3;
        m.missDmgMul *= 1.5;
      },
    },
    {
      id: 'wet',
      name: 'Lag spike',
      stacks: true,
      text: 'The trace moves 15% slower. All points x0.85.',
      apply(m) {
        m.fireMul *= 0.85;
        m.scoreMul *= 0.85;
      },
    },
    {
      id: 'keg',
      name: 'Zero-day',
      stacks: true,
      text: 'Cache hits pay x4 instead of x2, but a miss on one costs 12 HP.',
      apply(m) {
        m.minePointsMul = 4;
        m.mineDmg = 12;
      },
    },
    {
      id: 'longfuse',
      name: 'Proxy chain',
      stacks: true,
      text: 'Carry up to 6 more characters of lead into the next line.',
      apply(m) {
        m.leadCarryMax += 6;
      },
    },
    {
      id: 'tempered',
      name: 'Hotfix',
      stacks: true,
      text: 'Broken keys repair after 20 clean characters instead of 30.',
      apply(m, game) {
        game.keys.repairStreak = Math.max(10, game.keys.repairStreak - 10);
      },
    },
    {
      id: 'medic',
      name: 'Reboot',
      sticks: true,
      text: 'Heal to full now.',
      apply(m, game) {
        game.hp = game.maxHp;
      },
    },
    {
      id: 'accelerant',
      name: 'Overclock',
      stacks: true,
      text: 'The trace moves 20% faster. All points x1.5.',
      apply(m) {
        m.fireMul *= 1.2;
        m.scoreMul *= 1.5;
      },
    },
  ];

  function defaultMods() {
    return {
      scoreMul: 1,
      fireMul: 1,
      missDmgMul: 1,
      minePointsMul: 2,
      mineDmg: 8,
      wordHeal: 1,
      leadCarryMax: 10,
      glass: false,
      heartbeat: false,
      fog: 0,
    };
  }

  BL.CARDS = CARDS;
  BL.defaultMods = defaultMods;
})(window.BL = window.BL || {});
