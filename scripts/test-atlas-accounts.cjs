// Headless behaviour test for the atlas account layer (no browser needed).
//
// jsdom has no <dialog> implementation and no network, so this file provides
// small stand-ins for dialog.showModal/close and an in-memory Supabase double
// that mimics PostgREST, Supabase Auth sessions, Row Level Security, and realtime.
//
// Run: NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-accounts.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.error('Install jsdom first: npm install --prefix /tmp/atlas-test-deps jsdom'); process.exit(1); }

const root = path.resolve(__dirname, '..');
const mapDir = path.join(root, 'personal/travel/map');
const pageHtml = fs.readFileSync(path.join(mapDir, 'index.html'), 'utf8');
const CONFIG_SNIPPET = `window.TravelAtlasConfig = { supabaseUrl:'https://example.supabase.co', supabaseAnonKey:'test-anon-key', demoMode:false };`;

// ---------------------------------------------------------------- test server
function createServer() {
  const users = new Map();
  const sessions = new Map();
  const tables = { stamps:[], custom_cities:[], profiles:[], logins:[] };
  const channels = new Set();
  const calls = [];
  const accounts = new Map(); // email -> { email, password, user }
  const ACCESS_CODE = 'travel2n';
  let nextId = 1;
  let failedTable = null;

  const uuid = prefix => `${prefix}-${String(nextId++).padStart(4, '0')}`;
  function addUser({ name, email, sub }) {
    const id = sub || uuid('user');
    users.set(id, { id, email: email || `${name}@example.com`, email_confirmed_at:new Date().toISOString(), user_metadata:{ full_name:name, avatar_url:`https://img.example/${id}.png` } });
    return users.get(id);
  }
  function signInAs(id) {
    const user = users.get(id);
    const token = uuid('token');
    sessions.set(token, user);
    session = { access_token:token, user };
    channels.forEach(realtime => realtime.notify('AUTH', { session }));
    return session;
  }
  function rowsOf(table) { return tables[table]; }
  function visible(table) {
    // RLS: everyone may read; only the owner may write.
    return rowsOf(table).map(row => ({ ...row }));
  }
  function matches(row, query) {
    return query.every(([op, column, value]) => {
      if (op === 'eq') return String(row[column]) === String(value);
      if (op === 'in') return value.map(String).includes(String(row[column]));
      return true;
    });
  }
  function publish(table, eventType, row) {
    channels.forEach(realtime => realtime.notify('postgres_changes', {
      eventType, table, schema:'public', new:row ? { ...row } : {}, old:eventType === 'DELETE' ? { ...row } : {}
    }));
  }
  function makeQuery(table, who) {
    const ownerForWrite = () => { const current = who(); if (!current) throw new Error('new row violates row-level security policy'); return current.user.id; };
    const query = [];
    const builder = {
      _table: table, _query: query,
      select() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      eq(column, value) { query.push(['eq', column, value]); return builder; },
      in(column, value) { query.push(['in', column, value]); return builder; },
      upsert(payload, options) {
        calls.push({ op:'upsert', table, payload:Array.isArray(payload) ? payload : [payload] });
        // A test can make the next writes to one table fail, to prove the page
        // never claims a record the server has not accepted.
        if (failedTable === table) {
          builder._result = { data:null, error:{ message:'simulated write failure' } };
          return builder;
        }
        const owner = ownerForWrite();
        const list = Array.isArray(payload) ? payload : [payload];
        const saved = [];
        for (const item of list) {
          const conflict = options?.onConflict?.split(',').map(key => key.trim()).filter(Boolean) || ['id'];
          const existing = rowsOf(table).find(row => conflict.every(key => String(row[key]) === String(item[key])));
          if (existing) {
            if (existing.user_id !== owner) throw new Error('new row violates row-level security policy');
            Object.assign(existing, item);
            saved.push({ ...existing });
            publish(table, 'UPDATE', existing);
          } else {
            const row = { id:item.id || uuid(table.slice(0, 3)), ...item, user_id:item.user_id || owner, created_at:new Date().toISOString() };
            // `with check (auth.uid() = user_id)` from the README policies.
            if (row.user_id !== owner) throw new Error('new row violates row-level security policy');
            rowsOf(table).push(row);
            saved.push({ ...row });
            publish(table, 'INSERT', row);
          }
        }
        builder._result = { data:saved, error:null };
        return builder;
      },
      maybeSingle() { return resolve('single'); },
      single() { return resolve('single'); },
      then(resolveFn, rejectFn) {
        if (builder._result) return Promise.resolve(builder._result).then(resolveFn, rejectFn);
        return resolve('many').then(resolveFn, rejectFn);
      },
      catch(rejectFn) {
        if (builder._result) return Promise.resolve(builder._result).catch(rejectFn);
        return resolve('many').catch(rejectFn);
      },
      // `update()` and `delete()` arrive before their `.eq()` filters, so the
      // work has to wait until the builder is awaited with the filters in hand.
      update(patch) {
        calls.push({ op:'update', table, payload:patch });
        builder._update = patch;
        return builder;
      },
      delete() {
        calls.push({ op:'delete', table });
        builder._delete = true;
        return builder;
      }
    };
    function runUpdate() {
      let owner;
      try { owner = ownerForWrite(); }
      catch (error) { return { data:null, error:{ message:error.message } }; }
      const rows = rowsOf(table).filter(row => matches(row, query));
      const forbidden = rows.find(row => row.user_id && row.user_id !== owner);
      if (forbidden) return { data:null, error:{ message:'new row violates row-level security policy' } };
      rows.forEach(row => { Object.assign(row, builder._update); publish(table, 'UPDATE', row); });
      return { data:rows.map(row => ({ ...row })), error:null };
    }
    function runDelete() {
      let owner;
      try { owner = ownerForWrite(); }
      catch (error) { return { data:null, error:{ message:error.message } }; }
      const doomed = rowsOf(table).filter(row => matches(row, query));
      const forbidden = doomed.find(row => row.user_id && row.user_id !== owner);
      if (forbidden) return { data:null, error:{ message:'permission denied' } };
      doomed.forEach(row => {
        const index = rowsOf(table).indexOf(row);
        if (index >= 0) rowsOf(table).splice(index, 1);
        publish(table, 'DELETE', row);
      });
      return { data:doomed, error:null };
    }
    async function resolve(kind) {
      if (builder._result) return builder._result;
      if (builder._update) return runUpdate();
      if (builder._delete) return runDelete();
      const rows = visible(table).filter(row => matches(row, query));
      const data = kind === 'single' ? (rows[0] || null) : rows;
      return { data, error:null };
    }
    return builder;
  }

  // The database half of sign-in: only the shared code creates a traveller
  // profile, and every accepted code appends to atlas_logins.
  async function rpc(name, args, who) {
    calls.push({ op:'rpc', name, payload:args });
    if (!['atlas_redeem_code', 'atlas_login', 'atlas_leave_stamp'].includes(name)) {
      return { data:null, error:{ message:`Could not find the function public.${name}`, code:'PGRST202' } };
    }
    const current = who();
    if (!current?.user) return { data:{ ok:false, reason:'no_session' }, error:null };
    // Mirrors the SQL function: it only ever removes auth.uid() from companions.
    if (name === 'atlas_leave_stamp') {
      const stamp = tables.stamps.find(row => row.id === args?.p_stamp_id);
      if (!stamp) return { data:{ ok:false, reason:'not_found' }, error:null };
      if (stamp.user_id === current.user.id) return { data:{ ok:false, reason:'owner' }, error:null };
      if (!(stamp.companions || []).includes(current.user.id)) return { data:{ ok:false, reason:'not_tagged' }, error:null };
      stamp.companions = stamp.companions.filter(id => id !== current.user.id);
      publish('stamps', 'UPDATE', stamp);
      return { data:{ ok:true, stamp_id:stamp.id }, error:null };
    }
    if (name === 'atlas_login') {
      const profile = tables.profiles.find(row => row.id === current.user.id);
      if (!profile) return { data:{ ok:false, reason:'not_approved' }, error:null };
      tables.logins.push({ user_id:profile.id, display_name:profile.display_name, user_agent:args.p_user_agent, ip:'test' });
      return { data:{ ok:true, user_id:profile.id, display_name:profile.display_name, avatar_url:profile.avatar_url, discoverable:profile.discoverable }, error:null };
    }
    if (String(args?.p_code || '').trim() !== ACCESS_CODE) {
      return { data:{ ok:false, reason:'invalid_code' }, error:null };
    }
    const display = String(args?.p_name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || '旅人';
    let profile = tables.profiles.find(row => row.id === current.user.id);
    if (!profile) {
      profile = {
        id:current.user.id, user_id:current.user.id, display_name:display,
        avatar_url:'', discoverable:true, updated_at:new Date().toISOString()
      };
      tables.profiles.push(profile);
      publish('profiles', 'INSERT', profile);
    } else profile.display_name = display;
    tables.logins.push({
      user_id:current.user.id, display_name:display,
      user_agent:String(args?.p_user_agent || ''), ip:'test', created_at:new Date().toISOString()
    });
    return {
      data:{ ok:true, user_id:current.user.id, display_name:display, avatar_url:'', discoverable:true },
      error:null
    };
  }

  // Each page is its own tab: its own session, auth callbacks, and channel.
  function connect() {
    let session = null;
    const realtimeChannels = new Set();
    const client = {
      auth: {
        onAuthStateChange(handler) { handlers.push(handler); return { data:{ subscription:{ unsubscribe(){} } } }; },
        async getSession() { return { data:{ session }, error:null }; },
        async signUp({ email, password }) {
          calls.push({ op:'signUp', payload:{ email } });
          if (accounts.has(email)) return { data:{ user:{ identities:[] }, session:null }, error:null };
          const user = addUser({ name:'旅人', email });
          user.email_confirmed_at = null;
          user.identities = [{ provider:'email' }];
          accounts.set(email, { email, password, user });
          return { data:{ user, session:null }, error:null };
        },
        async resend({ email }) { calls.push({ op:'resend', payload:{ email } }); return { error:null }; },
        async signInWithPassword({ email, password }) {
          calls.push({ op:'signInWithPassword', payload:{ email } });
          const record = accounts.get(email);
          if (!record || record.password !== password) {
            return { data:{ user:null, session:null }, error:{ message:'Invalid login credentials' } };
          }
          if (!record.user.email_confirmed_at) return { data:{ user:null, session:null }, error:{ message:'Email not confirmed', code:'email_not_confirmed' } };
          const next = { access_token:uuid('token'), user:record.user };
          fireAuth(next);
          return { data:{ user:record.user, session:next }, error:null };
        },
        async signOut() {
          calls.push({ op:'signOut' });
          session = null;
          handlers.forEach(handler => handler('SIGNED_OUT', null));
          return { error:null };
        },
        // Never reveals whether an address exists, like the real endpoint.
        async resetPasswordForEmail(email, options) {
          calls.push({ op:'resetPasswordForEmail', payload:{ email, options } });
          return { data:{}, error:null };
        },
        async updateUser({ password }) {
          calls.push({ op:'updateUser' });
          if (!session?.user) return { data:{ user:null }, error:{ message:'Auth session missing!' } };
          for (const record of accounts.values()) if (record.user.id === session.user.id) record.password = password;
          return { data:{ user:session.user }, error:null };
        }
      },
      from(table) { return makeQuery(table, () => session); },
      async rpc(name, args) { return rpc(name, args, () => session); },
      channel() {
        const realtime = {
          listeners:[],
          on(type, filter, handler) {
            if (type === 'postgres_changes') realtime.listeners.push({ filter, handler });
            return realtime;
          },
          subscribe(handler) {
            realtime.statusHandler = handler;
            channels.add(realtime);
            realtimeChannels.add(realtime);
            setTimeout(() => handler?.('SUBSCRIBED'), 0);
            return realtime;
          },
          notify(kind, payload) {
            realtime.listeners.forEach(listener => {
              if (listener.filter.table === payload.table) listener.handler(payload);
            });
          },
          close() { channels.delete(realtime); realtimeChannels.delete(realtime); }
        };
        channels.add(realtime);
        return realtime;
      },
      removeChannel(realtime) { realtime.close?.(); }
    };
    const handlers = [];
    function fireAuth(nextSession) {
      session = nextSession;
      handlers.forEach(handler => handler(nextSession ? 'SIGNED_IN' : 'SIGNED_OUT', nextSession));
    }
    const initial = { access_token:null, user:null };
    function signInAs(id) {
      const user = users.get(id);
      if (!user) throw new Error(`unknown test user ${id}`);
      const next = { access_token:uuid('token'), user };
      fireAuth(next);
      return next;
    }
    return { client, fireAuth, signInAs, initial };
  }

  function notifyLive(payload) { channels.forEach(realtime => realtime.notify('postgres_changes', payload)); }
  const verify = email => { const user = accounts.get(email)?.user; assert(user); user.email_confirmed_at = new Date().toISOString(); };
  return {
    users, tables, calls, accounts, addUser, connect, uuid, notifyLive, verify, accessCode:ACCESS_CODE,
    setWriteFailure: table => { failedTable = table; }
  };
}

// ---------------------------------------------------------------- page harness
const sharedServer = createServer();

async function boot({ demo = false, seed = {}, viewport = 'desktop', url = 'https://eva.example/personal/travel/map/' } = {}) {
  const dom = new JSDOM(pageHtml, { url, runScripts:'outside-only', pretendToBeVisual:true });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', event => errors.push(event.message));
  window.matchMedia ||= () => ({ matches:false, media:'', addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
  window.Element.prototype.scrollIntoView ||= function () {};
  window.HTMLElement.prototype.scrollIntoView ||= function () {};
  window.HTMLDialogElement ||= window.HTMLElement;
  const dialogProto = window.HTMLDialogElement.prototype;
  if (!dialogProto.showModal) {
    dialogProto.showModal = function () { this.open = true; this.setAttribute('open', ''); };
    dialogProto.close = function () { this.open = false; this.removeAttribute('open'); };
  }
  window.BroadcastChannel ||= class { postMessage() {} addEventListener() {} close() {} };
  // Destructive actions ask first; the harness answers yes unless a test says otherwise.
  window.confirmAnswers = [];
  window.confirm = message => { window.confirmAnswers.push(message); return window.confirmAnswer !== false; };
  const storage = new Map();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem:key => storage.has(key) ? storage.get(key) : null,
      setItem:(key, value) => storage.set(key, String(value)),
      removeItem:key => storage.delete(key),
      clear:() => storage.clear(),
      key:index => [...storage.keys()][index] ?? null,
      get length() { return storage.size; }
    },
    configurable:true
  });
  for (const [key, value] of Object.entries(seed)) storage.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  const connection = sharedServer.connect();
  window.supabase = { createClient:() => connection.client };
  window.fetch = async () => ({ ok:true, json:async () => ({ mailer_autoconfirm:false }) });
  const inject = (file, transform) => {
    const source = transform ? transform(fs.readFileSync(path.join(mapDir, file), 'utf8')) : fs.readFileSync(path.join(mapDir, file), 'utf8');
    window.eval(source);
  };
  inject('config.js', () => demo ? 'window.TravelAtlasConfig={supabaseUrl:"",supabaseAnonKey:"",demoMode:true};' : CONFIG_SNIPPET);
  inject('account.js');
  for (const file of ['palette.js', 'world.js', 'places.js', 'okinawa-places.js', 'us-states.js', 'jp-admin.js']) inject(file);
  inject('app.js');
  const document = window.document;
  const settle = async (turns = 12) => { for (let i = 0; i < turns; i++) await new Promise(resolve => setTimeout(resolve, 3)); };
  await settle();
  return {
    dom, window, document, errors, settle, connection,
    $: selector => document.querySelector(selector),
    $$: selector => [...document.querySelectorAll(selector)]
  };
}

