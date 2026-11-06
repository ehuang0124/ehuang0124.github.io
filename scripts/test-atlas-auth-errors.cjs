// Regression: a failed sign-in must be answered in plain language, never with
// a raw backend string or a setup instruction. Every case below drives the
// real page against a stub client and checks what a person actually sees.
//
// Run: NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-auth-errors.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const mapDir = path.join(__dirname, '..', 'personal/travel/map');
const html = fs.readFileSync(path.join(mapDir, 'index.html'), 'utf8');
const CLOUD = 'window.TravelAtlasConfig={supabaseUrl:"https://example.supabase.co",supabaseAnonKey:"test-anon-key",demoMode:false};';
const LOCAL = 'window.TravelAtlasConfig={supabaseUrl:"",supabaseAnonKey:"",demoMode:false};';
const wait = async (n = 14) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 3)); };

// Minimal stand-in for supabase-js: just the calls the page makes.
function makeClient({ signedUp = true, signupResponse = null, rpc = { data:null, error:null }, signInError = null, profileResponse = null } = {}) {
  const state = { session: null, rpcCalls: [] };
  const chain = () => {
    const builder = {
      select() { return builder; }, order() { return builder; }, limit() { return builder; },
      eq() { return builder; }, in() { return builder; }, update() { return builder; },
      delete() { return builder; }, upsert() { return builder; },
      maybeSingle() { return Promise.resolve(profileResponse || { data:null, error:null }); },
      single() { return Promise.resolve({ data:null, error:null }); },
      then(resolveFn, rejectFn) { return Promise.resolve({ data:[], error:null }).then(resolveFn, rejectFn); }
    };
    return builder;
  };
  const client = {
    auth: {
      onAuthStateChange() { return { data:{ subscription:{ unsubscribe(){} } } }; },
      async getSession() { return { data:{ session: state.session }, error:null }; },
      async signUp() {
        if (signupResponse) return signupResponse;
        if (!signedUp) return { data:{ user:null, session:null }, error:{ message:'could not create the personal account' } };
        state.session = { access_token:'token', user:{ id:'user-device', email:'eva@example.com', email_confirmed_at:'2026-11-06T00:00:00Z' } };
        return { data:{ user:state.session.user, session:state.session }, error:null };
      },
      async signInWithPassword() {
        if (signInError) return { data:{ user:null, session:null }, error: signInError };
        state.session = { access_token:'token', user:{ id:'user-personal', email:'eva@example.com', email_confirmed_at:'2026-11-06T00:00:00Z' } };
        return { data:{ session:state.session, user:state.session.user }, error:null };
      },
      async signOut() { state.session = null; return { error:null }; }
    },
    from: chain,
    rpc(name, args) { state.rpcCalls.push({ name, args }); return Promise.resolve(rpc); },
    channel() {
      const realtime = { on() { return realtime; }, subscribe(handler) { handler?.('SUBSCRIBED'); return realtime; } };
      return realtime;
    },
    removeChannel() {}
  };
  return { client, state };
}

