# Stamp Atlas · 世界蓋章地圖

GitHub Pages route: `/personal/travel/map/`. Linked from the boarding-pass index at `/personal/travel/`.

The atlas is read-only until someone signs in: **no sign-in, no stamps.** Sign-in itself has two modes in the same files.

- **With a Supabase project (the live site).** The top bar offers personal email/password login. The separate account-creation view also asks for an invite and display name; once confirmation and SMTP are enabled (see setup below), Supabase Auth verifies email ownership and personal credentials, and Postgres checks the confirmed email and invite against a bcrypt hash before creating the traveller profile. Stamps live in Postgres, every device syncs, companions and the shared "一起走過" view work, and Row Level Security is the real access control. Every accepted code also writes a row to `atlas_logins`, so the owner can see who signed in, when, and from which browser and address.
- **No Supabase project.** The top bar falls back to a passphrase stored in `config.js` (`localGate`). Stamps then live in that browser's `localStorage`; nothing is uploaded and nothing syncs between devices. The passphrase check runs in the page, so it keeps out visitors, but it is not a security boundary — a static page cannot enforce one.

The account control and the backend status line sit in the sticky top bar on every screen; the footer repeats where the records actually live.

## What it does

- Five map collections: **240 countries and regions**, **171 editorially selected major cities**, **North America: 50 U.S. states, 64 U.S. national parks, and 48 Canadian national parks / national park reserves**, **35 Japanese national parks**, and **49 Okinawa destinations**. U.S. parks include Chiricahua (redesignated October 2026); Canadian parks include Pituamkek (established 2024).
- Click a country/marker or use the searchable, keyboard-accessible destination index. A typed name is an index over **every** collection, not a filter of the open tab, so a Chinese, English or code match found on another layer stays reachable: choosing it switches to that layer and selects the place, keeping the term. A term that matches nothing offers to add it as your own city, with the name carried into the form. Geographic area chips filter the index and reframe the map. Country and U.S. state outlines remain selectable; place and administrative names appear in hover tooltips instead of persistent map text. The North America layer combines selectable U.S. state boundaries, U.S. national parks, and Canadian national parks. Its filters narrow to the United States, one of its travel regions (太平洋西北, 加州, 西南沙漠, 洛磯山脈, 大平原, 中西部・五大湖, 德州與南方, 東南沿岸, 中大西洋, 新英格蘭, 阿拉斯加, 夏威夷, 美國屬地), or Canada, which is a single region. A park belongs to the region of its (first) state. These travel groupings are not administrative boundaries. The Japan national-park layer draws the nine conventional regions (the eight 地方, with Okinawa kept separate) and all 47 prefectures underneath the park markers. Hover or tap a prefecture to read its name and region. Those shapes are not stamp destinations, and the travel chips above the index (關東・甲信越, 南方離島, and the rest) are not those borders. The map pans by dragging anywhere (after an 8px move, so a drag never selects), pinches to zoom with two fingers, and has zoom and reset buttons; a vertical swipe over it still scrolls the page on a phone. From the whole-world view of countries or cities, the first tap on a place opens its continent and selects it; the next tap opens its postcard. A tap that lands on two or more fingertip-sized targets zooms in on the spot instead of guessing. Once a continent is open, countries smaller than a fingertip on screen (Singapore, Malta) get an invisible round tap target. Where parks are far apart (e.g. Alaska, American Samoa, Japan's southern islands), selecting them from the index pans the map to their location.
- A single custom month picker records visits at month precision (`YYYY-MM`). Its full-width calendar button shows the selected year/month, a selection action and a chevron; the same year controls and twelve-month panel work on desktop and mobile, without a second native date/month picker. The canonical value stays in a hidden field, and explicit validation rejects empty, malformed, year-zero and future values. Stamping produces a destination impression and red owner-initial seals on the map. Owners are derived from the existing rows/profiles within the active view: signed-in travellers see their own initial, and signed-out visitors see no seals at all. Companions are not mistaken for stamp owners. Every catalogue entry has a **destination-specific postcard plate**: a well-known local landscape, flower, figure or building drawn as a single-ink engraving. Each plate also carries its own deterministic contour lines and a unique catalogue serial (including every U.S., Canadian and Japanese park), so returning to a place reproduces exactly the same artwork. The plate caption names the motif and its family (風景 / 花草 / 人文 / 建築) and shows the four-step ink scale. Hovering a stamped place reveals its latest date. The same place can have **several visit months**; a repeated month is not added twice. Existing day-precision records migrate to their month when read. Individual stamps can be removed. A place is counted once in the collection total even if it has multiple dates.
- The city index can be extended from the page. Optional latitude **and** longitude give an accurate pin; without coordinates, the pin is explicitly labelled approximate and placed at the chosen country's map center. Custom cities can be removed.
- Every layer shows the **country flag** of each destination: countries, cities, U.S. states, and U.S./Canadian/Japanese parks inherit the flag of their country. Flags are bundled local SVGs (`flags/`, from `country-flag-icons`, MIT), so they render the same on every platform and need no network. The five disputed or unassigned catalogue entries with no ISO 3166-1 code (Somaliland, Northern Cyprus, Siachen Glacier) deliberately show no flag.
- Without a configured project, data stays in this browser's `localStorage` (`eva.travel.stamp-atlas.v1`), with the former Okinawa checklist kept separately as undated reminders. Signing in with the local passphrase is what unlocks stamping, custom cities, import and export. Export a versioned JSON backup, or import one to **merge** (not replace) existing visits and custom cities. Nothing is uploaded.
- **Map colour follows the map, not the stamp.** Every shape wears the hue of its continent — Asia red, Europe blue, Africa gold, the Americas (North and South together) green, Oceania violet, the unassigned 極地海域 entry grey — and inside each hue four tones separate the shapes that sit side by side, so no two countries that share a border, no two U.S. states, and no two neighbouring city or park markers ever show the same colour. `palette.js` solves this once at load from the real border geometry (shared border vertices) and the real point positions; it takes about 40 ms, never persists, and always returns the same answer, so a place keeps its colour on every device. Stamping does not change a tone: an unstamped shape shows its step as a pale tint, a stamped one prints the same step solid, so the four-tone pattern survives stamping. The index rows repeat the same swatch; the map carries no colour legend.
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
- **You can see which one is live from the account menu status line.** The page prints no storage or sync explainers anywhere — no note in the account dialog, no footer data-source line (see `skill.md` at the repo root). The page never prints the project host or names the service. Setup steps never leave the repo: failures on the page are plain language, and raw errors go to the console.
- **The data itself** is in the Supabase dashboard → **Table Editor** → `stamps`, `custom_cities`, `profiles`, and `atlas_logins` (one row per sign-in). Requests appear in the browser's Network panel as `https://<project>.supabase.co/rest/v1/...`.
- **The access code** is never in this repository. `atlas_access` holds one bcrypt hash; rotate it with `select public.atlas_rotate_code('a new code');` in the SQL Editor. `atlas_access`, `atlas_logins`, and `atlas_login_attempts` have RLS on and no policies, so the public API cannot read them.
- **If those two config lines are empty, no backend exists**: stamps are only in `localStorage` (`eva.travel.stamp-atlas.v1`), the site cannot enforce "only someone with the code can stamp", and nothing syncs.

## Accounts, companions, and sync

Linking a Supabase project turns the atlas into a small multi-traveller atlas. The account features below are off until `config.js` has a project URL and anon key; until then the `localGate` passphrase is the only sign-in.

- **Visitors see the map, but no stamps.** A signed-out visitor sees the map, the catalogue and the plates, but nobody's stamps, seals, custom cities or shared trips. Postgres enforces it: only an approved, verified traveller (`atlas_is_traveller()`) may read `stamps` and `custom_cities` ([`20261110_private_stamps.sql`](supabase/migrations/20261110_private_stamps.sql)), and the page does not request them without a session. Every write is checked by Row Level Security against `auth.uid()`. A visitor's stamp button opens the sign-in dialog instead of writing, and the page never holds a key that could edit someone else's rows.
- **One data scope per page view.** A signed-in traveller's map, collection counters, “只看已蓋章” filter and visit history all read that traveller's own records and nothing else; a signed-out visitor sees no records at all. The two never mix in one view, so a country somebody else stamped never appears as your own, and another traveller's companions are never merged into yours. Switching accounts clears the previous traveller's queued rows and restored cache.
- **Separate login and creation.** Returning travellers enter only email and password. The “建立帳號” tab also asks for an invite and display name. The two tabs support arrow keys, Home/End, and native form submission (including mobile keyboards and password managers). An active tab can be clicked again without erasing a draft; tabs are locked while a request is pending. Passwords must be more than 6 characters (minimum 7); set Auth's minimum password length to 7 for API enforcement. Creation first calls `atlas_prepare_signup(email, code, name)`, which checks the invite before any mail is sent and remembers only the address and name; when the confirmation link brings back a confirmed session, `atlas_complete_signup(userAgent)` creates the profile and the traveller is signed in with no second form. If the link was opened on another device, a plain login here finishes it the same way. Projects that have not applied `20261109_complete_signup_on_verify.sql` fall back to the older flow, where `atlas_redeem_code(code, name, userAgent)` approves the profile after the traveller re-enters password and invite. Returning login calls `atlas_login(userAgent)`, which requires an existing approved profile and only appends to the private login log. An Auth account without an approved profile stays read-only. After a wrong invite, creation can resume with the same email and password. The page never stores passwords; Supabase persists its normal session.
- **Login log.** Each successful creation or login appends to `atlas_logins` (time, name, browser string, IP, user id). The page never reads it; it is for the owner in the dashboard.
- **Sign-in persistence.** A session survives reloads. After sign-out, the same email and password return to the same traveller on any device, even after clearing site data. Legacy generated device credentials are removed, not reused. Existing legacy sessions and records remain; see the setup guide's migration note before signing out of an old account.
- **Companions.** A trip is stored per traveller per place per month, so the same place can carry several months and several travellers. The record's owner tags companions before or after stamping; only approved travellers who left “讓其他旅人標記我為旅伴” on can be added, and a database trigger enforces both that rule and the owner's identity. Untagging someone keeps your stamp.
- **被標記的人可以自己解除.** In 一起走過 the tagged traveller sees “解除我的標記” on somebody else's record. `atlas_leave_stamp(id)` only ever removes `auth.uid()` from `companions`; it cannot edit the visit, the owner, or the other companions.
- **一起走過.** Choosing a traveller lists the records that actually name both of you — you tagged them, they tagged you, or a third traveller tagged you both. Two people who independently stamped the same place in the same month without a tag are not counted. The counter reads “N 個共同去過的地點 · M 次到訪”: one place counts once, each month is one visit. Selecting a row jumps to that place on the map.
- **Removing a stamp asks first.** The × in 到訪紀錄 opens a confirmation naming the place and month; cancelling changes nothing.
- **Profile.** Clicking the signed-in chip (avatar and name; there is no separate gear) opens a short menu: name and email, the live sync state, the traveller's footprint (places · visits), the demo identity switch in demo mode, a link to the profile page and 登出. Everything else lives on the dedicated page at [`profile/`](profile/) (`profile/index.html`, `profile.js`, `profile.css`), which runs on `account.js` alone: identity and sync state with 立即同步, footprint numbers, display-name rename, the password-reset mail, the companion (discoverable) toggle, the demo identity switch, and sign-out. Renaming calls `profiles` update on the traveller's own row only (the existing “own profile update” RLS policy); a blank name is refused and an in-progress edit is never overwritten by a re-render. Demo travellers rename against the local demo store and local-gate travellers against `localStorage`; both are told they have no email instead of seeing a blank. A signed-out visitor on the profile page gets one line and a link back to the atlas with `?signin=1`, which opens the sign-in dialog.
- **Password reset.** Returning-user login offers “忘記密碼？”, and the profile page offers 寄送重設密碼信 for a signed-in traveller (hidden when the sign-in method has no email). The page asks the sign-in service to mail a reset link that always returns to the atlas page (even when requested from the profile page), answers in plain language either way, and opens the same dialog on its 重設密碼 view, which only collects a new password. Supabase's recovery callback supplies the recovery type in the URL; links that carry `token_hash` (custom mail templates) are verified with `verifyOtp`. An expired or already-used link comes back with an error in the URL: the page opens the login view with a plain message and 「忘記密碼？」 one click away, and strips the error from the address bar. Choosing the current password again, a reset session that is gone, and being offline each get their own message instead of a generic "reopen the link". Add the page URL to Auth's allowed redirect URLs and keep a mail sender configured, or the request fails quietly.
- **Live sync.** Writes go to Postgres and the page subscribes to `postgres_changes` for `stamps`, `custom_cities`, and `profiles`, so a stamp on one device appears on every open tab and phone. `syncPull()` refetches on reconnect, on tab focus, and every 20 s while the websocket is down.
- **Offline first, and honest about it.** A stamp is drawn immediately, but each record in 到訪紀錄 carries its own state: **待同步** while it waits in the outbox (`eva.travel.atlas.outbox.v1`), **已同步** only after the server confirmed it, and **未同步** with a **重試** button when an attempt was refused. The status line and the stamp feedback say the same thing, so a slow or missing connection never looks like a finished cloud write. A stamp send is locked while the request is in flight, and the record upsert is keyed by traveller, place and month, so a retry or a double tap cannot create a second stamp. A per-user snapshot (`eva.travel.stamp-atlas.v1`, identity-checked) keeps the last known stamps visible while a device is offline, and the JSON export contains only the signed-in traveller's own records.
- **Old local stamps.** The first sign-in on a browser that already has local stamps offers to upload them once (marker key `eva.travel.atlas.adopted.<user-id>`), then clears the local copy so two devices cannot diverge.
- Counters, colouring and history always describe the same traveller the map shows; a signed-out visitor's counters read zero.
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
2. In **Authentication → Sign In / Providers**, enable **Email** and configure custom SMTP for real recipients, then enable **Confirm email** after deploying this version on new projects. In the configured live project, confirmation is already enabled but custom SMTP is still missing. Set the minimum password length to 7. Travellers follow the email link and are signed in (after `20261109_complete_signup_on_verify.sql`; before it they re-enter their credentials and invite). Previously auto-confirmed accounts are not retroactively verified. Unconfirmed Auth users can still temporarily exist, but cannot create profiles or stamps; use rate limits/CAPTCHA and cleanup for signup abuse.
3. Set the shared code in **SQL Editor**: `select public.atlas_rotate_code('your code');` (at least 6 characters; only a bcrypt hash is stored). Repeat this line any time to rotate it.
4. Connect the project and check it in one command:

   ```sh
   node scripts/connect-supabase.cjs --url https://<project>.supabase.co --key <anon key> --check
   ```

   It writes `supabaseUrl` / `supabaseAnonKey` into [`config.js`](config.js), refuses a `service_role` key, and `--check` reports whether the anon key works, email sign-up is open with confirmation on, a code is set, and the `stamps` table exists. `--disconnect` returns the page to browser-only mode. The anon key is public by design; RLS is the access control.
5. Optional: run `NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-accounts.cjs` and `node scripts/test-atlas-auth-errors.cjs` to check the page against an in-memory double of PostgREST, RLS, Supabase sessions, and realtime.

Misconfiguration is answered in plain language on the page (never naming dashboard steps, SQL, or file paths); the raw error goes to the browser console for the owner. A wrong password, a wrong code, a throttled address, an unapproved account, missing tables or functions, an e-mail block, and being offline each get their own sentence (`scripts/test-atlas-auth-errors.cjs`).

The vendored `vendor/supabase.js` is [`@supabase/supabase-js@2.119.0`](https://github.com/supabase/supabase-js) UMD build (MIT, see `vendor/LICENSE-supabase-js.txt`). It is loaded only to keep the page build-free; when no project is configured the client is never created.

## Map, name and park data

- `world.js` is a preprojected and simplified local SVG shape index based on **Natural Earth admin-0 (1:50m)**, redistributed in [`world-atlas@2.0.2`](https://github.com/topojson/world-atlas). It excludes Antarctica, but includes small territories and some disputed geographic features; **240 is not a claim of 240 sovereign states**. These are map/navigation illustrations, not surveyed borders or a statement of political status. Country labels use Traditional Chinese CLDR/Babel names with a few editorial overrides; English labels come from the map index.
- The Natural Earth 1 projection is reproduced in `app.js` so new cities' coordinates align with the prebuilt shapes. See [`d3-geo`](https://github.com/d3/d3-geo) and its license in `licenses/LICENSE-d3-geo.txt`; the source redistribution's notice is in `licenses/LICENSE-world-atlas.txt`.
- **U.S. states:** state outlines come from the U.S. Census Bureau 10m geometries distributed by [`us-atlas@3.0.1`](https://github.com/topojson/us-atlas); the redistribution license is in `licenses/LICENSE-us-atlas.txt`. The 50 state shapes are projected into the page map for illustration, not surveyed-boundary navigation.
- **U.S.:** the [National Park Service's list](https://www.nps.gov/aboutus/national-park-system.htm) (64 as of November 2026). Approximate map points originated from the [National Parks GeoJSON index](https://github.com/kwab7777/National_Parks.Geo.JSON); White Sands, New River Gorge and the newly designated Chiricahua were added separately. Wolf Trap National Park for the Performing Arts is not one of the numbered 64 national parks.
- **Canada:** [Parks Canada's 2026 park counts](https://parks.canada.ca/agence-agency/accessibilite-accessibility/plan-action-accessibilite-accessibility-action-plan-2026-2028) (37 parks + 11 reserves), including [Pituamkek](https://parks.canada.ca/pn-np/cnpn-cnnp/pituamkek). Representative coordinates started with the same world parks GeoJSON index; Thaidene Nëné and Pituamkek have approximate representative points.
- **Japan:** [Ministry of the Environment park list](https://www.env.go.jp/park/parks/) and [35-park research index](https://github.com/isewasabi/japan-park-env-similarity/blob/main/notebooks/config.py). Most representative points use the center of the park bounding rectangles from [this Japan national park map](https://github.com/kamataryo/nationalpark-map/blob/master/topojson/abstract.json); four newer parks are plotted by hand. Prefecture outlines in `jp-admin.js` are a simplified projection of Geospatial Information Authority of Japan, Global Map Japan (2016), via [dataofjapan/land](https://github.com/dataofjapan/land). They illustrate the 47 prefectures and nine conventional regions; they are not surveyed boundaries. The redistribution note is in `licenses/LICENSE-japan-admin.txt`.
- **Flags:** `flags/` contains the 235 SVGs actually used, copied from [`country-flag-icons@1.6.20`](https://github.com/catamphetamine/country-flag-icons) at 3:2. Territory and disputed-area entries follow the map index's ISO codes (`XK` for Kosovo, `IO` for the Indian Ocean Territory); entries without an ISO code show no flag. The MIT notice is in `licenses/LICENSE-country-flag-icons.txt`.
- Major cities display recognizable IATA city/airport codes beside Chinese names when a reliable code exists. City names and points are a **curated, non-exhaustive travel index**, not a comprehensive city directory. Park markers are **representative locations, not park outlines**. Several parks consist of multiple separated areas or islands; use the index for their names rather than reading a pin as an exact boundary or entrance.

## Fonts

The local `fonts/` files are site-character subsets of the variable Google Fonts **Noto Sans TC**, **Noto Sans JP** and **Noto Serif TC**, redistributed under the SIL Open Font License 1.1 (full notices in `fonts/`). They let Traditional Chinese names render in offline/headless previews. `atlas-sans-extra.woff2` and `atlas-serif-extra.woff2` are additional OFL-licensed subsets covering only the caption characters introduced with the postcard plates; their `unicode-range` keeps them from overriding the main fonts. Browsers can still fall back to installed Chinese fonts for characters in user-entered custom city names that are outside every subset. The atlas additionally bundles the on-demand segmented `@fontsource-variable/noto-sans-tc@5.3.1` under `fonts/noto-sans-tc/` (OFL) so names and initials outside the small subset remain legible without a system CJK font. The shared `brand.css` uses `atlas-sans-jp-brand.woff2` (the 図 glyph subset from `@fontsource-variable/noto-sans-jp`; see `LICENSE-NotoSansJP.txt`) for the Japanese 旅行地図 masthead when Google Fonts is offline. Neither a full unsegmented font nor a remote font CDN is needed at runtime.

## Tests

No build tool or production runtime dependency is needed. Install the browser test tools outside the repository:

```sh
npm install --prefix /tmp/atlas-test-deps playwright-core @sparticuz/chromium
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-stamp-atlas.cjs
```

Or supply `CHROMIUM_PATH` pointing to a working Chromium executable. The browser test covers desktop/mobile, hover-only map labels, region navigation, map/list selections, zoom, month-only impressions, legacy date migration, duplicate prevention, delete, persistence, custom cities, export/import, navigation, overflow, the plate caption/tone groups and the specimen index. The existing `scripts/test-interactive-regions.cjs` checks the three Japan itinerary maps independently.

The map colour rules have their own dependency-free Node test:

```sh
node scripts/test-map-palette.cjs
```

It loads the real shape and place data and checks that every country, state, city and park gets a colour, that each continent keeps one hue, that no two shapes sharing a border (and no two neighbouring markers) reuse a tone inside that hue, that each large group uses all four tones, and that a reload reproduces the identical map.

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
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-signup-sql.cjs
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-demo-mode.cjs
```

- `test-atlas-local-mode.cjs` proves the unconfigured page keeps its records in the browser, refuses to stamp without the passphrase, rejects a wrong passphrase, shows country flags, and prints the data source in the footer.
- `test-atlas-auth-errors.cjs` drives the sign-in form against an in-memory client and checks every failure (wrong password, wrong code, throttling, unapproved login, missing setup, offline) is answered with plain language and no backend internals.
- `test-atlas-accounts.cjs` runs the page against an in-memory Supabase double: the access code, the login log, personal-password protection, password reset, the header glance menu, the profile page (email shown, display-name rename, signed-in reset), signup finishing on the confirmation link, cross-device identity, companion stamping, cloud delete, realtime inserts on a second device, row-level security on other people's rows, sessions that never redeemed the code, the shared-trip rules (tags only, third-traveller records, places versus visits, leaving a tag), the per-record sync states, and the demo mode.
- `test-atlas-demo-mode.cjs` walks the demo: sign-in, companion stamps, switching demo identity, a live cross-tab update, and the read-only visitor a signed-out browser sees.


The split account UI and the actual returning-user SQL function have focused tests:

```sh
npm install --prefix /tmp/atlas-test-deps playwright-core @sparticuz/chromium @electric-sql/pglite
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-auth-ui.cjs
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-login-sql.cjs
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-email-sql.cjs
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-stamp-sql.cjs
NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-personal-seals.cjs
```

The browser test checks map/index startup and real map clicks, login/creation switching,
creation-only fields, password validation, native form submission, confirmation and resend (including a fresh-browser callback), rejected-invite retries, completed registration/login through the real Auth client with mocked HTTP responses, and overflow at 1440, 390, and 320 px.
The personal-seal browser test covers multi-owner initials and their dates, large companion controls, local-only demo, persistence, deletion, map layers, chapter palettes and narrow-screen layout.
The login SQL test runs the deployed `atlas_login` definition and grants in embedded Postgres:
anonymous access is denied, an unapproved session cannot create a profile, and approved
logins are recorded privately under `auth.uid()`.

Existing projects missing `atlas_login` can apply only the additive repair in
[`supabase/migrations/20261105_add_atlas_login.sql`](supabase/migrations/20261105_add_atlas_login.sql).
This repair was applied to the configured live project on 2026-11-05; the public API cannot call it anonymously. The additive [`20261106_require_verified_email.sql`](supabase/migrations/20261106_require_verified_email.sql) and Confirm email are already enabled in the configured project, but it still needs custom SMTP to deliver messages to general travellers. The SQL test exercises the real verified-email and profile RLS gates.

Record guards and the companion “leave” function live in
[`supabase/migrations/20261106_stamp_guards.sql`](supabase/migrations/20261106_stamp_guards.sql)
(also included in `setup.sql`, which stays idempotent). They add:
`atlas_guard_stamp()` (an owner never changes, a visit month is never in the future,
and companions are approved travellers who allow being tagged) and
`atlas_leave_stamp(id)` (a tagged traveller removes only their own tag).
[`20261107_verified_write_guards.sql`](supabase/migrations/20261107_verified_write_guards.sql) follows both earlier migrations and also requires an approved, verified caller for profile updates and the security-definer leave RPC. `scripts/test-atlas-stamp-sql.cjs` runs the migration SQL in embedded Postgres. Both stamp guards and the follow-up still need applying to the configured project before this page is deployed; alternatively rerun `setup.sql`.

[`20261110_private_stamps.sql`](supabase/migrations/20261110_private_stamps.sql) replaces the public read policies on `stamps` and `custom_cities` with traveller-only reads (also in `setup.sql`). Apply it to the configured project in the SQL Editor before deploying this page; until then the page hides stamps from visitors, but the public API still returns them. `scripts/test-atlas-stamp-sql.cjs` checks that anonymous and unapproved sessions read nothing while approved travellers still read shared trips.

## Collection navigation and Okinawa

The atlas now uses a full-screen collection menu instead of layer tabs. Its five
chapters each have a distinct background and palette. World, cities, North America and Japan use bright, single-hue photography; Okinawa keeps its existing photograph and palette. The Okinawa
chapter (`?category=okinawa`) contains all 49 locations from the itinerary,
with ten regional filters and the same month-precision stamping, accounts,
companions and backup as the rest of the atlas. It uses `okinawa:<id>` keys;
Okinawa points are approximate and the illustrations are not navigation maps.

The Okinawa itinerary page remains a planning map, but stamping happens in the
atlas. Its old `okinawa-visited-v2` browser list is not deleted. Because it never
stored dates, the atlas displays it (or the old page's preselected defaults when
no list was saved) as a **reminder**, not as a dated stamp. Confirm a place and
enter its actual month to save it to the current atlas account. These undated
reminders are browser-local and are not part of atlas backup or cloud sync.

Run `NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-okinawa.cjs`
to check the deep link, collection switcher, regional filtering, search, old-list
reminders and persisted Okinawa stamps.

### Mobile layout

Up to 840px the atlas is built for quick stamping on a phone (`mobile.css`); desktop keeps its grid and side panel.

- **Index first.** The hero and board heading are hidden, the header is one row, and the collections are swipeable photo cards with a progress bar. The 地點索引 block is the home screen: the search field stays where it is, and below it a card per travel area of the open collection (continents, the U.S. travel regions plus one for Canada, Japanese or Okinawan regions, plus one for the whole collection) shows a small map in the atlas colours and its own stamped / total count. A strip above lists the latest stamps of the open collection. The destination list appears on the home screen only while a term is typed.
- **Map on demand.** Choosing a card, a search result, a recent stamp, or 打開全部地圖 pops the real map, area chips, 只看已蓋章 and the area's list out in a full-screen dialog (`#map-pop`) framed to that area; closing it (×, Escape, back) hands every piece back to the board at once.
- **Postcard sheet.** Tapping a place keeps its name pinned over the map and opens the existing stamp panel as a bottom sheet inside the pop-out. The short sheet shows the name, month and stamp button; tapping the handle or the name, or dragging the handle up, pulls it up for the plate, companions and history. ‹ › (or a sideways swipe on the sheet's top bar) steps to the previous or next place in list order without closing; dragging down, × or Escape closes the sheet before the map. The chosen visit month carries over between places, so stamping a whole trip is quick. A successful stamp presses the impression, gives a short vibration where supported and flashes the newly coloured shape.

`scripts/test-mobile-postcard.cjs` covers the region index, the map pop-out, the two-tap world view, home-screen search, the short and full sheet, the month picker at desktop, 390px and 320px, and reuse of the same panel across the breakpoint.
