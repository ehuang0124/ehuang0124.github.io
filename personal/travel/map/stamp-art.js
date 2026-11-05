/* Postcard stamp plates for /personal/travel/map/.
   Each destination gets an editorial one-ink vignette of a well-known landscape,
   flower, figure or building. Every drawing is built from the same four tonal
   steps (t-1 darkest … t-4 lightest) so the whole collection reads as one
   monochrome engraved series. Motifs are editorial shorthand, never a claim
   about official national symbols or exhaustive coverage. See README.md. */
(() => {
  'use strict';

  const KINDS = ['風景', '花草', '人文', '建築'];
  const GROUND = '<path d="M4 49h92M11 53h78"/>';
  const STEM = '<path d="M50 49V28m0 12q-12-11-19-3 8 11 19 5m0-6q12-11 19-3-8 11-19 5"/>';

  // A botanical plate: light ground + bud marks, mid-tone stem, dark blossom.
  function bloom(head, extra = '') {
    return [GROUND + '<circle cx="82" cy="14" r="5"/>', STEM + extra, head];
  }
  function petals(d, count, cx = 50, cy = 22) {
    let out = '';
    for (let i = 0; i < count; i++) out += `<path d="${d}" transform="rotate(${(360 / count) * i} ${cx} ${cy})"/>`;
    return out;
  }
  const DOT = '<circle cx="50" cy="22" r="2.2" class="f"/>';
  const ROUND = 'M50 22Q41 16 45 8Q50 3 55 8Q59 16 50 22Z';
  const NOTCH = 'M50 22Q41 15 45 7l3 4 2-5 2 5 3-4q4 8-5 15Z';
  const POINTED = 'M50 22Q42 14 50 4Q58 14 50 22Z';
  const BROAD = 'M50 22Q38 16 43 7Q50 2 57 7Q62 16 50 22Z';
  const PINWHEEL = 'M50 22Q40 18 43 8Q52 5 54 13Q56 19 50 22Z';
  const NARROW = 'M50 22Q46 12 50 4Q54 12 50 22Z';
  const WOOLLY = 'M50 22Q41 16 44 8l3 3 3-6 3 6 3-3q3 8-6 14Z';

  // Each plate is [light, mid, dark]. All strokes inherit currentColor.
  const ART = {
    /* ---------- 風景 / landscape ---------- */
    fuji: [
      '<path d="M4 49h92M11 53h78"/><path d="M10 18q9-5 17 0m46-4q9-5 17 0"/>',
      '<path d="M6 47 39 13Q50 5 61 13l33 34Z"/>',
      '<path d="M38 15q12-8 24 0l-4 3-4-3-4 3-4-3-4 3Zm2 8 5 7-3 3m14 1 5 8-4 2M6 47h88"/>'
    ],
    snowpeak: [
      '<path d="M4 49h92M11 53h78"/><path d="M12 15q10-5 19 0m39-3q9-5 18 0"/>',
      '<path d="m5 47 24-30 12 13 14-20 15 17 10-11 15 31Z"/>',
      '<path d="m20 26 9-9 8 8-6-2-4 3-4-2Zm26-4 9-11 9 11-6-2-4 3-4-2ZM13 47v-8m0 3-4-3m4 0 4-3M84 47v-9m0 3-4-3m4 0 4-3M4 49h92"/>'
    ],
    mountain: [
      '<path d="M4 49h92M10 53h80"/><path d="M8 42q12-5 24 0t24 0 24 0"/>',
      '<path d="m6 47 25-30 14 17 12-14 37 27Z"/>',
      '<path d="m24 26 7-9 8 9-7-3-4 3Zm28 1 6-7 7 8-6-3-3 2ZM4 49h92"/>'
    ],
    canyon: [
      '<path d="M5 49h90M8 53h84"/>',
      '<path d="M6 47V22l12 4 10-6 12 8 12-9 12 8 12-6 12 5 6-3v24Z"/>',
      '<path d="M6 30q16 3 32 0t32 0 26 0M6 38q16 3 32 0t32 0 26 0M14 24l4 5m16-6 4 6m18-4 4 6m18-3 4 6M4 49h92"/>'
    ],
    hoodoos: [
      '<path d="M4 49h92M10 53h80"/>',
      '<path d="m14 49 2-20 4-5-3-4 7-6 7 6-3 4 4 25Zm19 0 2-27 5-5-3-5 8-6 8 6-3 5 5 32Zm24 0 2-18 4-5-3-4 7-6 8 6-3 4 4 23Zm23 0 1-14 4-4-2-3 6-5 7 5-3 4 3 17Z"/>',
      '<path d="M18 24h12m7-12h14m10 12h13M4 49h92"/>'
    ],
    arch: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M8 49Q9 16 29 13q17 0 22 24 6-24 22-24 20 3 20 36"/>',
      '<path d="M26 49q1-15 10-17 8 0 10 9m2 8q2-13 10-13 8 0 9 13M4 49h92"/>'
    ],
    geyser: [
      '<path d="M6 49h88M12 53h76"/><path d="M20 44q10-5 20 0t20 0 20 0"/>',
      '<path d="M50 46q-9-10 0-19 9 9 0 19Zm0-20q-7-12 2-20 9 11 1 20m-9 0q-8-8-6-15m20 15q9-8 7-15"/>',
      '<path d="M38 48q-6-7 0-12m24 12q6-7 0-12M50 46v-7M6 49h88"/>'
    ],
    waterfall: [
      '<path d="M4 49h92M10 53h80"/>',
      '<path d="M6 10h27l4 12v22l-6 5M94 10H67l-4 12v22l6 5"/>',
      '<path d="M37 12v27l-2 8 5 3M43 12v27l-2 8 4 3M49 12v27l-1 8 3 3M55 12v27l-2 8 4 3M61 12v27l-2 8 5 3M4 49q12-6 24 0t24 0 24 0"/>'
    ],
    fjord: [
      '<path d="M4 46h92M10 50h80M14 54h72"/>',
      '<path d="M6 45 20 12l10 12 8-9 12 22 10-16 8 12 9-16 17 28Z"/>',
      '<path d="M28 46q10-4 20 0t20 0M42 33l6-8 6 9-6-2Zm22-3 6-8 6 9-6-2ZM4 46h92"/>'
    ],
    glacier: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M8 24 30 10l14 12 12-8 14 14 12-8 12 16H8Z"/>',
      '<path d="m20 22 6 8m8-14 4 10m10-6 6 10m8-4 6 10M8 40q20-4 40 0t44 0M6 47h88"/>'
    ],
    aurora: [
      '<path d="M4 49h92M10 53h80"/><circle cx="20" cy="12" r="1" class="f"/><circle cx="72" cy="9" r="1.2" class="f"/><circle cx="84" cy="20" r="1" class="f"/>',
      '<path d="M6 34q16-24 32-4t30-8 26 6M8 40q16-22 32-4t30-7 24 5"/>',
      '<path d="M12 49v-11m0 4-5-4m5 1 5-4M84 49v-13m0 5-5-4m5 1 5-4M46 49v-8m0 3-4-3m4 1 4-3M4 49h92"/>'
    ],
    volcano: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="m7 48 27-32 9 9 8-9 10 10 9-8 23 30Z"/>',
      '<path d="M45 13q-8-8 1-11 9 4 2 11m-9 3q-5-6 1-8m12 8q6-5 2-9M6 49h88"/>'
    ],
    crater: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M7 47q8-26 25-29 18-3 36 0 18 4 25 29"/>',
      '<path d="M14 41q20-9 36-9t36 9M14 41q20 9 36 9t36-9M6 49h88"/>'
    ],
    dunes: [
      '<circle cx="76" cy="16" r="8"/><path d="M4 49h92"/>',
      '<path d="M4 46q18-20 38 0 18-22 40-8 12 5 14 11M4 51q20-12 40 0t40 0"/>',
      '<path d="M20 39q10-7 20-2m34-8q8-3 14 1M4 49h92"/>'
    ],
    wetland: [
      '<path d="M5 45q11-6 22 0t22 0 22 0 22 0M5 50q11-6 22 0t22 0 22 0 22 0"/>',
      '<path d="M22 45V16m0 12-8-9m8 4 8-9M50 45V12m0 14-8-9m8 4 8-9M76 45V18m0 11-7-8m7 4 7-9"/>',
      '<path d="M4 53h92M14 20q5-5 9 0m33-6q5-5 9 0"/>'
    ],
    wave: [
      '<circle cx="76" cy="16" r="9"/><path d="M4 49h92"/>',
      '<path d="M6 38q12-12 24 0t24 0 24 0 18 0M6 45q12-12 24 0t24 0 24 0 18 0"/>',
      '<path d="M30 33q-5-14 12-21 17 9 12 21M42 13v20M14 27q7-9 15-2m46-3q7-9 15-2M4 49h92"/>'
    ],
    coral: [
      '<path d="M4 50h92M10 54h80"/><path d="M8 20q8-5 16 0m52-4q8-5 16 0"/>',
      '<path d="M24 49V30m0 8-8-8m8 2 8-9m-8 14-9-3m9 7 9-4M50 49V22m0 10-8-7m8 1 8-8m-8 15-9-3m9 7 9-4M76 49V32m0 7-7-7m7 2 7-8"/>',
      '<path d="M64 24q9-6 16 0-7 7-16 0Zm0 0-4-3M16 32q6-4 11 0-5 5-11 0ZM4 50h92"/>'
    ],
    cave: [
      '<path d="M4 50h92M10 54h80"/>',
      '<path d="M8 49q2-30 20-34 22-5 44 0 18 4 20 34"/>',
      '<path d="M18 20l4 9 5-7 4 11 5-8 5 10 5-8 5 9 5-10 5 7 4-9M20 49l4-9 4 9m9 0 4-12 4 12m9 0 4-9 4 9m9 0 4-11 4 11"/>'
    ],
    hotspring: [
      '<path d="M4 49h92M10 53h80"/>',
      '<path d="M14 44q8-7 20-5 10-7 22-2 12-4 20 4 8 2 10 8H14Z"/>',
      '<path d="M32 34q-6-8 2-13 8 5 1 13m12 0q-5-9 2-14 8 6 1 14m12 1q-5-7 2-12 7 5 0 12M20 44q12-4 24 0t24 0M4 49h92"/>'
    ],
    lake: [
      '<path d="M4 46h92M10 50h80M14 54h72"/>',
      '<path d="m8 45 22-25 11 12 10-10 12 15 9-8 20 16Z"/>',
      '<path d="M18 48q12-4 24 0t24 0M30 50q10-3 20 0t20 0m-40-30 6-7 6 7-6-2Zm22 2 6-7 6 8-6-2ZM4 46h92"/>'
    ],
    rainforest: [
      '<path d="M4 49h92M10 53h80"/><circle cx="50" cy="14" r="7"/>',
      '<path d="M16 49q-3-18 6-26 12 4 10 26m10 0q-3-24 8-32 12 6 10 32m10 0q-2-16 7-24 11 5 9 24"/>',
      '<path d="M22 23q-9-3-10-11 10-1 10 11Zm0 0q10-5 12-14-11 0-12 14Zm28-6q-10-4-11-13 11 0 11 13Zm0 0q11-5 13-14-12 0-13 14ZM4 49h92"/>'
    ],
    savanna: [
      '<circle cx="78" cy="14" r="9"/><path d="M4 45h92M10 50h80"/>',
      '<path d="M34 45V26M16 25q18-12 36 0M16 25q4-5 18-4 14-1 18 4"/>',
      '<path d="M34 26v19M4 45h92M12 45l3-6m6 6 2-5m9 5 3-6m44 6 3-6m7 6 2-5"/>'
    ],
    terrace: [
      '<circle cx="78" cy="14" r="7"/><path d="M4 49h92"/>',
      '<path d="M6 27q22-6 44 0t44 0M6 35q22-6 44 0t44 0M6 43q22-6 44 0t44 0"/>',
      '<path d="M14 27v4m12-3v4m12-2v3m12-2v3m12 0v3M16 35v4m14-3v4m12-2v3m12-2v3M4 49h92"/>'
    ],
    sun: [
      '<circle cx="50" cy="21" r="11"/><path d="M50 4v5m0 24v5M30 21h-5m50 0h-5M36 7l4 4m20 20 4 4m0-28-4 4M41 34l-4 4"/>',
      '<path d="M6 40q11-8 22 0t22 0 22 0 22 0"/>',
      '<path d="M6 47q11-8 22 0t22 0 22 0 22 0M4 52h92"/>'
    ],

    /* ---------- 花草 / flora ---------- */
    sakura: bloom(petals(NOTCH, 5) + DOT, '<path d="M32 18q-5-4-9-1m46-2q5-5 10-2"/>'),
    plum: bloom(petals(ROUND, 5) + DOT + '<path d="M50 22l-4-6m4 6 4-6m-4 6v-8"/>'),
    hibiscus: bloom(petals(BROAD, 5) + '<path d="M50 22V9"/><circle cx="50" cy="9" r="1.4" class="f"/>'),
    plumeria: bloom(petals(PINWHEEL, 5) + DOT),
    lotus: [
      '<path d="M4 49h92M8 44q14-6 28 0t28 0 28 0M16 48q10-4 20 0"/>',
      '<path d="M50 44V26m-18 18q-4-10 8-12 8 3 8 12m20 0q0-10-8-12-12 2-8 12"/>',
      petals(POINTED, 7) + '<path d="M42 24h16M4 49h92"/>'
    ],
    rose: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      STEM,
      '<path d="M50 30q-12-2-12-10 0-9 12-9t12 9q0 8-12 10Zm-6-10q3-6 8-3 4 4 0 8-5 3-8-2m8-3q-5-3-6 3 0 5 5 4"/>'
    ],
    sunflower: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      STEM,
      petals(NARROW, 12) + '<circle cx="50" cy="22" r="6"/><path d="M46 22h8m-4-4v8"/>'
    ],
    edelweiss: bloom(petals(WOOLLY, 7) + DOT + '<circle cx="45" cy="22" r="1" class="f"/><circle cx="55" cy="22" r="1" class="f"/>'),
    protea: bloom(petals(POINTED, 12) + '<circle cx="50" cy="22" r="5"/><circle cx="50" cy="22" r="2" class="f"/>'),
    magnolia: bloom(petals('M50 22Q42 15 46 4Q50 0 54 4Q58 15 50 22Z', 6) + DOT),
    tulip: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      '<path d="M34 49V24m32 25V27M50 49V16m-16 22q-13-6-14-17 13 1 14 17m32 3q12-8 12-19-13 0-12 19"/>',
      '<path d="M34 24q-8-2-7-10 3-3 6 0 1-5 5-5 4 0 5 5 3-3 6 0 1 8-7 10Zm32 3q-7-2-6-9 3-3 5 0 1-4 4-4 4 0 5 4 3-3 5 0 1 7-6 9Zm-16-11q-8-2-7-10 3-3 6 0 1-5 5-5 4 0 5 5 3-3 6 0 1 8-7 10Z"/>'
    ],
    lavender: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      '<path d="M36 49V20m14 29V14m14 29V22m-28 14q-9-6-11-14m39 9q9-6 11-14"/>',
      (() => {
        let out = '';
        for (const [cx, top] of [[36, 16], [50, 10], [64, 18]]) {
          for (let i = 0; i < 5; i++) {
            const y = top + i * 4;
            out += `<ellipse cx="${cx - 3}" cy="${y}" rx="2.1" ry="2.9"/><ellipse cx="${cx + 3}" cy="${y + 2}" rx="2.1" ry="2.9"/>`;
          }
        }
        return out;
      })()
    ],
    thistle: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      STEM,
      '<path d="M50 30q-11-2-12-12 4-2 6 1-2-7 2-10 3 3 3 7 1-7 4-9 2 5 1 9 4-4 7-2-1 12-11 16Zm-12-12-5-3m5 8-6 1m30-6 5-3m-5 8 6 1"/>'
    ],
    shamrock: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      '<path d="M50 49V27m0 5q-6 2-10 6"/>',
      '<path d="M50 27q-12-14-18-7 0 9 18 9Zm0 2q12-14 18-7 0 9-18 9Zm0-6q-9-16 0-19 9 3 0 19Z"/>'
    ],
    maple: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      '<path d="M50 49V32m0 6-6-4m6 4 6-4"/>',
      '<path d="M50 8l5 8 10-3-4 9 8 5-9 3 1 10-11-5-11 5 1-10-9-3 8-5-4-9 10 3Zm0 6v18"/>'
    ],
    fern: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      '<path d="M14 49Q42 32 84 8"/>',
      (() => {
        let leaflets = '';
        for (let i = 1; i <= 9; i++) {
          const t = i / 10, x = 14 + 70 * t, y = 49 - 41 * t * t;
          leaflets += `<path d="M${x} ${y}q-4-8-11-9m11 9q-1-9 6-12"/>`;
        }
        return leaflets;
      })()
    ],
    cactus: [
      '<path d="M4 49h92M11 53h78"/><circle cx="80" cy="13" r="6"/>',
      '<path d="M44 49V17q0-7 6-7t6 7v10h8V14q0-6 5-6t5 6v17q0 7-8 7h-6v11M44 31H32v-7q0-6-5-6t-5 6v15q0 7 8 7h14"/>',
      '<path d="M46 15h8m30-2h8M4 49h92M50 9v4"/>'
    ],
    joshua: [
      '<path d="M4 49h92M11 53h78"/><circle cx="80" cy="13" r="6"/>',
      '<path d="M47 49V22q0-6 5-6t5 6v9l8-9q3-3 6 0l-2 9 7-5M47 31l-9-9q-3-3-6 0l2 9-8-4"/>',
      '<path d="M52 14l-2-7m2 7 4-6m-4 6v-9M63 21l3-8m-3 8 7-4M38 22l-4-7m4 7-7-3M4 49h92"/>'
    ],
    redwood: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M28 49V13q6-7 11 0v36m20 0V8q6-7 12 0v41M28 22h11m20-8h12M40 49V27q4-4 8 0v22"/>',
      '<path d="M34 13V9m29-1v-4M4 49h92M14 49q6-4 12 0m50 0q6-4 12 0"/>'
    ],
    palm: [
      '<path d="M4 49h92M11 53h78"/><circle cx="80" cy="14" r="6"/>',
      '<path d="M48 49q2-20 6-34m-6 34q4-4 10-6m-10 6q-5-3-9-1m15-33q-8-11-20-6 8 8 20 6Zm0 0q-4-13 6-18 6 10-6 18Zm0 0q10-10 20-4-8 9-20 4Zm0 0q8-4 14 2-9 5-14-2Zm0 0q-10-2-14 5 9 3 14-5Z"/>',
      '<path d="M4 49h92M44 49q4 3 9 0"/>'
    ],
    bamboo: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M30 49V8m0 12h9m-9 12h9m-9 12h9M52 49V14m0 11h9m-9 12h9M72 49V20m0 10h8"/>',
      '<path d="M30 20q-11-6-16-2 7 7 16 2m0 0q-8-9-4-14 8 6 4 14m22 0q11-6 16-2-7 7-16 2m0 0q8-9 4-14-8 6-4 14M72 30q9-6 14-2-6 6-14 2"/>'
    ],
    rice: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M50 49V14M38 49V24m24 25V26M50 30q-9-8-14-6m14 6q9-9 14-6"/>',
      (() => {
        let out = '<path d="M50 14v-5"/>';
        for (let i = 0; i < 7; i++) {
          const y = 16 + i * 4.5, side = i % 2 ? 1 : -1, cx = 50 + side * 7;
          out += `<ellipse cx="${cx}" cy="${y}" rx="2.5" ry="3.2" transform="rotate(${side * 25} ${cx} ${y})"/>`;
        }
        return out + '<path d="M4 49h92"/>';
      })()
    ],
    grape: [
      GROUND + '<path d="M8 15q9-6 17 0"/>',
      '<path d="M50 49V17q-9-9-18-6 6 10 18 8m0-2q10-9 19-5-6 9-19 7"/>',
      (() => {
        const rows = [[0, 3], [-6, 3], [0, 2], [-3, 1]];
        let out = '<path d="M50 22v5"/>';
        rows.forEach(([offset, count], row) => {
          for (let i = 0; i < count; i++) out += `<circle cx="${44 + offset + i * 6}" cy="${29 + row * 6}" r="3.1"/>`;
        });
        return out + '<path d="M4 49h92"/>';
      })()
    ],
    coffee: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      '<path d="M50 49V12m0 14q-12-12-20-6 6 12 20 9m0-6q12-12 20-6-6 12-20 9"/>',
      '<circle cx="38" cy="29" r="3.4"/><circle cx="62" cy="29" r="3.4"/><circle cx="44" cy="38" r="3.4"/><circle cx="58" cy="38" r="3.4"/><path d="M38 26v6m24-6v6m-18 3v6m10-6v6"/>'
    ],
    tea: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      '<path d="M50 49V14m0 16q-13-10-21-4 8 11 21 8m0-4q13-10 21-4-8 11-21 8"/>',
      '<path d="M29 26q10 1 21-8m0 4q11 9 21 8M50 14q-3-6 0-9 3 3 0 9Z"/>'
    ],
    olive: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      '<path d="M50 49V16m0 16q-12-10-20-4 7 10 20 8m0-5q12-10 20-4-7 10-20 8"/>',
      '<ellipse cx="36" cy="30" rx="3" ry="4"/><ellipse cx="64" cy="30" rx="3" ry="4"/><ellipse cx="43" cy="40" rx="3" ry="4"/><ellipse cx="58" cy="40" rx="3" ry="4"/>'
    ],
    pine: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M50 8 34 27h9l-11 15h36L57 27h9Zm0 34v7M24 49V29l8 10 8-10v20"/>',
      '<path d="M50 8v41M4 49h92M42 34h16M38 42h24"/>'
    ],
    birch: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M34 49V8q0-4 5-4t5 4v41m18 0V12q0-4 5-4t5 4v37"/>',
      '<path d="M34 18h9m-9 12h9m-9 12h9m18-26h9m-9 12h9M39 4q-8-3-10 3 8 3 10 1m0 0q8-4 11 1-7 4-11 2m18-7q-7-3-9 2 7 3 9 1"/>'
    ],
    wheat: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M50 49V16m-14 25 6-8m8 3-6-8"/>',
      (() => {
        let out = '<path d="M50 16v-6"/>';
        for (let i = 0; i < 7; i++) {
          const y = 14 + i * 4.6;
          out += `<ellipse cx="44" cy="${y}" rx="2.3" ry="3.1" transform="rotate(-30 44 ${y})"/><ellipse cx="56" cy="${y}" rx="2.3" ry="3.1" transform="rotate(30 56 ${y})"/>`;
        }
        return out + '<path d="M4 49h92"/>';
      })()
    ],

    /* ---------- 人文 / people, culture, fauna ---------- */
    geisha: [
      '<path d="M4 49h92M11 53h78"/><circle cx="80" cy="13" r="6"/>',
      '<circle cx="50" cy="19" r="8"/><path d="M42 19q-2-12 8-12t8 12q-4-6-8-6t-8 6ZM50 28q-16 2-18 20h36q-2-18-18-20Zm-18 4q-10 2-10 12 6 4 12 0m34-12q10 2 10 12-6 4-12 0"/>',
      '<circle cx="50" cy="8" r="4"/><path d="M44 29l6 8 6-8M34 40h32M46 20h1m7 0h1m-5 5q2 2 4 0M70 32q10-8 16-2-6 9-16 2Zm16-2-8-4m8 4-7 5"/>'
    ],
    flamenco: [
      '<path d="M4 49h92M11 53h78"/>',
      '<circle cx="50" cy="15" r="5"/><path d="M46 20v12m8-12v12M40 46q-14-4-16-12 8-6 16-2 6-8 10-8t10 8q8-4 16 2-2 8-16 12Z"/>',
      '<circle cx="50" cy="9" r="3"/><path d="M46 22 36 8m18 14 10-14M40 38q10 4 20 0m-16 5q6 3 12 0M74 8q10-4 12 4-8 6-12-4Z"/>'
    ],
    gondola: [
      '<path d="M4 46q12-5 24 0t24 0 24 0 24 0M4 51q12-5 24 0t24 0 24 0 24 0"/>',
      '<path d="M10 40q22 12 48 12t32-12l-6 6q-12 8-26 8T26 46Zm60-4q-8 2-16 1 4-5 9-6"/>',
      '<path d="M40 40V16m0 8q-6-3-8 1 4 4 8 1m0 0q6-5 10-1-4 5-10 1m-1-9q-4-4 0-6 4 2 0 6ZM18 36l56-20M4 46h92"/>'
    ],
    piper: [
      '<path d="M4 49h92M11 53h78"/>',
      '<circle cx="44" cy="18" r="6"/><path d="M38 46V28q0-6 6-6t6 6v18Zm-4-8h20l3 10H31Zm14-10q10-2 12 6 0 6-10 6"/>',
      '<path d="M50 20l2-12m2 12 6-10M56 8V3m4 8V5m2 8V7M40 40h14m-14 4h14M36 46v4m14-4v4M42 12q6-6 12 0"/>'
    ],
    mermaid: [
      '<path d="M4 49h92M11 53h78"/><path d="M8 44q10-5 20 0t20 0 20 0 20 0"/>',
      '<path d="M30 44q10-4 20 0t20 0"/><circle cx="50" cy="20" r="5"/><path d="M46 26q-4 8 0 14 6 4 10 0 4-6 0-14Z"/>',
      '<path d="M45 20q-4-8 3-10 8 0 7 10M44 26q-8 2-6 8m14-8q8 2 6 8M46 38q-10 4-14 0 6-6 14-4m10 4q10 4 14 0-6-6-14-4"/>'
    ],
    terracotta: [
      '<path d="M4 49h92M11 53h78"/>',
      '<circle cx="50" cy="20" r="8"/><path d="M40 18q0-12 10-12t10 12M30 46V32q0-8 20-8t20 8v14Z"/>',
      '<path d="M50 8V4m-4 2 4-2 4 2M45 20h2m6 0h2m-5 6q2 2 4 0M42 26l8 6 8-6M34 34h32M36 38h28M40 42h20"/>'
    ],
    hula: [
      '<path d="M4 49h92M11 53h78"/><circle cx="80" cy="13" r="6"/>',
      '<circle cx="50" cy="15" r="5"/><path d="M46 20q-4 4-2 10l4 4h4l4-4q2-6-2-10ZM38 34q12-4 24 0l6 12H32Z"/>',
      '<path d="M50 10q-4-4 0-6 4 2 0 6ZM44 24q6 4 12 0M36 40q14 4 28 0m-26 4q12 4 24 0M46 22q-10 2-10 10m18-10q10 2 10 10M44 46v3m12-3v3"/>'
    ],
    buddha: [
      '<path d="M4 49h92M11 53h78"/><circle cx="50" cy="20" r="14"/>',
      '<circle cx="50" cy="20" r="8"/><path d="M34 40q4-14 16-14t16 14M24 44q26-8 52 0M28 40q22-8 44 0"/>',
      '<path d="M50 12V6m-4 3h8M45 20h2m6 0h2m-5 5q2 2 4 0M38 36q12 6 24 0M4 49h92"/>'
    ],
    totem: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M38 49V9q12-6 24 0v40M38 16h24m-24 11h24m-24 11h24"/>',
      '<path d="M50 6V2m-6 4 6-3 6 3M42 21h4m8 0h4m-16 4q8 5 16 0M42 32h4m8 0h4m-16 5q8 4 16 0M42 43q8 4 16 0M32 12q6-5 6 2m24-2q-6-5-6 2"/>'
    ],
    balloon: [
      '<path d="M4 49h92M10 53h80"/><path d="M6 44q12-9 24 0t24 0 24 0 16 0"/>',
      '<path d="M50 6q18 0 20 18 1 12-14 18H44Q29 36 30 24 32 6 50 6Zm0 0q-8 12-6 36m6-36q8 12 6 36m-16-18h20"/>',
      '<path d="M44 42l2 6h8l2-6m-10 6v4h8v-4M4 49h92"/>'
    ],
    crane: [
      '<path d="M4 49h92M10 53h80"/><path d="M8 44q11-5 22 0t22 0 22 0 22 0"/>',
      '<path d="M32 44V26q0-8 7-8 6 0 7 7l2-12q1-6 6-4 4 2 2 8l-3 9 14 6q7 3 1 6-8 2-16-2l-12-6"/>',
      '<path d="M52 21q5-5 9 0m-7-6 4-4M32 44l-5 5m7 0 5 5M4 49h92"/>'
    ],
    panda: [
      GROUND + '<circle cx="82" cy="14" r="5"/>',
      '<path d="M50 46q-14 0-16-12 0-13 16-13t16 13q-2 12-16 12Z"/>',
      '<circle cx="42" cy="18" r="5" class="f"/><circle cx="58" cy="18" r="5" class="f"/><ellipse cx="42" cy="28" rx="4" ry="5" class="f"/><ellipse cx="58" cy="28" rx="4" ry="5" class="f"/><circle cx="50" cy="34" r="2" class="f"/><path d="M44 39q6 5 12 0M14 49V28m0 8-6-5m6 1 6-6m56 23V30m0 7-6-5m6 1 6-6"/>'
    ],
    bison: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M20 44q-2-12 10-16 4-10 16-10 10 0 14 8l8 4q6 3 4 8 0 6-8 6Zm48-14q8 0 9 6 0 6-7 8l-4-4"/>',
      '<path d="M70 28q6-6 9-1-3 4-8 3M64 40q-2 6 1 8M28 44v4m12 0v4m16 0v4m12-4v4M20 36q-6-2-5 4M4 49h92"/>'
    ],
    bear: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M22 44q-4-10 4-16 2-8 14-8 12 0 16 8 8 4 6 12 0 4-6 4Zm40-18q8-2 10 4 1 6-6 8l-4-4"/>',
      '<path d="M66 22q0-5 4-4 2 3 0 5M70 32l6 2-6 2M28 44v4m12 0v4m14 0v4m10-4v4M4 49h92"/>'
    ],
    whale: [
      '<path d="M4 44q12-5 24 0t24 0 24 0 24 0M4 49h92"/>',
      '<path d="M10 38q14-16 36-16 22 0 30 14-4 8-18 8H24q-10 0-14-6Zm68-6q10-10 16-2-4 8-16 6Z"/>',
      '<path d="M46 22q-3-8 2-12 4 6 2 12M76 30q8-2 9 4-5 5-10 1M16 36q4 4 10 4M4 44h92M60 40q8 5 14 0"/>'
    ],
    kangaroo: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M34 44q-4-12 8-18 6-8 14-6 5 2 5 8l6 4q6 4 2 10-6 6-20 4Zm20-24q8-2 9 4 0 5-6 6"/>',
      '<path d="M56 16q-3-8 1-10 4 4 3 10m4 0q3-8 7-7 0 6-4 8M34 40q-14 6-22 2 8-8 22-6M42 44q-4 4-8 4m20-2q4 4 8 3M60 30q5 2 6 6M4 49h92"/>'
    ],
    llama: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M30 44q-2-12 8-14 8-2 16 0 6 2 6 14Zm6-14q-2-18 6-22 6 0 6 6l6 4q4 2 0 6l-6 2"/>',
      '<path d="M42 8q-3-6 0-7 3 2 3 6m4 0q3-6 6-5-1 5-5 6M34 44v4m10 0v4m10 0v4m8-4v4M60 30q6 0 6 6M4 49h92"/>'
    ],
    elephant: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M24 44V28q0-12 16-12t16 12q8 0 10 8 2 6-2 8Zm42-16q10-2 11 6 1 8-8 10l-4-4"/>',
      '<path d="M60 20q12-4 14 8-8 4-14-2M74 38q6 6 2 10-4 2-6-2M70 42l4 4M28 44v4m12 0v4m12 0v4m12-4v4M4 49h92"/>'
    ],
    turtle: [
      '<path d="M4 46q12-5 24 0t24 0 24 0 24 0"/>',
      '<path d="M50 14q18 0 24 14 4 12-6 18-18 8-36 0-10-6-6-18 6-14 24-14Z"/>',
      '<path d="M50 14q-4-6 0-8 4 2 0 8ZM26 26q-12-6-16 2 6 8 16 4m48-6q12-6 16 2-6 8-16 4M32 44q-8 8-12 4m48-4q8 8 12 4M50 14v32M32 30q18 8 36 0M34 38q16 6 32 0M4 46h92"/>'
    ],
    penguin: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M32 44V24q0-10 8-10t8 10q4 2 4 8 0 8-6 12Zm30 0V28q0-8 6-8t6 8q3 2 3 6 0 7-5 10Z"/>',
      '<path d="M32 14q0-6 8-6t8 6M62 20q0-5 6-5t6 5M48 20l6 2-6 2m30 0 5 2-5 2M40 14q-6 12 0 30m22-24q-5 10 0 24M32 44l-6 3m14-3 6 3m20-3-5 3m11-3 5 3M32 26q-6 8-2 16m40-12q-5 7-2 12"/>'
    ],

    /* ---------- 建築 / architecture ---------- */
    eiffel: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M50 4 37 45h26L50 4Zm-11 17h22m-16 12h10M28 49h44"/>',
      '<path d="M50 4V2m-12 39h24M41 21l18 11m0-11L41 32M38 33l12 12m12-12L50 45M4 49h92"/>'
    ],
    bigben: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M38 49V18h24v31m-21-31 9-9 9 9m-18 0h18M34 49h32"/>',
      '<circle cx="50" cy="26" r="6"/><path d="M50 22v4l3 2M42 38h16m-16 5h16M4 49h92"/>'
    ],
    colosseum: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M10 45V22q0-8 12-8h56q12 0 12 8v23Zm0 8h80M14 22h72"/>',
      '<path d="M18 27q0 10 8 10t8-10m8 0q0 10 8 10t8-10m8 0q0 10 8 10t8-10M18 40q0 8 8 8t8-8m8 0q0 8 8 8t8-8m8 0q0 8 8 8t8-8"/>'
    ],
    parthenon: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M12 20 50 7l38 13Zm2 5h72M14 46h72M14 46V25m12 21V25m12 21V25m12 21V25m12 21V25m12 21V25"/>',
      '<path d="M12 20h76M8 49h84M4 49h92"/>'
    ],
    taj: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M26 46V30h48v16m-48-8h48M50 7q14 6 14 19H36q0-13 14-19Zm0 0v-4m-30 8v20m60-20v20"/>',
      '<path d="M50 26q-5-8 0-14 5 6 0 14Zm-34 5v-6m68 6v-6M20 46h60M8 49h84"/>'
    ],
    greatwall: [
      '<path d="M4 49h92"/><path d="M6 42q16-10 30 0t28 0 30 0"/>',
      '<path d="M10 44V30l14-4 14 4v14m18 0V26l14-4 14 4v18M24 26V18h6v8m32-4v-8h6v8"/>',
      '<path d="M10 30h28m18-4h28M16 34h4m8 0h4m18-4h4m8 0h4M8 49h84"/>'
    ],
    pyramid: [
      '<circle cx="76" cy="14" r="8"/><path d="M4 49h92M11 53h78"/>',
      '<path d="M8 46 34 12l26 34Zm40 0 22-26 22 26Z"/>',
      '<path d="M34 12v34m40-26v26M8 46h84M4 49h92"/>'
    ],
    angkor: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M14 46h72V32H14v14m0-8h72M28 32V16q4-8 8 0v16m28 0V12q4-8 8 0v20"/>',
      '<path d="M36 16q-4-6 0-9 4 3 0 9Zm28-4q-4-6 0-9 4 3 0 9ZM20 38h8m8 0h8m8 0h8m8 0h8M4 49h92"/>'
    ],
    hagia: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M18 46V30h64v16m-64-8h64M50 8q16 8 16 20H34q0-12 16-20Zm0 0v-4M22 30V14h4v16m52 0V14h4v16"/>',
      '<path d="M24 14v-5m52 5v-5M50 28q-6-8 0-14 6 6 0 14ZM18 38h64M8 49h84"/>'
    ],
    stbasil: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M16 46V28h12v18m8 0V22h12v24m8 0V28h12v18M50 8q9 6 9 14H41q0-8 9-14Z"/>',
      '<path d="M22 28q-5-8 0-12 5 4 0 12Zm20-6q-5-8 0-12 5 4 0 12Zm20 6q-5-8 0-12 5 4 0 12ZM50 8V3m-9 19h18M12 49h76"/>'
    ],
    sagrada: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M22 46V16q3-7 6 0v30m14 0V9q3-7 6 0v37m14 0V16q3-7 6 0v30m12 0V20q3-6 6 0v26"/>',
      '<path d="M25 16v-5m20-7V4m20 12v-5m20 9v-4M14 34h18m8-8h18m8 8h18M8 49h84"/>'
    ],
    windmill: [
      '<path d="M4 49h92M11 53h78"/><path d="M6 44q12-5 24 0"/>',
      '<path d="M38 46 46 16h12l8 30Zm8-30 6-10 6 10M50 20 30 8m20 12 22-14M50 20v-22m0 22 22 14M50 20 28 34"/>',
      '<path d="M50 20m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M42 36h16M4 49h92"/>'
    ],
    torii: [
      '<path d="M4 46q12-5 24 0t24 0 24 0 24 0M4 51q12-5 24 0t24 0 24 0 24 0"/>',
      '<path d="M22 44V16h56v28m-56-18h56M16 12q34-7 68 0l4 5H12Z"/>',
      '<path d="M22 16v28m56-28v28M12 17h76M4 46h92"/>'
    ],
    pagoda: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M44 46V12h12v34M30 16h40L50 8Zm-4 10h48L50 18Zm-4 10h56L50 28Zm-4 10h64L50 38Z"/>',
      '<path d="M50 8V3m-20 13h40m-24 10h24m-30 10h36m-36 10h42M40 46h20M4 49h92"/>'
    ],
    castle: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M20 46h60V32H20v14M50 8q16 6 16 15H34q0-9 16-15Zm0 0v-4M30 22h40l-5 5H35Z"/>',
      '<path d="M34 17q4-6 8 0m8 0q4-6 8 0m8 0q4-6 8 0M20 32h60M26 38h12m24 0h12M8 49h84"/>'
    ],
    europecastle: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M16 46V22h12v24m8 0V14h12v32m8 0V22h12v24m8 0V28h8v18"/>',
      '<path d="M22 22v-8l6 4 6-4v8m8-8v-6l6 4 6-4v6m8 8v-8l6 4 6-4v8m8 6v-7l4 3 4-3v7M16 34h60M8 49h84"/>'
    ],
    petra: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M8 46V10q18 4 18 18 10-6 24-6t24 6q0-14 18-18v36Z"/>',
      '<path d="M34 46V24q8-6 16 0v22m-16-22 8-10 8 10m-12 6h8m-8 6h8M20 20q6 4 6 12m48-12q-6 4-6 12M8 46h84"/>'
    ],
    christ: [
      '<path d="M4 49h92M11 53h78"/><path d="M36 49q14-8 28 0"/>',
      '<path d="M50 24q-4 0-5 4l-2 14q8 5 14 0l-2-14q-1-4-5-4Zm0 0q-4-5 0-8 4 3 0 8Zm-6 4-16-5m22 5 16-5"/>',
      '<path d="M28 23q6 3 12 3m20 0q6 0 12-3M46 42v7m8-7v7M4 49h92"/>'
    ],
    liberty: [
      '<path d="M4 49h92M11 53h78"/><path d="M6 44q12-5 24 0"/>',
      '<path d="M46 46V24q-4-10 4-12 8 2 4 12v22m-8-20-8-4m16 4 8-4M38 46h24"/>',
      '<path d="M50 12V6m-3 2h6m-6 4 10-6m-4-2 4 2 4-2m-18 10 10-6M42 18q-4-6 0-9m16 9q4-6 0-9M26 22v-8m4 8h-8M4 49h92"/>'
    ],
    goldengate: [
      '<path d="M4 46q12-5 24 0t24 0 24 0 24 0M4 51h92"/>',
      '<path d="M22 44V12m56 32V12M22 18h56M22 26h56M8 40q42-26 84 0"/>',
      '<path d="M22 12v32m56-32v32M22 18q28 18 56 0M4 46h92M16 44V26m68 18V26"/>'
    ],
    opera: [
      '<path d="M4 46q12-5 24 0t24 0 24 0 24 0M8 49h84"/>',
      '<path d="M14 44q6-26 18-32 4 20 2 32Zm18 0q10-34 22-34 4 22 0 34Zm20 0q12-30 22-26 6 16 0 26Zm20 0q10-20 16-16 2 10-2 16Z"/>',
      '<path d="M14 44h78M4 46h92"/>'
    ],
    moai: [
      '<circle cx="78" cy="14" r="7"/><path d="M4 49h92M11 53h78"/>',
      '<path d="M34 46V22q0-12 12-14 12 2 14 12l2 26Zm12-14q6-4 12 0m-12 8h12"/>',
      '<path d="M46 8q10-2 14 6M34 22l-6 8 8 2m20-10 6 8-6 4M40 30h4m12 0h4m-12 8q6 4 12 0M4 49h92"/>'
    ],
    machu: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="m8 47 22-28 12 12 12-19 14 20 10-9 14 24Z"/><path d="M18 44h64M24 38h52M30 32h40M36 26h28"/>',
      '<path d="M30 34v6m10-10v10m10-14v14m10-10v10m10-6v6M4 49h92"/>'
    ],
    spire: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M44 46V24h4V14h1V6h2v8h1v10h4v22Zm-4 0V34h-4v12m16 0V34h4v12"/>',
      '<path d="M48 6V2m-4 22h12m-10 8h8m-6 8h4M4 49h92"/>'
    ],
    skyline: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M10 47V28h13v19m5 0V16h16v31m5 0V8h13v39m5 0V24h14v23m5 0V33h9v14"/>',
      '<path d="M50 8V3m-7 18h4m-4 6h4m-4 6h4m9-30h4m-4 6h4m-4 6h4m9 6h4m-4 6h4M4 49h92"/>'
    ],
    twintowers: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M24 46V12h14v34m24 0V12h14v34M24 22h14m24 0h14M38 28h24v5H38Z"/>',
      '<path d="M31 12V5m38 7V5M24 34h14m24 0h14M4 49h92"/>'
    ],
    capitol: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M50 6q14 8 14 20H36q0-12 14-20Zm0 0v-3m-6 23h12M18 46V30h64v16M16 30h68M14 46h72"/>',
      '<path d="M24 30v16m12-16v16m12-16v16m16-16v16m12-16v16M50 26v-2M8 49h84"/>'
    ],
    gatewayarch: [
      '<path d="M4 49h92M8 53h84"/>',
      '<path d="M12 46Q14 10 50 8q36 2 38 38"/>',
      '<path d="M24 46Q25 22 50 20q25 2 26 26M12 46h76M4 49h92"/>'
    ],
    lighthouse: [
      '<path d="M4 46q12-5 24 0t24 0 24 0 24 0M4 51q12-5 24 0t24 0 24 0 24 0"/>',
      '<path d="M42 44 45 16h10l3 28Zm3-28h12M40 44h20M45 16l-8-4m18 4 8-4"/>',
      '<path d="M50 12V4m-8 4-8-4m24 4 8-4M46 24h8m-8 8h8M4 46h92"/>'
    ],
    stupa: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M30 46V34q0-14 20-16 20 2 20 16v12Zm-4 0h48M50 18q-8-6 0-12 8 6 0 12Z"/>',
      '<path d="M50 6V2m-8 4h16M34 34q16-8 32 0M30 40h40M8 49h84"/>'
    ],
    hanok: [
      '<path d="M4 49h92M11 53h78"/>',
      '<path d="M14 28q36-18 72 0l-6 4H20Zm6 4h60v14H20Zm0 8h60"/>',
      '<path d="M14 28q36-14 72 0M20 32v14m20-14v14m20-14v14m20-14v14M8 49h84"/>'
    ]
  };

  /* Named plates. An id may reuse another drawing with its own caption. */
  const MOTIF_ROWS = [
    // 風景
    ['fuji', '富士山', '風景'], ['alps', '阿爾卑斯雪山', '風景', 'snowpeak'],
    ['snowpeak', '雪山與針葉林', '風景'],
    ['mountain', '山巒', '風景'], ['canyon', '峽谷岩層', '風景'],
    ['hoodoos', '布萊斯石柱群', '風景'], ['arch', '天然岩拱', '風景'],
    ['geyser', '間歇泉', '風景'], ['waterfall', '瀑布與山谷', '風景'],
    ['fjord', '峽灣', '風景'], ['glacier', '冰河', '風景'],
    ['aurora', '極光與針葉林', '風景'], ['volcano', '火山', '風景'],
    ['crater', '火山口湖', '風景'], ['dunes', '沙丘', '風景'],
    ['wetland', '濕地草澤', '風景'], ['wave', '島嶼海浪', '風景'],
    ['coral', '珊瑚礁', '風景'], ['cave', '鐘乳石洞穴', '風景'],
    ['hotspring', '溫泉蒸氣', '風景'], ['lake', '湖泊倒影', '風景'],
    ['rainforest', '雨林葉影', '風景'], ['savanna', '草原金合歡', '風景'],
    ['terrace', '稻米梯田', '風景'], ['sun', '太陽與海平線', '風景'],
    // 花草
    ['sakura', '櫻花', '花草'], ['plum', '梅花', '花草'],
    ['hibiscus', '扶桑花', '花草'], ['plumeria', '雞蛋花', '花草'],
    ['lotus', '蓮花', '花草'], ['rose', '玫瑰', '花草'],
    ['sunflower', '向日葵', '花草'], ['edelweiss', '高山雪絨花', '花草'],
    ['protea', '帝王花', '花草'], ['magnolia', '木蘭花', '花草'],
    ['tulip', '鬱金香', '花草'], ['lavender', '薰衣草', '花草'],
    ['thistle', '薊花', '花草'], ['shamrock', '三葉草', '花草'],
    ['maple', '楓葉', '花草'], ['fern', '銀蕨', '花草'],
    ['cactus', '巨柱仙人掌', '花草'], ['joshua', '約書亞樹', '花草'],
    ['redwood', '紅木巨杉', '花草'], ['palm', '椰子樹', '花草'],
    ['bamboo', '竹林', '花草'], ['rice', '稻穗', '花草'],
    ['grape', '葡萄藤', '花草'], ['coffee', '咖啡枝', '花草'],
    ['tea', '茶葉', '花草'], ['olive', '橄欖枝', '花草'],
    ['pine', '針葉松林', '花草'], ['birch', '白樺', '花草'],
    ['wheat', '麥穗', '花草'],
    // 人文 / 人物 / 動物
    ['geisha', '舞妓', '人文'], ['flamenco', '佛朗明哥舞者', '人文'],
    ['gondola', '貢多拉船夫', '人文'], ['piper', '風笛手', '人文'],
    ['mermaid', '小美人魚像', '人文'], ['terracotta', '兵馬俑', '人文'],
    ['hula', '草裙舞', '人文'], ['buddha', '佛像', '人文'],
    ['totem', '圖騰柱', '人文'], ['balloon', '熱氣球', '人文'],
    ['crane', '丹頂鶴', '人文'], ['panda', '熊貓與竹', '人文'],
    ['bison', '北美野牛', '人文'], ['bear', '棕熊', '人文'],
    ['whale', '鯨魚', '人文'], ['kangaroo', '袋鼠', '人文'],
    ['llama', '羊駝', '人文'], ['elephant', '大象', '人文'],
    ['turtle', '海龜', '人文'], ['penguin', '企鵝', '人文'],
    // 建築
    ['eiffel', '艾菲爾鐵塔', '建築'], ['bigben', '西敏寺鐘樓', '建築'],
    ['colosseum', '羅馬競技場', '建築'], ['parthenon', '帕德嫩神廟', '建築'],
    ['taj', '泰姬瑪哈陵', '建築'], ['greatwall', '萬里長城', '建築'],
    ['pyramid', '金字塔', '建築'], ['angkor', '吳哥窟', '建築'],
    ['hagia', '圓頂與尖塔', '建築'], ['stbasil', '洋蔥頂教堂', '建築'],
    ['sagrada', '聖家堂', '建築'], ['windmill', '荷蘭風車', '建築'],
    ['torii', '鳥居', '建築'], ['pagoda', '五重塔', '建築'],
    ['castle', '天守閣', '建築'], ['europecastle', '城堡尖塔', '建築'],
    ['petra', '佩特拉神殿', '建築'], ['christ', '基督像', '建築'],
    ['liberty', '自由女神像', '建築'], ['goldengate', '金門大橋', '建築'],
    ['opera', '雪梨歌劇院', '建築'], ['moai', '摩艾石像', '建築'],
    ['machu', '馬丘比丘', '建築'], ['spire', '高塔天際線', '建築'],
    ['burj', '哈里發塔', '建築', 'spire'], ['taipei101', '台北 101', '建築', 'spire'],
    ['skyline', '城市天際線', '建築'], ['twintowers', '雙子塔', '建築'],
    ['petronas', '雙峰塔', '建築', 'twintowers'],
    ['capitol', '圓頂議事堂', '建築'], ['gatewayarch', '大拱門', '建築'],
    ['lighthouse', '燈塔', '建築'], ['stupa', '佛塔', '建築'],
    ['hanok', '韓屋瓦頂', '建築'], ['cliffdwell', '崖壁石屋', '建築', 'cave'],
    ['europalace', '宮殿拱廊', '建築', 'colosseum']
  ];
  const MOTIFS = Object.fromEntries(MOTIF_ROWS.map(([id, label, kind, art]) => [id, { id, label, kind, art: art || id }]));

  /* Editorial destination index. Keys are ISO codes, catalogue ids or state
     abbreviations; values are plate ids in MOTIFS. Unlisted places inherit a
     country motif, then a broad geographic-region motif. */
  const COUNTRY = {
    JP:'fuji', KR:'hibiscus', TW:'plum', CN:'greatwall', HK:'skyline', MO:'skyline',
    MN:'savanna', KZ:'mountain', UZ:'hagia', KG:'mountain', TJ:'mountain', TM:'dunes',
    VN:'lotus', TH:'stupa', LA:'stupa', KH:'angkor', MM:'stupa', MY:'petronas',
    SG:'skyline', ID:'terrace', PH:'wave', BN:'hagia', TL:'wave', LK:'tea',
    IN:'taj', NP:'buddha', BT:'buddha', BD:'lotus', PK:'hagia', AF:'dunes',
    IR:'hagia', IQ:'hagia', SA:'hagia', AE:'burj', QA:'hagia', KW:'hagia',
    BH:'hagia', OM:'dunes', YE:'dunes', JO:'petra', IL:'hagia', PS:'hagia',
    LB:'olive', SY:'olive', TR:'balloon', CY:'olive', GE:'mountain', AM:'mountain',
    AZ:'mountain', MV:'turtle',
    GB:'bigben', IE:'shamrock', FR:'eiffel', DE:'capitol', NL:'windmill',
    BE:'skyline', LU:'europecastle', CH:'alps', AT:'edelweiss', IT:'colosseum',
    ES:'flamenco', PT:'olive', MC:'skyline', AD:'snowpeak', SM:'europecastle',
    VA:'colosseum', MT:'colosseum', GR:'parthenon', CZ:'europecastle',
    SK:'europecastle', PL:'europecastle', HU:'europecastle', SI:'alps',
    HR:'europecastle', BA:'hagia', RS:'hagia', ME:'europecastle', MK:'stupa',
    AL:'olive', RO:'europecastle', BG:'rose', MD:'grape', UA:'sunflower',
    BY:'birch', RU:'stbasil', EE:'birch', LV:'birch', LT:'birch',
    FI:'birch', SE:'birch', NO:'fjord', DK:'mermaid', IS:'aurora',
    AX:'birch', FO:'fjord', GL:'aurora', IM:'lighthouse', JE:'lighthouse',
    GG:'lighthouse', LI:'alps',
    US:'liberty', CA:'maple', MX:'cactus', CU:'palm', DO:'palm', HT:'palm',
    JM:'palm', BS:'palm', PR:'wave', BM:'wave', KY:'wave', TC:'wave',
    VG:'wave', VI:'wave', AI:'wave', MS:'wave', AG:'wave', KN:'wave',
    LC:'wave', VC:'wave', BB:'wave', TT:'wave', DM:'wave', GD:'wave',
    BZ:'coral', GT:'coffee', HN:'coffee', SV:'coffee', NI:'coffee',
    CR:'rainforest', PA:'rainforest', SX:'wave', CW:'wave', AW:'wave',
    MF:'wave', BL:'wave', PM:'lighthouse',
    CO:'coffee', VE:'waterfall', GY:'rainforest', SR:'rainforest',
    EC:'llama', PE:'machu', BO:'llama', BR:'christ', CL:'moai',
    AR:'llama', UY:'llama', PY:'rainforest', FK:'penguin', GS:'penguin',
    AU:'kangaroo', NZ:'fern', PG:'rainforest', FJ:'wave', SB:'wave', VU:'wave',
    NC:'wave', WF:'wave', TO:'wave', WS:'plumeria', KI:'wave', TV:'wave',
    NR:'wave', PW:'coral', FM:'coral', MH:'wave', MP:'wave', GU:'wave',
    AS:'plumeria', CK:'wave', NU:'wave', TK:'wave', PN:'moai', PF:'plumeria',
    NF:'pine', HM:'aurora', TF:'aurora', IO:'coral', SH:'wave',
    EG:'pyramid', LY:'dunes', TN:'olive', DZ:'dunes', MA:'olive', EH:'dunes',
    SD:'pyramid', SS:'savanna', ER:'savanna', ET:'coffee', DJ:'dunes',
    SO:'savanna', KE:'savanna', UG:'savanna', TZ:'savanna', RW:'savanna',
    BI:'savanna', CD:'rainforest', CG:'rainforest', GA:'rainforest',
    GQ:'rainforest', CM:'rainforest', CF:'rainforest', TD:'dunes',
    NE:'dunes', NG:'rainforest', BJ:'rainforest', TG:'rainforest',
    GH:'coffee', CI:'olive', LR:'rainforest', SL:'rainforest', GN:'rainforest',
    GW:'rainforest', SN:'savanna', GM:'savanna', MR:'dunes', ML:'dunes',
    BF:'savanna', NA:'dunes', BW:'savanna', ZW:'waterfall', ZM:'waterfall',
    MW:'savanna', MZ:'wave', AO:'savanna', ZA:'protea', LS:'protea',
    SZ:'protea', MG:'rainforest', MU:'wave', SC:'coral', KM:'wave',
    ST:'coffee', CV:'wave'
  };
  const CITY = {
    'tokyo-jp':'skyline', 'kyoto-jp':'geisha', 'osaka-jp':'castle',
    'sapporo-jp':'lavender', 'fukuoka-jp':'torii', 'naha-jp':'wave',
    'nagoya-jp':'castle', 'hiroshima-jp':'torii',
    'seoul-kr':'hanok', 'busan-kr':'wave',
    'taipei-tw':'taipei101', 'taichung-tw':'plum', 'kaohsiung-tw':'wave',
    'hong-kong-hk':'skyline', 'macau-mo':'skyline',
    'beijing-cn':'greatwall', 'shanghai-cn':'skyline', 'shenzhen-cn':'skyline',
    'guangzhou-cn':'bamboo', 'chengdu-cn':'panda', 'xi-an-cn':'terracotta',
    'singapore-sg':'skyline', 'bangkok-th':'stupa', 'chiang-mai-th':'elephant',
    'phuket-th':'wave', 'kuala-lumpur-my':'petronas', 'george-town-my':'petronas',
    'hanoi-vn':'lotus', 'ho-chi-minh-city-vn':'lotus', 'da-nang-vn':'wave',
    'manila-ph':'wave', 'cebu-city-ph':'coral', 'jakarta-id':'terrace',
    'denpasar-id':'terrace', 'yogyakarta-id':'stupa',
    'mumbai-in':'taj', 'new-delhi-in':'taj', 'bengaluru-in':'rainforest',
    'kolkata-in':'lotus', 'dubai-ae':'burj', 'abu-dhabi-ae':'hagia',
    'doha-qa':'hagia', 'istanbul-tr':'hagia', 'jerusalem-il':'hagia',
    'tel-aviv-il':'skyline', 'kathmandu-np':'buddha', 'phnom-penh-kh':'angkor',
    'yangon-mm':'stupa', 'ulaanbaatar-mn':'savanna', 'tbilisi-ge':'mountain',
    'almaty-kz':'mountain', 'colombo-lk':'tea', 'male-mv':'wave',
    'london-gb':'bigben', 'paris-fr':'eiffel', 'berlin-de':'capitol',
    'munich-de':'europecastle', 'rome-it':'colosseum', 'milan-it':'colosseum',
    'venice-it':'gondola', 'florence-it':'europecastle', 'madrid-es':'flamenco',
    'barcelona-es':'sagrada', 'lisbon-pt':'olive', 'porto-pt':'grape',
    'amsterdam-nl':'tulip', 'brussels-be':'skyline', 'vienna-at':'europecastle',
    'prague-cz':'europecastle', 'budapest-hu':'europecastle', 'warsaw-pl':'europecastle',
    'krakow-pl':'europecastle', 'copenhagen-dk':'mermaid', 'stockholm-se':'birch',
    'oslo-no':'fjord', 'helsinki-fi':'birch', 'reykjavik-is':'aurora',
    'dublin-ie':'shamrock', 'edinburgh-gb':'piper', 'zurich-ch':'alps',
    'geneva-ch':'alps', 'athens-gr':'parthenon', 'moscow-ru':'stbasil',
    'saint-petersburg-ru':'europalace', 'kyiv-ua':'sunflower', 'dubrovnik-hr':'europecastle',
    'new-york-us':'liberty', 'los-angeles-us':'skyline', 'chicago-us':'skyline',
    'san-francisco-us':'goldengate', 'seattle-us':'pine', 'portland-us':'pine',
    'boston-us':'lighthouse', 'washington-d-c-us':'capitol', 'miami-us':'palm',
    'atlanta-us':'magnolia', 'denver-us':'mountain', 'las-vegas-us':'skyline',
    'phoenix-us':'cactus', 'austin-us':'magnolia', 'dallas-us':'skyline',
    'houston-us':'skyline', 'san-diego-us':'wave', 'new-orleans-us':'magnolia',
    'honolulu-us':'hula', 'anchorage-us':'bear',
    'toronto-ca':'maple', 'vancouver-ca':'pine', 'montreal-ca':'maple',
    'quebec-city-ca':'europecastle', 'calgary-ca':'mountain', 'edmonton-ca':'bison',
    'ottawa-ca':'capitol', 'winnipeg-ca':'bison',
    'mexico-city-mx':'cactus', 'cancun-mx':'coral', 'guadalajara-mx':'cactus',
    'havana-cu':'palm', 'san-jose-cr':'rainforest', 'panama-city-pa':'rainforest',
    'bogota-co':'coffee', 'medellin-co':'coffee', 'lima-pe':'machu',
    'cusco-pe':'machu', 'santiago-cl':'moai', 'buenos-aires-ar':'flamenco',
    'rio-de-janeiro-br':'christ', 'sao-paulo-br':'skyline', 'quito-ec':'llama',
    'la-paz-bo':'llama', 'sydney-au':'opera', 'melbourne-au':'opera',
    'brisbane-au':'wave', 'perth-au':'wave', 'auckland-nz':'fern',
    'wellington-nz':'fern', 'christchurch-nz':'fern', 'cairo-eg':'pyramid',
    'marrakesh-ma':'olive', 'cape-town-za':'protea', 'johannesburg-za':'protea',
    'nairobi-ke':'savanna', 'zanzibar-city-tz':'wave', 'arusha-tz':'savanna'
  };
  const US_PARK = {
    acad:'lighthouse', arch:'arch', badl:'canyon', bibe:'canyon', bisc:'coral',
    blca:'canyon', brca:'hoodoos', cany:'canyon', care:'arch', cave:'cave',
    chis:'wave', chir:'hoodoos', cong:'wetland', crla:'crater', cuva:'waterfall',
    deva:'dunes', dena:'mountain', drto:'coral', ever:'wetland', gaar:'aurora',
    jeff:'gatewayarch', glac:'glacier', glba:'glacier', grca:'canyon',
    grte:'snowpeak', grba:'pine', grsa:'dunes', grsm:'mountain', gumo:'mountain',
    hale:'volcano', havo:'volcano', hosp:'hotspring', indu:'dunes', isro:'lake',
    jotr:'joshua', katm:'bear', kefj:'fjord', kica:'redwood', kova:'dunes',
    lacl:'lake', lavo:'volcano', maca:'cave', meve:'cliffdwell', mora:'snowpeak',
    npsa:'coral', neri:'waterfall', noca:'snowpeak', olym:'rainforest',
    pefo:'mountain', pinn:'arch', redw:'redwood', romo:'mountain',
    sagu:'cactus', sequ:'redwood', shen:'mountain', thro:'bison',
    viis:'coral', voya:'lake', whsa:'dunes', wica:'cave', wrst:'glacier',
    yell:'geyser', yose:'waterfall', zion:'canyon'
  };
  const CA_PARK = {
    'akamiuapishkukakkasuakmealy-mountains':'mountain', aulavik:'aurora',
    auyuittuq:'fjord', banff:'lake', 'bruce-peninsula':'fjord',
    'cape-breton-highlands':'fjord', 'elk-island':'bison', forillon:'fjord',
    fundy:'fjord', 'georgian-bay-islands':'wave', glacier:'glacier',
    grasslands:'bison', 'gros-morne':'fjord', 'gulf-islands':'wave',
    'gwaii-haanas':'totem', ivvavik:'aurora', jasper:'lake', kejimkujik:'lake',
    kluane:'glacier', kootenay:'glacier', kouchibouguac:'wetland',
    'la-mauricie':'lake', 'mingan-archipelago':'wave', 'mount-revelstoke':'glacier',
    nahanni:'waterfall', 'naatsihchoh':'mountain', 'pacific-rim':'wave',
    pituamkek:'wave', 'point-pelee':'wetland', 'prince-albert':'lake',
    'prince-edward-island':'lighthouse', pukaskwa:'lake', qausuittuq:'aurora',
    quttinirpaaq:'aurora', 'riding-mountain':'bison', 'sable-island':'wave',
    sirmilik:'aurora', 'terra-nova':'fjord', 'thaidene-nene':'lake',
    'thousand-islands':'lake', 'torngat-mountains':'mountain',
    'tuktut-nogait':'aurora', ukkusiksalik:'aurora', vuntut:'aurora',
    wapusk:'aurora', 'waterton-lakes':'lake', 'wood-buffalo':'bison',
    yoho:'glacier'
  };
  const JP_PARK = {
    rishiri:'snowpeak', shiretoko:'fjord', akan:'crater', kushiro:'crane',
    taisetsu:'snowpeak', hidaka:'fjord', shikotsu:'crater', towada:'lake',
    sanriku:'fjord', bandai:'volcano', nikko:'pagoda', oze:'wetland',
    joshinetsu:'snowpeak', myoko:'snowpeak', chichibu:'mountain',
    ogasawara:'whale', fuji:'fuji', chubu:'snowpeak', hakusan:'edelweiss',
    minamialps:'snowpeak', ise:'torii', yoshino:'sakura', sanin:'fjord',
    setonaikai:'wave', daisen:'volcano', ashizuri:'fjord', saikai:'wave',
    unzen:'hotspring', aso:'volcano', kirishima:'volcano', yakushima:'fern',
    amami:'coral', yambaru:'rainforest', kerama:'coral', iriomote:'coral'
  };
  const STATE = {
    AL:'magnolia', AK:'bear', AZ:'cactus', AR:'rice', CA:'redwood', CO:'snowpeak',
    CT:'maple', DE:'lighthouse', FL:'palm', GA:'magnolia', HI:'hula', ID:'pine',
    IL:'wheat', IN:'wheat', IA:'wheat', KS:'sunflower', KY:'wheat', LA:'magnolia',
    ME:'lighthouse', MD:'lighthouse', MA:'maple', MI:'lake', MN:'lake', MS:'magnolia',
    MO:'wheat', MT:'mountain', NE:'wheat', NV:'dunes', NH:'maple', NJ:'lighthouse',
    NM:'dunes', NY:'liberty', NC:'pine', ND:'wheat', OH:'wheat', OK:'bison',
    OR:'pine', PA:'capitol', RI:'lighthouse', SC:'palm', SD:'bison', TN:'mountain',
    TX:'cactus', UT:'arch', VT:'maple', VA:'capitol', WA:'pine', WV:'mountain',
    WI:'wheat', WY:'bison'
  };
  const REGION = { AS:'terrace', EU:'snowpeak', AF:'savanna', NA:'pine', SA:'rainforest', OC:'wave', AN:'aurora' };
  const NA_REGION = {
    'na-us-west':'redwood', 'na-us-mountain':'mountain', 'na-us-midwest':'wheat',
    'na-us-east':'magnolia', 'na-us-alaska':'aurora', 'na-us-hawaii':'hula',
    'na-us-territories':'coral',
    'na-ca-pacific':'pine', 'na-ca-rockies':'snowpeak', 'na-ca-central':'maple',
    'na-ca-atlantic':'lighthouse', 'na-ca-north':'aurora'
  };
  const JP_REGION = { hokkaido:'snowpeak', tohoku:'fjord', kanto:'sakura', chubu:'snowpeak', west:'pagoda', kyushu:'volcano', islands:'coral' };

  function pick(table, key, fallback) { return (key && table[key]) || fallback; }
  function resolve(place) {
    if (!place) return null;
    let id = null;
    let scope = 'place';
    if (place.category === 'countries') {
      id = pick(COUNTRY, place.iso, null) || pick(COUNTRY, place.id, null);
      if (!id) { id = pick(REGION, place.region, 'sun'); scope = 'region'; }
    } else if (place.category === 'cities') {
      id = pick(CITY, place.id, null);
      if (!id && place.iso) { id = pick(COUNTRY, place.iso, null); scope = 'country'; }
      if (!id) { id = pick(REGION, place.region, 'sun'); scope = 'region'; }
    } else if (place.category === 'na') {
      if (place.isState) {
        id = pick(STATE, place.abbr, null);
        if (!id) { id = pick(NA_REGION, place.region, 'mountain'); scope = 'region'; }
      } else if (String(place.key || '').startsWith('ca:')) {
        id = pick(CA_PARK, place.id, null);
        if (!id) { id = pick(NA_REGION, place.region, 'pine'); scope = 'region'; }
      } else {
        id = pick(US_PARK, place.id, null);
        if (!id) { id = pick(NA_REGION, place.region, 'mountain'); scope = 'region'; }
      }
    } else if (place.category === 'jp') {
      id = pick(JP_PARK, place.id, null);
      if (!id) { id = pick(JP_REGION, place.region, 'sakura'); scope = 'region'; }
    }
    if (!id) { id = pick(REGION, place.region, 'sun'); scope = 'region'; }
    const motif = MOTIFS[id] || MOTIFS.sun;
    return { ...motif, scope };
  }
  function render(motif) {
    const plate = ART[motif.art] || ART.sun;
    return `<g class="t-3">${plate[0] || ''}</g><g class="t-2">${plate[1] || ''}</g><g class="t-1">${plate[2] || ''}</g>`;
  }
  function label(place, motif) {
    return motif.scope === 'region' ? `地區意象 · ${motif.label}` : `${place.zh} · ${motif.label}`;
  }
  window.TravelAtlasStampArt = {
    kinds: KINDS, art: ART, motifs: MOTIFS, country: COUNTRY, city: CITY,
    usPark: US_PARK, caPark: CA_PARK, jpPark: JP_PARK, state: STATE, region: REGION,
    find: resolve, render, label
  };
})();
