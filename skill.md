# Site copy skill

The copy axis for every page on this site is the journey itself — roads, seasons, cities, history, people, feeling. Anything not on that axis is not copy; it is an appliance manual stapled onto a story, and it does not get written. When in doubt, ask: is this sentence the story, or the appliance? Delete appliance copy.

## Never write

- **Storage, sync, or cloud explainers.** No sentence may describe where records live, what syncs, or which mode the visitor is in — not in the account dialog, not in a footer `資料來源:` line, not in an import/export hint. This includes 「資料會同步到你的帳號，跨裝置都看得到。」, 「資料只存在此瀏覽器」, 「示範資料」, and their relatives. The page makes no storage claims at all, in any mode.
- **Colour legends and swatch keys.** No 各大洲色調 key, no 美國州 key, no legend of what any colour family means — the map and the index swatches carry the colour system. The only legend kept is the stamp-state pair （尚未蓋章／已蓋章）; the drag hint （拖曳移動地圖） is gone.
- **Data-source lines and hint microcopy.** No `資料來源：`, no `海岸線圖資：…`, no `地圖：Natural Earth 向量圖資`, no `歷史資料：…` link row, no `資料與圖片來源` block that says where facts or shapes came from. No small print that explains a drawing or a coordinate either: 「地點座標為概略位置，僅供旅行規劃參考。」, 「圓點為概略位置」, 「位置為概略」, 「國界為地理示意」, 「州界依…示意」, 「地圖形狀為地理示意」, 「標示旅行分區，非行政界線」, 「圖稿為編輯插畫，非官方國徽…」 — all out. A dot is read as an approximate position by being a dot; the page does not say so. Photo and font credits stay, because a licence requires them.
- **Manual-style instruction sentences.** 「點一個事件，地圖會移到它發生的地方」, 「也可以直接點地圖標記；切換區域只留下該區的景點」, 「在地圖上找一個國家，或在下方搜尋它的名字」, 「座標選填；留空時以國家中心標示」. If the interface needs a sentence to be usable, the interface is wrong, not the visitor.
- **Descriptions parked beside section headings.** A page gets one clear title; the heading carries it alone. No side descriptions beside section heads, no paragraph restating the heading.
- **Decorative slogans.** 「COLLECT MOMENTS, NOT JUST PLACES.」, 「每一張地圖，都是一種走看世界的方式。」, 「WHERE TO NEXT?」 — taglines that say nothing about the journey are out.
- **Promotional guide text above a page title.** Do not add redundant product-name eyebrows or quiz metadata such as 「JAPANESE TEA FINDER」 and 「7 題 · 2 分鐘 · 不需要註冊」. Let the page title and action speak for themselves; keep necessary navigation and accessible labels.
- **Pointers at this repo.** No visible copy may reference `spec.md`, setup guides, Notion, or agent rules. Visibly noting `personal/travel/spec.md` or 「行程整理自 Notion」 was a violation.
- **Duplicate attribution lines.** If the footer already carries the full photo/font credit, no `Photographs ・ Wikimedia Commons` strip-notes.

## Always keep

- **The story.** Narrative copy about places — roads, seasons, weather, history, legends, food, light. This is the axis; it may be long.
- **One clear title per page and per section**, navigation labels, action buttons, form labels, accessible names.
- **Live status in its shortest form:** 待同步／已同步／未同步＋「重試」, 同步中（N 筆待上傳）, 離線, 連線異常，將自動重試， and the stamp feedback itself. Status is shown, never explained.
- **Sign-in gates and empty states:** one short line saying what signing in enables (登入後才能蓋章, 登入後可以標記一起旅行的朋友) or what is empty (登入後，標記過旅伴的旅程會出現在這裡). No second sentence about why.
- **Accessibility and safety text:** skip links, aria-labels, alt text, `role="alert"` errors, noscript notices, keyboard instructions for dialogs.
- **Licence, photo, and font credits** only. Data-honesty disclaimers on the page are retired: no approximate-location note, no approximate-boundary note, no 「旅遊分區，不是古代三山疆界。」. The drawing itself carries the approximation.
- **Reset-view guidance** inside the 重設密碼 view (「設定新密碼後，就能用新密碼登入。」) — the one explanatory line a task-typed view keeps.

## Working rules

- Cutting copy means cutting its CSS, its JS hooks (`.textContent` writes, hidden toggles), affected tests, and doc references in the same change. No orphaned selectors, no assertions on deleted elements.
- If a sentence is only true because of the visitor's sign-in state, prefer the button that changes with it (登入後蓋章) over prose beside it.
- New pages: write the story first. If a sentence cannot be traced to a place, a season, a person, or a necessary status, it does not ship.
- `agent.md` owns the engineering rules; this file owns the copy axis. When the axis moves, both move in the same PR.