async function load({ config = CLOUD, clientOptions, url = 'https://eva.example/personal/travel/map/' } = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', error => errors.push(error.message));
  window.matchMedia ||= () => ({ matches:false, media:'', addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
  window.Element.prototype.scrollIntoView ||= function () {};
  window.HTMLElement.prototype.scrollIntoView ||= function () {};
  window.HTMLDialogElement ||= window.HTMLElement;
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
  const fake = makeClient(clientOptions);
  window.supabase = { createClient: () => fake.client };
  for (const file of ['config.js', 'account.js', 'palette.js', 'world.js', 'places.js', 'okinawa-places.js', 'us-states.js', 'app.js']) {
    window.eval(file === 'config.js' ? config : fs.readFileSync(path.join(mapDir, file), 'utf8'));
  }
  await wait();
  const $ = selector => window.document.querySelector(selector);
  const click = node => node.dispatchEvent(new window.MouseEvent('click', { bubbles:true, cancelable:true }));
  async function signIn({ name = 'Eva Huang', code = 'travel2n', createAccount = true } = {}) {
    click($('#sign-in'));
    await wait();
    if (createAccount) click($('#account-create'));
    $('#account-email').value = 'eva@example.com';
    $('#account-password').value = 'personal-password-123';
    $('#traveller-name').value = name;
    $('#access-code').value = code;
    click($('#code-signin-submit'));
    await wait(20);
  }
  return { window, $, click, signIn, errors, fake };
}

(async () => {
  // 0. A wrong password says so in plain words; the dialog stays open and the
  // form is usable again — this is the failure a returning traveller hits most.
  {
    const page = await load({ clientOptions:{ signInError:{ message:'Invalid login credentials', code:'invalid_credentials' } } });
    await page.signIn({ createAccount:false });
    assert(page.$('#account-error').textContent.includes('電子郵件或個人密碼不正確'), 'a wrong password is named plainly');
    assert.equal(page.$('#account-dialog').open, true, 'the dialog stays open');
    assert.equal(page.$('#code-signin-submit').disabled, false, 'the form is usable again');
    assert.equal(page.$('#account-password').value, '', 'the password is cleared');
    assert.equal(page.fake.state.session, null, 'no session is kept');
    assert.deepEqual(page.errors, []);
  }

  // 1. A wrong code is refused by Postgres; the page says so in Chinese.
  {
    const page = await load({ clientOptions:{ rpc:{ data:{ ok:false, reason:'invalid_code' }, error:null } } });
    await page.signIn({ code:'nope' });
    assert.equal(page.$('#account-dialog').open, true, 'the dialog stays open');
    assert(page.$('#account-error').textContent.includes('通行碼不正確'), 'the reason is translated');
    assert.equal(page.$('#account-card').hidden, true, 'a refused code does not sign anybody in');
    assert.equal(page.fake.state.rpcCalls.at(-1).args.p_code, 'nope', 'the code is checked in Postgres, not in the page');
    assert.deepEqual(page.errors, []);
  }

  // 2. Too many guesses is its own message, not a raw database error.
  {
    const page = await load({ clientOptions:{ rpc:{ data:{ ok:false, reason:'throttled' }, error:null } } });
    await page.signIn();
    assert(page.$('#account-error').textContent.includes('稍後再試'), 'throttling asks the traveller to wait');
    assert.deepEqual(page.errors, []);
  }

  // 3. No code set yet: plain language, no SQL on the page.
  {
    const page = await load({ clientOptions:{ rpc:{ data:{ ok:false, reason:'no_code_set' }, error:null } } });
    await page.signIn();
    assert(page.$('#account-error').textContent.includes('網站擁有者'), 'a missing code points at the owner, not at SQL');
    assert(!/atlas_rotate_code|SQL/i.test(page.$('#account-error').textContent), 'no setup detail leaks to the page');
    assert.deepEqual(page.errors, []);
  }

  // 4. Missing tables/functions: plain language, no file paths on the page.
  {
    const page = await load({
      clientOptions:{ rpc:{ data:null, error:{ message:'Could not find the function public.atlas_redeem_code', code:'PGRST202' } } }
    });
    await page.signIn();
    assert(page.$('#account-error').textContent.includes('登入服務暫時無法使用'), 'a missing function is a plain outage message');
    assert(!/setup\.sql|PGRST202|atlas_/i.test(page.$('#account-error').textContent), 'no setup detail leaks to the page');
    assert.deepEqual(page.errors, []);
  }

  // 5. A network failure is not a wrong code.
  {
    const page = await load({ clientOptions:{ signedUp:false } });
    await page.signIn();
    assert(page.$('#account-error').textContent.length > 0, 'the failure is reported');
    assert.equal(page.$('#account-card').hidden, true);
    assert.deepEqual(page.errors, []);
  }

  // 6. Without a project the code form never appears and nothing is called.
  {
    const page = await load({ config: LOCAL });
    page.click(page.$('#sign-in'));
    await wait();
    assert.equal(page.$('#code-signin').hidden, true, 'no Supabase project, no access-code form');
    assert.equal(page.$('#account-dialog').open, true);
    assert.equal(page.fake.state.rpcCalls.length, 0, 'no backend calls in local mode');
    assert.deepEqual(page.errors, []);
  }

  // Returning login has its own plain outage message and approval boundary.
  {
    const page = await load({ clientOptions:{ rpc:{ data:null, error:{ message:'Could not find the function public.atlas_login', code:'PGRST202' } } } });
    await page.signIn({ createAccount:false });
    assert(page.$('#account-error').textContent.includes('登入服務暫時無法使用'));
    assert(!/setup\.sql|PGRST202|atlas_/i.test(page.$('#account-error').textContent), 'no setup detail leaks to the page');
    assert.equal(page.$('#account-dialog').open, true);
    assert.equal(page.fake.state.session, null);
    assert.equal(page.fake.state.rpcCalls.at(-1).name, 'atlas_login');
    assert.equal(page.fake.state.rpcCalls.at(-1).args.p_code, undefined);
    assert.deepEqual(page.errors, []);
  }
  {
    const page = await load({ clientOptions:{ rpc:{ data:{ ok:false, reason:'not_approved' }, error:null } } });
    await page.signIn({ createAccount:false });
    assert(page.$('#account-error').textContent.includes('建立帳號'));
    assert.equal(page.$('#account-card').hidden, true);
    assert.equal(page.fake.state.session, null);
    assert.deepEqual(page.errors, []);
  }

  // Obfuscated duplicate-signup responses are not email-confirmation errors.
  {
    const page = await load({ clientOptions:{ signupResponse:{ data:{ user:{ identities:[] }, session:null }, error:null }, profileResponse:{ data:{ id:'user-personal' }, error:null } } });
    await page.signIn();
    assert(page.$('#account-error').textContent.includes('已註冊'));
    assert(!page.$('#account-error').textContent.includes('Confirm email'));
    assert.equal(page.$('#account-create').getAttribute('aria-selected'), 'true');
    assert.equal(page.fake.state.rpcCalls.length, 0);
  }
  // Unexpected network/client exceptions never leave a disabled form behind.
  {
    const page = await load();
    page.window.TravelAtlasAccount.signIn = async () => { throw new Error('network interrupted'); };
    await page.signIn();
    assert(page.$('#account-error').textContent.includes('連線失敗'));
    assert.equal(page.$('#code-signin-submit').disabled, false);
    assert.equal(page.$('#account-create').disabled, false);
    assert.equal(page.$('#account-login').disabled, false);
    assert.equal(page.$('#account-panel').hasAttribute('aria-busy'), false);
    assert.equal(page.$('#account-dialog').open, true);
    assert.deepEqual(page.errors, []);
  }

  console.log('PASS sign-in errors: wrong password, wrong code, throttling, missing code, missing setup, offline, login function, unapproved login');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
