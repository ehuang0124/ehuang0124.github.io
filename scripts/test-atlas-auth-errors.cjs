// Regression: a failed Google round-trip must explain the next click, not show
// Supabase's raw error. Supabase returns failures as ?error=… / #error=… on the
// page it redirected back to; this file loads the page with those URLs.
//
// Run: NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-auth-errors.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const mapDir = path.join(__dirname, '..', 'personal/travel/map');
const html = fs.readFileSync(path.join(mapDir, 'index.html'), 'utf8');
const wait = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 3)); };

async function load(url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', error => errors.push(error.message));
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.Element.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const proto = window.HTMLDialogElement.prototype;
  if (!proto.showModal) {
    proto.showModal = function () { this.open = true; };
    proto.close = function () { this.open = false; };
  }
  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
      clear: () => store.clear(),
      key: index => [...store.keys()][index] ?? null,
      get length() { return store.size; }
    },
    configurable: true
  });
  // Local config: the redirect-error handling must work with no project too.
  const config = 'window.TravelAtlasConfig={supabaseUrl:"",supabaseAnonKey:"",demoMode:false};';
  for (const file of ['config.js', 'account.js', 'world.js', 'places.js', 'us-states.js', 'app.js']) {
    window.eval(file === 'config.js' ? config : fs.readFileSync(path.join(mapDir, file), 'utf8'));
  }
  await wait(14);
  return { window, document: window.document, errors };
}

(async () => {
  // 1. Provider not enabled: the classic "I set up Google but forgot the switch".
  {
    const url = 'http://localhost/personal/travel/map/?error=server_error&error_description=Unsupported+provider%3A+provider+is+not+enabled';
    const page = await load(url);
    const $ = selector => page.document.querySelector(selector);
    assert.equal($('#account-dialog').open, true, 'the sign-in dialog explains the failure');
    assert($('#account-error').textContent.includes('Authentication → Providers → Google'), 'it names the exact dashboard step');
    assert.equal(new URL(page.window.location.href).search.includes('error='), false, 'the error is cleared from the address bar');
    assert.deepEqual(page.errors, []);
  }

  // 2. Redirect URL not allowed (error arrives in the hash for implicit flow).
  {
    const url = 'http://localhost/personal/travel/map/#error=access_denied&error_description=redirect_uri_mismatch';
    const page = await load(url);
    const $ = selector => page.document.querySelector(selector);
    assert.equal($('#account-dialog').open, true);
    assert($('#account-error').textContent.includes('URL Configuration'), 'it names the redirect configuration step');
    assert.equal(new URL(page.window.location.href).hash, '', 'the hash is cleared');
    assert.deepEqual(page.errors, []);
  }

  // 3. Cancelled consent is not a setup problem.
  {
    const url = 'http://localhost/personal/travel/map/?error=access_denied';
    const page = await load(url);
    const $ = selector => page.document.querySelector(selector);
    assert($('#account-error').textContent.includes('取消了 Google 授權'));
    assert.deepEqual(page.errors, []);
  }

  // 4. A page with no error keeps the dialog closed and the URL untouched.
  {
    const page = await load('http://localhost/personal/travel/map/?demo=0');
    const $ = selector => page.document.querySelector(selector);
    assert.equal($('#account-dialog').open, false);
    assert.equal($('#account-error').textContent, '');
    assert(page.window.location.href.endsWith('?demo=0'), 'unrelated query parameters survive');
    assert.deepEqual(page.errors, []);
  }

  console.log('PASS auth errors: OAuth failures are translated and cleaned from the URL');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
