// Run with NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-mobile-postcard.cjs
// Requires playwright-core and @sparticuz/chromium (or CHROMIUM_PATH).
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    if (file.endsWith(path.sep)) file += 'index.html';
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const bundled = process.env.CHROMIUM_PATH ? null : (await import(require.resolve('@sparticuz/chromium'))).default;
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || await bundled.executablePath(),args:bundled ? bundled.args : ['--no-sandbox'],headless:true});
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.goto(base + '/personal/travel/map/');
    await page.locator('#place-search').fill('法國');
    await page.locator('#place-list button[data-place]').first().click();
    const dialog = page.locator('#mobile-stamp-dialog');
    assert.equal(await dialog.evaluate(el => el.open), true);
    assert.equal(await dialog.getAttribute('data-family'), 'europe');
    assert.equal(await page.locator('#place-name').innerText(), '法國');
    const toggle = page.locator('#date-picker-toggle');
    const picker = page.locator('#date-picker-panel');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await picker.isVisible(), true);
    const current = await page.locator('#visit-date').getAttribute('max');
    const currentYear = Number(current.slice(0, 4));
    assert.equal(await page.locator('#date-months button').count(), 12);
    assert.equal(await page.locator('#date-year-next').isDisabled(), true);
    const futureMonth = Number(current.slice(5)) + 1;
    if (futureMonth <= 12) assert.equal(await page.locator(`#date-months button:nth-child(${futureMonth})`).isDisabled(), true);
    await page.locator('#date-year').fill(String(currentYear - 1));
    await page.locator('#date-year').press('Tab');
    await page.locator(`#date-months button[data-month="${currentYear - 1}-03"]`).click();
    assert.equal(await page.locator('#visit-date').inputValue(), `${currentYear - 1}-03`);
    assert.equal(await page.locator('#stamp-face-date').textContent(), `${currentYear - 1}.03`);
    assert.equal(await picker.isHidden(), true);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    assert.equal(await page.locator(`#date-months button[data-month="${currentYear - 1}-03"]`).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await picker.isHidden(), true);
    assert.equal(await dialog.evaluate(el => el.open), true, 'Escape closes the picker before the postcard');
    const bounds = await page.locator('#stamp-button').boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844, 'stamp button fits on screen');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.evaluate(el => el.open), false);
    assert.equal(await page.locator('.atlas-grid > .stamp-panel').count(), 1);
    await page.setViewportSize({width:1200,height:900});
    assert.equal(await page.locator('.atlas-grid > .stamp-panel').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('PASS mobile postcard: selection, regional colour, viewport, Escape and desktop restoration');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
