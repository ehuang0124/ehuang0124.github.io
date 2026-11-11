# Travel pages

## One brand for every page

Every page under `personal/travel/` — the landing page, the two 幕末 itinerary pages, 沖繩 and the world stamp atlas — now runs on **one** visual brand: the 長崎 tourism look the landing page introduced. White ground, gothic type with 900-weight display headings, crimson `#C9202F` as the single accent, 8–16 px corners, one hairline system, and the diamond lattice from the 長崎 tourist-brand lockup.

`brand.css` is that brand. Every page links `crumbs.css`, then its own layout CSS, then `brand.css` **last** — so the brand can retheme a page without that page's CSS having to know about it. The landing page is the one page that adds `landing.css` after `brand.css`, because its section layout has to win over the shared pieces. It owns the `--ng-*` tokens, base type and focus ring, breadcrumbs, the sticky top bar, the cover/hero, section heads, chips and controls, footers, the shared 基本情報 / 目次 / note blocks, and then one commented "pass" per page family (itinerary, 沖繩, atlas, historical layer).

| File | Scope |
| --- | --- |
| `brand.css` | The shared brand layer: tokens, base type, breadcrumbs, top bar (landing header, 沖繩 topbar, atlas header), hero/cover, lattice, section heads, chips, buttons, selects, footers, plus a pass for each page family. Loaded after the page's layout CSS (on the landing page, before `landing.css`). |
| `landing.css` | Landing page only (`index.html`): the 頁面分類 row (the no-JavaScript fallback index), 目次, feature cards, the 推し POINT callout, the 青島 band, 旅の断片, the postcard and the printed 型錄 style guide. It declares no tokens of its own. |
| `assets/travel-icons.svg` | Shared 24×24 line-icon sprite (13 symbols: 神社 / 五重塔 / 城 / 山 / 海 / 鐵道 / 渡船 / 溫泉 / 食 / 寫真 / 地點 / 郵戳, plus `an-lattice` — the 240×24 diamond chain used as the brand's separator). Reference one with `<svg class="an-i"><use href="/personal/travel/assets/travel-icons.svg#an-castle"/></svg>`; stroke and fill are inherited, so a single class themes every icon. |
| `itinerary.css` | Layout for the two 幕末 itinerary maps (East Japan, Kyushu): cover, prefecture cards, chronology, map panel, place panel. Tokens and type come from `brand.css`. |
| `okinawa/okinawa.css` | 沖繩 page layout only (narrative chapters, mainland interactive atlas, four-day itinerary); tokens and type come from `brand.css`. |
| `map/style.css` | Stamp Atlas application layout. Its `:root` aliases the atlas's own names (`--paper`, `--rust`, `--serif` …) to brand tokens; `brand.css` is what turns that layout white, crimson and gothic. |
| `history-context.css` | The optional shared history layer used by the East Japan and Kyushu maps; themed by the historical-context pass in `brand.css`. |
| `crumbs.css` | Shared breadcrumb bar, matching the landing page's `.ng-crumbs`; a page may still theme it through `--crumb-*`. |

Four axes carry the brand everywhere:

| Axis | What every page does |
| --- | --- |
| **Palette** | White ground, 生成り `#F6F5F1` for panels and footers, 墨 `#1C1C1C` for text, crimson `#C9202F` (長崎レッド) as the single accent, with 茜 `#A3162A`, 長崎藍 `#12314B` and 金茶 `#C2A05C` as secondary inks. |
| **Type** | Gothic only — Noto Sans JP / Noto Sans TC, Archivo for tracked Latin micro-labels, and the bundled `Atlas Sans TC` subsets (`map/fonts/`, absolute-path `@font-face` in `brand.css`) as the offline fallback. Display type is weight 900; there is no 明朝 anywhere. |
| **Pattern** | The 240×24 diamond chain (`#an-lattice`) sits under every page title and above every footer, and nowhere else. |
| **Surface** | Corners are 8–16 px; rules are one hairline (`--ng-line` / `--ng-line-soft`); shadows are limited to the landing postcard and a soft card lift on hover. The magazine's inset photo frame and vertical 縦書き rail are retired — text runs horizontally. |

## Landing page (`index.html`)

The landing page is the reference implementation of that brand. A tracked micro-eyebrow (`観光特集 ・ 第 01 号 ・ 2026 冬`) sits over an oversized 900-weight gothic headline `日本のどこへ、いつ行く？`, with the 〜まとめ〜 subline below it.

`landing.css` no longer declares tokens of its own: it consumes `--ng-*` from `brand.css`, so one edit to the brand reaches the landing page, the two itinerary pages, 沖繩 and the atlas at once.

Sections run 0101–0105: 日本三帖 preface, 三つの帖 (trilogy index, three photographic plates plus a Stamp Atlas callout), the 青島 quote band, 旅の断片, 寄一封明信片, and 型錄. 旅の断片 is a responsive four-place Kyushu index: each card links to the matching prefecture in `kyushu/?region=<key>#regions`. Unknown region keys fall back to Nagasaki.

**One menu, not two.** `navigation.js` gives every travel page a single trigger: the sticky header's link row becomes one full-screen `MENU` dialog holding the four journeys (東海道, 九州, 沖繩, 世界蓋章), the page's own 頁面分類 links as chips, and a foot row (旅行首頁, 文字紀錄, Eva Huang). A page's section row is marked `data-page-sections` — it is the no-JavaScript fallback index and is folded into that dialog at load, so the landing page never shows a second menu stacked under the header. The hero's 往下閱讀 cue points at the first section (`#journeys`), not at the section row.

Two motifs are deliberately kept and theirs is a narrow brief:

- **Postcard** — the airmail-bordered `旅のたより` panel carries a stamp, a postmark and a 朱 hanko. It is decoration plus one call to action; it stores nothing and reads nothing.
- **Stamping** — stamps, month precision, sign-in and local storage stay in the [world stamp atlas](map/). The landing page never renders stamp state and never mentions stamps, month records or sign-in; section 04 is one postcard and only links in.

The closing 型錄 section indexes the three trip features only (the Stamp Atlas map is reachable from the menu, the postcard section and the callout). Each entry is an editorial spread: alternating photo/copy sides, an offset colour frame, an oversized hollow issue number, a vertical 第 0X 帖 tab, a date line, a route line and a pill link. The palette, icon grid and type rules live in `spec.md`.

Photography is Wikimedia Commons only, each file credited in the page footer and on the cover. `--ng-sans` and `--ng-grotesk` fall back to **Noto Sans JP / Noto Sans TC** (with Archivo first for Latin) because Japanese shinjitai and kana in display copy (e.g. 断, 残) are absent from the Traditional Chinese subsets. The itinerary, island and atlas pages draw their Wikimedia Commons images the same way and keep their own `hero-credit` / credits blocks.

The design comp in `design/landing-page-comp.jpg` is a local render of the page at 1440 px; the stand-in photography used for that render lives in `design/_assets/` and is git-ignored.

Rules for future edits: every page keeps `--ng-*` tokens, gothic 900 headings, 長崎 red, 8–16 px corners and the lattice; no page declares a hex value outside the `brand.css` token block (page CSS asks for a token instead). New shared chrome belongs in `brand.css`; page CSS keeps only that page's layout. Decorative shadows stay out everywhere except the postcard lift and the soft card hover. Copy stays minimal — one page title, plus labels that identify content, report status, or explain a limitation. Every page keeps its own `hero-credit` / credits block for the Wikimedia Commons photo attributions that already ship with it.

# Interactive map regions

The postcard-style [world stamp atlas](map/) is a fourth, independent map at `/personal/travel/map/`. Its four layers, country flags, month-precision stamps, sign-in (a shared access code checked by Supabase, or a browser-only passphrase when no project is configured), the login log, local backup format, data provenance and browser tests are documented in [`map/README.md`](map/README.md). The atlas is read-only until someone signs in. The three Japan itinerary maps described below retain their existing stamps and storage keys.

All three maps expose a labelled native **區域** select next to the map controls. A region filters markers and the map's story/place list, then frames the selected area. Resetting the view keeps the filter; choosing the full itinerary clears it. Selecting a story/place from outside the current region clears incompatible filters so the destination is visible.

## Japan

- East Japan: 關東 (Tokyo), 中部／東海 (Shizuoka, Aichi), 近畿 (Mie: Matsusaka, Ise, Shima), plus the explicitly off-map 博多 continuation.
- Mie can also be grouped with Tokai in travel contexts; this map consistently uses the Kinki prefectural grouping and labels Mie explicitly.
- Kyushu: 北部九州 (the existing Fukuoka/Nagasaki stories) and 南部九州 (Kagoshima/Miyazaki). The existing seven-prefecture editorial navigation is retained.
- Options reflect the map's existing content, not an all-Japan coverage claim. There are currently no Hokuriku stories or markers.

## Okinawa

The Okinawa feature page (`/personal/travel/okinawa/`) focuses on Fuzhou / Chinese immigration heritage and the 2027 1/7–1/10 mainland itinerary across **14 sites** in two mainland groupings (the complete 49-place Okinawa dataset remains intact in the independent [world stamp atlas](map/) via `map/okinawa-places.js`):

| Area | Sites |
| --- | --- |
| 那霸・首里 (`naha`, 8 sites) | Kume (久米村・久米至聖廟), Fukushuen (1992 garden), Shuri Castle, Shikinaen (1799), Tsuboya (1682 kiln consolidation), Kencho-mae, Kokusai-dori / Makishi, Naha Airport |
| 中部 (`central`, 6 sites) | Nishihara / Haebaru (Ryukyu kasuri & suburban stops), Urasoe (1372 Satto tribute origin), Nakagusuku Castle, Yomitan Yachimun no Sato, Southeast Botanical Gardens, Koza Gate 2 Street |

The page pairs four thematic narrative chapters (`#narrative`, linking directly into map pins) with a mainland-only interactive SVG atlas (`#atlas`, including a 6-site `只看移民史核心` filter and 1/7–1/10 route toggle) and the four-day itinerary (`#plan`). Place names live in the site index, hover tooltips and keyboard-accessible pins, not permanent map overlays. It intentionally excludes the 1945 Battle of Okinawa markers (`history-context.js`) and outer-island/Yanbaru regions so the editorial scope stays centered on Sino-Ryukyuan maritime immigration history and the 2027 mainland itinerary.

The cover and landing card share a locally bundled copy of the [2010 Shuri Castle aerial photograph](https://commons.wikimedia.org/wiki/File:100927_Shuri_Cstl_aerial.jpg) (MLIT/GSI; reuse allowed with attribution, including the prescribed National Land Image Information credit in each page's footer). Each of the four narrative chapters also has one locally bundled, captioned Commons landmark photograph, with photographer, original file, exact licence and changes credited beside the image:

| Chapter / depicted place | Local photo | Original and photographer | Chosen reuse licence |
| --- | --- | --- | --- |
| 01 · Urasoe Castle's **reconstructed** outer wall, not medieval masonry | `okinawa/photos/urasoe-walls.jpg` | [Urasoe Castle Walls](https://commons.wikimedia.org/wiki/File:Urasoe_Castle_Walls.jpg), Sturmgewehr88 (2013) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.en) |
| 02 · Kume Shiseibyo's present gate, at the **post-2013** temple site | `okinawa/photos/kume-shiseibyo.jpg` | [Kume-Shiseibyo, Naha](https://commons.wikimedia.org/wiki/File:151230_Kume-Shiseibyo_Naha_Okinawa_pref_Japan01n.jpg), 663highland (2015) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.en) |
| 03 · Shikinaen's pond bridge and royal villa | `okinawa/photos/shikinaen.jpg` | [Naha Shikinaen](https://commons.wikimedia.org/wiki/File:Naha_Shikinaen17n4272.jpg), 663highland (2011) | [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/deed.en) |
| 04 · Tsuboya Yachimun Street near the 南窯 entrance | `okinawa/photos/tsuboya-street.jpg` | [Tsuboya-Yachimun-dori street](https://commons.wikimedia.org/wiki/File:JP-47_Naha_Tsuboya-Yachimun-dori_street.jpg), Hajime NAKANO (2006) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/deed.en) |

These are small web JPEGs (500 × 375, 960 × 640, 960 × 640, and 480 × 640 respectively): the Urasoe and Tsuboya source downloads were Commons-indexed previews, and the Kume and Shikinaen images were downsized from larger Commons images. The site copies were recompressed and metadata-stripped, **not cropped or colour-edited**; the responsive figures also preserve each photo's aspect ratio. The photos remain subject to their individual licences, not a blanket licence for the site. Both the cover and landing card load the already bundled segmented Noto Sans TC variable font (`map/fonts/noto-sans-tc/`) so the new Traditional Chinese characters remain legible offline even when Google Fonts is unavailable. The shared masthead's Japanese 図 glyph has a small OFL-licensed JP fallback (`map/fonts/atlas-sans-jp-brand.woff2`).

## Browser regression tests

No production build step or runtime dependency is introduced. Install test tools outside the checkout:

```sh
npm install --prefix /tmp/atlas-test-deps playwright-core
NODE_PATH=/tmp/atlas-test-deps/node_modules CHROMIUM_PATH=/path/to/chromium \
  node scripts/test-interactive-regions.cjs
NODE_PATH=/tmp/atlas-test-deps/node_modules CHROMIUM_PATH=/path/to/chromium \
  node scripts/test-travel-landing.cjs
```

Alternatively install `@sparticuz/chromium` alongside `playwright-core` (requires compatible system libraries) and omit `CHROMIUM_PATH`. Tests serve this checkout on an ephemeral loopback port and block external photo requests. The landing test covers filled photos, text spacing, route wrapping, keyboard links and longer copy across desktop and mobile widths. The region tests cover timeline/marker filtering, Okinawa's 4 narrative chapters and their locally loaded, uncropped photographs, 14 mainland sites, core-site and route toggles, reset behavior, itinerary jumps and keyboard focus.

## Historical context and the Kanto/Kansai question

`history-context.js` / `history-context.css` provide one shared, optional SVG context layer used by East Japan and Kyushu (`AtlasHistory.events` keeps all 9 canonical events so shared scripts stay intact). The East Japan map labels **Kansai (Kinki) ← Chubu (Tokai) → Kanto**. Kanto and Kansai do not share a border. Open-diamond markers identify **Hakone Pass**, **Fuwa Barrier / Sekigahara**, and **Suzuka Pass** as travel gateways / transition references, not a surveyed regional boundary. The region grouping remains Kinki including Mie; Kansai's cultural extent varies by definition.

Closed, numbered diamonds identify exactly **nine** selected historical locations in `history-context.js` (with East Japan showing 5 and Kyushu showing 2):

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

The regression suite also covers the nine-item cap, historical marker filtering/toggles, gateway controls and boundary disclaimer, keyboard marker activation, focus retention, and independence from stamp filtering. The 49-place Okinawa dataset in `map/okinawa-places.js` remains untouched.
