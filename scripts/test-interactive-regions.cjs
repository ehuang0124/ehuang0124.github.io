// Run with: NODE_PATH=/path/to/test-deps/node_modules node scripts/test-interactive-regions.cjs
// Test deps: npm install --prefix /path/to/test-deps playwright-core @sparticuz/chromium
// Or install playwright-core alone and set CHROMIUM_PATH to an existing Chromium executable.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (file.endsWith(path.sep)) file += 'index.html';
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const module = process.env.CHROMIUM_PATH ? null : require('@sparticuz/chromium');
    const bundled = module?.default || module;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || await bundled.executablePath(), args: bundled ? bundled.args.filter(arg => arg !== '--single-process') : ['--no-sandbox'], headless: true });
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      // Tests are offline: Wikimedia photos are not required for map interaction.
      await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const [name, regions] of Object.entries({
        'east-japan': { kanto: 3, chubu: 7, kinki: 4, kyushu: 1 },
        kyushu: { north: 4, south: 7 }
      })) {
        await page.goto(`${url}/personal/interactive/${name}/`);
        const total = Object.values(regions).reduce((sum, n) => sum + n, 0);
        assert.equal(await page.locator('.event').count(), total);
        for (const [region, count] of Object.entries(regions)) {
          await page.selectOption('#region-filter', region);
          assert.equal(await page.locator('.event').count(), count);
          assert(await page.evaluate(() => [...document.querySelectorAll('.mk')].every(g => (g.style.display !== 'none') === MAP_REGIONS[mapRegion].groups.includes(g.dataset.g))));
          assert(await page.evaluate(() => regionEvents().some(e => e.id === active)));
          assert.equal(await page.locator('#region-status').textContent().then(s => s.includes(`${count} 個故事`)), true);
          await page.locator('.event').last().click();
          assert.equal(await page.locator('.event.active').count(), 1);
          await page.locator('#reset-map').click();
          assert.equal(await page.inputValue('#region-filter'), region);
        }
        await page.locator('#all-map').click();
        assert.equal(await page.locator('.event').count(), total);
        await page.selectOption('#region-filter', Object.keys(regions)[0]);
        await page.locator('#route-map').click();
        assert.equal(await page.inputValue('#region-filter'), 'all');
        assert.equal(await page.locator('.event').count(), total);
        if (name === 'kyushu') {
          await page.selectOption('#region-filter', 'north');
          await page.locator('.region-tab[data-region="kagoshima"]').click();
          await page.locator('[data-story="shiro"]').click();
          assert.equal(await page.inputValue('#region-filter'), 'all');
          assert.equal(await page.evaluate(() => active), 'shiro');
        }
        console.log(`PASS ${name} ${viewport.width}px: every region, timeline, markers, reset, route`);
      }
      await page.goto(`${url}/personal/interactive/okinawa/`);
      const expected = { yanbaru: 3, motobu: 7, onna: 3, central: 11, naha: 8, south: 8, kerama: 2, kume: 1, miyako: 2, yaeyama: 4 };
      // All 49 places stay accounted for; no IDs or storage keys changed.
      assert.equal(await page.evaluate(() => PLACES.length), 49);
      assert(await page.evaluate(() => PLACES.every(p => REGIONS[p.region]?.map === p.map)));
      for (const [region, count] of Object.entries(expected)) {
        await page.selectOption('#region-filter', region);
        assert.equal(await page.locator('#sidenav-list button').count(), count);
        assert.equal(await page.locator(`.rcard[data-r="${region}"]`).getAttribute('aria-pressed'), 'true');
        assert(await page.evaluate(() => visiblePlaces().every(p => p.region === regionFilter && p.map === viewName)));
        assert.equal(await page.evaluate(() => visiblePlaces().length), count);
        assert(await page.evaluate(() => [vb.x, vb.y, vb.w, vb.h].every(Number.isFinite)));
        await page.locator('#reset-view').click();
        assert.equal(await page.inputValue('#region-filter'), region);
      }
      await page.selectOption('#region-filter', 'kerama');
      assert.equal(await page.evaluate(() => viewName), 'main');
      await page.locator('.rcard[data-r="miyako"]').click();
      assert.equal(await page.inputValue('#region-filter'), 'miyako');
      assert.equal(await page.evaluate(() => viewName), 'islands');
      await page.locator('[data-view="main"]').click();
      assert.equal(await page.inputValue('#region-filter'), 'all');
      assert.equal(await page.locator('.rcard[aria-pressed="true"]').count(), 0);
      await page.selectOption('#region-filter', 'naha');
      await page.evaluate(() => { visited.clear(); saveVisited(); updateAll(); });
      await page.locator('[data-filter="visited"]').click();
      assert.equal(await page.locator('#sidenav-list button').count(), 0);
      assert(await page.locator('#sidenav-list').textContent().then(s => s.includes('沒有符合')));
      await page.locator('[data-filter="all"]').click();
      await page.evaluate(() => toggleVisited('shuri'));
      await page.locator('[data-filter="visited"]').click();
      assert.equal(await page.locator('#sidenav-list button').count(), 1);
      await page.reload();
      assert(await page.evaluate(() => visited.has('shuri')));
      await page.selectOption('#region-filter', 'kerama');
      await page.locator('#plan-grid [data-stop="kume"]').click();
      assert.equal(await page.inputValue('#region-filter'), 'all');
      assert.equal(await page.evaluate(() => activeId), 'kume');
      await page.selectOption('#region-filter', 'yaeyama');
      await page.locator('#route-toggle').click();
      assert.equal(await page.inputValue('#region-filter'), 'all');
      assert.equal(await page.evaluate(() => viewName), 'main');
      // Native labelled select is keyboard accessible and fits narrow screens.
      await page.locator('#region-filter').focus();
      assert.equal(await page.locator('#region-filter').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`PASS okinawa ${viewport.width}px: 10 regions, view/card sync, stamps, empty state, persistence, itinerary, route, keyboard, no overflow`);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
