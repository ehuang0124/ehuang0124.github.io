# Stamp Atlas · 世界蓋章地圖

GitHub Pages route: `/personal/travel/map/`. Linked from the boarding-pass index at `/personal/travel/`.

The atlas is read-only until someone signs in: **no sign-in, no stamps.** Sign-in itself has two modes in the same files.

- **With a Supabase project (the live site).** The top bar offers personal email/password sign-in plus an invite code. New accounts also choose a display name; Supabase Auth checks personal credentials, and Postgres checks the invite against a bcrypt hash before creating the traveller profile. Stamps live in Postgres, every device syncs, companions and the shared "一起走過" view work, and Row Level Security is the real access control. Every accepted code also writes a row to `atlas_logins`, so the owner can see who signed in, when, and from which browser and address.
- **No Supabase project.** The top bar falls back to a passphrase stored in `config.js` (`localGate`). Stamps then live in that browser's `localStorage`; nothing is uploaded and nothing syncs between devices. The passphrase check runs in the page, so it keeps out visitors, but it is not a security boundary — a static page cannot enforce one.

The account control and the backend status line sit in the sticky top bar on every screen; the footer repeats where the records actually live.

## What it does

- Four map layers: **240 countries and regions**, **171 editorially selected major cities**, **North America: 50 U.S. states, 64 U.S. national parks, and 48 Canadian national parks / national park reserves**, and **35 Japanese national parks**. U.S. parks include Chiricahua (redesignated October 2026); Canadian parks include Pituamkek (established 2024).
- Click a country/marker or use the searchable, keyboard-accessible destination index. Geographic area chips filter the index and reframe the map. Country and U.S. state outlines remain selectable; place and administrative names appear in hover tooltips instead of persistent map text. The North America layer combines selectable U.S. state boundaries, U.S. national parks, and Canadian national parks. Its filters narrow to the United States, Canada, or subregions. These travel groupings are not administrative boundaries. The map can be dragged from the sea, zoomed, and reset. Where parks are far apart (e.g. Alaska, American Samoa, Japan's southern islands), selecting them from the index pans the map to their location.
- A native month picker records visits at month precision (`YYYY-MM`) and produces a tactile rubber-stamp impression and a small ink mark on the map. Every catalogue entry has a **destination-specific postcard plate**: a well-known local landscape, flower, figure or building drawn as a single-ink engraving. Each plate also carries its own deterministic contour lines and a unique catalogue serial (including every U.S., Canadian and Japanese park), so returning to a place reproduces exactly the same artwork. The plate caption names the motif and its family (風景 / 花草 / 人文 / 建築) and shows the four-step ink scale. Hovering a stamped place reveals its latest date. The same place can have **several visit months**; a repeated month is not added twice. Existing day-precision records migrate to their month when read. Individual stamps can be removed. A place is counted once in the collection total even if it has multiple dates.
- The city index can be extended from the page. Optional latitude **and** longitude give an accurate pin; without coordinates, the pin is explicitly labelled approximate and placed at the chosen country's map center. Custom cities can be removed.
- Every layer shows the **country flag** of each destination: countries, cities, U.S. states, and U.S./Canadian/Japanese parks inherit the flag of their country. Flags are bundled local SVGs (`flags/`, from `country-flag-icons`, MIT), so they render the same on every platform and need no network. The five disputed or unassigned catalogue entries with no ISO 3166-1 code (Somaliland, Northern Cyprus, Siachen Glacier) deliberately show no flag.
- Without a configured project, data stays in this browser's `localStorage` (`eva.travel.stamp-atlas.v1`), separate from the Okinawa page's storage. Signing in with the local passphrase is what unlocks stamping, custom cities, import and export. Export a versioned JSON backup, or import one to **merge** (not replace) existing visits and custom cities. Nothing is uploaded.
- Text is set via `textContent` rather than interpolating user input into markup; imported backups are schema-checked and sanitized.

## Postcard plates

- `stamp-art.js` holds the plate library: 104 hand-drawn SVG engravings and 110 named motifs. Every motif belongs to one of four families: **風景** (scenery and landforms), **花草** (flowers, trees and crops), **人文** (people, cultural figures and animals), **建築** (landmarks and architecture). Motifs are editorial shorthand for a widely recognised local image, **not** a claim about official national symbols, flags or an exhaustive list of what a place is known for.
- Every drawing is built from the same monochrome ink (`--stamp-ink`) in four tonal steps (`.t-1` darkest to `.t-4` lightest). The unstamped preview uses the same ink at reduced opacity, so the whole collection stays in one colour scale rather than mixing destination colours. `app.js` adds a faint, place-specific contour plate behind each motif plus the catalogue serial; the small caption under the stamp identifies the motif and its family.
- Assignment is hierarchical and deterministic: an exact curated destination (country ISO, city id, U.S. state abbreviation, U.S./Canadian/Japanese park id) → the country's motif for unlisted cities → a broad geographic-region motif for the few remaining territories. Regional fallbacks are captioned `地區意象 · …` rather than implying a destination-specific landmark. All 608 catalogue entries resolve to a plate; 570 have their own curated assignment.
- [`specimen.html`](specimen.html) is the plate index, grouped by family, with example destinations for each motif. It is linked from the atlas footer and adds no data or runtime dependency.

## Where the backend lives

GitHub Pages only serves files: there is no server process in this repository, so the page's "backend" is whatever `config.js` points at.

- **Follow [`SETUP-SUPABASE.md`](SETUP-SUPABASE.md)** to create the project, run the schema, set the access code, and write the two config values.
- **`config.js` is the switch.** `supabaseUrl` + `supabaseAnonKey` → Supabase mode. Empty strings → browser-only mode with the `localGate` passphrase.
- **You can see which one is live in three places:** the account menu (*已同步 / 本機通行碼*), the account dialog's 後端 line, and the footer's `資料來源:` line. In Supabase mode the footer prints the project host, e.g. `資料來源：Supabase（abcdefgh.supabase.co）`.
- **The data itself** is in the Supabase dashboard → **Table Editor** → `stamps`, `custom_cities`, `profiles`, and `atlas_logins` (one row per sign-in). Requests appear in the browser's Network panel as `https://<project>.supabase.co/rest/v1/...`.
- **The access code** is never in this repository. `atlas_access` holds one bcrypt hash; rotate it with `select public.atlas_rotate_code('a new code');` in the SQL Editor. `atlas_access`, `atlas_logins`, and `atlas_login_attempts` have RLS on and no policies, so the public API cannot read them.
- **If those two config lines are empty, no backend exists**: stamps are only in `localStorage` (`eva.travel.stamp-atlas.v1`), the site cannot enforce "only someone with the code can stamp", and nothing syncs.

## Accounts, companions, and sync

Linking a Supabase project turns the atlas into a small multi-traveller atlas. The account features below are off until `config.js` has a project URL and anon key; until then the `localGate` passphrase is the only sign-in.

- **Visitors see the map, but cannot change it.** Reading is public; every write is checked by Postgres Row Level Security against `auth.uid()`. A visitor's stamp button opens the sign-in dialog instead of writing, and the page never holds a key that could edit someone else's rows.
- **Personal account + invite code.** Travellers enter their own email, password, and the shared invite code. First-time visitors select “建立帳號” and choose a display name and a password of at least 12 characters. Supabase Auth verifies the password on every form submission; only then does `atlas_redeem_code(code, name, userAgent)` approve the profile. A known invite or a matching display name cannot access somebody else's account. The page never stores passwords; Supabase persists its normal session. Set Auth's minimum password length to 12 as well for API enforcement. Failed sign-ins clear the session and keep the dialog open.
- **Login log.** Each successful redemption appends to `atlas_logins` (time, name, browser string, IP, user id). The page never reads it; it is for the owner in the dashboard.
- **Sign-in persistence.** A session survives reloads. After sign-out, the same email and password plus invite return to the same traveller on any device, even after clearing site data. Legacy generated device credentials are removed, not reused. Existing legacy sessions and records remain; see the setup guide's migration note before signing out of an old account.
- **Companions.** Any signed-in traveller can be tagged on a trip before or after stamping. A trip is stored per traveller per place per month, so the same place can carry several months and several travellers. Untagging someone keeps your stamp.
- **一起走過.** Choosing a traveller lists the places you visited together — either because one of you tagged the other, or because you independently stamped the same place and month. Selecting a row jumps to that place on the map.
- **Live sync.** Writes go to Postgres and the page subscribes to `postgres_changes` for `stamps`, `custom_cities`, and `profiles`, so a stamp on one device appears on every open tab and phone. `syncPull()` refetches on reconnect, on tab focus, and every 20 s while the websocket is down.
- **Offline first.** A stamp is drawn immediately. Failed writes wait in an outbox (`eva.travel.atlas.outbox.v1`) and retry on reconnect, so nothing is lost when a phone loses signal. A per-user snapshot (`eva.travel.stamp-atlas.v1`) keeps the last known stamps visible while a device is offline.
- **Old local stamps.** The first sign-in on a browser that already has local stamps offers to upload them once (marker key `eva.travel.atlas.adopted.<user-id>`), then clears the local copy so two devices cannot diverge.
- Counters describe the signed-in traveller (their own places); visitors see the whole atlas. Everyone's stamps remain on the map.
- **Demo mode** (`?demo=1`) exercises the whole interface with four seeded travellers, `localStorage`, and `BroadcastChannel` instead of a server. It is opt-in and never touches a real project.

### Local passphrase (no backend)

`config.js` → `localGate` holds a display name and the **SHA-256 hash** of a passphrase; the passphrase itself is never written to the repository. Change it in one step:

```sh
node scripts/set-atlas-passphrase.cjs "a new passphrase"
node scripts/set-atlas-passphrase.cjs "a new passphrase" --name "Eva Huang"
```

Anyone who knows the passphrase can stamp **in their own browser**; their stamps stay on that device. Delete `localGate` from `config.js` and the dialog explains that no sign-in method is configured. Switch to Supabase for shared, enforceable records.

### Setup

**[`SETUP-SUPABASE.md`](SETUP-SUPABASE.md) is the click-by-click guide (Chinese) for the whole thing.** The short version:

1. Create a Supabase project, then run [`supabase/setup.sql`](supabase/setup.sql) in **SQL Editor**. It creates `profiles`, `stamps`, `custom_cities`, their RLS policies, and adds the tables to the realtime publication. The script is idempotent.
2. In **Authentication → Sign In / Providers**, enable **Email** and turn **Confirm email** off. Travellers create personal email/password accounts; set the minimum password length to 12 in Auth settings. No confirmation mail is sent, so email ownership is not verified. The invite code separately admits the account to the atlas.
3. Set the shared code in **SQL Editor**: `select public.atlas_rotate_code('your code');` (at least 6 characters; only a bcrypt hash is stored). Repeat this line any time to rotate it.
4. Connect the project and check it in one command:

   ```sh
   node scripts/connect-supabase.cjs --url https://<project>.supabase.co --key <anon key> --check
   ```

   It writes `supabaseUrl` / `supabaseAnonKey` into [`config.js`](config.js), refuses a `service_role` key, and `--check` reports whether the anon key works, email sign-up is open with confirmation off, a code is set, and the `stamps` table exists. `--disconnect` returns the page to browser-only mode. The anon key is public by design; RLS is the access control.
5. Optional: run `NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-accounts.cjs` and `node scripts/test-atlas-auth-errors.cjs` to check the page against an in-memory double of PostgREST, RLS, Supabase sessions, and realtime.

Misconfiguration is surfaced in the page rather than the console: a wrong code, a throttled address, a project with no code set, missing tables or functions, a project that still demands e-mail confirmation, a wrong key, and being offline each get their own sentence naming the next dashboard step (`scripts/test-atlas-auth-errors.cjs`).

The vendored `vendor/supabase.js` is [`@supabase/supabase-js@2.119.0`](https://github.com/supabase/supabase-js) UMD build (MIT, see `vendor/LICENSE-supabase-js.txt`). It is loaded only to keep the page build-free; when no project is configured the client is never created.

## Map, name and park data

- `world.js` is a preprojected and simplified local SVG shape index based on **Natural Earth admin-0 (1:50m)**, redistributed in [`world-atlas@2.0.2`](https://github.com/topojson/world-atlas). It excludes Antarctica, but includes small territories and some disputed geographic features; **240 is not a claim of 240 sovereign states**. These are map/navigation illustrations, not surveyed borders or a statement of political status. Country labels use Traditional Chinese CLDR/Babel names with a few editorial overrides; English labels come from the map index.
- The Natural Earth 1 projection is reproduced in `app.js` so new cities' coordinates align with the prebuilt shapes. See [`d3-geo`](https://github.com/d3/d3-geo) and its license in `licenses/LICENSE-d3-geo.txt`; the source redistribution's notice is in `licenses/LICENSE-world-atlas.txt`.
- **U.S. states:** state outlines come from the U.S. Census Bureau 10m geometries distributed by [`us-atlas@3.0.1`](https://github.com/topojson/us-atlas); the redistribution license is in `licenses/LICENSE-us-atlas.txt`. The 50 state shapes are projected into the page map for illustration, not surveyed-boundary navigation.
- **U.S.:** the [National Park Service's list](https://www.nps.gov/aboutus/national-park-system.htm) (64 as of November 2026). Approximate map points originated from the [National Parks GeoJSON index](https://github.com/kwab7777/National_Parks.Geo.JSON); White Sands, New River Gorge and the newly designated Chiricahua were added separately. Wolf Trap National Park for the Performing Arts is not one of the numbered 64 national parks.
- **Canada:** [Parks Canada's 2026 park counts](https://parks.canada.ca/agence-agency/accessibilite-accessibility/plan-action-accessibilite-accessibility-action-plan-2026-2028) (37 parks + 11 reserves), including [Pituamkek](https://parks.canada.ca/pn-np/cnpn-cnnp/pituamkek). Representative coordinates started with the same world parks GeoJSON index; Thaidene Nëné and Pituamkek have approximate representative points.
- **Japan:** [Ministry of the Environment park list](https://www.env.go.jp/park/parks/) and [35-park research index](https://github.com/isewasabi/japan-park-env-similarity/blob/main/notebooks/config.py). Most representative points use the center of the park bounding rectangles from [this Japan national park map](https://github.com/kamataryo/nationalpark-map/blob/master/topojson/abstract.json); four newer parks are plotted by hand.
- **Flags:** `flags/` contains the 235 SVGs actually used, copied from [`country-flag-icons@1.6.20`](https://github.com/catamphetamine/country-flag-icons) at 3:2. Territory and disputed-area entries follow the map index's ISO codes (`XK` for Kosovo, `IO` for the Indian Ocean Territory); entries without an ISO code show no flag. The MIT notice is in `licenses/LICENSE-country-flag-icons.txt`.
- Major cities display recognizable IATA city/airport codes beside Chinese names when a reliable code exists. City names and points are a **curated, non-exhaustive travel index**, not a comprehensive city directory. Park markers are **representative locations, not park outlines**. Several parks consist of multiple separated areas or islands; use the index for their names rather than reading a pin as an exact boundary or entrance.

## Fonts

The local `fonts/` files are site-character subsets of the variable Google Fonts **Noto Sans TC** and **Noto Serif TC**, redistributed under the SIL Open Font License 1.1 (full notices in `fonts/`). They let Traditional Chinese names render in offline/headless previews. `atlas-sans-extra.woff2` and `atlas-serif-extra.woff2` are additional OFL-licensed subsets covering only the caption characters introduced with the postcard plates; their `unicode-range` keeps them from overriding the main fonts. Browsers can still fall back to installed Chinese fonts for characters in user-entered custom city names that are outside every subset. Neither the full fonts nor a remote font CDN are needed at runtime.

## Tests

No build tool or production runtime dependency is needed. Install the browser test tools outside the repository:

```sh
npm install --prefix /tmp/atlas-test-deps playwright-core @sparticuz/chromium
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-stamp-atlas.cjs
```

Or supply `CHROMIUM_PATH` pointing to a working Chromium executable. The browser test covers desktop/mobile, hover-only map labels, region navigation, map/list selections, zoom, month-only impressions, legacy date migration, duplicate prevention, delete, persistence, custom cities, export/import, navigation, overflow, the plate caption/tone groups and the specimen index. The existing `scripts/test-interactive-regions.cjs` checks the three Japan itinerary maps independently.

The plate library also has a dependency-free Node test:

```sh
node scripts/test-stamp-art.cjs
```

It checks that all 608 destinations resolve to a stable plate, that every motif has a real three-layer drawing in a valid family, and that the famous-destination assignments and regional fallback captions stay intact.

The local sign-in gate, flags, and the read-only visitor state are covered by `scripts/test-atlas-local-mode.cjs` (jsdom). Account behaviour runs headlessly through jsdom (no browser download needed):

```sh
npm install --prefix /tmp/atlas-test-deps jsdom
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-local-mode.cjs
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-auth-errors.cjs
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-accounts.cjs
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-demo-mode.cjs
```

- `test-atlas-local-mode.cjs` proves the unconfigured page keeps its records in the browser, refuses to stamp without the passphrase, rejects a wrong passphrase, shows country flags, and prints the data source in the footer.
- `test-atlas-auth-errors.cjs` loads the page with the `?error=` / `#error=` URLs Supabase redirects back with, and checks the message names the right dashboard step and is cleaned from the address bar.
- `test-atlas-accounts.cjs` runs the page against an in-memory Supabase double: the access code, the login log, personal-password protection, cross-device identity, companion stamping, cloud delete, realtime inserts on a second device, row-level security on other people's rows, sessions that never redeemed the code, and the demo mode.
- `test-atlas-demo-mode.cjs` walks the demo: sign-in, companion stamps, switching demo identity, a live cross-tab update, and the read-only visitor a signed-out browser sees.

