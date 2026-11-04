// Headless behaviour test for the atlas account layer (no browser needed).
//
// jsdom has no <dialog> implementation and no network, so this file provides
// small stand-ins for dialog.showModal/close and an in-memory Supabase double
// that mimics PostgREST, Google OAuth sessions, Row Level Security, and realtime.
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
  const tables = { stamps:[], custom_cities:[], profiles:[] };
  const channels = new Set();
  const calls = [];
  let nextId = 1;

  const uuid = prefix => `${prefix}-${String(nextId++).padStart(4, '0')}`;
  function addUser({ name, email, sub }) {
    const id = sub || uuid('user');
    users.set(id, { id, email: email || `${name}@example.com`, user_metadata:{ full_name:name, avatar_url:`https://img.example/${id}.png` } });
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
      update(patch) {
        calls.push({ op:'update', table, payload:patch });
        let owner;
        try { owner = ownerForWrite(); }
        catch (error) { builder._result = { data:null, error:{ message:error.message } }; return builder; }
        const rows = rowsOf(table).filter(row => matches(row, query));
        const forbidden = rows.find(row => row.user_id && row.user_id !== owner);
        if (forbidden) {
          builder._result = { data:null, error:{ message:'new row violates row-level security policy' } };
          return builder;
        }
        rows.forEach(row => { Object.assign(row, patch); publish(table, 'UPDATE', row); });
        builder._result = { data:rows.map(row => ({ ...row })), error:null };
        return builder;
      },
      delete() {
        calls.push({ op:'delete', table, query:[...query] });
        const owner = ownerForWrite();
        const doomed = rowsOf(table).filter(row => matches(row, query));
        const forbidden = doomed.find(row => row.user_id && row.user_id !== owner);
        if (forbidden) { builder._result = { data:null, error:{ message:'permission denied' } }; return builder; }
        doomed.forEach(row => {
          const index = rowsOf(table).indexOf(row);
          if (index >= 0) rowsOf(table).splice(index, 1);
          publish(table, 'DELETE', row);
        });
        builder._result = { data:doomed, error:null };
        return builder;
      }
    };
    async function resolve(kind) {
      const rows = visible(table).filter(row => matches(row, query));
      const data = kind === 'single' ? (rows[0] || null) : rows;
      return { data, error:null };
    }
    return builder;
  }

  // Each page is its own tab: its own session, auth callbacks, and channel.
  function connect() {
    let session = null;
    const realtimeChannels = new Set();
    const client = {
      auth: {
        onAuthStateChange(handler) { handlers.push(handler); return { data:{ subscription:{ unsubscribe(){} } } }; },
        async getSession() { return { data:{ session }, error:null }; },
        async signInWithOAuth(options) {
          calls.push({ op:'signInWithOAuth', payload:options });
          return { data:{ provider:'google' }, error:null };
        },
        async signOut() { session = null; return { error:null }; }
      },
      from(table) { return makeQuery(table, () => session); },
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
  return { users, tables, calls, addUser, connect, uuid, notifyLive };
}

// ---------------------------------------------------------------- page harness
const sharedServer = createServer();

async function boot({ demo = false, seed = {}, viewport = 'desktop' } = {}) {
  const dom = new JSDOM(pageHtml, { url:'https://eva.example/personal/travel/map/', runScripts:'outside-only', pretendToBeVisual:true });
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
  const inject = (file, transform) => {
    const source = transform ? transform(fs.readFileSync(path.join(mapDir, file), 'utf8')) : fs.readFileSync(path.join(mapDir, file), 'utf8');
    window.eval(source);
  };
  inject('config.js', () => demo ? 'window.TravelAtlasConfig={supabaseUrl:"",supabaseAnonKey:"",demoMode:true};' : CONFIG_SNIPPET);
  inject('account.js');
  for (const file of ['world.js', 'places.js', 'us-states.js']) inject(file);
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
  const eva = server.addUser({ name:'Eva Huang', email:'eva@example.com', sub:'user-eva' });
  const lin = server.addUser({ name:'林宜臻', email:'lin@example.com', sub:'user-lin' });
  const stranger = server.addUser({ name:'路人甲', email:'stranger@example.com', sub:'user-stranger' });
  // Lin and Hana have signed in before, so their discoverable profiles exist.
  const hana = server.addUser({ name:'田中雅子', email:'hana@example.com', sub:'user-hana' });
  for (const person of [lin, hana, eva]) {
    server.tables.profiles.push({
      id:person.id, user_id:person.id, display_name:person.user_email_name || person.user_metadata.full_name,
      avatar_url:person.user_metadata.avatar_url, discoverable:true, updated_at:new Date().toISOString()
    });
  }

  // ---------------------------------------------------------------- 1. visitor mode
  {
    server.tables.stamps.push({
      id:'stamp-seed-1', user_id:eva.id, place_key:'countries:158', visit_month:'2023-03-01',
      companions:[lin.id], created_at:'2023-03-01T00:00:00Z', updated_at:'2023-03-01T00:00:00Z'
    });
    const page = await boot();
    assert.deepEqual(page.errors, [], 'visitor page should load without errors');
    assert.equal(page.$('#sign-in').hidden, false, 'visitors get a Google sign-in button');
    assert.equal(page.$('#account-card').hidden, true);
    assert.equal(page.$('#passport-count').textContent, '1', 'visitors see the published collection');
    assert.equal(page.$('#collection-label').textContent, '旅人共蓋章');
    assert.equal(page.$('#stamp-button').classList.contains('locked'), true, 'the stamp action is locked for visitors');
    assert.equal(page.$('#companion-manage').hidden, true);
    // Locked stamp button opens the account dialog instead of writing.
    page.$('#visit-date').value = '2024-01';
    click(page.window, page.$('#stamp-button'));
    await page.settle();
    assert.equal(page.$('#account-dialog').open, true, 'locked action asks for sign-in');
    assert.equal(server.tables.stamps.length, 1, 'a visitor cannot create stamps');
    // Custom city creation is also blocked.
    click(page.window, page.$$('.category-tab')[1]);
    await page.settle();
    click(page.window, page.$('#add-city'));
    await page.settle();
    assert.equal(page.$('#city-dialog').open, false, 'visitors cannot open the add-city dialog');
    click(page.window, page.document.getElementById('account-dialog-close'));
    await page.settle();
    console.log('PASS visitor: read-only stamps, locked actions, no writes');
  }

  // ---------------------------------------------------------------- 2. Google sign-in and stamping
  {
    const page = await boot();
    click(page.window, page.$('#sign-in'));
    await page.settle();
    assert.equal(page.$('#account-dialog').open, true);
    click(page.window, page.$('#account-google'));
    await page.settle();
    const oauth = server.calls.find(call => call.op === 'signInWithOAuth');
    assert(oauth, 'Google OAuth should be requested');
    assert.equal(oauth.payload.provider, 'google');
    assert(oauth.payload.options.redirectTo.endsWith('/personal/travel/map/'), 'OAuth returns to the atlas');
    // Supabase completes the redirect and reports the session.
    page.connection.fireAuth({ access_token:'token-1', user:eva });
    await page.settle(); await page.settle();
    assert.equal(page.$('#account-card').hidden, false, 'signed-in chip appears');
    assert.equal(page.$('#account-name').textContent, 'Eva Huang');
    assert.equal(page.$('#stamp-button').classList.contains('locked'), false, 'signed-in travellers may stamp');
    const profile = server.tables.profiles.find(row => row.id === eva.id);
    assert(profile, 'a profile row is created for companion discovery');
    // Stamp Taiwan (country 158) with a companion.
    page.$('#place-search').value = '台灣';
    input(page.window, page.$('#place-search'));
    await page.settle();
    choosePlace(page, '台灣');
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
    const saved = server.tables.stamps.find(row => row.user_id === eva.id && row.place_key === 'countries:158' && row.visit_month.startsWith('2024-05'));
    assert(saved, 'the stamp reaches the cloud');
    assert.deepEqual([...saved.companions], [lin.id], 'the companion is stored on the stamp');
    assert.equal(page.$('#passport-count').textContent, '1', 'a place counts once across months');
    assert.equal(page.$$('#history-list li').length, 2, 'both months are listed for the place');
    // Removing your own stamp deletes the cloud row.
    const historyRow = page.$$('#history-list li').find(row => row.textContent.includes('2024.05'));
    click(page.window, historyRow.querySelector('button[data-date]'));
    await page.settle(); await page.settle();
    assert.equal(server.tables.stamps.some(row => row.visit_month.startsWith('2024-05')), false, 'delete reaches the cloud');
    console.log('PASS sign-in: Google OAuth, profile, companion stamping, cloud delete');
  }

  // ---------------------------------------------------------------- 3. companion view + live updates
  {
    const page = await boot();
    page.connection.fireAuth({ access_token:'token-lin', user:lin });
    await page.settle(); await page.settle();
    assert.equal(page.$('#account-name').textContent, '林宜臻');
    // Live update: Eva stamps Japan while Lin has the page open.
    server.tables.stamps.push({
      id:'stamp-live-1', user_id:eva.id, place_key:'countries:392', visit_month:'2025-02-01',
      companions:[lin.id], created_at:'2025-02-01T00:00:00Z', updated_at:'2025-02-01T00:00:00Z'
    });
    server.notifyLive({ eventType:'INSERT', table:'stamps', schema:'public', new:{ ...server.tables.stamps.at(-1) }, old:{} });
    await page.settle();
    // Lin sees only her own collection total; Eva's live Japan row is on the map.
    assert.equal(page.$('#passport-count').textContent, '0', 'a traveller counts only their own stamps');
    assert.equal(page.$$('.map-country.done').length, 1, 'everyone\'s stamps still mark the shared map');
    // The live row appears on the map and in the history without a reload.
    page.$('#place-search').value = '日本';
    input(page.window, page.$('#place-search'));
    await page.settle();
    choosePlace(page, '日本');
    await page.settle();
    assert(page.$('#history-list').textContent.includes('2025.02'), 'the other traveller month is visible');
    assert(page.$('#history-list').textContent.includes('他人'), 'the row is labelled as someone else\'s stamp');
    assert.equal(page.$('#history-list button[data-date]'), null, 'visitors of a row cannot delete another person stamp');
    // The shared-trips panel lists places Eva and Lin visited together.
    const friendsText = page.$('#friends-list').textContent;
    assert(page.$('#friends-tabs').textContent.includes('Eva Huang'), 'friends tab lists the other traveller');
    assert.equal(page.$('#friends-tabs [aria-selected="true"]').textContent, 'Eva Huang', 'the traveller with shared trips is selected');
    assert(friendsText.includes('日本'), 'shared trip months appear in 一起走過');
    assert.equal(page.$('#friends-shared').textContent, '1');
    console.log('PASS companions: live insert, shared trips, per-user views');
  }

  // ---------------------------------------------------------------- 4. cross-device sync
  {
    const pageA = await boot();
    const pageB = await boot();
    pageA.connection.fireAuth({ access_token:'token-eva-a', user:eva });
    pageB.connection.fireAuth({ access_token:'token-eva-b', user:eva });
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
    const created = server.tables.stamps.find(row => row.place_key === 'countries:764' && row.user_id === eva.id);
    assert(created, 'device A writes to the cloud');
    server.notifyLive({ eventType:'INSERT', table:'stamps', schema:'public', new:{ ...created }, old:{} });
    await pageB.settle();
    assert(pageB.$('#passport-count').textContent === pageA.$('#passport-count').textContent, 'both devices show the same total');
    assert.equal(pageB.$('#passport-count').textContent, pageA.$('#passport-count').textContent, 'device B counts the new country');
    console.log('PASS sync: a stamp on one device appears on another through realtime');
  }

  // ---------------------------------------------------------------- 5. RLS
  {
    // Even a crafted request cannot edit another traveller's row: the database
    // double enforces the same owner check as the SQL policies in the README.
    const strangerPage = await boot();
    strangerPage.connection.fireAuth({ access_token:'token-stranger-rls', user:stranger });
    await strangerPage.settle();
    const evaRow = server.tables.stamps.find(row => row.user_id === eva.id);
    assert(evaRow, 'Eva has a cloud row from the earlier sections');
    const blocked = await strangerPage.connection.client.from('stamps').update({ companions:[stranger.id] }).eq('id', evaRow.id);
    assert(blocked.error, 'updating another user row is rejected by row level security');
    assert.deepEqual([...server.tables.stamps.find(row => row.id === evaRow.id).companions], [...evaRow.companions], 'the other row is unchanged');
    const page = await boot();
    page.connection.fireAuth({ access_token:'token-stranger', user:stranger });
    await page.settle();
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
    console.log('PASS demo: local sign-in, seeded trips, stamping, companions');
  }

  console.log('All account tests passed.');
  // The page's poll timer would keep Node alive; the server double has no sockets.
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
