# Travel pages

## Magazine styling

Every page under `personal/travel/` is laid out like a Japanese travel magazine (warm washi paper, 明朝 serif headlines, hairline rules, small tracked-out Latin labels, a vertical 縦書き rail on the cover) — with one deliberate exception: the landing page follows the 長崎 tourism brand instead (white ground, gothic type, crimson accent, diamond lattice; see below). The shared layer is:

| File | Scope |
| --- | --- |
| `magazine.css` | Design tokens (`--mag-*`), base paper texture, masthead, cover, section heads, 基本情報 tables, 目次 list, footer. Linked by every page. |
| `landing.css` | Landing page only (`index.html`): a page-local 長崎 theme (`--ng-*` tokens, gothic type, crimson and 藍 accents, diamond lattice) plus layout for the cover, the 観光案内 nav, 目次, feature cards, the quote band, 旅の断片, the postcard and the printed style guide. It does not consume `--mag-*`. |
| `assets/travel-icons.svg` | Shared 24×24 line-icon sprite (13 symbols: 神社 / 五重塔 / 城 / 山 / 海 / 鐵道 / 渡船 / 溫泉 / 食 / 寫真 / 地點 / 郵戳, plus `an-lattice` — the 240×24 diamond chain used as the landing page's repeating motif). Reference one with `<svg class="an-i"><use href="/personal/travel/assets/travel-icons.svg#an-castle"/></svg>`; stroke and fill are inherited, so a single class themes every icon. |
| `itinerary.css` | Layout for the two 幕末 itinerary maps (East Japan, Kyushu): cover, prefecture cards, chronology, map panel, place panel. |
| `okinawa/okinawa.css` | 沖繩 page layout only; tokens and shared pieces come from `magazine.css`. |
| `map/style.css` | Stamp Atlas application CSS. Its `:root` aliases the old palette names to the `--mag-*` tokens, and a marked "magazine pass" block at the end keeps the atlas on the same paper. |
| `crumbs.css` | Shared breadcrumb, themed per page through `--crumb-*` custom properties. |

## Landing page (`index.html`)

The landing page is built on the 長崎 tourism brand rather than on the washi-and-明朝 register of the itinerary pages. Four things carry that reference:

| Axis | What the page does |
| --- | --- |
| **Palette** | White ground, 生成り `#F6F5F1` for panels, 墨 `#1C1C1C` for text, and crimson `#C9202F` (長崎レッド) as the single accent, with 茜 `#A3162A`, 長崎藍 `#12314B` and 金茶 `#C2A05C` as secondary inks. |
| **Type** | Gothic only — Noto Sans JP / Noto Sans TC for Japanese and Traditional Chinese, Archivo for tracked Latin micro-labels. Display type is weight 900; there is no 明朝 on this page. |
| **Pattern** | The diamond lattice from the 長崎 tourist-brand lockup (`#an-lattice`, a 240×24 chain). It sits under the hero title, inside the 青島 band and above the footer stamp, and nowhere else. |
| **Title** | A tracked micro-eyebrow (`観光特集 ・ 第 01 号 ・ 2026 冬`) over an oversized 900-weight gothic headline `日本のどこへ、いつ行く？`, with the 〜まとめ〜 subline below it. |

Because the page runs on its own theme, `landing.css` declares page-local `--ng-*` tokens and does **not** read `--mag-*`; `magazine.css` still drives the three itinerary pages and the atlas. Corners on the landing page are 8–16 px, and the only shadow is the soft lift under the postcard.

Sections run 0101–0105: 日本三帖 preface, 三つの帖 (trilogy index, three photographic cards plus a Stamp Atlas callout), the 青島 quote band, 旅の断片, 寄一封明信片, and 型錄.

Two motifs are deliberately kept and theirs is a narrow brief:

- **Postcard** — the airmail-bordered `旅のたより` panel carries a stamp, a postmark and a 朱 hanko. It is decoration plus one call to action; it stores nothing and reads nothing.
- **Stamping** — stamps, month precision, sign-in and local storage stay in the [world stamp atlas](map/). The landing page never renders stamp state; it only links in. Section 04 says so in copy.

The closing 型錄 section indexes the three trip features only (the Stamp Atlas map is reachable from the nav, category bar, postcard section and the callout). Each entry is an editorial spread: alternating photo/copy sides, an offset colour frame, an oversized hollow issue number, a vertical 第 0X 帖 tab, a date line, a route line and a pill link. The palette, icon grid and type rules live in `spec.md`.

Photography is Wikimedia Commons only, each file credited in the page footer and on the cover. `--ng-sans` and `--ng-grotesk` fall back to **Noto Sans JP / Noto Sans TC** (with Archivo first for Latin) because Japanese shinjitai and kana in display copy (e.g. 断, 残) are absent from the Traditional Chinese subsets.

The design comp in `design/landing-page-comp.jpg` is a local render of the page at 1440 px; the stand-in photography used for that render lives in `design/_assets/` and is git-ignored.

Rules for future edits: the itinerary pages keep `--mag-*` tokens, serif headings at weight 500 and square corners; the landing page keeps `--ng-*` tokens, gothic 900 headings, 長崎 red and the diamond lattice. Neither declares a hex value outside its own token block and the 型錄 palette. Decorative shadows stay out everywhere except the single postcard lift. Copy stays minimal — one page title, plus labels that identify content, report status, or explain a limitation. Every page keeps its own `hero-credit` / credits block for the Wikimedia Commons photo attributions that already ship with it.

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
