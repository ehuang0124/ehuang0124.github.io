# Stamp Atlas · 世界蓋章地圖

Static, dependency-free GitHub Pages route: `/personal/travel/map/`. Linked from the boarding-pass index at `/personal/travel/`.

## What it does

- Five map layers: **240 countries and regions**, **171 editorially selected major cities**, **64 U.S. national parks**, **48 Canadian national parks / national park reserves**, and **35 Japanese national parks**. U.S. parks include Chiricahua (redesignated October 2026); Canadian parks include Pituamkek (established 2024).
- Click a country/marker or use the searchable, keyboard-accessible destination index. Geographic area chips filter the index and reframe the map. Country outlines show admin-0 divisions; U.S. and Canada layers label state/province codes, and U.S./Canada/Japan layers show broad travel-geography groupings. These travel groupings are not administrative boundaries. The map can be dragged from the sea, zoomed, and reset. Where parks are far apart (e.g. Alaska, American Samoa, Japan's southern islands), selecting them from the index pans the map to their location.
- A native month picker records visits at month precision (`YYYY-MM`) and produces a tactile rubber-stamp impression and a small ink mark on the map. Hovering a stamped place reveals its latest date. The same place can have **several visit months**; a repeated month is not added twice. Existing day-precision records migrate to their month when read. Individual stamps can be removed. A place is counted once in the collection total even if it has multiple dates.
- The city index can be extended from the page. Optional latitude **and** longitude give an accurate pin; without coordinates, the pin is explicitly labelled approximate and placed at the chosen country's map center. Custom cities can be removed.
- All data is private to this browser's `localStorage` (`eva.travel.stamp-atlas.v1`), separate from the Okinawa page's storage. Export a versioned JSON backup, or import one to **merge** (not replace) existing visits and custom cities. There is no account, server, cross-device synchronization, or prefilled personal travel history.
- Text is set via `textContent` rather than interpolating user input into markup; imported backups are schema-checked and sanitized.

## Map, name and park data

- `world.js` is a preprojected and simplified local SVG shape index based on **Natural Earth admin-0 (1:50m)**, redistributed in [`world-atlas@2.0.2`](https://github.com/topojson/world-atlas). It excludes Antarctica, but includes small territories and some disputed geographic features; **240 is not a claim of 240 sovereign states**. These are map/navigation illustrations, not surveyed borders or a statement of political status. Country labels use Traditional Chinese CLDR/Babel names with a few editorial overrides; English labels come from the map index.
- The Natural Earth 1 projection is reproduced in `app.js` so new cities' coordinates align with the prebuilt shapes. See [`d3-geo`](https://github.com/d3/d3-geo) and its license in `licenses/LICENSE-d3-geo.txt`; the source redistribution's notice is in `licenses/LICENSE-world-atlas.txt`.
- **U.S.:** the [National Park Service's list](https://www.nps.gov/aboutus/national-park-system.htm) (64 as of November 2026). Approximate map points originated from the [National Parks GeoJSON index](https://github.com/kwab7777/National_Parks.Geo.JSON); White Sands, New River Gorge and the newly designated Chiricahua were added separately. Wolf Trap National Park for the Performing Arts is not one of the numbered 64 national parks.
- **Canada:** [Parks Canada's 2026 park counts](https://parks.canada.ca/agence-agency/accessibilite-accessibility/plan-action-accessibilite-accessibility-action-plan-2026-2028) (37 parks + 11 reserves), including [Pituamkek](https://parks.canada.ca/pn-np/cnpn-cnnp/pituamkek). Representative coordinates started with the same world parks GeoJSON index; Thaidene Nëné and Pituamkek have approximate representative points.
- **Japan:** [Ministry of the Environment park list](https://www.env.go.jp/park/parks/) and [35-park research index](https://github.com/isewasabi/japan-park-env-similarity/blob/main/notebooks/config.py). Most representative points use the center of the park bounding rectangles from [this Japan national park map](https://github.com/kamataryo/nationalpark-map/blob/master/topojson/abstract.json); four newer parks are plotted by hand.
- Major cities display recognizable IATA city/airport codes beside Chinese names when a reliable code exists. City names and points are a **curated, non-exhaustive travel index**, not a comprehensive city directory. Park markers are **representative locations, not park outlines**. Several parks consist of multiple separated areas or islands; use the index for their names rather than reading a pin as an exact boundary or entrance.

## Fonts

The local `fonts/` files are site-character subsets of the variable Google Fonts **Noto Sans TC** and **Noto Serif TC**, redistributed under the SIL Open Font License 1.1 (full notices in `fonts/`). They let Traditional Chinese names render in offline/headless previews; browsers can still fall back to their installed Chinese fonts for characters in user-entered custom city names that are not in these subsets. Neither the full fonts nor a remote font CDN are needed at runtime.

## Tests

No build tool or production runtime dependency is needed. Install the browser test tools outside the repository:

```sh
npm install --prefix /tmp/atlas-test-deps playwright-core @sparticuz/chromium
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-stamp-atlas.cjs
```

Or supply `CHROMIUM_PATH` pointing to a working Chromium executable. The browser test covers desktop/mobile, region navigation, map/list selections, zoom, month-only impressions, legacy date migration, duplicate prevention, delete, persistence, custom cities, export/import, navigation and overflow. The existing `scripts/test-interactive-regions.cjs` checks the three Japan itinerary maps independently.
