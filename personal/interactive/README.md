# Interactive map regions

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
