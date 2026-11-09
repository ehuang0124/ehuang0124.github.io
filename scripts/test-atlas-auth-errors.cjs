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
// `prepare` answers atlas_prepare_signup; by default the project predates it
// (function missing), so the older verify-then-redeem flow is exercised.
const LEGACY_PREPARE = { data:null, error:{ code:'PGRST202', message:'Could not find the function public.atlas_prepare_signup' } };
function makeClient({ signedUp = true, signupResponse = null, rpc = { data:null, error:null }, prepare = LEGACY_PREPARE, rpcByName = {}, signInError = null, initialSession = null, profileResponse = null, updateUserError = null } = {}) {
  const state = { session: initialSession, rpcCalls: [], prepareCalls: [], signupCalls:0, resendCalls:0, updateUserCalls:0 };
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
        state.signupCalls++;
        if (signupResponse) return signupResponse;
        if (!signedUp) return { data:{ user:null, session:null }, error:{ message:'could not create the personal account' } };
        // A previously verified, not-yet-approved signup returns the
        // obfuscated duplicate response and must prove the password again.
        return { data:{ user:{ identities:[] }, session:null }, error:null };
      },
      async resend() { state.resendCalls++; return { error:null }; },
      async signInWithPassword() {
        if (signInError) return { data:{ user:null, session:null }, error: signInError };
        state.session = { access_token:'token', user:{ id:'user-personal' } };
        return { data:{ session:state.session, user:state.session.user }, error:null };
      },
      async updateUser() { state.updateUserCalls++; return { data:{ user:state.session?.user || null }, error:updateUserError }; },
      async signOut() { state.session = null; return { error:null }; }
    },
    from: chain,
    rpc(name, args) {
      if (name === 'atlas_prepare_signup') { state.prepareCalls.push(args); return Promise.resolve(prepare); }
      state.rpcCalls.push({ name, args });
      return Promise.resolve(rpcByName[name] || rpc);
    },
    channel() {
      const realtime = { on() { return realtime; }, subscribe(handler) { handler?.('SUBSCRIBED'); return realtime; } };
      return realtime;
    },
    removeChannel() {}
  };
  return { client, state };
}

