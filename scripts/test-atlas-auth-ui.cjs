// Browser smoke test for separate login/creation views, desktop and mobile.
// Dependencies outside the checkout: playwright-core, @sparticuz/chromium
// Run with NODE_PATH=/tmp/atlas-test-deps/node_modules; optionally CHROMIUM_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer(async (req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (file.endsWith('config.js')) {
      res.setHeader('Content-Type', 'text/javascript');
      res.end('window.TravelAtlasConfig={supabaseUrl:"https://example.supabase.co",supabaseAnonKey:"test-anon"};');
      return;
    }
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const types = { '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
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
      await page.route('**/*', route => {
        // The real client can initialize; network responses are deterministic
        // and read-only. No test request reaches a live Supabase project.
        if (route.request().url().startsWith('https://example.supabase.co')) return route.fulfill({ json:[] });
        return route.request().url().startsWith(base) ? route.continue() : route.abort();
      });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/personal/travel/map/');
      await page.locator('.place-item').first().waitFor();
      assert.equal(await page.locator('.place-item').count(), 240);
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#map-svg').scrollIntoViewIfNeeded();
      // Click an actual visible point inside a country, not the SVG path's
      // bounding-box centre (which may fall in another country for islands).
      const point = await page.locator('.map-country[data-id="156"]').evaluate(el => {
        const rect = el.getBoundingClientRect();
        for (let y = rect.top; y < rect.bottom; y += 3) for (let x = rect.left; x < rect.right; x += 3) {
          if (document.elementFromPoint(x, y) === el) return { x, y };
        }
      });
      assert(point, 'a map destination has a clickable visible point');
      await page.mouse.click(point.x, point.y);
      assert((await page.locator('#place-name').textContent()).includes('中國'));
      await page.locator('#sign-in').click();
      assert.equal(await page.locator('#access-code').isVisible(), false);
      assert.equal(await page.locator('#traveller-name').isVisible(), false);
      assert.equal(await page.locator('#account-sync-note').isVisible(), false);
      assert.equal(await page.locator('.account-list').count(), 0);
      await page.locator('#account-email').fill('traveller@example.com');
      await page.locator('#account-password').fill('123456');
      await page.locator('#account-password').press('Enter');
      await page.waitForFunction(() => document.querySelector('#account-error').textContent.includes('6'));
      assert(await page.locator('#account-dialog').isVisible());
      await page.locator('#account-create').click();
      assert(await page.locator('#access-code').isVisible());
      assert(await page.locator('#traveller-name').isVisible());
      assert.equal(await page.locator('#account-password').getAttribute('autocomplete'), 'new-password');
      assert.equal(await page.locator('#account-password').getAttribute('minlength'), '7');
      await page.locator('#access-code').fill('temporary-test-invite');
      await page.locator('#account-login').click();
      assert.equal(await page.locator('#access-code').inputValue(), '');
      assert.equal(await page.locator('#access-code').isVisible(), false);
      assert.equal(await page.locator('#account-password').getAttribute('autocomplete'), 'current-password');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS auth UI ${viewport.width}px: map/index, concise login, creation-only invite, password validation, mode switching`);
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
