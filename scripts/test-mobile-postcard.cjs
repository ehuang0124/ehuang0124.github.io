// Run with NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-mobile-postcard.cjs
// Requires playwright-core and @sparticuz/chromium (or CHROMIUM_PATH).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const passphrase = 'month-picker-test';
const config = `window.TravelAtlasConfig={supabaseUrl:'',supabaseAnonKey:'',localGate:{name:'Test Traveller',passphraseHash:'${crypto.createHash('sha256').update(passphrase).digest('hex')}'}};`;
(async () => {
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    if (req.url.split('?')[0].endsWith('/')) file = path.join(file, 'index.html');
    if (file === path.join(root, 'personal/travel/map/config.js')) {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(config);
    }
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end();
      const types = {'.js':'text/javascript', '.css':'text/css', '.html':'text/html; charset=utf-8', '.svg':'image/svg+xml', '.woff2':'font/woff2'};
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const bundled = process.env.CHROMIUM_PATH ? null : (await import(require.resolve('@sparticuz/chromium'))).default;
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || await bundled.executablePath(),args:bundled ? bundled.args.filter(arg => arg !== '--single-process') : ['--no-sandbox'],headless:true});
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const viewport of [{width:1440,height:960}, {width:390,height:844}, {width:320,height:700}]) {
      const page = await browser.newPage({viewport, reducedMotion:'reduce'});
      const mobile = viewport.width <= 840;
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      await page.goto(base + '/personal/travel/map/');
      assert.equal(await page.locator('#place-list button[data-place]').count(), 240);
      assert.equal(await page.locator('.map-country').count(), 240);
      const dialog = page.locator('#mobile-stamp-dialog');
      const mapPop = page.locator('#map-pop');
      if (mobile) {
        // Phones open on the region index: the map and the list wait behind a card.
        assert.equal(await page.locator('#map-svg').isVisible(), false);
        assert.equal(await page.locator('#place-list').isVisible(), false, 'the home list waits for a search');
        assert.equal(await page.locator('#region-index button[data-region]').count(), 8, 'the whole collection plus one card per continent');
        assert.equal(await page.locator('#region-index button[data-region="AS"] .region-card-count').innerText(), '0 / 55');
        assert(await page.locator('#region-index button[data-region="AS"] .thumb-shape').count() >= 50, 'each card draws its own countries');
        await page.locator('#map-open').click();
        assert.equal(await mapPop.evaluate(el => el.open), true, 'the map pops out over the index');
        assert.equal(await page.locator('#map-pop-title').innerText(), '世界國家');
        assert.equal(await page.locator('#map-pop #place-list').isVisible(), true, 'the list rides with the map');
      } else {
        assert.equal(await page.locator('#region-index').isVisible(), false, 'desktop keeps its side-by-side board');
        assert.equal(await page.locator('#map-open').isVisible(), false);
      }
      // A real map click still selects a destination and opens the mobile postcard.
      await page.locator('#map-svg').scrollIntoViewIfNeeded();
      const point = await page.locator('.map-country[data-id="156"]').evaluate(el => {
        const rect = el.getBoundingClientRect();
        for (let y = Math.max(0, rect.top); y < Math.min(innerHeight, rect.bottom); y += 2)
          for (let x = Math.max(0, rect.left); x < Math.min(innerWidth, rect.right); x += 2)
            if (el.contains(document.elementFromPoint(x, y))) return {x, y};
      });
      assert(point, 'China has a visible clickable point');
      await page.mouse.click(point.x, point.y);
      assert.equal(await page.locator('#place-name').innerText(), '中國');
      // From the whole world the first tap only opens the continent.
      assert.equal(await dialog.evaluate(el => el.open), false, 'the first world-view tap does not open the postcard');
      assert.equal(await page.locator('#region-controls button[aria-pressed="true"]').getAttribute('data-region'), 'AS');
      if (mobile) {
        assert.equal(await page.locator('#map-pop-title').innerText(), '亞洲', 'the pop-out follows the continent');
        const again = await page.locator('.map-country[data-id="156"]').evaluate(el => {
          const rect = el.getBoundingClientRect();
          for (let y = Math.max(0, rect.top); y < Math.min(innerHeight, rect.bottom); y += 2)
            for (let x = Math.max(0, rect.left); x < Math.min(innerWidth, rect.right); x += 2)
              if (el.contains(document.elementFromPoint(x, y))) return {x, y};
        });
        await page.mouse.click(again.x, again.y);
      }
      assert.equal(await dialog.evaluate(el => el.open), mobile);
      if (mobile) {
        assert.equal(await dialog.getAttribute('data-sheet'), 'peek', 'a tap opens the short sheet over the map');
        assert.equal(await page.locator('#map-tooltip').innerText(), '中國', 'the tapped name stays pinned over the map');
        const stamp = await page.locator('#stamp-button').boundingBox();
        assert(stamp.y + stamp.height <= viewport.height, 'the stamp button is reachable without scrolling');
        assert.equal(await page.locator('.impression-paper').isVisible(), false, 'the short sheet keeps the map in view');
        await page.locator('#sheet-toggle').click();
        assert.equal(await dialog.getAttribute('data-sheet'), 'full');
        assert.equal(await page.locator('.impression-paper').isVisible(), true, 'pulling up shows the whole stamp desk');
        // Escape closes the sheet before the map; the close button returns home.
        await page.keyboard.press('Escape');
        await dialog.waitFor({state:'hidden'});
        assert.equal(await mapPop.evaluate(el => el.open), true);
        await page.locator('#map-pop-close').click();
        await mapPop.waitFor({state:'hidden'});
        assert.equal(await page.locator('.atlas-grid > .map-column').count(), 1, 'the map goes back to the board');
        assert.equal(await page.locator('.directory > #place-list').count(), 1, 'the list goes back to the index');
      }
      // The searchable destination index uses the same panel and picker; on a
      // phone the search stays on the home screen and swaps the cards for results.
      await page.locator('#place-search').fill('法國');
      if (mobile) {
        assert.equal(await page.locator('#region-index').isVisible(), false, 'searching swaps the cards for results');
        assert.equal(await page.locator('#place-list').isVisible(), true);
      }
      await page.locator('#place-list button[data-place]').first().click();
      assert.equal(await dialog.evaluate(el => el.open), mobile);
      if (mobile) assert.equal(await mapPop.evaluate(el => el.open), true, 'choosing a result pops the map out with its sheet');
      assert.equal(await dialog.getAttribute('data-family'), 'europe');
      assert.equal(await page.locator('#place-name').innerText(), '法國');
      const toggle = page.locator('#date-picker-toggle');
      const picker = page.locator('#date-picker-panel');
      const value = page.locator('#visit-date');
      const year = page.locator('#date-year');
      const current = await value.inputValue();
      const currentYear = Number(current.slice(0, 4));
      assert.equal(await value.getAttribute('type'), 'hidden');
      assert.equal(await value.isVisible(), false);
      assert.equal(await page.locator('input[type="month"], input[type="date"]').count(), 0, 'no second native picker');
      assert.equal(await toggle.count(), 1);
      assert.equal(await picker.count(), 1);
      assert.equal(await page.locator('#visit-date-label').getAttribute('for'), 'date-picker-toggle');
      assert.equal(await page.getByRole('button', {name:/到訪月份.*年.*月.*選擇/}).count(), 1, 'the accessible name includes purpose and current value');
      const bounds = await toggle.boundingBox();
      const fieldBounds = await page.locator('#date-stamp-picker').boundingBox();
      assert(bounds.height >= 44 && Math.abs(bounds.width - fieldBounds.width) < 1, 'the whole field is a large click target');
      assert.equal(await toggle.evaluate(el => getComputedStyle(el).cursor), 'pointer');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      // Icon, value text, arrow and field padding all open this same chooser.
      await toggle.locator('.date-picker-icon').click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.equal(await picker.isVisible(), true);
      assert.equal(await page.locator('#date-months button').count(), 12);
      assert.equal(await page.locator('#date-year-next').isDisabled(), true);
      assert.equal(await page.locator(`#date-months button[data-month="${current}"]`).evaluate(el => el === document.activeElement), true);
      const futureMonth = Number(current.slice(5)) + 1;
      if (futureMonth <= 12) assert.equal(await page.locator(`#date-months button:nth-child(${futureMonth})`).isDisabled(), true);
      assert(await page.locator('#date-months button').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44)));
      await toggle.locator('.date-picker-chevron').click();
      assert.equal(await picker.isHidden(), true);
      await page.locator('#visit-date-value').click();
      await page.locator('#date-year-prev').click();
      assert.equal(await year.inputValue(), String(currentYear - 1));
      assert.equal(await page.locator('#date-months button:enabled').count(), 12);
      await page.locator('#date-year-next').click();
      assert.equal(await year.inputValue(), String(currentYear));
      // A year edit cannot introduce a future, fractional, missing or zero year.
      for (const invalidYear of [String(currentYear + 1), '0', '', '2020.5']) {
        await year.fill(invalidYear);
        await year.press('Tab');
        assert.equal(await year.inputValue(), String(currentYear));
      }
      await year.fill('1');
      await year.press('Tab');
      assert.equal(await page.locator('#date-year-prev').isDisabled(), true);
      assert.equal(await page.locator('#date-months button[data-month="0001-01"]').count(), 1);
      await year.fill(String(currentYear - 1));
      await year.press('Tab');
      await page.locator(`#date-months button[data-month="${currentYear - 1}-03"]`).click();
      assert.equal(await value.inputValue(), `${currentYear - 1}-03`);
      assert.equal(await page.locator('#visit-date-value').innerText(), `${currentYear - 1} 年 3 月`);
      assert.equal(await page.locator('#stamp-face-date').textContent(), `${currentYear - 1}.03`);
      assert.equal(await picker.isHidden(), true);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await toggle.evaluate(el => el === document.activeElement), true, 'selection returns focus to the only trigger');
      // Space/Enter open; Tab and Enter choose; Escape cancels only the picker.
      await toggle.press('Space');
      assert.equal(await page.locator(`#date-months button[data-month="${currentYear - 1}-03"]`).getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Escape');
      assert.equal(await picker.isHidden(), true);
      assert.equal(await dialog.evaluate(el => el.open), mobile, 'Escape closes the picker before the postcard');
      await toggle.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      const selected = `${currentYear - 1}-04`;
      assert.equal(await value.inputValue(), selected);
      assert.equal(await picker.isHidden(), true);
      await toggle.click({position:{x:3,y:3}});
      await page.locator('#date-year-prev').click();
      await page.locator('.place-heading').click();
      assert.equal(await picker.isHidden(), true, 'outside click closes without committing a browsed year');
      assert.equal(await value.inputValue(), selected);
      await toggle.click();
      assert.equal(await year.inputValue(), String(currentYear - 1));
      await page.locator('#date-months button').last().focus();
      await page.keyboard.press('Tab');
      assert.equal(await picker.isHidden(), true, 'tabbing out closes the panel');
      if (mobile) {
        const stampBounds = await page.locator('#stamp-button').boundingBox();
        assert(stampBounds.y >= 0 && stampBounds.y + stampBounds.height <= viewport.height, 'collapsed postcard action fits on screen');
      }
      // The new canonical value still respects the sign-in gate and persists once.
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#account-dialog').evaluate(el => el.open), true);
      assert.equal(await page.locator('#passport-count').textContent(), '0');
      await page.locator('#passphrase').fill(passphrase);
      await page.locator('#local-signin-submit').click();
      await page.locator('#account-dialog').waitFor({state:'hidden'});
      await page.locator('#stamp-button').click();
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#history-list li').count(), 1, 'duplicate months are not written');
      assert((await page.locator('#stamp-feedback').textContent()).includes('這個月已蓋過章'));
      const savedMonths = () => page.evaluate(() => JSON.parse(localStorage.getItem('eva.travel.stamp-atlas.v1')).visits['countries:250']);
      assert.deepEqual(await savedMonths(), [selected]);
      // Hidden fields have no native constraint validation: exercise our guard directly.
      for (const invalid of ['', 'not-a-month', '0000-01', '2024-00', '2024-13', '2024-01-02', `${currentYear + 1}-01`]) {
        await value.evaluate((el, month) => { el.value = month; el.dispatchEvent(new Event('change', {bubbles:true})); }, invalid);
        await page.locator('#stamp-button').click();
        assert.equal(await toggle.getAttribute('aria-invalid'), 'true');
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true, 'validation focuses the visible trigger, not the hidden value');
        assert((await page.locator('#stamp-feedback').textContent()).includes('不能晚於本月'));
        assert.deepEqual(await savedMonths(), [selected]);
      }
      await toggle.click();
      await year.fill(String(currentYear - 1));
      await year.press('Tab');
      await page.locator(`#date-months button[data-month="${selected}"]`).click();
      assert.equal(await toggle.getAttribute('aria-invalid'), 'false');
      // Closing/reopening and crossing the responsive breakpoint reuse one control.
      if (mobile) {
        await toggle.click();
        await page.locator('#mobile-stamp-close').click();
        await dialog.waitFor({state:'hidden'});
        assert.equal(await picker.isHidden(), true);
        assert.equal(await page.locator('.atlas-grid > .stamp-panel').count(), 1);
        await page.locator('#map-pop #place-list button[data-place]').first().click();
        assert.equal(await value.inputValue(), selected);
        assert.equal(await picker.isHidden(), true);
        await toggle.click();
        await page.setViewportSize({width:1200,height:900});
        await dialog.waitFor({state:'hidden'});
        assert.equal(await page.locator('.atlas-grid > .stamp-panel').isVisible(), true);
        assert.equal(await picker.isHidden(), true);
        assert.equal(await toggle.count(), 1);
        assert.equal(await value.inputValue(), selected);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS month picker / postcard ${viewport.width}px: one picker, full-field trigger, map/index, keyboard, bounds, validation, stamping and responsive restoration`);
      await page.close();
    }
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
