/* =========================================================================
   Procedural icons. Every glyph is generated SVG — no asset files.
   Consistent grammar: 24×24 viewBox, 1.75 stroke, round caps/joins.
   icon(name, size?, cls?) → SVG string.
   ========================================================================= */
(function () {
  'use strict';

  const P = {
    flame: `<path d="M12 3c.4 3.2-2.2 4.8-3.5 7A6.4 6.4 0 0 0 12 21a6.4 6.4 0 0 0 3.6-11.1C14 8.4 12.4 6.3 12 3z"/>
            <path d="M12 21a3 3 0 0 0 2.1-5.2c-.9-.8-1.8-1.8-2.1-2.8-.3 1-1.2 2-2.1 2.8A3 3 0 0 0 12 21z"/>`,
    flameDim: `<path d="M12 3c.4 3.2-2.2 4.8-3.5 7A6.4 6.4 0 0 0 12 21a6.4 6.4 0 0 0 3.6-11.1C14 8.4 12.4 6.3 12 3z" stroke-dasharray="2.5 2.5"/>`,
    speaker: `<path d="M4 9.5v5h3l5 4v-13l-5 4H4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/><path d="M17.8 7.2a7.2 7.2 0 0 1 0 9.6"/>`,
    speakerOff: `<path d="M4 9.5v5h3l5 4v-13l-5 4H4z"/><path d="M16 10l5 5M21 10l-5 5"/>`,
    flag: `<path d="M6 21V4"/><path d="M6 4.5c2-1.2 4-1.2 6 0s4 1.2 6 0V13c-2 1.2-4 1.2-6 0s-4-1.2-6 0"/>`,
    flagFill: `<path d="M6 21V4"/><path d="M6 4.5c2-1.2 4-1.2 6 0s4 1.2 6 0V13c-2 1.2-4 1.2-6 0s-4-1.2-6 0z" fill="currentColor" fill-opacity=".25"/>`,
    check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
    cross: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
    info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".4" fill="currentColor"/>`,
    book: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/><path d="M9 7.5h7M9 10.5h5"/>`,
    swap: `<path d="M7 4l-3.5 3.5L7 11"/><path d="M3.5 7.5H17"/><path d="M17 13l3.5 3.5L17 20"/><path d="M20.5 16.5H7"/>`,
    ear: `<path d="M7 14a6 6 0 1 1 10-4.5c0 3-2.5 3.7-2.5 6A3.2 3.2 0 0 1 11 19"/><path d="M10.5 9.6A2.6 2.6 0 0 1 14.6 11"/>`,
    tiles: `<rect x="3.5" y="5" width="7.5" height="6" rx="1.5"/><rect x="13.5" y="5" width="7" height="6" rx="1.5"/><rect x="6.5" y="14" width="8" height="6" rx="1.5"/>`,
    keyboard: `<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h.01M11 11h.01M15 11h.01M7 14.5h10"/>`,
    gap: `<path d="M4 17h16"/><path d="M5 7h4M15 7h4"/><path d="M10.5 7h3" stroke-dasharray="1.5 2.5"/>`,
    pairs: `<circle cx="6.5" cy="7" r="2.6"/><circle cx="17.5" cy="17" r="2.6"/><path d="M9 9.2l6.4 5.8"/>`,
    user: `<circle cx="12" cy="8.2" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>`,
    users: `<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.6 5.6 0 0 1 11 0"/><path d="M15.5 5.8a3.2 3.2 0 0 1 0 5.5"/><path d="M16.8 14.4a5.6 5.6 0 0 1 3.7 5.1"/>`,
    trophy: `<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 5H4.5v1A3.5 3.5 0 0 0 8 9.5M16 5h3.5v1A3.5 3.5 0 0 1 16 9.5"/><path d="M12 13v4M8.5 20h7M10 17h4"/>`,
    gear: `<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>`,
    chevR: `<path d="M9 5.5l6.5 6.5L9 18.5"/>`,
    chevL: `<path d="M15 5.5L8.5 12 15 18.5"/>`,
    edit: `<path d="M14.5 5.5l4 4L8 20H4v-4L14.5 5.5z"/><path d="M12.5 7.5l4 4"/>`,
    download: `<path d="M12 4v11M7.5 11l4.5 4.5L16.5 11"/><path d="M4.5 19.5h15"/>`,
    upload: `<path d="M12 19V8M7.5 12L12 7.5 16.5 12"/><path d="M4.5 4.5h15"/>`,
    sparkle: `<path d="M12 4l1.6 4.9L19 10.5l-5.4 1.6L12 17l-1.6-4.9L5 10.5l5.4-1.6L12 4z"/>`,
    bolt: `<path d="M13 3L5.5 13.5h5L11 21l7.5-10.5h-5L13 3z"/>`,
    home: `<path d="M4.5 11L12 4l7.5 7"/><path d="M6.5 9.5V20h11V9.5"/><path d="M10 20v-5.5h4V20"/>`,
    cards: `<rect x="4" y="6.5" width="12" height="14" rx="2"/><path d="M8.5 3.5H18a2 2 0 0 1 2 2V17"/><path d="M7.5 11h5"/>`,
    leaf: `<path d="M5 19C5 9 12 5 20 4.5 19.5 13 15 19 7 19"/><path d="M5 19c3-5 7-8.5 11-10.5"/>`,
    sea: `<path d="M3 9.5c2.2 0 2.2 1.8 4.5 1.8S9.8 9.5 12 9.5s2.2 1.8 4.5 1.8S18.8 9.5 21 9.5"/><path d="M3 14.5c2.2 0 2.2 1.8 4.5 1.8s2.3-1.8 4.5-1.8 2.2 1.8 4.5 1.8 2.3-1.8 4.5-1.8"/>`,
    skip: `<path d="M5.5 5.5L13 12l-7.5 6.5V5.5z"/><path d="M17.5 5.5v13"/>`,
    note: `<path d="M5 4.5h14v12l-4 4H5v-16z"/><path d="M15 20.5v-4h4"/><path d="M8.5 9h7M8.5 12.5h5"/>`,
    refresh: `<path d="M19 12a7 7 0 1 1-2-4.9"/><path d="M17.5 3.5v4h-4"/>`,
    plus: `<path d="M12 5.5v13M5.5 12h13"/>`
  };

  function icon(name, size, cls) {
    size = size || 20;
    const body = P[name] || P.info;
    return `<svg class="ico${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  /* Šahovnica strip: n squares, k of them "lit" — the progress motif.
     Alternates red/cream like the Croatian checkerboard. */
  function sahovnica(n, k, size) {
    size = size || 14;
    const gap = 3;
    const w = n * (size + gap) - gap;
    let cells = '';
    for (let i = 0; i < n; i++) {
      const lit = i < k;
      const isRed = i % 2 === 0;
      const fill = lit ? (isRed ? 'var(--accent-red)' : 'var(--accent-blue)') : 'none';
      const stroke = lit ? 'none' : 'var(--line)';
      cells += `<rect x="${i * (size + gap)}" y="0" width="${size}" height="${size}" rx="3"
        fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    }
    return `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}" aria-hidden="true">${cells}</svg>`;
  }

  /* Procedural avatar: initial in a tinted roundel, hue chosen per profile. */
  function avatar(name, hue, size) {
    size = size || 36;
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="hsl(${hue} 45% 88%)" stroke="hsl(${hue} 40% 55%)" stroke-width="1.5"/>
      <text x="20" y="26.5" text-anchor="middle" font-family="Iowan Old Style, Palatino Linotype, Georgia, serif"
        font-size="19" font-weight="600" fill="hsl(${hue} 45% 30%)">${initial}</text>
    </svg>`;
  }

  window.CRO = window.CRO || {};
  CRO.icons = { icon, sahovnica, avatar, names: Object.keys(P) };
})();
