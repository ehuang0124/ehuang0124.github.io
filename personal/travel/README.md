# Interactive map regions

The postcard-style [world stamp atlas](map/) is a fourth, independent map at `/personal/travel/map/`. Its four layers, country flags, month-precision stamps, sign-in (a shared access code checked by Supabase, or a browser-only passphrase when no project is configured), the login log, local backup format, data provenance and browser tests are documented in [`map/README.md`](map/README.md). The atlas is read-only until someone signs in. The three Japan itinerary maps described below retain their existing stamps and storage keys.

All three maps expose a labelled native **區域** select next to the map controls. A region filters markers and the map's story/place list, then frames the selected area. Resetting the view keeps the filter; choosing the full itinerary clears it. Selecting a story/place from outside the current region clears incompatible filters so the destination is visible.

## Japan

- East Japan: 關東 (Tokyo), 中部／東海 (Shizuoka, Aichi), 近畿 (Mie: Matsusaka, Ise, Shima), plus the explicitly off-map 博多 continuation.
- Mie can also be grouped with Tokai in travel contexts; this map consistently uses the Kinki prefectural grouping and labels Mie explicitly.
- Kyushu: 北部九州 (the existing Fukuoka/Nagasaki stories) and 南部九州 (Kagoshima/Miyazaki). The existing seven-prefecture editorial navigation is retained.
- Options reflect the map's existing content, not an all-Japan coverage claim. There are currently no Hokuriku stories or markers.

## Okinawa proposal

These are **travel areas informed by cultural context**, not official cultural boundaries or the historical Hokuzan/Chuzan/Nanzan kingdoms.

| Area | Existing places / rationale |
| --- | --- |
| 山原（北端森林） | Kunigami's forest, waterfalls and Cape Hedo. Yanbaru culture extends beyond this deliberately narrow travel grouping. |
| 名護・本部半島 | Nago, Motobu, Nakijin, Sesoko, Kouri and Ie; northern port/peninsula itinerary and Hokuzan castle heritage. |
| 恩納海岸 | Onna's west-coast route: Manzamo, Maeda and Ryukyu Mura. |
| 中部 | Yomitan pottery, gusuku sites, Koza and postwar streets, plus Urasoe. |
| 那霸・首里 | Royal capital, Kume's diplomatic connections and Naha's markets; includes the airport. |
| 南部 | Nanjo sacred sites, Itoman war remembrance and Tomigusuku. The existing combined Nishihara/Haebaru entry stays intact and follows the Haebaru itinerary here; this does not reclassify Nishihara administratively. |
| 慶良間群島 | Zamami and Tokashiki; ferry itinerary. |
| 久米島 | Separate island and transport itinerary. |
| 宮古群島 | Miyako and Irabu, kept distinct from Yaeyama. |
| 八重山群島 | Ishigaki, Taketomi, Iriomote and Yonaguni. |

Each Okinawa area belongs to exactly one map projection. This fixes the old “離島” card, which switched to Miyako/Yaeyama even for Kerama and Kumejima. Cards and the select share one filter; switching projections clears an incompatible filter. The visited-state filter intersects the region filter for both pins and the sidebar, with an explicit empty state. The full stamp checklist remains global. Existing place IDs, localStorage key and stamps are unchanged.

## Browser regression tests

No production build step or runtime dependency is introduced. Install test tools outside the checkout:

```sh
npm install --prefix /tmp/atlas-test-deps playwright-core
NODE_PATH=/tmp/atlas-test-deps/node_modules CHROMIUM_PATH=/path/to/chromium \
  node scripts/test-interactive-regions.cjs
```

Alternatively install `@sparticuz/chromium` alongside `playwright-core` (requires compatible system libraries) and omit `CHROMIUM_PATH`. Tests serve this checkout on an ephemeral loopback port and block external photo requests. They cover all regions at desktop/mobile widths, timeline/marker filtering, cards/projection synchronization, reset/route behavior, visited intersections, empty states, saved stamps, itinerary jumps and keyboard focus.

## Historical context and the Kanto/Kansai question

`history-context.js` / `history-context.css` provide one shared, optional SVG context layer, separate from itinerary stories and stamp storage. The East Japan map labels **Kansai (Kinki) ← Chubu (Tokai) → Kanto**. Kanto and Kansai do not share a border. Open-diamond markers identify **Hakone Pass**, **Fuwa Barrier / Sekigahara**, and **Suzuka Pass** as travel gateways / transition references, not a surveyed regional boundary. The region grouping remains Kinki including Mie; Kansai's cultural extent varies by definition.

Closed, numbered diamonds identify exactly **nine** selected historical locations across the three maps:

1. 1582 本能寺之變 — Kyoto, the original temple site (not the relocated modern temple).
2. 1600 關原之戰 — a representative point in the Sekigahara battlefield.
3. 1615 大坂夏之陣 — Osaka Castle, a representative site, not all battlefields.
4. 1853 黑船來航 — Kurihama, Perry's landing site near Uraga, not Shimoda.
5. 1868 江戶城無血開城 — Edo Castle, not the negotiation location.
6. 1877 城山之戰 — Shiroyama, Kagoshima.
7. 1945 長崎原爆 — the hypocenter park in Nagasaki, not Dejima.
8. 1945 沖繩戰役・首里戰線 — Shuri Castle / the 32nd Army headquarters area.
9. 1945 沖繩戰役・摩文仁 — Mabuni Hill in southern Okinawa. June 23 commemoration is not presented as the end of all fighting.

Locations are approximate representative points, never battle extents. Each item has explanatory text and an external reading link. Markers and the corresponding accessible button list respect the region and map projection, but intentionally ignore stamp status so an important event doesn't disappear just because the user hasn't visited. Both the historical layer and East Japan's gateway layer have independent toggles. Marker selection works by pointer, Enter, or Space; list selection frames the site. The layer keeps callout sizes consistent on zoom and preserves keyboard focus during redraws. On narrow screens the numbered map badges use the full-text list as their legend.

The regression suite also covers the nine-item cap, historical marker filtering/toggles, gateway controls and boundary disclaimer, keyboard marker activation, focus retention, and independence from stamp filtering. No historical marker adds a stamp or changes the existing 49-place dataset.
