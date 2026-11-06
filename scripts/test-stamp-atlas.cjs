// Browser regression test for /personal/travel/map/.
// Install outside the checkout: npm install --prefix /tmp/atlas-test-deps playwright-core @sparticuz/chromium
// Run: NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-stamp-atlas.cjs
// Or provide CHROMIUM_PATH=/path/to/chromium. Some Linux images need LD_LIBRARY_PATH for libnss/libnspr.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
// The page requires a signed-in traveller before stamping. Browser tests use a
// disposable passphrase served in place of config.js, so the real one never
// appears in this file.
const TEST_PASSPHRASE = 'browser-test-passphrase';
const TEST_CONFIG = `window.TravelAtlasConfig={supabaseUrl:'',supabaseAnonKey:'',demoMode:false,localGate:{name:'Test Traveller',passphraseHash:'${crypto.createHash('sha256').update(TEST_PASSPHRASE).digest('hex')}'}};`;

(async () => {
  const server = http.createServer((req,res) => {
    let file = path.join(root,decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
    if (file.endsWith(path.sep)) file += 'index.html';
    if (file === path.join(root,'personal/travel/map/config.js')) {
      res.setHeader('Content-Type','text/javascript; charset=utf-8');
      res.end(TEST_CONFIG);
      return;
    }
    fs.readFile(file,(error,body) => {
      if (error) {res.writeHead(404).end();return;}
      res.setHeader('Content-Type',file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html; charset=utf-8');
      res.end(body);
    });
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    const bundled = process.env.CHROMIUM_PATH ? null : (await import(require.resolve('@sparticuz/chromium'))).default;
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || await bundled.executablePath(),args:bundled ? bundled.args.filter(arg => arg !== '--single-process') : ['--no-sandbox'],headless:true});
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const viewport of [{width:1440,height:960},{width:390,height:844},{width:320,height:700}]) {
      const context = await browser.newContext({viewport,reducedMotion:'reduce',acceptDownloads:true});
      await context.route('**/*',route => route.request().url().startsWith(url) ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      // Sign in with the browser-only passphrase; harmless when already signed in.
      const ensureSignedIn = async () => {
        if (await page.locator('#account-card').isVisible()) return;
        await page.locator('#sign-in').click();
        await page.locator('#passphrase').fill(TEST_PASSPHRASE);
        await page.locator('#local-signin-submit').click();
        await page.locator('#account-card').waitFor({state:'visible'});
      };
      const chooseCollection = async id => { await page.locator('#collection-menu-button').click(); await page.locator(`#tab-${id}`).click(); };
      const onShape = async (selector, action) => {
        await page.locator('#map-svg').scrollIntoViewIfNeeded();
        const point = await page.locator(selector).evaluate(el => {
          const rect = el.getBoundingClientRect();
          for (let y = Math.max(0, rect.top); y < Math.min(innerHeight, rect.bottom); y += 1)
            for (let x = Math.max(0, rect.left); x < Math.min(innerWidth, rect.right); x += 1)
              if (el.contains(document.elementFromPoint(x, y))) return {x, y};
        });
        assert(point, `${selector} has a visible point`);
        if (action === 'hover') await page.mouse.move(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
      };
      page.on('pageerror',error => errors.push(error.message));
      await page.goto(`${url}/personal/travel/map/`);
      await page.evaluate(() => document.fonts.ready);
      assert.deepEqual(errors,[],'the atlas should initialize without uncaught JavaScript errors');
      assert.equal(await page.locator('.map-country').count(),240);
      // The USA's SVG bounding box includes distant territories; its centre
      // can be over France. Hover a genuinely visible point on the path.
      await page.locator('#map-svg').scrollIntoViewIfNeeded();
      const usaPoint = await page.locator('.map-country[data-id="840"]').evaluate(el => {
        const rect = el.getBoundingClientRect();
        for (let y = rect.top; y < rect.bottom; y += 3) for (let x = rect.left; x < rect.right; x += 3) {
          if (document.elementFromPoint(x, y) === el) return {x, y};
        }
      });
      assert(usaPoint, 'USA has a visible hover point');
      await page.mouse.move(usaPoint.x, usaPoint.y);
      assert.equal(await page.locator('#map-tooltip').isVisible(),true);
      assert((await page.locator('#map-tooltip').textContent()).includes('美國'));
      await page.mouse.move(5,5);
      assert.equal(await page.locator('#map-tooltip').isHidden(),true);
      assert.equal(await page.locator('.place-item').count(),240);
      assert(await page.locator('#destination-index').isVisible());
      assert.equal(await page.locator('#place-name').textContent(),'日本');
      assert.equal(await page.locator('#visit-date').getAttribute('type'),'month');
      assert.equal(await page.locator('#map-svg text, #map-svg title').count(),0);
      assert.equal(await page.locator('#state-legend').isHidden(),true);
      assert.equal(await page.locator('.map-country.selected.done').count(),0);
      assert.equal(await page.locator('#board-total').textContent(),'240');
      assert.equal(await page.locator('#tab-count-na').textContent(),'0 / 162');
      // The unified North America layer must still recognize legacy U.S. and Canada stamp keys.
      await page.evaluate(() => localStorage.setItem('eva.travel.stamp-atlas.v1',JSON.stringify({version:1,visits:{'us:yell':['2023-03'],'ca:banff':['2024-06']},customCities:[]})));
      await page.reload();
      assert.equal(await page.locator('#passport-count').textContent(),'2');
      await chooseCollection('na');
      assert.equal(await page.locator('#tab-count-na').textContent(),'2 / 162');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#collection-menu-button').click();
      assert.equal(await page.locator('#collection-menu').evaluate(el => el.open), true);
      assert.equal(await page.locator('#tab-countries').getAttribute('aria-current'), 'true');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#collection-menu').evaluate(el => el.open), false);
      await page.locator('#visit-date').fill('2099-01');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#passport-count').textContent(),'0');
      assert((await page.locator('#stamp-feedback').textContent()).includes('不能晚於本月'));
      await page.locator('#zoom-in').click();
      assert(await page.locator('#map-svg').getAttribute('viewBox').then(box => Number(box.split(' ')[2]) < 1000));
      await page.locator('#zoom-reset').click();
      assert.equal(await page.locator('#map-svg').getAttribute('viewBox'),'0 0 1000 520');
      await page.locator('[data-region="AS"]').click();
      assert.equal(await page.locator('.place-item').count(),55);
      await page.locator('#place-search').fill('日本');
      assert.equal(await page.locator('.place-item[data-place="392"]').count(),1);
      assert(await page.locator('.place-item').count() > 1, 'search spans every collection');
      await page.locator('#place-search').fill('');
      await page.locator('[data-region="all"]').click();
      await page.locator('#map-svg').scrollIntoViewIfNeeded();
      const taiwanPoint = await page.locator('.map-country[data-id="158"]').evaluate(el => {
        const rect = el.getBoundingClientRect();
        for (let y = Math.max(0, rect.top); y < Math.min(innerHeight, rect.bottom); y += .7)
          for (let x = Math.max(0, rect.left); x < Math.min(innerWidth, rect.right); x += .7)
            if (document.elementFromPoint(x, y) === el) return {x, y};
      });
      assert(taiwanPoint, 'Taiwan has a visible clickable point');
      await page.mouse.click(taiwanPoint.x, taiwanPoint.y);
      assert.equal(await page.locator('#place-name').textContent(),'台灣');
      assert(await page.locator('#map-svg').getAttribute('viewBox').then(box => Number(box.split(' ')[2]) < 1000));
      // No sign-in, no ink: the stamp button is locked for a fresh visitor.
      assert.equal(await page.locator('#sign-in').isVisible(),true,'the sign-in control lives in the top bar');
      assert.equal(await page.locator('#stamp-button').getAttribute('data-locked'),'true');
      await page.locator('#visit-date').fill('2023-03');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#account-dialog').evaluate(el => el.open),true);
      assert.equal(await page.locator('#passport-count').textContent(),'0');
      await page.locator('#account-dialog-close').click();
      await ensureSignedIn();
      assert.equal(await page.locator('#stamp-button').getAttribute('data-locked'),'false');
      await page.locator('#visit-date').fill('2023-03');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#passport-count').textContent(),'1');
      assert.equal(await page.locator('.map-country.selected.done').count(),1);
      assert.equal(await page.locator('.country-imprint').count(),1);
      assert.equal(await page.locator('#history-list li').count(),1);
      assert((await page.locator('#stamp-face-date').textContent()).includes('2023.03'));
      // The postcard plate is destination-specific and drawn in one ink with four tonal steps.
      assert((await page.locator('#plate-motif').textContent()).includes('台灣'));
      assert(['風景','花草','人文','建築'].includes(await page.locator('#plate-kind').textContent()));
      assert.equal(await page.locator('#stamp-art g.t-1, #stamp-art g.t-2, #stamp-art g.t-3, #stamp-art g.t-4').count(),4);
      assert((await page.locator('#stamp-art').getAttribute('aria-label')).includes('圖稿編號'));
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#history-list li').count(),1);
      assert((await page.locator('#stamp-feedback').textContent()).includes('這個月已蓋過章'));
      await page.locator('#visit-date').fill('2024-05');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#history-list li').count(),2);
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('#history-list button[data-date="2023-03"]').click();
      assert.equal(await page.locator('#history-list li').count(),2, 'cancel leaves the record intact');
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#history-list button[data-date="2023-03"]').click();
      assert.equal(await page.locator('#history-list li').count(),1);
      await page.reload();
      assert.equal(await page.locator('#passport-count').textContent(),'1');
      assert.equal(await page.locator('#history-list li').count(),0); // Reopens on the featured country.
      await page.locator('#visited-filter').click();
      assert.equal(await page.locator('.place-item').count(),1);
      assert((await page.locator('.place-item').first().textContent()).includes('台灣'));
      await page.locator('.place-item').click();
      assert.equal(await page.locator('#history-list li').count(),1);
      await chooseCollection('cities');
      await page.locator('.map-point[data-id="tokyo-jp"]').hover();
      assert.equal(await page.locator('#map-tooltip').isVisible(),true);
      assert((await page.locator('#map-tooltip').textContent()).includes('東京'));
      assert((await page.locator('#map-tooltip').textContent()).includes('TYO'));
      await page.mouse.move(5,5);
      assert.equal(await page.locator('#map-tooltip').isHidden(),true);
      await page.locator('#place-search').fill('Portland');
      assert.equal(await page.locator('.place-item .city-code').textContent(),'PDX');
      await page.locator('.place-item').click();
      assert.equal(await page.locator('#place-code').textContent(),'PDX');
      await page.locator('#place-search').fill('');
      assert.equal(await page.locator('.place-item').count(),171);
      assert.equal(await page.locator('.map-point').count(),171);
      await page.locator('#visited-filter').click();
      assert.equal(await page.locator('.place-item').count(),0);
      assert((await page.locator('.empty-results').textContent()).includes('還沒有蓋章'));
      await page.locator('#visited-filter').click();
      await page.locator('[data-region="EU"]').click();
      await onShape('.map-point[data-id="berlin-de"]', 'click');
      assert.equal(await page.locator('#place-name').textContent(),'柏林');
      assert(await page.locator('.place-item').count() > 20);
      await page.locator('#place-search').fill('巴黎');
      assert.equal(await page.locator('.place-item').count(),1);
      await page.locator('.place-item').click();
      assert.equal(await page.locator('#place-name').textContent(),'巴黎');
      assert((await page.locator('#plate-motif').textContent()).includes('艾菲爾鐵塔'));
      await page.locator('#visit-date').fill('2022-10');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#passport-count').textContent(),'2');
      assert.equal(await page.locator('.map-point.done').count(),1);
      await chooseCollection('na');
      assert.equal(await page.locator('.place-item').count(),162);
      assert.equal(await page.locator('.map-us-state').count(),50);
      assert.equal(await page.locator('#state-legend').isHidden(),false);
      assert.equal(await page.locator('.map-point').count(),112);
      // Zoom a dense layer before targeting a state on a narrow screen.
      await page.locator('[data-region="us"]').click();
      await page.locator('#place-search').fill('加利福尼亞州');
      await page.locator('.place-item[data-place="state-ca"]').click();
      await onShape('.map-us-state[data-id="state-ca"]', 'hover');
      await page.locator('#place-search').fill('');
      assert((await page.locator('#map-tooltip').textContent()).includes('加利福尼亞州'));
      await page.mouse.move(5,5);
      await page.locator('[data-region="ca"]').click();
      await page.locator('#place-search').fill('Banff');
      await page.locator('.place-item').click();
      await onShape('.map-point[data-id="banff"]', 'hover');
      await page.locator('#place-search').fill('');
      assert((await page.locator('#map-tooltip').textContent()).includes('亞伯達省'));
      await page.mouse.move(5,5);
      assert((await page.locator('[data-region="us"]').textContent()).includes('114'));
      assert((await page.locator('[data-region="ca"]').textContent()).includes('48'));
      await page.locator('[data-region="all"]').click();
      await page.locator('#place-search').fill('加利福尼亞州');
      assert.equal(await page.locator('.place-item[data-place="state-ca"]').count(),1);
      await page.locator('.place-item[data-place="state-ca"]').click(); // focuses the small state
      await onShape('.map-us-state[data-id="state-ca"]', 'click');
      assert.equal(await page.locator('#place-name').textContent(),'加利福尼亞州');
      assert.equal(await page.locator('.map-us-state.selected').count(),1);
      await page.locator('#visit-date').fill('2024-06');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('.map-us-state.done').count(),1);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#history-list button[data-date="2024-06"]').click();
      assert.equal(await page.locator('.map-us-state.done').count(),0);
      await page.locator('#place-search').fill('');
      await page.locator('[data-region="na-us-alaska"]').click();
      assert.equal(await page.locator('.place-item').count(),9);
      await page.locator('[data-region="na-us-hawaii"]').click();
      assert.equal(await page.locator('.place-item').count(),3);
      await page.locator('[data-region="na-us-territories"]').click();
      assert.equal(await page.locator('.place-item').count(),2);
      await page.locator('[data-region="all"]').click();
      await page.locator('#place-search').fill('Chiricahua');
      assert.equal(await page.locator('.place-item').count(),1);
      await page.locator('.place-item').click();
      assert.equal(await page.locator('#place-name').textContent(),'奇里卡瓦');
      await page.locator('#place-search').fill('');
      await page.locator('[data-region="ca"]').click();
      assert.equal(await page.locator('.place-item').count(),48);
      assert.equal(await page.locator('#state-legend').isHidden(),true);
      assert.equal(await page.locator('.map-point').count(),48);
      await page.locator('[data-region="na-ca-north"]').click();
      assert.equal(await page.locator('.place-item').count(),14);
      await chooseCollection('jp');
      assert.equal(await page.locator('.place-item').count(),35);
      await page.locator('.map-point[data-id="fuji"]').hover();
      assert((await page.locator('#map-tooltip').textContent()).includes('富士箱根伊豆'));
      assert((await page.locator('#map-tooltip').textContent()).includes('東京'));
      await page.mouse.move(5,5);
      await page.locator('[data-region="islands"]').click();
      assert.equal(await page.locator('.place-item').count(),6);
      await chooseCollection('cities');
      await page.locator('#add-city').click();
      await page.locator('#city-name').fill('臺南');
      await page.locator('#city-lat').fill('22.998');
      await page.locator('#city-lon').fill('120.212');
      await page.locator('#city-dialog .dialog-submit').click();
      assert.equal(await page.locator('#city-dialog').evaluate(el => el.open),false);
      assert.equal(await page.locator('#place-name').textContent(),'臺南');
      assert.equal(await page.locator('#board-total').textContent(),'172');
      await page.locator('#visit-date').fill('2021-01');
      await page.locator('#stamp-button').click();
      assert.equal(await page.locator('#passport-count').textContent(),'3');
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#export-stamps').click();
      const download = await downloadPromise;
      const backupPath = path.join(os.tmpdir(),`travel-atlas-test-${viewport.width}.json`);
      await download.saveAs(backupPath);
      const backup = JSON.parse(fs.readFileSync(backupPath,'utf8'));
      assert.equal(backup.version,1);
      assert.equal(Object.values(backup.visits).flat().length,3);
      assert.equal(backup.customCities.length,1);
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem('eva.travel.stamp-atlas.v1', JSON.stringify({version:1,visits:{'countries:158':['2023-03-12']},customCities:[]})); });
      await page.reload();
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('eva.travel.stamp-atlas.v1')).visits['countries:158']),['2023-03']);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      assert.equal(await page.locator('#passport-count').textContent(),'0');
      await ensureSignedIn();
      await page.locator('#import-stamps').setInputFiles(backupPath);
      await page.waitForFunction(() => document.querySelector('#passport-count').textContent === '3');
      assert.equal(await page.locator('#passport-count').textContent(),'3');
      assert((await page.locator('#backup-feedback').textContent()).includes('合併'));
      await page.reload();
      await chooseCollection('cities');
      assert.equal(await page.locator('#board-total').textContent(),'172');
      await page.locator('#place-search').fill('臺南');
      await page.locator('.place-item').click();
      assert.equal(await page.locator('#history-list li').count(),1);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#delete-city').click();
      assert.equal(await page.locator('#board-total').textContent(),'171');
      assert.equal(await page.locator('#passport-count').textContent(),'2');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors,[]);
      await page.goto(`${url}/personal/travel/`);
      assert.equal(await page.locator('a.ng-postcard-btn[href="/personal/travel/map/"]').count(),1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(`${url}/personal/travel/map/specimen.html`);
      assert.equal(await page.locator('.specimen-card').count(),110);
      assert.equal(await page.locator('.kind-section').count(),4);
      await page.goto(url);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log(`PASS stamp atlas ${viewport.width}px: four layers, North America states and parks, regional geography, zoom, map/list selection, month-only stamps, delete, persistence, city creation, backup round-trip, no overflow or JS errors`);
      await context.close();
    }
  } finally {await browser?.close();server.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
