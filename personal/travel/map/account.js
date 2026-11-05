// Stamp Atlas accounts, cloud sync, companions, and live updates.
//
// Transport only: this module owns sign-in, the cloud rows, and realtime events.
// app.js owns the map and the local record model.
//
// Sign-in is a shared access code checked by Postgres. The code is not in this
// file: `atlas_redeem_code()` compares it against a bcrypt hash and, only on a
// match, creates the traveller's profile row (which is what Row Level Security
// uses to allow writes) and appends a row to `atlas_logins` so the site owner
// can see who signed in, when, and from which browser and address.
//
// When no Supabase project is configured the module falls back to the
// browser-only `localGate` passphrase in config.js.
(() => {
  'use strict';

  const config = window.TravelAtlasConfig || {};
  const CACHE_KEY = 'eva.travel.stamp-atlas.v1';
  const OUTBOX_KEY = 'eva.travel.atlas.outbox.v1';
  const DEMO_KEY = 'eva.travel.atlas.demo.v1';
  const DEMO_SESSION_KEY = 'eva.travel.atlas.demo.session';
  // Without a Supabase project the page still needs a way to tell the owner
  // from a visitor. This key holds the local (browser-only) traveller session.
  const LOCAL_SESSION_KEY = 'eva.travel.atlas.session.v1';
  // Every browser gets its own Supabase Auth account (a random email + password
  // this page generates). That keeps one traveller per device without asking
  // anybody to remember a second password: the shared access code is the only
  // thing a person types. The credentials below are that device's identity, so
  // signing out and back in on the same browser returns to the same stamps.
  const DEVICE_KEY = 'eva.travel.atlas.device.v1';
  const TRAVELLER_NAME_KEY = 'eva.travel.atlas.name.v1';
  const DEMO_USERS = [
    { id:'demo-eva', name:'Eva Huang' },
    { id:'demo-lin', name:'林宜臻' },
    { id:'demo-chen', name:'陳柏宇' },
    { id:'demo-tanaka', name:'田中雅子' }
  ];
  const listeners = Object.create(null);
  const rowsById = new Map();
  const citiesById = new Map();
  const profiles = new Map();
  const state = {
    mode:'local',
    connection:'local',
    user:null,
    pending:0,
    lastSyncAt:null,
    realtime:false
  };
  let client = null;
  let channel = null;
  let pollTimer = null;
  let demoChannel = null;
  let initialised = false;
  let flushing = false;

  function emit(event, detail) {
    (listeners[event] || []).forEach(handler => {
      try { handler(detail); } catch (error) { console.error(error); }
    });
  }
  function on(event, handler) {
    (listeners[event] ||= []).push(handler);
    return () => { listeners[event] = (listeners[event] || []).filter(item => item !== handler); };
  }
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }
  function isConfigured() { return Boolean(config.supabaseUrl && config.supabaseAnonKey); }

  // ---------- local traveller gate (no backend) ----------
  // SHA-256, so the passphrase itself never appears in the page source. This is
  // a soft gate for a personal site, not an access-control boundary: the page
  // is static, so a determined visitor can still edit their own browser state.
  // Real enforcement (Postgres RLS) needs the Supabase project.
  function sha256Hex(text) {
    const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
    const bytes = [];
    const encoded = unescape(encodeURIComponent(String(text)));
    for (let i = 0; i < encoded.length; i++) bytes.push(encoded.charCodeAt(i));
    const bitLength = encoded.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLength / Math.pow(2, i * 8)) & 0xff);
    let hash = [1779033703, -1150833019, 1013904242, -1521486534, 1359893119, -1694144372, 528734635, 1541459225];
    const k = [1116352408, 1899447441, -1245643825, -373957723, 961987163, 1508970993, -1841331548, -1424204075, -670586216, 310598401, 607225278, 1426881987, 1925078388, -2132889090, -1680079193, -1046744716, -459576895, -272742522, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986, -1740746414, -1473132947, -1341970488, -1084653625, -958395405, -710438585, 113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, -2117940946, -1838011259, -1564481375, -1474664885, -1035236496, -949202525, -778901479, -694614492, -200395387, 275423344, 430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779, 1955562222, 2024104815, -2067236844, -1933114872, -1866530822, -1538233109, -1090935817, -965641998];
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = new Array(64);
      for (let i = 0; i < 16; i++) {
        const j = offset + i * 4;
        words[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
      }
      for (let i = 16; i < 64; i++) {
        const w15 = words[i - 15], w2 = words[i - 2];
        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        words[i] = (words[i - 16] + s0 + words[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (let i = 0; i < 64; i++) {
        const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + k[i] + words[i]) | 0;
        const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      hash = [ (hash[0] + a) | 0, (hash[1] + b) | 0, (hash[2] + c) | 0, (hash[3] + d) | 0,
        (hash[4] + e) | 0, (hash[5] + f) | 0, (hash[6] + g) | 0, (hash[7] + h) | 0 ];
    }
    return hash.map(word => ((word >>> 0).toString(16).padStart(8, '0'))).join('');
  }
  function localGate() {
    const gate = config.localGate;
    if (!gate || typeof gate.passphraseHash !== 'string' || !/^[0-9a-f]{64}$/i.test(gate.passphraseHash)) return null;
    const name = typeof gate.name === 'string' && gate.name.trim() ? gate.name.trim() : '旅人';
    return {
      name,
      id: `local-${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'traveller'}`,
      hash: gate.passphraseHash.toLowerCase(),
      hint: typeof gate.hint === 'string' ? gate.hint : ''
    };
  }
  function restoreLocalSession() {
    const gate = localGate();
    if (!gate) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY)); } catch { saved = null; }
    if (!saved || saved.hash !== gate.hash) return;
    setUser({ id: gate.id, name: gate.name, avatar: '', email: '', local: true });
  }
  async function localSignIn(passphrase) {
    const gate = localGate();
    if (!gate) return { ok: false, reason: '這個頁面還沒有設定登入方式。' };
    const value = typeof passphrase === 'string' ? passphrase.trim() : '';
    if (!value) return { ok: false, reason: '請輸入通行碼。' };
    if (sha256Hex(value) !== gate.hash) return { ok: false, reason: '通行碼不正確。' };
    try {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ hash: gate.hash, at: new Date().toISOString() }));
    } catch { return { ok: false, reason: '這個瀏覽器不允許儲存登入狀態。' }; }
    setUser({ id: gate.id, name: gate.name, avatar: '', email: '', local: true });
    emit('status', status());
    return { ok: true };
  }
  function localSignOut() {
    try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch { /* ignore */ }
    setUser(null);
    emit('status', status());
  }
  // ---------- outbox (offline queue) ----------
  function readOutbox() {
    const raw = readJSON(OUTBOX_KEY, []);
    return Array.isArray(raw) ? raw.filter(op => op && typeof op.op === 'string' && typeof op.userId === 'string') : [];
  }
  function writeOutbox(ops) {
    state.pending = ops.filter(op => op.userId === state.user?.id).length;
    writeJSON(OUTBOX_KEY, ops.slice(-400));
    emit('status', status());
  }
  function queue(op) {
    if (!state.user) return;
    const ops = readOutbox();
    const sameRecord = item => item.userId === op.userId && item.op === op.op
      && item.payload?.placeKey === op.payload?.placeKey
      && item.payload?.month === op.payload?.month
      && item.payload?.id === op.payload?.id;
    const next = ops.filter(item => !sameRecord(item));
    // A record created offline and deleted offline never needs to reach the server.
    if (op.op === 'stamp:delete') {
      const created = ops.some(item => item.userId === op.userId && item.op === 'stamp:set'
        && item.payload?.placeKey === op.payload?.placeKey && item.payload?.month === op.payload?.month);
      if (created) {
        writeOutbox(next.filter(item => !(item.userId === op.userId && item.op === 'stamp:set'
          && item.payload?.placeKey === op.payload?.placeKey && item.payload?.month === op.payload?.month)));
        return;
      }
    }
    next.push({ ...op, at:new Date().toISOString() });
    writeOutbox(next);
  }
  function outboxForCurrentUser() {
    if (!state.user) return [];
    return readOutbox().filter(op => op.userId === state.user.id);
  }

  // ---------- demo store (no server; cross-tab live via BroadcastChannel) ----------
  function demoStore() {
    const raw = readJSON(DEMO_KEY, null);
    if (raw && Array.isArray(raw.stamps)) {
      // Signing in repeatedly must not duplicate the same trip.
      const seen = new Set();
      raw.stamps = raw.stamps.filter(row => {
        const key = `${row.userId}|${row.placeKey}|${row.month}`;
        if (seen.has(key) || !row.userId || !row.placeKey || !row.month) return false;
        seen.add(key);
        return true;
      });
      raw.cities ||= [];
      return raw;
    }
    const seeded = seedDemo();
    writeJSON(DEMO_KEY, seeded);
    return seeded;
  }
  function seedDemo() {
    const rows = [];
    let n = 0;
    const add = (userId, placeKey, month, companions) => {
      rows.push({ id:`demo-stamp-${++n}`, userId, placeKey, month, companions, createdAt:`${month}-01T09:00:00.000Z` });
    };
    // Eva and 林宜臻: a spring trip to Japan, a summer trip to the Rockies.
    add('demo-eva','countries:392','2023-04',['demo-lin']);
    add('demo-eva','cities:tokyo-jp','2023-04',['demo-lin']);
    add('demo-eva','cities:kyoto-jp','2023-04',['demo-lin']);
    add('demo-eva','jp:fuji','2023-04',['demo-lin']);
    add('demo-eva','us:yell','2024-08',['demo-lin']);
    // Eva with 陳柏宇 in Thailand, and a Taiwan trip on her own.
    add('demo-eva','countries:764','2025-01',['demo-chen','demo-tanaka']);
    add('demo-eva','cities:chiang-mai-th','2025-01',['demo-chen']);
    add('demo-eva','countries:158','2024-02',[]);
    add('demo-lin','countries:392','2023-04',['demo-eva']);
    add('demo-lin','cities:tokyo-jp','2023-04',['demo-eva']);
    add('demo-lin','ca:banff','2024-08',['demo-eva']);
    add('demo-lin','countries:250','2022-06',[]);
    add('demo-chen','countries:392','2022-11',['demo-eva']);
    add('demo-chen','countries:764','2025-01',['demo-eva','demo-tanaka']);
    add('demo-tanaka','countries:392','2024-06',['demo-eva']);
    add('demo-tanaka','countries:764','2025-01',['demo-eva','demo-chen']);
    add('demo-tanaka','cities:seoul-kr','2023-09',[]);
    add('demo-tanaka','countries:410','2023-09',[]);
    return { stamps:rows, cities:[] };
  }
  function demoWrite(mutator) {
    const store = demoStore();
    mutator(store);
    writeJSON(DEMO_KEY, store);
    demoBroadcast();
    return store;
  }
  function demoBroadcast() {
    try {
      demoChannel?.postMessage({ at:Date.now() });
      localStorage.setItem('eva.travel.atlas.demo.ping', String(Date.now()));
    } catch { /* storage may be unavailable */ }
  }
  function demoSession() {
    try {
      const id = sessionStorage.getItem(DEMO_SESSION_KEY);
      return DEMO_USERS.some(user => user.id === id) ? id : null;
    } catch { return null; }
  }
  function setDemoSession(id) {
    try {
      if (id) sessionStorage.setItem(DEMO_SESSION_KEY, id);
      else sessionStorage.removeItem(DEMO_SESSION_KEY);
    } catch { /* ignore */ }
  }

  // ---------- row normalisation ----------
  function stampFromRow(row) {
    if (!row || typeof row.place_key !== 'string') return null;
    const month = String(row.visit_month || '').slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
    return {
      id:String(row.id),
      userId:String(row.user_id),
      placeKey:row.place_key,
      month,
      companions:Array.isArray(row.companions) ? row.companions.filter(value => typeof value === 'string') : [],
      updatedAt:row.updated_at || row.created_at || null
    };
  }
  function cityFromRow(row) {
    if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') return null;
    const lat = row.lat === null || row.lat === undefined ? null : Number(row.lat);
    const lon = row.lon === null || row.lon === undefined ? null : Number(row.lon);
    if (lat === null || lon === null) return { id:row.id, userId:String(row.user_id), en:row.name, iso:row.iso, lat:null, lon:null };
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { id:row.id, userId:String(row.user_id), en:row.name, iso:row.iso, lat, lon };
  }
  function profileFromRow(row) {
    return {
      id:String(row.id),
      name:typeof row.display_name === 'string' && row.display_name.trim() ? row.display_name.trim() : '旅人',
      avatar:typeof row.avatar_url === 'string' ? row.avatar_url : '',
      discoverable:row.discoverable !== false
    };
  }

  // ---------- state helpers ----------
  function status() {
    return {
      mode:state.mode,
      connection:state.connection,
      pending:state.pending,
      lastSyncAt:state.lastSyncAt,
      realtime:state.realtime,
      signedIn:Boolean(state.user)
    };
  }
  function setConnection(next) {
    if (state.connection === next) return;
    state.connection = next;
    emit('status', status());
  }
  function setUser(user) {
    state.user = user;
    state.pending = user ? readOutbox().filter(op => op.userId === user.id).length : 0;
    emit('auth', user);
    emit('status', status());
  }
  // Every mode now requires a signed-in traveller before anything can change.
  function canEdit() { return Boolean(state.user); }

  function sortRows() {
    return [...rowsById.values()].sort((a, b) => a.month.localeCompare(b.month) || a.placeKey.localeCompare(b.placeKey));
  }
  function visibleRows() { return sortRows(); }
  function myRows() { return state.user ? sortRows().filter(row => row.userId === state.user.id) : []; }
  // Custom cities belong to the traveller who added them.
  function visibleCities() {
    if (state.user) return [...citiesById.values()].filter(city => city.userId === state.user.id);
    return [];
  }

  // ---------- views of the data ----------
  const api = {
    get mode() { return state.mode; },
    get user() { return state.user; },
    isConfigured,
    canEdit,
    status,
    on,
    profiles:() => new Map(profiles),
    profile: id => profiles.get(id) || null,
    rows: visibleRows,
    myRows,
    cities: visibleCities,
    pendingOps: outboxForCurrentUser,
    demoUsers: () => DEMO_USERS.slice(),
    demoAvailable: () => state.mode === 'demo',
    localGateAvailable: () => Boolean(localGate()),
    localGateHint: () => localGate()?.hint || '',
    localSignIn,
    localSignOut,
    // Last name this browser signed in with, so the dialog can prefill it.
    lastTravellerName: () => {
      const value = readJSON(TRAVELLER_NAME_KEY, '');
      return typeof value === 'string' ? value : '';
    },
    async refresh() { return syncPull(); },
    signIn,
    signOut,
    enterDemo,
    exitDemo,
    async init() {
      if (initialised) return;
      initialised = true;
      if (isConfigured()) {
        state.mode = 'cloud';
        state.connection = 'connecting';
        if (!window.supabase?.createClient) { setConnection('error'); return; }
        client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'pkce' }
        });
        client.auth.onAuthStateChange((event, session) => {
          if (!session?.user) { setUser(null); return; }
          // A refreshed token for the traveller already on screen changes nothing.
          if (event === 'TOKEN_REFRESHED' && state.user?.id === session.user.id) return;
          resolveSession(session);
        });
        const { data } = await client.auth.getSession();
        await resolveSession(data?.session || null);
        setConnection('online');
        // Every visitor loads the public atlas, signed in or not.
        await syncPull();
        startPolling();
        window.addEventListener('online', () => { refreshConnection(); flush(); syncPull(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncPull(); flush(); } });
        emit('ready', status());
        return;
      }
      // Demo mode is opt-in: config.demoMode, or ?demo=1 on the page URL.
      const demoRequested = Boolean(config.demoMode) || new URLSearchParams(location.search).has('demo');
      if (demoRequested) {
        state.mode = 'demo';
        state.connection = 'online';
        startDemoChannel();
        profilesLoadDemo();
        // Load the shared demo atlas before announcing readiness, so a visitor
        // sees the same collection as a signed-in traveller.
        await syncPull();
        const id = demoSession();
        if (id) enterDemo(id);
        emit('ready', status());
        return;
      }
      state.mode = 'local';
      restoreLocalSession();
      emit('ready', status());
    }
  };

  function refreshConnection() {
    if (!client) return;
    setConnection(navigator.onLine ? 'online' : 'offline');
  }

  // ---------- profiles ----------
  function profilesLoadDemo() {
    DEMO_USERS.forEach(user => profiles.set(user.id, { id:user.id, name:user.name, avatar:'', discoverable:true }));
    emit('profiles', profiles);
  }
  async function setDiscoverable(value) {
    if (!state.user) return false;
    const profile = profiles.get(state.user.id) || { id:state.user.id, name:state.user.name, avatar:state.user.avatar };
    profile.discoverable = Boolean(value);
    profiles.set(profile.id, profile);
    emit('profiles', profiles);
    if (state.mode === 'demo') return true;
    if (!client) return false;
    const { error } = await client.from('profiles').update({ discoverable:Boolean(value), updated_at:new Date().toISOString() }).eq('id', state.user.id);
    return !error;
  }
  api.setDiscoverable = setDiscoverable;

  // ---------- auth ----------
  // Postgres can only recognise a traveller through auth.uid(), so the page
  // needs a Supabase Auth session before it can even ask about the access code.
  // Each browser therefore gets its own account, created from a random address
  // and password this page generates and keeps in localStorage: nobody has to
  // remember a second credential, and the code stays the one thing a person
  // types. Re-using the stored account means signing out and in again on the
  // same browser returns to the same traveller and the same stamps.
  function randomToken(bytes) {
    if (window.crypto?.getRandomValues) {
      const buffer = new Uint8Array(bytes);
      window.crypto.getRandomValues(buffer);
      return [...buffer].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    return Array.from({ length: bytes * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
  async function ensureSession() {
    const existing = (await client.auth.getSession()).data?.session;
    if (existing) return { session: existing };
    const stored = readJSON(DEVICE_KEY, null);
    if (stored?.email && stored?.password) {
      const { data, error } = await client.auth.signInWithPassword({ email: stored.email, password: stored.password });
      if (!error && data?.session) return { session: data.session };
      // The stored account is gone (project reset, revoked user): make a new one.
    }
    const email = `atlas-${randomToken(10)}@example.com`;
    const password = randomToken(24);
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return { error };
    if (!data?.session) return { error: { message: 'email_confirmation_required' } };
    writeJSON(DEVICE_KEY, { email, password });
    return { session: data.session };
  }
  // Supabase errors are terse and English. Turn the ones that mean "one more
  // switch in the dashboard" into that switch.
  function signInErrorText(error) {
    const text = `${error?.message || error || ''} ${error?.code || ''}`;
    if (/email_confirmation_required|email not confirmed|confirm your email/i.test(text)) {
      return '這個專案還要求確認信：Supabase → Authentication → Sign In / Providers → Email → 關閉「Confirm email」後再試。';
    }
    if (/signups? (are )?(not allowed|disabled)|signup.*disabl/i.test(text)) {
      return 'Supabase 目前不開放建立帳號：Authentication → Sign In / Providers → Email 要開啟（本頁靠它建立這台裝置的旅人身分）。';
    }
    if (/invalid api key|no api key|invalid jwt|jwt expired/i.test(text)) {
      return 'anon key 不正確或已失效：請換上 Project Settings → API 的 anon public key，或重跑 scripts/connect-supabase.cjs。';
    }
    if (/does not exist|42P01|schema cache|PGRST202|function.*not found/i.test(text)) {
      return '資料表或函式還沒建立：到 Supabase SQL Editor 執行 personal/travel/map/supabase/setup.sql。';
    }
    if (/failed to fetch|networkerror|load failed|err_name_not_resolved/i.test(text)) {
      return '連不到 Supabase：確認網路可用，且 config.js 的 supabaseUrl 正確。';
    }
    return `登入失敗：${error?.message || '請稍後再試。'}`;
  }
  function codeErrorText(reason) {
    switch (reason) {
      case 'invalid_code': return '通行碼不正確。';
      case 'missing_code': return '請輸入通行碼。';
      case 'throttled': return '嘗試次數太多，請 15 分鐘後再試。';
      case 'no_code_set':
        return '這個專案還沒設定通行碼：在 Supabase SQL Editor 執行 select public.atlas_rotate_code(\'新的通行碼\');';
      case 'no_session': return '登入工作階段已失效，請重新整理再試。';
      default: return '登入失敗，請稍後再試。';
    }
  }
  async function signIn({ code, name } = {}) {
    if (state.mode === 'demo') { enterDemo('demo-eva'); return { ok:true }; }
    // No backend: the dialog collects the browser-only passphrase instead.
    if (state.mode === 'local') return localSignIn(code);
    if (!client) return { ok:false, reason:'這個頁面還沒有連接 Supabase 專案。' };
    const value = typeof code === 'string' ? code.trim() : '';
    const traveller = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    if (!value) return { ok:false, reason:'請輸入通行碼。' };
    setConnection('connecting');
    const attempt = await ensureSession();
    if (attempt.error) {
      setConnection('error');
      return { ok:false, reason: signInErrorText(attempt.error) };
    }
    if (!attempt.session?.user) {
      setConnection('error');
      return { ok:false, reason:'無法開始登入，請重新整理再試。' };
    }
    // The code itself is checked in Postgres, never in this file.
    const { data, error } = await client.rpc('atlas_redeem_code', {
      p_code: value,
      p_name: traveller,
      p_user_agent: String(navigator.userAgent || '').slice(0, 300)
    });
    if (error) {
      setConnection('error');
      return { ok:false, reason: signInErrorText(error) };
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || result.ok !== true) {
      setConnection('online');
      return { ok:false, reason: codeErrorText(result?.reason) };
    }
    const profile = {
      id: String(result.user_id || attempt.session.user.id),
      name: typeof result.display_name === 'string' && result.display_name.trim() ? result.display_name.trim() : '旅人',
      avatar: typeof result.avatar_url === 'string' ? result.avatar_url : '',
      email: ''
    };
    writeJSON(TRAVELLER_NAME_KEY, profile.name);
    profiles.set(profile.id, { ...profile, discoverable: result.discoverable !== false });
    setUser(profile);
    startSubscription();
    emit('profiles', profiles);
    await syncPull();
    flush();
    emit('status', status());
    return { ok:true };
  }
  // A session only means something once the code has produced a profile row.
  let resolveSeq = 0;
  async function resolveSession(session) {
    const seq = ++resolveSeq;
    if (!session?.user) { setUser(null); return; }
    if (state.user?.id === session.user.id) return;
    const { data, error } = await client.from('profiles')
      .select('id,display_name,avatar_url,discoverable')
      .eq('id', session.user.id)
      .maybeSingle();
    if (seq !== resolveSeq) return;
    if (error) {
      setConnection('error');
      if (isSetupError(error)) emit('error', error.message);
      return;
    }
    // Signed in but not approved: a visitor with an empty session.
    if (!data) { setUser(null); return; }
    const profile = profileFromRow(data);
    profiles.set(profile.id, profile);
    setUser({ id:profile.id, name:profile.name, avatar:profile.avatar, email:'' });
    startSubscription();
    await syncPull();
    flush();
  }
  async function signOut() {
    if (state.mode === 'demo') { exitDemo(); return; }
    if (state.mode === 'local') { localSignOut(); return; }
    if (!client) return;
    stopSubscription();
    setUser(null);
    await client.auth.signOut();
    setConnection('online');
    // Stay a read-only visitor of the public atlas.
    await syncPull();
    emit('cities', { reset:true });
  }
  function enterDemo(id = 'demo-eva') {
    const user = DEMO_USERS.find(item => item.id === id);
    if (!user) return;
    const sameUser = state.user?.id === user.id;
    setDemoSession(user.id);
    profilesLoadDemo();
    setUser({ id:user.id, name:user.name, avatar:'', email:'' });
    // Switching between demo travellers needs a fresh pull; a first sign-in
    // already pulls from the auth change itself.
    if (sameUser || state.connection === 'online') syncPull();
  }
  function exitDemo() {
    setDemoSession(null);
    setUser(null);
    // The map stays public after signing out: keep the shared rows, drop only
    // this traveller's private custom cities.
    syncPull();
  }
  api.setDemoUser = id => { if (state.mode === 'demo') enterDemo(id); };

  // ---------- realtime ----------
  function startSubscription() {
    if (!client || channel) return;
    channel = client.channel('atlas-sync')
      .on('postgres_changes', { event:'*', schema:'public', table:'stamps' }, payload => {
        const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
        const stamp = stampFromRow(row);
        if (!stamp) return;
        if (payload.eventType === 'DELETE') {
          rowsById.delete(String(payload.old.id));
        } else {
          rowsById.set(stamp.id, stamp);
        }
        state.lastSyncAt = new Date().toISOString();
        emit('rows', { type:payload.eventType, stamp });
        emit('status', status());
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'custom_cities' }, payload => {
        const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
        if (payload.eventType === 'DELETE') citiesById.delete(String(payload.old.id));
        else {
          const city = cityFromRow(row);
          if (city) citiesById.set(city.id, city);
        }
        emit('cities', { type:payload.eventType });
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'profiles' }, payload => {
        const row = payload.new;
        if (row?.id) { profiles.set(String(row.id), profileFromRow(row)); emit('profiles', profiles); }
      })
      .subscribe(channelState => {
        state.realtime = channelState === 'SUBSCRIBED';
        if (channelState === 'SUBSCRIBED') { setConnection('online'); stopPolling(); }
        else if (channelState === 'CHANNEL_ERROR' || channelState === 'TIMED_OUT') { setConnection(navigator.onLine ? 'error' : 'offline'); startPolling(); }
        emit('status', status());
      });
  }
  function stopSubscription() {
    if (channel && client) client.removeChannel(channel);
    channel = null;
    state.realtime = false;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  // Realtime needs a live websocket; a slow poll keeps unsent work moving when it drops.
  function startPolling() {
    if (pollTimer || !client) return;
    pollTimer = setInterval(() => {
      if (document.hidden || !navigator.onLine) return;
      if (state.realtime) return;
      syncPull();
      flush();
    }, 20000);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function startDemoChannel() {
    try { demoChannel = new BroadcastChannel('eva.travel.atlas.demo'); }
    catch { demoChannel = null; }
    const reload = () => {
      if (state.mode !== 'demo') return;
      rowsById.clear();
      citiesById.clear();
      demoStore().stamps.forEach(row => {
        const stamp = stampFromRow({ ...row, id:row.id, user_id:row.userId, place_key:row.placeKey, visit_month:`${row.month}-01` });
        if (stamp) rowsById.set(stamp.id, stamp);
      });
      state.lastSyncAt = new Date().toISOString();
      emit('rows', { external:true });
      emit('status', status());
    };
    demoChannel?.addEventListener('message', reload);
    window.addEventListener('storage', event => {
      if (event.key === 'eva.travel.atlas.demo.ping' || event.key === DEMO_KEY) reload();
    });
  }

  // ---------- sync ----------
  function isSetupError(error) {
    const text = `${error?.message || error || ''} ${error?.code || ''} ${error?.details || ''}`;
    return /42P01|does not exist|schema cache|invalid api key|no api key|invalid jwt|permission denied|42501|row-level security|violates row-level/i.test(text);
  }
  async function syncPull() {
    if (state.mode === 'demo') {
      rowsById.clear();
      citiesById.clear();
      const store = demoStore();
      store.stamps.forEach(row => {
        const stamp = stampFromRow({ id:row.id, user_id:row.userId, place_key:row.placeKey, visit_month:`${row.month}-01`, companions:row.companions, updated_at:row.createdAt });
        if (stamp) rowsById.set(stamp.id, stamp);
      });
      (store.cities || []).forEach(row => {
        const city = cityFromRow({ id:row.id, user_id:row.userId, name:row.en, iso:row.iso, lat:row.lat, lon:row.lon });
        if (city) citiesById.set(city.id, city);
      });
      profilesLoadDemo();
      state.lastSyncAt = new Date().toISOString();
      emit('rows', { reset:true });
      emit('cities', { reset:true });
      emit('status', status());
      return { ok:true };
    }
    if (state.mode !== 'cloud' || !client) return { ok:false, reason:'local' };
    if (!navigator.onLine) { setConnection('offline'); return { ok:false, reason:'offline' }; }
    try {
      const { data:rows, error } = await client.from('stamps').select('id,user_id,place_key,visit_month,companions,created_at,updated_at').order('visit_month', { ascending:true });
      if (error) throw error;
      rowsById.clear();
      (rows || []).forEach(row => { const stamp = stampFromRow(row); if (stamp) rowsById.set(stamp.id, stamp); });
      const { data:cities } = await client.from('custom_cities').select('id,user_id,name,iso,lat,lon');
      citiesById.clear();
      (cities || []).forEach(row => { const city = cityFromRow(row); if (city) citiesById.set(city.id, city); });
      const { data:profileRows } = await client.from('profiles').select('id,display_name,avatar_url,discoverable');
      (profileRows || []).forEach(row => profiles.set(String(row.id), profileFromRow(row)));
      state.lastSyncAt = new Date().toISOString();
      setConnection('online');
      emit('rows', { reset:true });
      emit('cities', { reset:true });
      emit('profiles', profiles);
      emit('status', status());
      return { ok:true };
    } catch (error) {
      console.warn('sync failed', error);
      setConnection(navigator.onLine ? 'error' : 'offline');
      // A missing table, a wrong key or a blocked policy is a setup problem,
      // not a transient one: tell the page so it can name the next click.
      if (isSetupError(error)) emit('error', error.message);
      return { ok:false, reason:error.message };
    }
  }

  async function flush() {
    if (flushing || state.mode !== 'cloud' || !client || !state.user || !navigator.onLine) return;
    const mine = outboxForCurrentUser();
    if (!mine.length) { state.pending = 0; emit('status', status()); return; }
    flushing = true;
    setConnection('connecting');
    const sameOp = (a, b) => a.userId === b.userId && a.op === b.op
      && JSON.stringify(a.payload) === JSON.stringify(b.payload);
    const dropOp = op => writeOutbox(readOutbox().filter(item => !sameOp(item, op)));
    for (const op of mine) {
      try {
        if (op.op === 'stamp:set') {
          const { data, error } = await client.from('stamps').upsert({
            user_id:op.userId,
            place_key:op.payload.placeKey,
            visit_month:`${op.payload.month}-01`,
            companions:op.payload.companions || [],
            updated_at:new Date().toISOString()
          }, { onConflict:'user_id,place_key,visit_month' }).select('id,user_id,place_key,visit_month,companions,created_at,updated_at').single();
          if (error) throw error;
          const stamp = stampFromRow(data);
          if (stamp) rowsById.set(stamp.id, stamp);
        } else if (op.op === 'stamp:delete') {
          let id = typeof op.payload.id === 'string' && !op.payload.id.startsWith('pending-') ? op.payload.id : null;
          if (!id) {
            const { data } = await client.from('stamps').select('id').eq('user_id', op.userId)
              .eq('place_key', op.payload.placeKey).eq('visit_month', `${op.payload.month}-01`).maybeSingle();
            id = data?.id;
          }
          if (id) {
            const { error } = await client.from('stamps').delete().eq('id', id).eq('user_id', op.userId);
            if (error) throw error;
            rowsById.delete(String(id));
          }
        } else if (op.op === 'city:set') {
          const { error } = await client.from('custom_cities').upsert({
            id:op.payload.id, user_id:op.userId, name:op.payload.en, iso:op.payload.iso,
            lat:op.payload.lat, lon:op.payload.lon, updated_at:new Date().toISOString()
          }, { onConflict:'id' });
          if (error) throw error;
        } else if (op.op === 'city:delete') {
          const { error } = await client.from('custom_cities').delete().eq('id', op.payload.id).eq('user_id', op.userId);
          if (error) throw error;
        }
        dropOp(op);
      } catch (error) {
        console.warn('queued change failed', op.op, error);
        flushing = false;
        setConnection(navigator.onLine ? 'error' : 'offline');
        startPolling();
        return;
      }
    }
    flushing = false;
    state.lastSyncAt = new Date().toISOString();
    setConnection('online');
    emit('rows', { reset:true });
    emit('status', status());
  }
  api.flush = flush;

  // Optimistic local writes: app.js updates its own model immediately, then
  // calls these. If the network is down the change waits in the outbox.
  // Demo writes update the in-memory snapshot immediately: the page has already
  // drawn the new stamp, and a snapshot pull would not carry it yet.
  function demoStamp({ placeKey, month, companions = [] }) {
    const rowId = () => `demo-stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let row;
    const okay = demoWriteGuarded(store => {
      const existing = store.stamps.find(item => item.userId === state.user.id && item.placeKey === placeKey && item.month === month);
      if (existing) {
        existing.companions = companions;
        row = { ...existing };
      } else {
        row = { id:rowId(), userId:state.user.id, placeKey, month, companions, createdAt:new Date().toISOString() };
        store.stamps.push(row);
      }
    });
    if (okay && row) {
      const stamp = stampFromRow({ id:row.id, user_id:row.userId, place_key:row.placeKey, visit_month:`${row.month}-01`, companions:row.companions, updated_at:row.createdAt });
      if (stamp) rowsById.set(stamp.id, stamp);
      return true;
    }
    return false;
  }
  function demoWriteGuarded(mutator) {
    try { demoWrite(mutator); return true; }
    catch { return false; }
  }
  api.upsertStamp = async ({ placeKey, month, companions = [] }) => {
    if (state.mode === 'local' || !state.user) return { local:true };
    if (state.mode === 'demo') {
      demoStamp({ placeKey, month, companions });
      return { ok:true };
    }
    queue({ op:'stamp:set', userId:state.user.id, payload:{ placeKey, month, companions } });
    flush();
    return { queued:true };
  };
  api.deleteStamp = async ({ id, placeKey, month }) => {
    if (state.mode === 'local' || !state.user) return { local:true };
    if (state.mode === 'demo') {
      demoWriteGuarded(store => {
        store.stamps = store.stamps.filter(row => !(row.userId === state.user.id && row.placeKey === placeKey && row.month === month));
      });
      for (const [id, row] of rowsById) {
        if (row.userId === state.user.id && row.placeKey === placeKey && row.month === month) rowsById.delete(id);
      }
      return { ok:true };
    }
    queue({ op:'stamp:delete', userId:state.user.id, payload:{ id, placeKey, month } });
    flush();
    return { queued:true };
  };
  api.upsertCity = async city => {
    if (state.mode === 'local' || !state.user) return { local:true };
    if (state.mode === 'demo') {
      demoWriteGuarded(store => {
        store.cities ||= [];
        store.cities = store.cities.filter(row => row.id !== city.id);
        store.cities.push({ id:city.id, userId:state.user.id, en:city.en, iso:city.iso, lat:city.lat, lon:city.lon });
      });
      return { ok:true };
    }
    queue({ op:'city:set', userId:state.user.id, payload:city });
    flush();
    return { queued:true };
  };
  api.deleteCity = async id => {
    if (state.mode === 'local' || !state.user) return { local:true };
    if (state.mode === 'demo') {
      demoWriteGuarded(store => { store.cities = (store.cities || []).filter(row => row.id !== id); });
      return { ok:true };
    }
    queue({ op:'city:delete', userId:state.user.id, payload:{ id } });
    flush();
    return { queued:true };
  };

  // Local records from before sign-in are uploaded once, then merged by month.
  api.adoptLocal = async ({ visits, customCities }) => {
    if (state.mode === 'local' || !state.user) return 0;
    let count = 0;
    for (const city of customCities || []) await api.upsertCity(city);
    const rows = Object.entries(visits || {});
    for (const [placeKey, months] of rows) for (const month of months) {
      await api.upsertStamp({ placeKey, month, companions:[] });
      count++;
    }
    return count;
  };
  // Persist a per-user view locally so a reload without a network still shows stamps.
  api.writeCache = payload => writeJSON(CACHE_KEY, payload);
  api.cachedVisits = () => {
    const raw = readJSON(CACHE_KEY, null);
    return raw && typeof raw.visits === 'object' && !Array.isArray(raw.visits) ? raw.visits : null;
  };

  window.TravelAtlasAccount = api;
})();
