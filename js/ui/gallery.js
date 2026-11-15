/*
 * gallery.js — every image asset that shipped with the original site.
 *
 * The game itself only needs a few of these (the key art, the favicon), but the
 * whole set was pulled down, so it is browsable here instead of sitting in the
 * repo unseen. Thumbnails lazy-load; click for the full image.
 */
(function (BL) {
  'use strict';

  const GROUPS = [
    {
      id: 'burnline',
      title: 'Burnline',
      blurb: 'key art and social card for this game',
      items: [
        ['assets/art/key-art.jpg', 'key art'],
        ['assets/og.jpg', 'social card'],
      ],
    },
    {
      id: 'icons',
      title: 'Pixel icons',
      blurb: 'the 64px glyph set from the site chrome',
      items: [
        'check', 'eye', 'handshake', 'lead', 'megaphone', 'openbook', 'pdf', 'phoneperson',
        'pin', 'qr', 'report', 'shield', 'speech', 'stand', 'ticket', 'walk',
      ].map((n) => ['assets/img/icons/' + n + '.png', n]),
    },
    {
      id: 'sheets',
      title: 'Sprite sheets',
      blurb: 'illustration atlases, 1200-1536px',
      items: [
        ['assets/img/icons/chatty-retro-generated-alpha-v3.png', 'chatty atlas'],
        ['assets/img/icons/pxlbots-retro-generated-alpha-v3.png', 'pxlbots atlas'],
        ['assets/img/icons/hexarun-retro-generated-alpha-v3.png', 'hexarun atlas'],
        ['assets/img/icons/tutor-retro-generated-alpha-v2.png', 'tutor atlas'],
        ['assets/img/icons/chatty-edu-illustrations-generated-alpha-v4.png', 'edu atlas'],
      ],
    },
    {
      id: 'hexarun',
      title: 'Hexarun',
      blurb: 'robot racing',
      items: [
        'hexrun-promo', 'racing', 'duel', 'crowd', 'crowd-2', 'festival', 'indoor', 'kid',
        'tent', 'track-scheme', 'event-promo4-poster',
      ].map((n) => ['assets/img/hexarun/' + n + '.jpg', n.replace(/-/g, ' ')]),
    },
    {
      id: 'pxlbots',
      title: 'PXLbots',
      blurb: 'the build kits',
      items: [
        'action', 'battery', 'case', 'controller', 'cubes', 'driver', 'motors', 'sonar',
        'builds-poster', 'magnets-poster', 'outdoor-poster', 'turntable-poster',
        'pxlbots-promo',
      ].map((n) => ['assets/img/pxlbots/' + n + '.jpg', n.replace(/-/g, ' ')]),
    },
    {
      id: 'chatty',
      title: 'Chatty',
      blurb: 'the tutor line-up and its screens',
      items: [
        ['assets/img/chatty.png', 'chatty hero'],
        ['assets/img/chatty/trio-promo4.jpg', 'trio'],
        ['assets/img/chatty/lineup-promo4.jpg', 'line-up'],
        ['assets/img/chatty/yellow-promo4.jpg', 'yellow'],
        ['assets/img/chatty/edu2.jpg', 'edu'],
        ['assets/img/chatty/centr.jpg', 'centre'],
        ['assets/img/chatty/promprom.jpg', 'prom'],
        ['assets/img/chatty/tutor-workspace-promo4.jpg', 'tutor workspace'],
        ['assets/img/chatty/edu-demo.jpg', 'edu demo'],
        ['assets/img/chatty/promo-qr.jpg', 'qr'],
        ['assets/img/chatty/ui-habit-editor.jpg', 'ui: habit'],
        ['assets/img/chatty/ui-mimic-editor.jpg', 'ui: mimic'],
        ['assets/img/chatty/ui-move-editor.jpg', 'ui: move'],
        ['assets/img/chatty/ui-scenario-editor.jpg', 'ui: scenario'],
        ['assets/img/chatty/ui-system-instruction.jpg', 'ui: system'],
        ['assets/img/chatty/rocky-poster.jpg', 'rocky'],
        ['assets/img/chatty/promo4-poster.jpg', 'promo'],
        ['assets/img/chatty/reel-poster.jpg', 'reel'],
        ['assets/img/chatty/tutor-promo4-poster.jpg', 'tutor promo'],
        ['assets/img/chatty/edu-greeting-generated-alpha-v4.png', 'edu greeting'],
        ['assets/img/chatty/promo-chatty-mall-bg-v2.png', 'mall bg'],
      ],
    },
    {
      id: 'brand',
      title: 'Brand and partners',
      blurb: 'logos and the mode cards',
      items: [
        ['assets/img/logo.svg', 'logo'],
        ['assets/img/icon-chatty-180.png', 'app icon'],
        ['assets/img/mode-ad.jpg', 'mode: ad'],
        ['assets/img/mode-edu.jpg', 'mode: edu'],
        ['assets/img/mode-fun.jpg', 'mode: fun'],
        ['assets/img/pxlbots-hero.jpg', 'pxlbots hero'],
        ['assets/img/partners/partner-gorobo.svg', 'gorobo'],
        ['assets/img/partners/partner-robotex-transparent-v2.png', 'robotex'],
        ['assets/img/partners/partner-skolkovo.png', 'skolkovo'],
        ['assets/img/partners/partner-sosnovoborsky.svg', 'sosnovoborsky'],
        ['assets/img/partners/partner-spbguptd.svg', 'spbguptd'],
        ['assets/img/partners/partner-technopark-spb.svg', 'technopark'],
      ],
    },
    {
      id: 'events',
      title: 'Events',
      blurb: 'covers and photos',
      items: [
        ['assets/media/events/covers/dronfest-2026-cover.jpg', 'dronfest 2026'],
        ['assets/media/events/covers/tekhnovektor-2025-cover.jpg', 'tekhnovektor 2025'],
        ['assets/media/events/covers/samyy-bolshoy-semeynyy-festival-2025-cover-v2.jpg', 'family festival'],
        ['assets/media/events/covers/spasem-zhivotnykh-sevkabel-port-2025-cover.jpg', 'sevkabel port'],
        ['assets/media/events/covers/ii-sammit-obrazovatelnoe-oborudovanie-2025-cover.jpg', 'education summit'],
        ['assets/media/events/photos/dronfest-2026-1.jpg', 'dronfest 1'],
        ['assets/media/events/photos/dronfest-2026-2.jpg', 'dronfest 2'],
        ['assets/media/events/photos/dronfest-2026-3.jpg', 'dronfest 3'],
        ['assets/media/events/photos/dronfest-2026-4.jpg', 'dronfest 4'],
        ['assets/media/events/photos/dronfest-2026-5.jpg', 'dronfest 5'],
      ],
    },
    {
      id: 'thumbs',
      title: 'Venue',
      blurb: 'thumbnails from the events pages',
      items: ['venue-1', 'venue-2', 'venue-3', 'venue-4', 'venue-5', 'venue-6'].map((n) => [
        'assets/img/thumbs/' + n + '.jpg',
        n.replace('-', ' '),
      ]),
    },
  ];

  let built = false;

  function build() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    const html = GROUPS.map((g) => {
      const tiles = g.items
        .map(
          ([src, label]) =>
            '<button type="button" class="tile-img" data-src="' + src + '" data-label="' +
            escapeAttr(label) + '"><img loading="lazy" src="' + src + '" alt="' +
            escapeAttr(label) + '" /><span>' + escapeAttr(label) + '</span></button>'
        )
        .join('');
      return (
        '<section class="gallery-group"><h3>' + g.title + '</h3><p>' + g.blurb +
        '</p><div class="gallery-strip">' + tiles + '</div></section>'
      );
    }).join('');
    grid.innerHTML = html;
    grid.addEventListener('click', (ev) => {
      const tile = ev.target.closest('.tile-img');
      if (!tile) return;
      openLightbox(tile.dataset.src, tile.dataset.label);
    });
    built = true;
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function openLightbox(src, label) {
    const box = document.getElementById('lightbox');
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox-cap').textContent = label + ' — ' + src;
    box.hidden = false;
  }

  function closeLightbox() {
    document.getElementById('lightbox').hidden = true;
    document.getElementById('lightbox-img').src = '';
  }

  function open() {
    if (!built) build();
    document.getElementById('gallery').hidden = false;
  }
  function close() {
    document.getElementById('gallery').hidden = true;
  }

  function init() {
    document.getElementById('btn-gallery').addEventListener('click', open);
    document.getElementById('btn-gallery-close').addEventListener('click', close);
    document.getElementById('lightbox').addEventListener('click', closeLightbox);
    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (!document.getElementById('lightbox').hidden) return closeLightbox();
      if (!document.getElementById('gallery').hidden) close();
    });
    const count = GROUPS.reduce((n, g) => n + g.items.length, 0);
    const note = document.getElementById('gallery-note');
    if (note) note.textContent = count + ' images — every asset from the original site, bundled locally';
  }

  BL.gallery = { init, open, close, GROUPS };
})(window.BL = window.BL || {});
