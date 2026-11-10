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
      let registered = false;
      let confirmed = false;
      let approved = false;
      const calls = [];
      const user = { id:'11111111-1111-4111-8111-111111111111', email:'traveller@example.com', aud:'authenticated', role:'authenticated', identities:[{ provider:'email' }] };
      const authUser = () => ({ ...user, email_confirmed_at:confirmed ? '2026-11-06T00:00:00Z' : null });
      const profile = { id:user.id, display_name:'測試旅人', avatar_url:'', discoverable:true };
      const token = () => ['header', Buffer.from(JSON.stringify({ sub:user.id, exp:Math.floor(Date.now()/1000)+3600, role:'authenticated' })).toString('base64url'), 'signature'].join('.');
      const session = () => ({ access_token:token(), refresh_token:'test-refresh', expires_in:3600, token_type:'bearer', user:authUser() });
      await page.route('**/*', async route => {
        const request = route.request();
        if (!request.url().startsWith('https://example.supabase.co')) return request.url().startsWith(base) ? route.continue() : route.abort();
        const url = new URL(request.url());
        const body = request.postDataJSON() || {};
        calls.push({ path:url.pathname, method:request.method(), body });
        // Exercise the real vendored Auth client, including duplicate-signup
        // errors, token persistence, PostgREST maybeSingle, and auth events.
        if (url.pathname === '/auth/v1/settings') return route.fulfill({ json:{ mailer_autoconfirm:false, external:{ email:true } } });
        if (url.pathname === '/auth/v1/signup') {
          await new Promise(resolve => setTimeout(resolve, 200));
          if (registered) return route.fulfill({ json:{ ...authUser(), identities:[] } });
          registered = true;
          return route.fulfill({ json:authUser() });
        }
        if (url.pathname === '/auth/v1/resend' || url.pathname === '/auth/v1/recover') return route.fulfill({ json:{} });
        if (url.pathname === '/auth/v1/token') {
          if (!confirmed) return route.fulfill({ status:400, json:{ code:'email_not_confirmed', msg:'Email not confirmed' } });
          return route.fulfill({ json:session() });
        }
        if (url.pathname === '/auth/v1/logout') return route.fulfill({ status:204 });
        if (url.pathname === '/auth/v1/user') return route.fulfill({ json:authUser() });
        if (url.pathname === '/rest/v1/rpc/atlas_redeem_code') {
          await new Promise(resolve => setTimeout(resolve, 200));
          if (body.p_code !== 'test-invite') return route.fulfill({ json:{ ok:false, reason:'invalid_code' } });
          approved = true;
          return route.fulfill({ json:{ ok:true, user_id:user.id, ...profile } });
        }
        // This browser test covers a project without the newer signup functions;
        // test-atlas-auth-errors/accounts cover the link-finishes-signup flow.
        if (url.pathname === '/rest/v1/rpc/atlas_prepare_signup' || url.pathname === '/rest/v1/rpc/atlas_complete_signup') {
          return route.fulfill({ status:404, json:{ code:'PGRST202', message:`Could not find the function public.${url.pathname.split('/').pop()}` } });
        }
        if (url.pathname === '/rest/v1/rpc/atlas_login') return route.fulfill({ json:{ ok:approved, user_id:user.id, ...profile } });
        if (url.pathname === '/rest/v1/profiles') return route.fulfill({ json:approved ? [profile] : [] });
        return route.fulfill({ json:[] });
      });
      await page.routeWebSocket('**/*', socket => socket.close());
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/personal/travel/map/');
      await page.locator('.place-item').first().waitFor({ state:'attached' });
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
      // On narrow screens a place selection opens the postcard dialog; close it
      // before continuing with the account flow behind it.
      if (await page.locator('#mobile-stamp-dialog').evaluate(dialog => dialog.open)) {
        await page.locator('#mobile-stamp-close').click();
        await page.locator('#mobile-stamp-dialog').waitFor({ state:'hidden' });
      }
      await page.locator('#sign-in').click();
      assert.equal(await page.getByRole('tablist', { name:'帳號操作' }).count(), 1);
      assert.equal(await page.getByRole('tab', { name:'登入', exact:true }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#access-code').isVisible(), false);
      assert.equal(await page.locator('#traveller-name').isVisible(), false);
      assert.equal(await page.locator('#account-sync-note').isVisible(), false);
      assert.equal(await page.locator('.account-list').count(), 0);
      await page.locator('#account-email').fill('traveller@example.com');
      await page.locator('#account-password').fill('123456');
      await page.locator('#account-password').press('Enter');
      await page.waitForFunction(() => document.querySelector('#account-error').textContent.includes('6'));
      const errorStyle = await page.locator('#account-error').evaluate(el => {
        const style = getComputedStyle(el);
        return { color:style.color, background:style.backgroundColor, fontSize:style.fontSize };
      });
      const luminance = color => {
        const channels = color.match(/\d+/g).slice(0, 3).map(value => {
          const channel = Number(value) / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const foreground = luminance(errorStyle.color), background = luminance(errorStyle.background);
      assert((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) >= 4.5, 'account error text meets WCAG AA contrast');
      assert.equal(errorStyle.fontSize, '14px', 'dialog paragraph styles do not shrink account errors');
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
      await page.locator('#account-login').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#account-create').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#account-panel').getAttribute('aria-labelledby'), 'account-create');
      await page.keyboard.press('Home');
      assert.equal(await page.locator('#account-login').getAttribute('tabindex'), '0');
      await page.keyboard.press('End');
      assert.equal(await page.locator('#account-create').getAttribute('tabindex'), '0');
      await page.locator('#account-password').fill('abcdefg');
      await page.locator('#traveller-name').fill('測試旅人');
      await page.locator('#access-code').fill('bad-invite');
      // Selecting the already-active tab must not erase a form in progress.
      await page.locator('#account-create').click();
      assert.equal(await page.locator('#account-password').inputValue(), 'abcdefg');
      assert.equal(await page.locator('#access-code').inputValue(), 'bad-invite');
      // Native/programmatic form submit (including mobile/password-manager
      // submission) must call registration, not implicitly close the dialog.
      await page.locator('#account-form').evaluate(form => form.requestSubmit());
      await page.waitForFunction(() => document.querySelector('#account-panel').getAttribute('aria-busy') === 'true');
      assert(await page.locator('#account-create').isDisabled());
      await page.locator('#email-verification').waitFor({ state:'visible' });
      assert.equal(await page.locator('#verification-email').textContent(), 'traveller@example.com');
      assert(await page.locator('#account-dialog').isVisible());
      assert.equal(await page.locator('#account-create').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#account-password').inputValue(), '');
      assert.equal(await page.locator('#access-code').inputValue(), '');
      assert(await page.locator('#account-card').isHidden());
      assert.equal(calls.filter(call => call.path === '/rest/v1/rpc/atlas_redeem_code').length, 0, 'a pending email never redeems the invite');
      await page.locator('#verification-resend').click();
      await page.waitForFunction(() => document.querySelector('#verification-feedback').textContent.includes('垃圾郵件'));
      assert.equal(calls.filter(call => call.path === '/auth/v1/resend').length, 1);
      assert(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('abcdefg'), 'page never stores the password');
      assert(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('bad-invite'), 'page never stores the invite');
      // Follow a real implicit Auth callback in a fresh browser storage context:
      // the link must work even when opened on a different device/browser.
      confirmed = true;
      await page.evaluate(() => localStorage.clear());
      await page.goto(base + '/personal/travel/map/?email-confirmed=1#access_token=' + encodeURIComponent(token()) + '&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=signup');
      await page.waitForFunction(() => document.querySelector('#account-status').textContent.includes('信箱已驗證'));
      assert(await page.locator('#account-dialog').isVisible());
      assert.equal(await page.locator('#account-email').inputValue(), 'traveller@example.com');
      assert.equal(await page.locator('#account-create').getAttribute('aria-selected'), 'true');
      assert(await page.locator('#account-card').isHidden());
      // An unapproved account can recover its password without the invite
      // prompt replacing the reset form; afterwards it still needs the invite.
      await page.evaluate(() => localStorage.clear());
      await page.goto(base + '/personal/travel/map/?unapproved-reset=1#access_token=' + encodeURIComponent(token()) + '&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery');
      await page.waitForFunction(() => document.querySelector('#code-signin').dataset.mode === 'reset');
      assert(await page.locator('#account-password').isVisible());
      await page.locator('#account-password').fill('abcdefg');
      await page.locator('#account-form').evaluate(form => form.requestSubmit());
      await page.waitForFunction(() => document.querySelector('#account-status').textContent.includes('密碼已更新'));
      assert.equal(await page.locator('#code-signin').getAttribute('data-mode'), 'create');
      assert.equal(await page.locator('#account-email').inputValue(), 'traveller@example.com');
      assert(await page.locator('#account-card').isHidden());
      await page.locator('#account-password').fill('abcdefg');
      await page.locator('#traveller-name').fill('測試旅人');
      await page.locator('#access-code').fill('bad-invite');
      await page.locator('#account-form').evaluate(form => form.requestSubmit());
      await page.waitForFunction(() => document.querySelector('#account-error').textContent.includes('通行碼不正確'));
      assert(await page.locator('#account-dialog').isVisible());
      assert.equal(await page.locator('#account-password').inputValue(), '');
      await page.locator('#account-password').fill('abcdefg');
      await page.locator('#access-code').fill('test-invite');
      await page.locator('#traveller-name').press('Enter');
      await page.locator('#account-dialog').waitFor({ state:'hidden' });
      assert.equal(await page.locator('#account-name').textContent(), '測試旅人');
      assert.equal(calls.filter(call => call.path === '/auth/v1/signup').length, 3);
      assert.equal(calls.filter(call => call.path === '/auth/v1/token').length, 2, 'each retry proves the original password');
      const redemptions = calls.filter(call => call.path === '/rest/v1/rpc/atlas_redeem_code').length;
      assert(!(await page.locator('#account-card').textContent()).includes('⚙'), 'no gear beside the profile');
      await page.locator('#account-menu-button').click();
      const menuBox = await page.locator('#account-menu').boundingBox();
      assert(menuBox.x >= 0 && menuBox.x + menuBox.width <= viewport.width, 'the account menu stays on screen');
      assert.equal(await page.locator('#account-profile-link').getAttribute('href'), './profile/');
      await page.locator('#sign-out').click();
      await page.locator('#sign-in').waitFor({ state:'visible' });
      await page.locator('#sign-in').click();
      await page.locator('#account-password').fill('abcdefg');
      await page.locator('#account-form').evaluate(form => form.requestSubmit());
      await page.locator('#account-dialog').waitFor({ state:'hidden' });
      assert.equal(await page.locator('#account-name').textContent(), '測試旅人');
      assert.equal(calls.filter(call => call.path === '/rest/v1/rpc/atlas_redeem_code').length, redemptions, 'login never redeems an invite');
      assert.equal(calls.filter(call => call.path === '/rest/v1/rpc/atlas_login').length, 1);
      // Recovery and confirmation both use real implicit Auth callbacks. A
      // reset link must keep its dedicated view after the other flow is added.
      await page.locator('#account-menu-button').click();
      await page.locator('#sign-out').click();
      await page.locator('#sign-in').click();
      await page.locator('#account-email').fill('traveller@example.com');
      await page.locator('#account-forgot').click();
      await page.waitForFunction(() => document.querySelector('#account-status').textContent.includes('重設密碼的信已寄出'));
      assert.equal(await page.locator('#account-error').textContent(), '', 'a sent reset mail is not shown as an error');
      assert.equal(calls.filter(call => call.path === '/auth/v1/recover').length, 1);
      await page.evaluate(() => localStorage.clear());
      await page.goto(base + '/personal/travel/map/?password-recovery=1#access_token=' + encodeURIComponent(token()) + '&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery');
      await page.waitForFunction(() => document.querySelector('#code-signin').dataset.mode === 'reset');
      assert(await page.locator('#account-dialog').isVisible());
      assert(await page.locator('#account-password').isVisible());
      assert(await page.locator('#account-email').isHidden());
      assert(await page.locator('#create-account-note').isHidden());
      await page.locator('#account-password').fill('replacement-password-123');
      await page.locator('#account-form').evaluate(form => form.requestSubmit());
      await page.locator('#account-dialog').waitFor({ state:'hidden' });
      assert(calls.some(call => call.path === '/auth/v1/user' && call.method === 'PUT'), 'the new password reaches Auth');
      assert.equal(await page.locator('#account-name').textContent(), '測試旅人');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS auth UI ${viewport.width}px: map/index, keyboard tabs, native form submission, email confirmation on another browser, resend, registration retry, login and password recovery`);
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
