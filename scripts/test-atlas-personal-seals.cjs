// Responsive, real-browser regression for the personal seal and companion UI.
// NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-personal-seals.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');

// Use the same single month picker as a traveller, not a native input or DOM assignment.
async function chooseVisitMonth(page, month) {
  await page.locator('#date-picker-toggle').click();
  await page.locator('#date-year').fill(month.slice(0, 4));
  await page.locator('#date-year').press('Tab');
  await page.locator(`#date-months button[data-month="${month}"]`).click();
}

(async () => {
  const server = http.createServer(async (req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    // Keep a project configured: ?demo=1 must still never create its client.
    if (file.endsWith('config.js')) {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end('window.TravelAtlasConfig={supabaseUrl:"https://example.supabase.co",supabaseAnonKey:"test-anon"};');
    }
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const types = { '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.jpg':'image/jpeg' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'text/html; charset=utf-8');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const bundled = process.env.CHROMIUM_PATH ? null : (await import(require.resolve('@sparticuz/chromium'))).default;
    browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || await bundled.executablePath(), args:bundled ? bundled.args.filter(arg => arg !== '--single-process') : ['--no-sandbox'], headless:true });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const viewport of [{ width:1440, height:960 }, { width:390, height:844 }, { width:320, height:700 }]) {
      const page = await browser.newPage({ viewport, reducedMotion:'reduce' });
      const errors = [];
      let projectRequests = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith('https://example.supabase.co')) projectRequests++;
        return url.startsWith(base) ? route.continue() : route.abort();
      });
      await page.goto(base + '/personal/travel/map/?demo=1');
      await page.locator('.place-item').first().waitFor({ state:'attached' });
      assert.equal(await page.evaluate(() => TravelAtlasAccount.mode), 'demo');
      assert.equal(projectRequests, 0, 'demo never contacts the configured project');
      assert(await page.locator('#stamp-button svg').count(), 'stamp action has a real stamp icon');
      assert(await page.locator('#companion-manage').isVisible(), 'visitors can see how to tag companions');
      await page.locator('#sign-in').click();
      await page.locator('#account-demo').click();
      assert.equal(await page.locator('#account-name').textContent(), 'Eva Huang');
      const first = page.locator('.place-item:not(.done)').first();
      const id = await first.getAttribute('data-place');
      assert(id);
      await first.click();
      assert(await page.locator('#stamp-signatures').isHidden(), 'unvisited places do not invent an owner');
      await chooseVisitMonth(page, '2020-02');
      const bounds = await page.locator('#companion-manage').boundingBox();
      assert(bounds.width >= 200 && bounds.height >= 44, 'tagging has a large touch target');
      await page.locator('#companion-manage').click();
      const option = page.locator('.companion-option').filter({ hasText:'林宜臻' });
      assert((await option.boundingBox()).height >= 44, 'traveller option has a large touch target');
      await option.click();
      await page.locator('#companion-form .dialog-submit').click();
      assert((await page.locator('#companion-chips').textContent()).includes('林宜臻'));
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#stamp-owner-initial').textContent(), 'E');
      assert((await page.locator('#stamp-signature-list').textContent()).includes('Eva Huang'));
      const country = page.locator(`.country-imprint[data-place-key="countries:${id}"]`);
      assert.equal(await country.locator('.map-seal[data-author-id="demo-eva"] .map-seal-initial').textContent(), 'E');
      assert.equal(await country.locator('.map-seal').count(), 1, 'tagging a companion does not forge their stamp');
      await page.reload();
      await page.locator('#account-name').waitFor({ state:'visible' });
      await page.locator(`.place-item[data-place="${id}"]`).click();
      assert.equal(await page.locator('#stamp-owner-initial').textContent(), 'E', 'owner initial persists after reload');
      const switchToLin = async () => {
        await page.locator('#account-menu-button').click();
        await page.locator('#demo-user').selectOption('demo-lin');
        assert.equal(await page.locator('#account-name').textContent(), '林宜臻');
      };
      const becomeVisitor = async () => {
        await page.locator('#account-menu-button').click();
        await page.locator('#sign-out').click();
        await page.locator('#sign-in').waitFor({ state:'visible' });
      };
      const signInAsLin = async () => {
        await page.locator('#sign-in').click();
        await page.locator('#account-demo').click();
        await switchToLin();
      };
      await switchToLin();
      assert.equal(await country.locator('.map-seal').count(), 0, 'another traveller is not shown as my stamp');
      assert(await page.locator('#stamp-signatures').isHidden());
      await chooseVisitMonth(page, '2019-01');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#stamp-owner-initial').textContent(), '林');
      assert.equal(await page.locator('#stamp-face-date').textContent(), '2019.01', 'initial and date belong to the same owner');
      assert.equal(await country.locator('.map-seal').count(), 1, 'the signed-in scope shows only my seal');
      assert.equal(await country.locator('.map-seal-initial').textContent(), '林');
      assert(!(await page.locator('#stamp-signature-list').textContent()).includes('Eva Huang'));
      await page.locator('.place-item[data-place="392"]').click();
      const japan = page.locator('.country-imprint[data-place-key="countries:392"]');
      assert.equal(await japan.locator('.map-seal').count(), 1);
      assert.equal(await japan.locator('.map-seal').first().getAttribute('data-author-id'), 'demo-lin');
      assert.equal(await page.locator('#stamp-face-date').textContent(), '2023.04');
      assert.equal(await page.locator('#stamp-signature-list .stamp-signature').count(), 1);
      // A signed-out visitor sees nobody's seals, signatures or dates.
      await becomeVisitor();
      assert.equal(await page.locator('.map-seal').count(), 0, 'the visitor map carries no seals');
      assert.equal(await page.locator('#stamp-signature-list .stamp-signature').count(), 0);
      await page.locator(`.place-item[data-place="${id}"]`).click();
      assert.equal(await country.count(), 0, 'no imprint for a visitor');
      await signInAsLin();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#history-list button[data-date="2019-01"]').click();
      assert.equal(await country.locator('.map-seal').count(), 0, 'removing my seal leaves my view unvisited');
      await becomeVisitor();
      assert.equal(await page.locator('.map-seal').count(), 0, 'a visitor still sees no seals');
      await signInAsLin();
      // Point layers and state outlines also use owner seals.
      await page.locator('#collection-inline').click();
      await page.locator('#tab-cities').click();
      const city = page.locator('.place-item:not(.done)').first();
      const cityId = await city.getAttribute('data-place');
      await city.click();
      await chooseVisitMonth(page, '2020-03');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator(`.map-point[data-id="${cityId}"] .map-seal-initial`).textContent(), '林');
      await page.locator('#collection-inline').click();
      await page.locator('#tab-na').click();
      const state = page.locator('.place-item[data-place^="state-"]:not(.done)').first();
      const stateId = await state.getAttribute('data-place');
      await state.click();
      await chooseVisitMonth(page, '2020-04');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator(`.state-imprint[data-place-key="us:${stateId}"] .map-seal-initial`).textContent(), '林');
      // The four refreshed chapters have distinct bright images; Okinawa is preserved.
      const themes = [];
      for (const theme of ['countries', 'cities', 'na', 'jp', 'okinawa']) {
        await page.locator('#collection-inline').click();
        await page.locator(`#tab-${theme}`).click();
        themes.push(await page.evaluate(() => ({ image:getComputedStyle(document.body).getPropertyValue('--chapter-image'), accent:getComputedStyle(document.body).getPropertyValue('--chapter-accent') })));
      }
      assert.deepEqual(themes.slice(0, 4).map(item => item.image.match(/[^/]+\.jpg/)?.[0]), ['world.jpg', 'cities.jpg', 'north-america.jpg', 'japan.jpg']);
      assert(themes[4].image.includes('okinawa.jpg'));
      assert.equal(new Set(themes.map(item => item.accent)).size, 5);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
      assert.equal(projectRequests, 0);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS personal seals ${viewport.width}px: touch targets, owner identity, persistence, deletion, point/state layers, palettes and local-only demo`);
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