const click = (window, node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles:true, cancelable:true }));
const change = (window, node) => node.dispatchEvent(new window.Event('change', { bubbles:true }));
const input = (window, node) => node.dispatchEvent(new window.Event('input', { bubbles:true }));

function choosePlace(page, name) {
  const button = page.$$('.place-item').find(item => item.textContent.includes(name));
  assert(button, `place item for ${name} should exist`);
  click(page.window, button);
}

async function main() {
  const server = sharedServer;
  const lin = server.addUser({ name:'林宜臻', email:'lin@example.com', sub:'user-lin' });
  const hana = server.addUser({ name:'田中雅子', email:'hana@example.com', sub:'user-hana' });
  const stranger = server.addUser({ name:'路人甲', email:'stranger@example.com', sub:'user-stranger' });
  // Lin and Hana redeemed the code before, so their traveller profiles exist.
  for (const person of [lin, hana]) {
    server.tables.profiles.push({
      id:person.id, user_id:person.id, display_name:person.user_metadata.full_name,
      avatar_url:person.user_metadata.avatar_url, discoverable:true, updated_at:new Date().toISOString()
    });
  }

  // ---------------------------------------------------------------- 1. visitor mode
  {
    server.tables.stamps.push({
      id:'stamp-seed-1', user_id:hana.id, place_key:'countries:158', visit_month:'2023-03-01',
      companions:[], created_at:'2023-03-01T00:00:00Z', updated_at:'2023-03-01T00:00:00Z'
    });
    const page = await boot();
    assert.deepEqual(page.errors, [], 'visitor page should load without errors');
    assert.equal(page.$('#sign-in').hidden, false, 'visitors get a code sign-in button');
    assert.equal(page.$('#sign-in').textContent, '帳號登入');
    assert.equal(page.$('#account-card').hidden, true);
    assert.equal(page.$('#passport-count').textContent, '1', 'visitors see the published collection');
    assert.equal(page.$('#collection-label').textContent, '旅人共蓋章');
    assert.equal(page.$('#stamp-button').classList.contains('locked'), true, 'the stamp action is locked for visitors');
    assert.equal(page.$('#companion-manage').hidden, false, 'visitors can see how to start tagging');
    assert(page.$('#companion-manage').textContent.includes('登入後標記旅伴'));
    // Locked stamp button opens the account dialog instead of writing.
    page.$('#visit-date').value = '2024-01';
    click(page.window, page.$('#stamp-button'));
    await page.settle();
    assert.equal(page.$('#account-dialog').open, true, 'locked action asks for sign-in');
    assert.equal(page.$('#code-signin').hidden, false, 'the access-code field is offered');
    assert.equal(page.$('#local-signin').hidden, true, 'the browser-only passphrase is not offered in cloud mode');
    assert.equal(page.$('#code-signin').dataset.mode, 'login');
    assert.equal(page.$('#access-code').closest('label').hidden, true);
    assert.equal(page.$('#access-code').disabled, true);
    assert.equal(page.$('#traveller-name').closest('label').hidden, true);
    assert.equal(page.$('#account-sync-note').hidden, true, 'login has no feature list');
    assert.equal(page.$('.account-list'), null, 'unnecessary feature list removed');
    click(page.window, page.$('#account-create'));
    assert.equal(page.$('#access-code').closest('label').hidden, false);
    assert.equal(page.$('#traveller-name').closest('label').hidden, false);
    assert.equal(page.$('#account-password').autocomplete, 'new-password');
    page.$('#access-code').value = 'discard-on-switch';
    click(page.window, page.$('#account-login'));
    assert.equal(page.$('#access-code').value, '');
    assert.equal(page.$('#access-code').required, false);
    assert.equal(page.$('#account-password').minLength, 7);
    assert.equal(page.$('#account-password').autocomplete, 'current-password');
    assert.equal(server.tables.stamps.length, 1, 'a visitor cannot create stamps');
    // Custom city creation is also blocked.
    click(page.window, page.$$('.collection-choice')[1]);
    await page.settle();
    click(page.window, page.$('#add-city'));
    await page.settle();
    assert.equal(page.$('#city-dialog').open, false, 'visitors cannot open the add-city dialog');
    click(page.window, page.document.getElementById('account-dialog-close'));
    await page.settle();
    console.log('PASS visitor: read-only stamps, locked actions, no writes');
  }

  // ---------------------------------------------------------------- 2. code sign-in
  let traveller = null;
  {
    const page = await boot();
    click(page.window, page.$('#sign-in'));
    await page.settle();
    assert.equal(page.$('#account-dialog').open, true);
    assert.equal(page.$('#code-signin').hidden, false, 'cloud sign-in asks for the access code');

    // A wrong code is refused by Postgres, and the page translates the reason.
    click(page.window, page.$('#account-create'));
    page.$('#account-email').value = 'eva@example.com';
    page.$('#account-password').value = 'personal-password-123';
    page.$('#traveller-name').value = 'Eva Huang';
    page.$('#access-code').value = 'not-the-code';
    click(page.window, page.$('#code-signin-submit'));
    await page.settle(); await page.settle();
    assert.equal(page.$('#email-verification').hidden, false, 'signup first requests email verification');
    assert.equal(server.tables.profiles.length, 2, 'unverified signup creates no profile');
    assert.equal(server.calls.filter(call => call.name === 'atlas_redeem_code').length, 0, 'invite is not redeemed before confirmation');
    assert.equal(page.$('#account-password').value, '');
    assert.equal(page.$('#access-code').value, '');
    assert.equal(page.$('#verification-resend').hidden, false);
    server.verify('eva@example.com');
    click(page.window, page.$('#verification-continue'));
    page.$('#account-password').value = 'personal-password-123';
    page.$('#access-code').value = 'not-the-code';
    click(page.window, page.$('#code-signin-submit'));
    await page.settle(); await page.settle();
    assert(page.$('#account-error').textContent.includes('通行碼不正確'), 'a wrong code is rejected after verification');
    assert.equal(page.$('#account-card').hidden, true, 'the visitor stays signed out');
    assert.equal(server.tables.profiles.length, 2, 'a wrong code creates no traveller');
    assert.equal(server.tables.logins.length, 0, 'a wrong code is not a login');

    // The right code creates this browser's traveller and logs the sign-in.
    page.$('#account-email').value = 'eva-approved@example.com';
    page.$('#account-password').value = 'personal-password-123';
    page.$('#access-code').value = 'travel2n';
    click(page.window, page.$('#code-signin-submit'));
    await page.settle(); await page.settle();
    assert.equal(page.$('#email-verification').hidden, false);
    assert.equal(page.$('#account-card').hidden, true, 'still read-only before verification');
    server.verify('eva-approved@example.com');
    click(page.window, page.$('#verification-continue'));
    page.$('#account-password').value = 'personal-password-123';
    page.$('#access-code').value = 'travel2n';
    click(page.window, page.$('#code-signin-submit'));
    await page.settle(); await page.settle();
    assert.equal(page.$('#account-dialog').open, false, 'the dialog closes on success');
    assert.equal(page.$('#account-card').hidden, false, 'signed-in chip appears');
    assert.equal(page.$('#account-name').textContent, 'Eva Huang');
    assert.equal(page.$('#stamp-button').classList.contains('locked'), false, 'signed-in travellers may stamp');
    const redemption = server.calls.filter(call => call.op === 'rpc').at(-1);
    assert.equal(redemption.name, 'atlas_redeem_code');
    assert.equal(redemption.payload.p_code, 'travel2n', 'the page sends the typed code to Postgres');
    assert.equal(redemption.payload.p_name, 'Eva Huang');
    assert(redemption.payload.p_user_agent.length > 0, 'the browser name is sent with the login');
    const login = server.tables.logins.at(-1);
    assert.equal(login.display_name, 'Eva Huang', 'the login log names the traveller');
    assert(login.user_agent, 'the login log records the browser');
    assert.equal(page.window.localStorage.getItem('eva.travel.atlas.device.v1'), null, 'no generated credentials retained');
    assert(!JSON.stringify(page.window.localStorage).includes('personal-password-123'), 'password is never saved by the page');
    assert.equal(page.$('#account-password').value, '', 'password field is cleared');
    traveller = page.window.TravelAtlasAccount.user;
    assert.equal(server.tables.profiles.filter(row => row.id === traveller.id).length, 1, 'the code created one profile');

    // Stamp Japan with a companion.
    page.$('#place-search').value = '日本';
    input(page.window, page.$('#place-search'));
    await page.settle();
    choosePlace(page, '日本');
    await page.settle();
    page.$('#visit-date').value = '2024-05';
    change(page.window, page.$('#visit-date'));
    await page.settle();
    click(page.window, page.$('#companion-manage'));
    await page.settle();
    const linOption = page.$$('#companion-options input').find(node => node.value === lin.id);
    assert(linOption, 'other signed-in travellers can be tagged');
    linOption.checked = true;
    page.$('#companion-form').dispatchEvent(new page.window.Event('submit', { bubbles:true, cancelable:true }));
    await page.settle();
    assert(page.$('#companion-chips').textContent.includes('林宜臻'), 'the chosen companion is shown before stamping');
    click(page.window, page.$('#stamp-button'));
    await page.settle(); await page.settle();
    const saved = server.tables.stamps.find(row => row.user_id === traveller.id && row.place_key === 'countries:392' && row.visit_month.startsWith('2024-05'));
    assert(saved, 'the stamp reaches the cloud');
    assert.deepEqual([...saved.companions], [lin.id], 'the companion is stored on the stamp');
    assert.equal(page.$('#passport-count').textContent, '1', 'a place counts once across months');
    assert.equal(page.$$('#history-list li').length, 1, 'the month is listed for the place');
    // Removing your own stamp deletes the cloud row.
    const historyRow = page.$$('#history-list li').find(row => row.textContent.includes('2024.05'));
    click(page.window, historyRow.querySelector('button[data-date]'));
    await page.settle(); await page.settle();
    assert.equal(server.tables.stamps.some(row => row.user_id === traveller.id && row.visit_month.startsWith('2024-05')), false, 'delete reaches the cloud');

    // Signing out and back in on this browser returns to the same traveller.
    click(page.window, page.$('#account-menu-button'));
    await page.settle();
    click(page.window, page.$('#sign-out'));
    await page.settle(); await page.settle();
    assert.equal(page.$('#account-card').hidden, true, 'signing out returns to the visitor view');
    click(page.window, page.$('#sign-in'));
    await page.settle();
    click(page.window, page.$('#account-login'));
    page.$('#account-password').value = 'personal-password-123';
    assert.equal(page.$('#traveller-name').value, 'Eva Huang', 'the last name is prefilled');
    assert.equal(page.$('#access-code').closest('label').hidden, true, 'login does not show invite');
    assert.equal(page.$('#access-code').value, '', 'login needs no invite');
    click(page.window, page.$('#code-signin-submit'));
    await page.settle(); await page.settle();
    assert.equal(page.window.TravelAtlasAccount.user.id, traveller.id, 'the same browser keeps the same traveller');
    assert.equal(server.tables.logins.length, 2, 'each sign-in is logged');
    assert.equal(server.calls.filter(call => call.op === 'rpc').at(-1).name, 'atlas_login');

    // Profile section: email is shown read-only, the display name can change,
    // and a signed-in traveller can ask for a password-reset mail.
    click(page.window, page.$('#account-menu-button'));
    await page.settle();
    assert.equal(page.$('#account-profile-name').textContent, 'Eva Huang', 'the profile shows the display name');
    assert.equal(page.$('#account-profile-email').textContent, 'eva-approved@example.com', 'the profile shows the sign-in email');
    assert.equal(page.$('#profile-name-input').value, 'Eva Huang', 'the rename field starts from the current name');
    assert.equal(page.$('#profile-reset-password').hidden, false, 'cloud travellers can request a reset from the profile');
    page.$('#profile-name-input').value = '   ';
    input(page.window, page.$('#profile-name-input'));
    click(page.window, page.$('#profile-save'));
    await page.settle();
    assert(page.$('#profile-feedback').textContent.includes('不能是空白'), 'a blank name is refused');
    assert.equal(server.tables.profiles.find(row => row.id === traveller.id).display_name, 'Eva Huang', 'a blank name writes nothing');
    page.$('#profile-name-input').value = 'Eva H.';
    input(page.window, page.$('#profile-name-input'));
    click(page.window, page.$('#profile-save'));
    await page.settle(); await page.settle();
    assert.equal(server.tables.profiles.find(row => row.id === traveller.id).display_name, 'Eva H.', 'the new name reaches the profile row');
    assert.equal(page.window.TravelAtlasAccount.user.name, 'Eva H.', 'the session carries the new name');
    assert.equal(page.$('#account-name').textContent, 'Eva H.', 'the chip shows the new name');
    assert.equal(page.$('#account-profile-name').textContent, 'Eva H.');
    assert(page.$('#profile-feedback').textContent.includes('Eva H.'), 'the save is confirmed in the menu');
    assert.equal(page.$('#account-menu').hidden, false, 'the menu stays open after saving');
    const resetCalls = server.calls.filter(call => call.op === 'resetPasswordForEmail').length;
    click(page.window, page.$('#profile-reset-password'));
    await page.settle();
    const profileReset = server.calls.filter(call => call.op === 'resetPasswordForEmail').at(-1);
    assert.equal(server.calls.filter(call => call.op === 'resetPasswordForEmail').length, resetCalls + 1, 'the profile reset sends one mail');
    assert.equal(profileReset.payload.email, 'eva-approved@example.com', 'the reset goes to the signed-in address');
    assert(profileReset.payload.options.redirectTo.startsWith('https://eva.example/personal/travel/map/'), 'the profile reset link returns to this page');
    assert(page.$('#profile-feedback').textContent.includes('重設密碼的信已寄到'), 'the profile confirms the reset mail');
    // Restore the name other scenarios expect.
    page.$('#profile-name-input').value = 'Eva Huang';
    input(page.window, page.$('#profile-name-input'));
    click(page.window, page.$('#profile-save'));
    await page.settle(); await page.settle();
    assert.equal(page.window.TravelAtlasAccount.user.name, 'Eva Huang');
    click(page.window, page.$('#account-menu-button'));
    console.log('PASS profile: email shown, display name editable and saved, signed-in password reset');
  }

  // Personal passwords protect an account even when the invite is known.
  {
    const page = await boot();
    const account = page.window.TravelAtlasAccount;
    const valid = { email:'eva-approved@example.com', password:'personal-password-123' };
    let result = await account.signIn({ ...valid, password:'wrong-password' });
    assert.equal(result.ok, false);
    assert(result.reason.includes('個人密碼不正確'));
    assert.equal(account.user, null);
    assert.equal((await account.signIn(valid)).ok, true);
    assert.equal(account.user.id, traveller.id);
    // An existing session must not bypass password verification.
    result = await account.signIn({ ...valid, password:'wrong-password' });
    assert.equal(result.ok, false);
    assert.equal(account.user, null);
    assert.equal((await page.connection.client.auth.getSession()).data.session, null);
    // Returning accounts do not redeem or transmit any invite.
    const redemptions = server.calls.filter(call => call.name === 'atlas_redeem_code').length;
    result = await account.signIn({ ...valid, code:'ignored-in-login' });
    assert.equal(result.ok, true);
    assert.equal(server.calls.filter(call => call.name === 'atlas_redeem_code').length, redemptions);
    assert.equal(server.calls.filter(call => call.op === 'rpc').at(-1).payload.p_code, undefined);
    const authCalls = server.calls.filter(call => call.op === 'signUp').length;
    result = await account.signIn({ ...valid, password:'123456', code:'travel2n', createAccount:true, name:'Eva' });
    assert.equal(result.ok, false);
    assert.equal(server.calls.filter(call => call.op === 'signUp').length, authCalls, 'short signup password is rejected before Auth');
    assert.equal((await account.signIn({ ...valid, code:'travel2n', createAccount:true, name:'Eva' })).ok, false, 'duplicate registration cannot take over an account');
    assert.equal(account.user, null);
    console.log('PASS passwords: wrong password, existing-session bypass, invite-free login, short password, duplicate signup');
  }

  // Registration retries, approval boundary, and exact password length.
  {
    const page = await boot();
    const account = page.window.TravelAtlasAccount;
    const credentials = { email:'seven@example.com', password:'abcdefg', name:'七字旅人' };
    const authCalls = server.calls.filter(call => call.op === 'signUp' || call.op === 'signInWithPassword').length;
    assert.equal((await account.signIn({ ...credentials, password:'abcdef', code:'travel2n', createAccount:true })).ok, false);
    assert.equal((await account.signIn({ ...credentials, password:'abcdef' })).ok, false);
    assert.equal(server.calls.filter(call => call.op === 'signUp' || call.op === 'signInWithPassword').length, authCalls);
    assert.equal((await account.signIn({ ...credentials, createAccount:true })).ok, false, 'creation requires an invite');
    const pending = await account.signIn({ ...credentials, code:'bad-invite', createAccount:true });
    assert.equal(pending.pendingVerification, true);
    assert.equal(account.user, null);
    server.verify(credentials.email);
    assert.equal((await account.signIn({ ...credentials, code:'bad-invite', createAccount:true })).ok, false);
    let result = await account.signIn(credentials);
    assert.equal(result.ok, false, 'Auth without an approved profile remains read-only');
    assert(result.reason.includes('尚未完成建立'));
    assert.equal(account.user, null);
    assert.equal((await page.connection.client.auth.getSession()).data.session, null);
    assert.equal((await account.signIn({ ...credentials, code:'travel2n', createAccount:true })).ok, true, 'creation resumes after fixing invite, with a seven-character password');
    const id = account.user.id;
    await account.signOut();
    assert.equal((await account.signIn(credentials)).ok, true, 'seven-character password logs in without an invite');
    assert.equal(account.user.id, id);
    console.log('PASS creation boundary: 6 rejected, 7 accepted, retry rejected invite, unapproved account blocked');
  }

  // ---------------------------------------------------------------- 3. companion view + live updates
  {
    const page = await boot();
    page.connection.fireAuth({ access_token:'token-lin', user:lin });
    await page.settle(); await page.settle();
    assert.equal(page.$('#account-name').textContent, '林宜臻');
    // Live update: the other traveller stamps Japan while Lin has the page open.
    server.tables.stamps.push({
      id:'stamp-live-1', user_id:traveller.id, place_key:'countries:392', visit_month:'2025-02-01',
      companions:[lin.id], created_at:'2025-02-01T00:00:00Z', updated_at:'2025-02-01T00:00:00Z'
    });
    server.notifyLive({ eventType:'INSERT', table:'stamps', schema:'public', new:{ ...server.tables.stamps.at(-1) }, old:{} });
    await page.settle();
    // One scope: the map, the counters and the history all carry Lin's own
    // footprint; somebody else's stamp never marks her map.
    assert.equal(page.$('#passport-count').textContent, '0', 'a traveller counts only their own stamps');
    assert.equal(page.$$('.map-country.done').length, 0, 'another traveller\'s stamps do not mark my map');
    // The live row still reaches the shared-trip view, not my history.
    page.$('#place-search').value = '日本';
    input(page.window, page.$('#place-search'));
    await page.settle();
    choosePlace(page, '日本');
    await page.settle();
    assert.equal(page.$('#stamp-history').hidden, true, 'another traveller\'s month is not in my history');
    assert.equal(page.$('#history-list button[data-date]'), null, 'I cannot delete another person\'s stamp');
    // The shared-trips panel lists places both travellers visited together.
    const friendsText = page.$('#friends-list').textContent;
    assert(page.$('#friends-tabs').textContent.includes('Eva Huang'), 'friends tab lists the other traveller');
    assert(page.$('#friends-tabs [aria-selected="true"]').textContent.includes('Eva Huang'), 'the traveller with shared trips is selected');
    assert(friendsText.includes('日本'), 'shared trip months appear in 一起走過');
    // One shared place, one visit: the counter says places, not rows.
    assert.equal(page.$('#friends-shared').textContent, '1');
    assert(page.$('#friends-visits').textContent.includes('1 次到訪'), 'the shared counter names visits separately');
    // Signing out returns to the public atlas, which shows everyone.
    await page.window.TravelAtlasAccount.signOut();
    await page.settle(); await page.settle();
    assert.equal(page.$('#collection-label').textContent, '旅人共蓋章');
    assert.equal(page.$$('.map-country.done').length, 2, 'the visitor sees every traveller on the map (TW and JP)');
    console.log('PASS companions: live insert, shared trips, per-user views');
  }

  // ---------------------------------------------------------------- 4. cross-device sync
  {
    const user = server.users.get(traveller.id);
    const pageA = await boot();
    const pageB = await boot();
    for (const page of [pageA, pageB]) {
      const result = await page.window.TravelAtlasAccount.signIn({ email:'eva-approved@example.com', password:'personal-password-123', code:'travel2n' });
      assert.equal(result.ok, true, 'same credentials work on a fresh device');
      assert.equal(page.window.TravelAtlasAccount.user.id, user.id);
    }
    await pageA.settle();
    await pageB.settle();
    pageA.$('#place-search').value = '泰國';
    input(pageA.window, pageA.$('#place-search'));
    await pageA.settle();
    choosePlace(pageA, '泰國');
    await pageA.settle();
    pageA.$('#visit-date').value = '2025-01';
    click(pageA.window, pageA.$('#stamp-button'));
    await pageA.settle(); await pageA.settle();
    const created = server.tables.stamps.find(row => row.place_key === 'countries:764' && row.user_id === traveller.id);
    assert(created, 'device A writes to the cloud');
    server.notifyLive({ eventType:'INSERT', table:'stamps', schema:'public', new:{ ...created }, old:{} });
    await pageB.settle();
    assert.equal(pageB.$('#passport-count').textContent, pageA.$('#passport-count').textContent, 'device B counts the new country');
    console.log('PASS sync: a stamp on one device appears on another through realtime');
  }

  // ---------------------------------------------------------------- 5. RLS
  {
    // The stranger redeemed the code elsewhere, so they have a profile row but
    // still cannot touch anybody else's stamps.
    server.tables.profiles.push({
      id:stranger.id, user_id:stranger.id, display_name:'路人甲', avatar_url:'', discoverable:true,
      updated_at:new Date().toISOString()
    });
    const strangerPage = await boot();
    strangerPage.connection.fireAuth({ access_token:'token-stranger-rls', user:stranger });
    await strangerPage.settle(); await strangerPage.settle();
    const otherRow = server.tables.stamps.find(row => row.user_id === traveller.id);
    assert(otherRow, 'the other traveller has a cloud row from the earlier sections');
    const blocked = await strangerPage.connection.client.from('stamps').update({ companions:[stranger.id] }).eq('id', otherRow.id);
    assert(blocked.error, 'updating another user row is rejected by row level security');
    assert.deepEqual([...server.tables.stamps.find(row => row.id === otherRow.id).companions], [...otherRow.companions], 'the other row is unchanged');
    const page = await boot();
    page.connection.fireAuth({ access_token:'token-stranger', user:stranger });
    await page.settle(); await page.settle();
    page.$('#place-search').value = '日本';
    input(page.window, page.$('#place-search'));
    await page.settle();
    choosePlace(page, '日本');
    await page.settle();
    page.$('#visit-date').value = '2025-03';
    click(page.window, page.$('#stamp-button'));
    await page.settle(); await page.settle();
    const own = server.tables.stamps.filter(row => row.user_id === stranger.id);
    assert.equal(own.length, 1, 'the stranger can still save their own stamp');
    console.log('PASS security: other travellers read-only, own rows writable');
  }

  // ---------------------------------------------------------------- 5b. session without a code
  {
    // A Supabase session on its own (no redeemed code, no profile row) is still
    // a visitor: the page must not let it write, and Postgres would refuse too.
    const uninvited = server.addUser({ name:'未登入者', email:'nobody@example.com' });
    const page = await boot();
    page.connection.fireAuth({ access_token:'token-nobody', user:uninvited });
    await page.settle(); await page.settle();
    assert.equal(page.$('#account-card').hidden, true, 'a session without the code is only a visitor');
    assert.equal(page.$('#stamp-button').classList.contains('locked'), true, 'stamping stays locked');
    click(page.window, page.$('#stamp-button'));
    await page.settle();
    assert.equal(page.$('#account-dialog').open, true, 'the page asks for the code instead of writing');
    assert.equal(server.tables.stamps.some(row => row.user_id === uninvited.id), false, 'nothing was written');
    console.log('PASS gate: a Supabase session alone cannot write');
  }

  // ------------------------------------------- 7. shared-trip rules (MVP P0)
  {
    const page = await boot();
    page.connection.fireAuth({ access_token:'token-lin-shared', user:lin });
    await page.settle(); await page.settle();
    const account = page.window.TravelAtlasAccount;
    const addStamp = (id, userId, placeKey, month, companions = []) => server.tables.stamps.push({
      id, user_id:userId, place_key:placeKey, visit_month:`${month}-01`, companions,
      created_at:`${month}-01T00:00:00Z`, updated_at:`${month}-01T00:00:00Z`
    });
    const sharedWith = async id => {
      const tab = page.$$('#friends-tabs button').find(button => button.dataset.friend === id);
      assert(tab, `the traveller ${id} has a tab`);
      click(page.window, tab);
      await page.settle();
      return {
        places: Number(page.$('#friends-shared').textContent),
        visits: page.$('#friends-visits').textContent,
        list: page.$('#friends-list').textContent
      };
    };
    // The only shared record so far is Eva's Japan trip that tagged Lin.
    let state = await sharedWith(traveller.id);
    assert.equal(state.places, 1, 'a tagged trip is shared');
    assert(state.visits.includes('1 次到訪'));

    // Both stamp Kyoto in the same month without tagging each other.
    addStamp('stamp-kyoto-lin', lin.id, 'cities:kyoto-jp', '2024-09');
    addStamp('stamp-kyoto-eva', traveller.id, 'cities:kyoto-jp', '2024-09');
    await account.refresh();
    await page.settle(); await page.settle();
    state = await sharedWith(traveller.id);
    assert.equal(state.places, 1, 'the same city in the same month is not a shared trip');

    // A third traveller records the trip and tags us both.
    addStamp('stamp-kyoto-hana', hana.id, 'cities:kyoto-jp', '2024-10', [lin.id, traveller.id]);
    await account.refresh();
    await page.settle(); await page.settle();
    state = await sharedWith(traveller.id);
    assert.equal(state.places, 2, 'a third traveller can record a trip we both took');
    assert(state.list.includes('京都'), 'the shared place is listed');

    // One shared place visited twice counts as one place and two visits.
    addStamp('stamp-kyoto-eva-2', traveller.id, 'cities:kyoto-jp', '2024-11', [lin.id]);
    await account.refresh();
    await page.settle(); await page.settle();
    state = await sharedWith(traveller.id);
    assert.equal(state.places, 2, 'a place counts once however often it is shared');
    assert(state.visits.includes('3 次到訪'), 'each month is a visit');

    // A tagged traveller takes their own tag off somebody else's record.
    const leave = page.$$('#friends-list button[data-leave]').find(button => button.dataset.leave === 'stamp-kyoto-hana');
    assert(leave, 'a tag added by another traveller can be removed');
    click(page.window, leave);
    await page.settle(); await page.settle();
    const hanaRow = server.tables.stamps.find(row => row.id === 'stamp-kyoto-hana');
    assert.deepEqual([...hanaRow.companions], [traveller.id], 'only my own tag is removed');
    assert.equal(hanaRow.visit_month, '2024-10-01', 'the visit itself is unchanged');
    state = await sharedWith(traveller.id);
    assert(state.visits.includes('2 次到訪'), 'the removed tag no longer counts as a visit');
    assert.equal(page.$('#friends-feedback').hidden, false, 'the page says the tag was removed');
    console.log('PASS shared trips: tags only, third-traveller records, places vs visits, leaving a tag');
  }

  // --------------------------------------------- 8. honest sync state (MVP P0)
  {
    const page = await boot();
    page.connection.fireAuth({ access_token:'token-eva-sync', user:server.users.get(traveller.id) });
    await page.settle(); await page.settle();
    const account = page.window.TravelAtlasAccount;
    page.$('#place-search').value = '日本';
    input(page.window, page.$('#place-search'));
    await page.settle();
    choosePlace(page, '日本');
    await page.settle();
    const badgeFor = month => {
      const row = page.$$('#history-list li').find(item => item.textContent.includes(month.replace('-', '.')));
      return row?.querySelector('.history-sync') || null;
    };

    // Offline: the record waits here and the page must not say it synced.
    Object.defineProperty(page.window.navigator, 'onLine', { value:false, configurable:true });
    page.$('#visit-date').value = '2026-01';
    click(page.window, page.$('#stamp-button'));
    await page.settle(); await page.settle();
    assert.equal(badgeFor('2026-01')?.textContent, '待同步', 'an offline stamp is marked as waiting');
    assert(page.$('#stamp-feedback').textContent.includes('同步'), 'the page names the waiting sync');
    assert.equal(server.tables.stamps.some(row => row.visit_month === '2026-01-01' && row.user_id === traveller.id), false, 'nothing reached the cloud yet');

    // Back online: the same queued record is confirmed, not duplicated.
    Object.defineProperty(page.window.navigator, 'onLine', { value:true, configurable:true });
    await account.flush();
    await page.settle(); await page.settle();
    assert.equal(badgeFor('2026-01')?.textContent, '已同步', 'a confirmed record says so');
    assert.equal(server.tables.stamps.filter(row => row.visit_month === '2026-01-01' && row.user_id === traveller.id).length, 1, 'a retry never duplicates the record');

    // A refused write stays visible with its own retry.
    server.setWriteFailure('stamps');
    page.$('#visit-date').value = '2026-02';
    click(page.window, page.$('#stamp-button'));
    await page.settle(); await page.settle(); await page.settle();
    assert.equal(badgeFor('2026-02')?.textContent, '未同步', 'a failed write is not called synced');
    const retry = badgeFor('2026-02').parentElement.querySelector('button[data-retry]');
    assert(retry, 'a failed record offers a retry');
    server.setWriteFailure(null);
    click(page.window, retry);
    await page.settle(); await page.settle(); await page.settle();
    assert.equal(badgeFor('2026-02')?.textContent, '已同步', 'the retry reaches the cloud');
    assert.equal(server.tables.stamps.filter(row => row.visit_month === '2026-02-01' && row.user_id === traveller.id).length, 1, 'the retry stores one record');
    console.log('PASS sync state: waiting, confirmed, failed with retry, no duplicates');
  }

  // ------------------------------------------- 9. password reset (MVP P1)
  {
    const page = await boot();
    click(page.window, page.$('#sign-in'));
    await page.settle();
    assert.equal(page.$('#account-forgot').hidden, false, 'returning-user login offers a reset');
    click(page.window, page.$('#account-create'));
    assert.equal(page.$('#account-forgot').hidden, true, 'creating an account does not');
    click(page.window, page.$('#account-login'));
    // Without an address the page explains what to fill in and sends nothing.
    page.$('#account-email').value = '';
    const resetsBefore = server.calls.filter(call => call.op === 'resetPasswordForEmail').length;
    click(page.window, page.$('#account-forgot'));
    await page.settle();
    assert(page.$('#account-error').textContent.includes('電子郵件'), 'the page asks for the address');
    assert.equal(server.calls.filter(call => call.op === 'resetPasswordForEmail').length, resetsBefore, 'nothing is sent without an address');
    // With the address a reset mail is requested, in plain language.
    page.$('#account-email').value = 'eva-approved@example.com';
    click(page.window, page.$('#account-forgot'));
    await page.settle();
    const request = server.calls.filter(call => call.op === 'resetPasswordForEmail').at(-1);
    assert.equal(request.payload.email, 'eva-approved@example.com');
    assert(request.payload.options.redirectTo.startsWith('https://eva.example/personal/travel/map/'), 'the link returns to this page');
    assert.equal(request.payload.options.redirectTo.includes('?'), false, 'the link carries no query string');
    assert(page.$('#account-status').textContent.includes('信已寄出'), 'the page says the mail was sent');
    assert.equal(page.$('#account-error').textContent, '', 'a sent reset mail is not shown as an error');
    console.log('PASS reset request: entry only on login, address required, link returns to the page');
  }
  {
    // Following the link opens the same dialog on its reset view.
    const page = await boot({ url:'https://eva.example/personal/travel/map/?type=recovery' });
    await page.settle(); await page.settle();
    const account = page.window.TravelAtlasAccount;
    assert.equal(page.$('#account-dialog').open, true, 'the recovery link opens the account dialog');
    assert.equal(page.$('#code-signin').dataset.mode, 'reset');
    assert.equal(page.$('#account-dialog-title').textContent, '重設密碼');
    assert.equal(page.$('#account-email').closest('label').hidden, true, 'the address came from the link');
    assert.equal(page.$('#account-password').autocomplete, 'new-password');
    assert.equal(page.$('.account-modes').hidden, true, 'a reset is not a sign-in or a creation');
    // A too-short password is refused before any request.
    page.$('#account-password').value = 'abcdef';
    page.$('#account-form').dispatchEvent(new page.window.Event('submit', { bubbles:true, cancelable:true }));
    await page.settle(); await page.settle();
    assert(page.$('#account-error').textContent.includes('6'), 'a short password is refused');
    assert.equal(server.calls.some(call => call.op === 'updateUser'), false, 'nothing was sent');
    // The link proves the address; a new password finishes the reset.
    page.connection.fireAuth({ access_token:'token-recovery', user:server.users.get(traveller.id) });
    await page.settle(); await page.settle();
    page.$('#account-password').value = 'replacement-password-1';
    page.$('#account-form').dispatchEvent(new page.window.Event('submit', { bubbles:true, cancelable:true }));
    await page.settle(); await page.settle();
    assert.equal(page.$('#account-dialog').open, false, 'the dialog closes once the password is set');
    assert.equal(page.$('#account-card').hidden, false, 'the traveller is signed in with the new password');
    await account.signOut();
    await page.settle();
    assert.equal((await account.signIn({ email:'eva-approved@example.com', password:'personal-password-123' })).ok, false, 'the old password no longer works');
    assert.equal((await account.signIn({ email:'eva-approved@example.com', password:'replacement-password-1' })).ok, true, 'the new password does');
    console.log('PASS password reset: link view, short password refused, new password signs in');
  }

  // ---------------------------------------------------------------- 6. demo mode
  {
    const page = await boot({ demo:true });
    assert.equal(page.$('#sign-in').hidden, false, 'demo mode offers a sign-in button');
    click(page.window, page.$('#sign-in'));
    await page.settle();
    assert.equal(page.$('#account-demo').hidden, false, 'demo explains it is a local demo');
    click(page.window, page.$('#account-demo'));
    await page.settle();
    assert.equal(page.$('#account-card').hidden, false, 'demo sign-in shows the account chip');
    assert(page.$('#passport-count').textContent !== '0', 'demo data is seeded');
    page.$('#visit-date').value = '2025-06';
    page.$('#place-search').value = '南韓';
    input(page.window, page.$('#place-search'));
    await page.settle();
    choosePlace(page, '南韓');
    await page.settle();
    click(page.window, page.$('#stamp-button'));
    await page.settle();
    assert(page.$('#stamp-feedback').textContent.includes('已記錄'), 'demo stamps are recorded locally');
    assert(page.$('#friends-tabs').textContent.length > 0, 'demo exposes companions');
    click(page.window, page.$('#account-menu-button'));
    await page.settle();
    assert.equal(page.$('#account-profile-email').textContent, '示範帳號（沒有電子郵件）', 'demo travellers are told there is no email');
    assert.equal(page.$('#profile-reset-password').hidden, true, 'demo travellers get no reset mail');
    page.$('#profile-name-input').value = '示範 Eva';
    input(page.window, page.$('#profile-name-input'));
    click(page.window, page.$('#profile-save'));
    await page.settle();
    assert.equal(page.window.TravelAtlasAccount.user.name, '示範 Eva', 'a demo rename applies immediately');
    assert.equal(page.$('#account-name').textContent, '示範 Eva');
    assert(page.$('#profile-feedback').textContent.includes('示範 Eva'));
    console.log('PASS demo: local sign-in, seeded trips, stamping, companions');
  }

  console.log('All account tests passed.');
  // The page's poll timer would keep Node alive; the server double has no sockets.
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