async function load({ config = CLOUD, clientOptions, autoConfirm = false, url = 'https://eva.example/personal/travel/map/' } = {}) {
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
  window.fetch = async () => ({ ok:true, json:async () => ({ mailer_autoconfirm:autoConfirm }) });
  for (const file of ['config.js', 'account.js', 'palette.js', 'world.js', 'places.js', 'okinawa-places.js', 'us-states.js', 'jp-admin.js', 'app.js']) {
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

  // An obfuscated duplicate does not bypass the original password.
  {
    const page = await load({ clientOptions:{ signupResponse:{ data:{ user:{ identities:[] }, session:null }, error:null }, signInError:{ message:'Invalid login credentials' } } });
    await page.signIn();
    assert(page.$('#account-error').textContent.includes('個人密碼不正確'));
    assert.equal(page.$('#account-create').getAttribute('aria-selected'), 'true');
    assert.equal(page.fake.state.rpcCalls.length, 0);
  }
  // A new account stays read-only until the email has been verified.
  {
    const page = await load({ clientOptions:{ signupResponse:{ data:{ user:{ identities:[{ provider:'email' }] }, session:null }, error:null } } });
    await page.signIn();
    assert.equal(page.$('#email-verification').hidden, false);
    assert.equal(page.$('#account-card').hidden, true);
    assert.equal(page.$('#account-password').value, '');
    assert.equal(page.$('#access-code').value, '');
    assert.equal(page.fake.state.rpcCalls.length, 0);
    page.click(page.$('#verification-resend')); await wait();
    assert.equal(page.fake.state.resendCalls, 1);
    assert(page.$('#verification-feedback').textContent.includes('垃圾郵件'));
  }
  {
    const page = await load({ clientOptions:{ signInError:{ message:'Email not confirmed', code:'email_not_confirmed' } } });
    await page.signIn({ createAccount:false });
    assert.equal(page.$('#email-verification').hidden, false);
    assert.equal(page.$('#verification-resend').hidden, false);
    assert.equal(page.fake.state.rpcCalls.length, 0);
  }
  // A stale session with an approved profile but no confirmed email never
  // appears as an editable traveller, even if a token exists locally.
  {
    const page = await load({ clientOptions:{
      initialSession:{ access_token:'token', user:{ id:'old-profile', email:'stale@example.com', email_confirmed_at:null } },
      profileResponse:{ data:{ id:'old-profile', display_name:'Stale', discoverable:true }, error:null }
    } });
    assert.equal(page.$('#account-card').hidden, true);
    assert.equal(page.window.TravelAtlasAccount.user, null);
    assert.equal(page.$('#email-verification').hidden, false);
    assert.equal(page.$('#verification-email').textContent, 'stale@example.com');
    assert.deepEqual(page.errors, []);
  }
  // Do not create even a provisional Auth user if confirmation is disabled.
  {
    const page = await load({ autoConfirm:true });
    await page.signIn();
    assert(page.$('#account-error').textContent.includes('網站擁有者'));
    assert.equal(page.fake.state.signupCalls, 0);
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

  // The invite is checked before the mail goes out; the link alone will then
  // finish the account, so the verification view says so.
  {
    const page = await load({ clientOptions:{ prepare:{ data:{ ok:true }, error:null }, signupResponse:{ data:{ user:{ identities:[{ provider:'email' }] }, session:null }, error:null } } });
    await page.signIn({ code:'travel2n' });
    assert.equal(page.fake.state.prepareCalls.length, 1);
    assert.equal(JSON.stringify(page.fake.state.prepareCalls[0]), JSON.stringify({ p_email:'eva@example.com', p_code:'travel2n', p_name:'Eva Huang' }));
    assert.equal(page.fake.state.signupCalls, 1);
    assert.equal(page.$('#email-verification').hidden, false);
    assert(page.$('#verification-step-two').textContent.includes('自動完成建立並登入'));
    assert.equal(page.fake.state.rpcCalls.length, 0, 'nothing is redeemed before the link');
    assert(!JSON.stringify([...Array(page.window.localStorage.length).keys()].map(i => page.window.localStorage.getItem(page.window.localStorage.key(i)))).includes('travel2n'), 'the invite is not stored by the page');
    // 「我已完成驗證」 goes to a plain login, not the second form.
    page.click(page.$('#verification-continue'));
    await page.window.Promise.resolve();
    assert.equal(page.$('#account-login').getAttribute('aria-selected'), 'true');
    assert.equal(page.$('#account-email').value, 'eva@example.com');
    assert.deepEqual(page.errors, []);
  }
  // A wrong invite is refused before any Auth user or mail exists.
  {
    const page = await load({ clientOptions:{ prepare:{ data:{ ok:false, reason:'invalid_code' }, error:null } } });
    await page.signIn({ code:'nope' });
    assert(page.$('#account-error').textContent.includes('通行碼不正確'));
    assert.equal(page.fake.state.signupCalls, 0, 'no signup with a wrong invite');
    assert.equal(page.$('#email-verification').hidden, true);
    assert.equal(page.$('#account-create').getAttribute('aria-selected'), 'true');
    assert.deepEqual(page.errors, []);
  }
  // Opening the confirmation link finishes the account and signs in.
  {
    const page = await load({ clientOptions:{
      initialSession:{ access_token:'token', user:{ id:'new-user', email:'new@example.com', email_confirmed_at:'2026-11-09T00:00:00Z' } },
      profileResponse:{ data:null, error:null },
      rpcByName:{ atlas_complete_signup:{ data:{ ok:true, user_id:'new-user', display_name:'新旅人', avatar_url:'', discoverable:true }, error:null } }
    } });
    assert.equal(page.fake.state.rpcCalls.at(-1)?.name, 'atlas_complete_signup');
    assert.equal(page.$('#account-card').hidden, false, 'the link signs the traveller in');
    assert.equal(page.$('#account-name').textContent, '新旅人');
    assert.equal(page.$('#account-dialog').open, false, 'no second form');
    assert(page.$('#stamp-feedback').textContent.includes('帳號已建立'));
    assert.deepEqual(page.errors, []);
  }
  // Confirmed elsewhere, then a plain login here finishes the account.
  {
    const page = await load({ clientOptions:{ rpcByName:{
      atlas_login:{ data:{ ok:false, reason:'not_approved' }, error:null },
      atlas_complete_signup:{ data:{ ok:true, user_id:'user-personal', display_name:'Eva Huang', avatar_url:'', discoverable:true }, error:null }
    } } });
    await page.signIn({ createAccount:false });
    assert.equal(page.$('#account-card').hidden, false);
    assert.deepEqual(page.fake.state.rpcCalls.map(call => call.name), ['atlas_login', 'atlas_complete_signup']);
    assert.deepEqual(page.errors, []);
  }
  // An expired or used mail link says so instead of silently showing the map.
  {
    const page = await load({ url:'https://eva.example/personal/travel/map/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=' });
    await wait();
    assert.equal(page.$('#account-dialog').open, true);
    assert(page.$('#account-error').textContent.includes('已失效'));
    assert.equal(page.$('#account-forgot').hidden, false, 'a new reset mail is one click away');
    assert.equal(page.window.location.hash, '', 'the error is not replayed on reload');
    assert(!/otp_expired|access_denied/.test(page.$('#account-error').textContent));
    assert.deepEqual(page.errors, []);
  }
  // Reset: choosing the current password again is named, not "reopen the link".
  {
    const recovery = 'https://eva.example/personal/travel/map/#access_token=t&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery';
    const page = await load({ url:recovery, clientOptions:{
      initialSession:{ access_token:'token', user:{ id:'user-personal', email:'eva@example.com', email_confirmed_at:'2026-11-01T00:00:00Z' } },
      profileResponse:{ data:{ id:'user-personal', display_name:'Eva Huang', discoverable:true }, error:null },
      updateUserError:{ message:'New password should be different from the old password.', code:'same_password' }
    } });
    await wait();
    assert.equal(page.$('#code-signin').dataset.mode, 'reset');
    page.$('#account-password').value = 'same-password-123';
    page.click(page.$('#code-signin-submit'));
    await wait(20);
    assert.equal(page.fake.state.updateUserCalls, 1);
    assert(page.$('#account-error').textContent.includes('不能和目前的密碼相同'));
    assert.equal(page.$('#code-signin').dataset.mode, 'reset', 'stays on the reset view to try another');
    assert.deepEqual(page.errors, []);
  }
  // Reset with no session left: send the traveller to request a new mail.
  {
    const recovery = 'https://eva.example/personal/travel/map/#access_token=t&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery';
    const page = await load({ url:recovery });
    await wait();
    assert.equal(page.$('#code-signin').dataset.mode, 'reset');
    page.$('#account-password').value = 'new-password-123';
    page.click(page.$('#code-signin-submit'));
    await wait(20);
    assert.equal(page.fake.state.updateUserCalls, 0, 'no update without a session');
    assert(page.$('#account-error').textContent.includes('重設連結已失效'));
    assert.equal(page.$('#code-signin').dataset.mode, 'login');
    assert.equal(page.$('#account-forgot').hidden, false);
    assert.deepEqual(page.errors, []);
  }

  console.log('PASS sign-in errors: wrong password, wrong code, throttling, missing code, missing setup, offline, login function, unapproved login, invite before mail, link finishes signup, login finishes signup, expired links, reset errors');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
