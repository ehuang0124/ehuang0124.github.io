// Run with: NODE_PATH=/path/to/test-deps/node_modules node scripts/test-travel-landing.cjs
// Test deps: playwright-core and @sparticuz/chromium, or set CHROMIUM_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');

const image = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#bcd"/><circle cx="400" cy="300" r="120" fill="#456"/></svg>';
const types = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8' };

function layout(page) {
  return page.evaluate(() => {
    const rect = element => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    return [...document.querySelectorAll('.ng-lead')].map(lead => {
      const row = lead.querySelector('a');
      const fig = lead.querySelector('.ng-lead-fig');
      const pic = lead.querySelector('.ng-lead-pic');
      const img = pic.querySelector('img');
      const desc = lead.querySelector('.ng-lead-desc');
      const descStyle = getComputedStyle(desc);
      const rowStyle = getComputedStyle(row);
      return {
        href: row.getAttribute('href'), row: rect(row), fig: rect(fig), pic: rect(pic), img: rect(img),
        copy: rect(lead.querySelector('.ng-lead-copy')), date: rect(lead.querySelector('.ng-lead-date')),
        title: rect(lead.querySelector('.ng-lead-title')), desc: rect(desc),
        route: rect(lead.querySelector('.ng-lead-route')), foot: rect(lead.querySelector('.ng-lead-foot')),
        paddingTop: parseFloat(rowStyle.paddingTop), paddingBottom: parseFloat(rowStyle.paddingBottom),
        fontSize: parseFloat(descStyle.fontSize), lineHeight: parseFloat(descStyle.lineHeight),
        letterSpacing: parseFloat(descStyle.letterSpacing), objectFit: getComputedStyle(img).objectFit,
        imageLoaded: img.complete && img.naturalWidth > 0, alt: img.alt,
        routeSegments: [...lead.querySelectorAll('.ng-lead-route > span')].map(segment => ({
          ...rect(segment), arrow: segment.querySelector('i')?.getAttribute('aria-hidden') || null
        }))
      };
    });
  });
}

function near(actual, expected, message) {
  assert(Math.abs(actual - expected) < 1, `${message}: ${actual} vs ${expected}`);
}

(async () => {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (file.endsWith(path.sep)) file += 'index.html';
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const module = process.env.CHROMIUM_PATH ? null : require('@sparticuz/chromium');
    const bundled = module?.default || module;
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || await bundled.executablePath(),
      args: bundled ? bundled.args.filter(arg => arg !== '--single-process') : ['--no-sandbox'],
      headless: true
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const expectedHrefs = ['/personal/travel/east-japan/', '/personal/travel/kyushu/', '/personal/travel/okinawa/'];
    for (const width of [280, 320, 390, 760, 761, 1000, 1001, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(base + '/')) return route.continue();
        if (url.includes('wikimedia.org/')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: image });
        return route.abort();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/personal/travel/`, { waitUntil: 'domcontentloaded' });
      await page.mouse.move(0, 0);
      // Bring lazy-loaded photos into view and wait for their decoded fixtures.
      for (const img of await page.locator('.ng-lead-pic img').all()) {
        await img.scrollIntoViewIfNeeded();
        await img.evaluate(element => element.decode());
      }
      const rows = await layout(page);
      assert.equal(rows.length, 3);
      assert.deepEqual(rows.map(row => row.href), expectedHrefs);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px overflow`);
      rows.forEach((row, index) => {
        assert(row.imageLoaded && row.alt, `${width}px photo ${index + 1} loads and has alt text`);
        assert.equal(row.objectFit, 'cover');
        for (const edge of ['left', 'right', 'top', 'bottom']) {
          near(row.pic[edge], row.fig[edge], `${width}px photo ${index + 1} fills its frame (${edge})`);
          near(row.img[edge], row.fig[edge], `${width}px image ${index + 1} fills its frame (${edge})`);
        }
        const minHeightRatio = width > 1000 ? [4 / 3, 8 / 7, 5 / 6][index] : width > 760 ? 2 / 3 : 3 / 4;
        assert(row.fig.height / row.fig.width >= minHeightRatio - 0.01, `${width}px photo ${index + 1} is tall enough`);
        if (width > 1000) {
          near(row.fig.top, row.row.top + row.paddingTop, 'photo fills top of desktop row');
          near(row.fig.bottom, row.row.bottom - row.paddingBottom, 'photo fills bottom of desktop row');
          assert(row.copy.top >= row.fig.top - 1 && row.copy.bottom <= row.fig.bottom + 1);
          assert(index === 1 ? row.copy.right < row.fig.left : row.fig.right < row.copy.left, 'alternating columns do not overlap');
        } else {
          near(row.fig.left, row.copy.left, 'stacked columns align');
          assert(row.copy.top - row.fig.bottom >= 23, 'room between photo and copy');
        }
        assert(row.fontSize >= 14 && row.lineHeight >= row.fontSize * 2 && row.letterSpacing > 0, 'readable description');
        assert(row.title.top - row.date.bottom >= 15, 'room after date');
        assert(row.desc.top - row.title.bottom >= 15, 'room after title');
        assert(row.route.top - row.desc.bottom >= 19, 'room after description');
        assert(row.foot.top - row.route.bottom >= 19, 'room after route');
        assert.equal(row.routeSegments.length, [5, 4, 4][index]);
        assert.deepEqual(row.routeSegments.map(segment => segment.arrow), [null, ...Array(row.routeSegments.length - 1).fill('true')]);
        assert(row.routeSegments.every(segment => segment.left >= row.route.left - 1 && segment.right <= row.route.right + 1), 'route segments stay inside the column');
      });
      assert.deepEqual(errors, []);

      if (width === 1024) {
        // Longer or enlarged copy must stretch the photo vertically, not sideways
        // across the text column or past the edge of the viewport.
        await page.addStyleTag({ content: '.ng-lead-desc{font-size:28px!important;line-height:2.1!important}.ng-lead-title b{font-size:44px!important}' });
        await page.evaluate(() => document.querySelectorAll('.ng-lead-desc').forEach(desc => { desc.textContent = desc.textContent.repeat(4); }));
        const enlarged = await layout(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'enlarged text causes no overflow');
        enlarged.forEach((row, index) => {
          near(row.fig.top, row.row.top + row.paddingTop, 'expanded photo fills row top');
          near(row.fig.bottom, row.row.bottom - row.paddingBottom, 'expanded photo fills row bottom');
          near(row.pic.width, row.fig.width, 'expanded crop stays in its column');
          assert(index === 1 ? row.copy.right < row.fig.left : row.fig.right < row.copy.left, 'expanded photo and copy do not overlap');
        });
      }
      if (width === 390 || width === 1440) {
        const first = page.locator('.ng-lead > a').first();
        await first.focus();
        assert.equal(await first.evaluate(element => element === document.activeElement), true);
        await Promise.all([page.waitForURL('**/personal/travel/east-japan/'), page.keyboard.press('Enter')]);
      }
      console.log(`PASS landing ${width}px: filled photos, spacing, routes and responsive layout`);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
