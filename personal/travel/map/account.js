// Stamp Atlas accounts, cloud sync, companions, and live updates.
//
// Transport only: this module owns sign-in, the cloud rows, and realtime events.
// app.js owns the map and the local record model.
//
// Supabase Auth handles personal passwords and email confirmation. A verified
// account must still redeem the shared invite in Postgres before a profile is
// created. Returning-user `atlas_login` requires that profile and never grants
// approval. Neither the password nor the invite is saved by this page.
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
  // Legacy generated credentials are no longer used or retained.
  const DEVICE_KEY = 'eva.travel.atlas.device.v1';
  let authenticating = false;
  let recoveryFlow = false;
  // An expired or already-used mail link comes back with an error instead of
  // a session; the page says so instead of silently showing the map.
  let linkError = null;
  const TRAVELLER_NAME_KEY = 'eva.travel.atlas.name.v1';
  // Display-name override for the browser-only gate, whose name comes from config.
  const LOCAL_NAME_KEY = 'eva.travel.atlas.local-name.v1';
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
    const savedName = readJSON(LOCAL_NAME_KEY, '');
    const name = typeof savedName === 'string' && savedName.trim() ? savedName.trim().slice(0, 40) : gate.name;
    setUser({ id: gate.id, name, avatar: '', email: '', local: true });
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
    const savedName = readJSON(LOCAL_NAME_KEY, '');
    const name = typeof savedName === 'string' && savedName.trim() ? savedName.trim().slice(0, 40) : gate.name;
    setUser({ id: gate.id, name, avatar: '', email: '', local: true });
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
  // Remember that one queued change was refused, so the page can show it
  // instead of claiming the cloud already has it.
  function markFailed(op) {
    const ops = readOutbox();
    const index = ops.findIndex(item => item.userId === op.userId && item.op === op.op
      && item.payload?.placeKey === op.payload?.placeKey
      && item.payload?.month === op.payload?.month
      && item.payload?.id === op.payload?.id);
    if (index < 0) return;
    ops[index] = { ...ops[index], failed:true, attempts:(ops[index].attempts || 0) + 1 };
    writeOutbox(ops);
  }
  function syncStates() {
    const map = new Map();
    if (state.mode !== 'cloud' || !state.user) return map;
    for (const op of outboxForCurrentUser()) {
      const { placeKey, month } = op.payload || {};
      if (typeof placeKey !== 'string' || typeof month !== 'string') continue;
      map.set(`${placeKey}|${month}`, op.failed ? 'failed' : 'pending');
    }
    return map;
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
      // Records whose last attempt failed and that are waiting for a retry.
      failing:state.user ? outboxForCurrentUser().filter(op => op.failed).length : 0,
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
  // A signed-out visitor sees nobody's stamps; travellers also read records
  // that tag them, which the shared-trip view needs.
  function visibleRows() { return state.user ? sortRows() : []; }
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
    // One record's state: queued ('pending'), refused ('failed') or confirmed.
    syncStates,
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
      // An explicitly requested demo must never contact the configured project.
      const demoRequested = Boolean(config.demoMode) || new URLSearchParams(location.search).has('demo');
      if (demoRequested) {
        state.mode = 'demo';
        state.connection = 'online';
        startDemoChannel();
        profilesLoadDemo();
        await syncPull();
        const id = demoSession();
        if (id) enterDemo(id);
        emit('ready', status());
        return;
      }
      if (isConfigured()) {
        // Capture the recovery type before the Auth client consumes the hash.
        recoveryFlow = recoveryLink();
        linkError = readLinkError();
        const tokenHash = linkError ? null : readTokenHash();
        // An error link never opens the reset view: it has no session to use.
        if (linkError) recoveryFlow = false;
        try { localStorage.removeItem(DEVICE_KEY); } catch { /* ignore */ }
        state.mode = 'cloud';
        state.connection = 'connecting';
        if (!window.supabase?.createClient) { setConnection('error'); return; }
        client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
          // The email link may open on another device/browser. The implicit callback
          // can complete there without a browser-specific PKCE verifier.
          auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'implicit' }
        });
        client.auth.onAuthStateChange((event, session) => {
          if (authenticating) return;
          // A recovery link proves the address; it only asks for a new password.
          if (event === 'PASSWORD_RECOVERY') { recoveryFlow = true; emit('recovery', true); return; }
          if (!session?.user) { setUser(null); return; }
          // A refreshed token for the traveller already on screen changes nothing.
          if (event === 'TOKEN_REFRESHED' && state.user?.id === session.user.id && session.user.email_confirmed_at) return;
          resolveSession(session);
        });
        if (tokenHash) {
          try {
            const { error } = await client.auth.verifyOtp(tokenHash);
            if (error) { console.warn('mail link could not be verified', error); linkError = { code:error.code || 'otp_expired', description:error.message || '' }; recoveryFlow = false; }
          } catch (error) {
            console.warn('mail link could not be verified', error);
            linkError = { code:'otp_expired', description:'' };
            recoveryFlow = false;
          }
        }
        const { data } = await client.auth.getSession();
        await resolveSession(data?.session || null);
        cleanAuthParams();
        if (linkError) {
          console.warn('mail link returned an error', linkError);
          setTimeout(() => emit('link-error', linkError), 0);
        }
        setConnection('online');
        // A link that carries the recovery type opens the reset view even if
        // the exchange completes after the page has already rendered.
        if (recoveryFlow) setTimeout(() => emit('recovery', true), 0);
        // Signed-in travellers load their atlas; visitors get an empty one.
        await syncPull();
        startPolling();
        window.addEventListener('online', () => { refreshConnection(); flush(); syncPull(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncPull(); flush(); } });
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
  function demoNameOverrides() {
    const raw = readJSON(DEMO_KEY, null);
    return raw && raw.profileNames && typeof raw.profileNames === 'object' ? raw.profileNames : {};
  }
  function profilesLoadDemo() {
    const overrides = demoNameOverrides();
    DEMO_USERS.forEach(user => {
      const name = typeof overrides[user.id] === 'string' && overrides[user.id].trim() ? overrides[user.id].trim().slice(0, 40) : user.name;
      profiles.set(user.id, { id:user.id, name, avatar:'', discoverable:true });
    });
    emit('profiles', profiles);
  }
  function demoDisplayName(id) {
    return profiles.get(id)?.name || DEMO_USERS.find(user => user.id === id)?.name || '旅人';
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

  // ---------- display name ----------
  // The name other travellers see (companion tags, stamp signatures). Email is
  // owned by Supabase Auth and is only ever shown, never edited here. RLS
  // ("own profile update") already restricts this write to the traveller's
  // own row; demo and local modes keep the same behaviour without a backend.
  async function updateDisplayName(rawName) {
    if (!state.user) return { ok:false, reason:'請先登入。' };
    const name = typeof rawName === 'string' ? rawName.trim().slice(0, 40) : '';
    if (!name) return { ok:false, reason:'顯示名稱不能是空白。' };
    if (name === state.user.name) return { ok:true, name, unchanged:true };
    if (state.mode === 'demo') {
      const okay = demoWriteGuarded(store => {
        store.profileNames = { ...(store.profileNames || {}), [state.user.id]:name };
      });
      if (!okay) return { ok:false, reason:'暫時無法儲存，請稍後再試。' };
      profilesLoadDemo();
      setUser({ ...state.user, name });
      emit('profiles', profiles);
      return { ok:true, name };
    }
    if (state.mode === 'local') {
      if (!writeJSON(LOCAL_NAME_KEY, name)) return { ok:false, reason:'這個瀏覽器不允許儲存，請稍後再試。' };
      setUser({ ...state.user, name });
      return { ok:true, name };
    }
    if (!client) return { ok:false, reason:'登入服務暫時無法使用，請稍後再試。' };
    const { error } = await client.from('profiles')
      .update({ display_name:name, updated_at:new Date().toISOString() })
      .eq('id', state.user.id);
    if (error) {
      console.warn('display name could not be saved', error);
      return { ok:false, reason:'名稱暫時無法儲存，請稍後再試。' };
    }
    const profile = profiles.get(state.user.id) || { id:state.user.id, avatar:state.user.avatar, discoverable:true };
    profiles.set(state.user.id, { ...profile, name });
    writeJSON(TRAVELLER_NAME_KEY, name);
    setUser({ ...state.user, name });
    emit('profiles', profiles);
    return { ok:true, name };
  }
  api.updateDisplayName = updateDisplayName;

  // ---------- auth ----------
  // Anyone can open the page source, so failures are answered in plain
  // language. Setup steps, keys and file paths stay in the repo, never here.
  function signInErrorText(error) {
    const text = `${error?.message || error || ''} ${error?.code || ''}`;
    if (/invalid login credentials|invalid_credentials/i.test(text)) return '電子郵件或個人密碼不正確。';
    if (/already registered|user_already_exists|email_exists/i.test(text)) return '這個電子郵件已註冊，請改用登入。';
    if (/weak_password|password.*(short|least|weak)/i.test(text)) return '密碼太短，請換一組超過 6 個字元的密碼。';
    if (/rate.limit|too many requests|over_.*rate_limit/i.test(text)) return '登入或註冊太頻繁，請稍後再試。';
    if (/email_confirmation_required|email not confirmed|email_not_confirmed|confirm your email/i.test(text)) {
      return '請先點擊驗證信中的連結，驗證信箱後再繼續。';
    }
    if (/email_address_not_authorized|error sending confirmation email|email.*(not authorized|sending|blocked)/i.test(text)) {
      return '驗證信暫時無法寄出，請稍後再試或聯絡網站擁有者。';
    }
    if (/signups? (are )?(not allowed|disabled)|signup.*disabl/i.test(text)) {
      return '目前還不能建立帳號，請聯絡網站擁有者。';
    }
    if (/invalid api key|no api key|invalid jwt|jwt expired/i.test(text)) {
      return '登入服務暫時無法使用，請稍後再試。';
    }
    if (/does not exist|42P01|schema cache|PGRST202|function.*not found/i.test(text)) {
      return '登入服務暫時無法使用，請稍後再試。';
    }
    if (/failed to fetch|networkerror|load failed|err_name_not_resolved/i.test(text)) {
      return '網路連線似乎有問題，請檢查網路後再試。';
    }
    return '登入失敗，請稍後再試。';
  }
  function codeErrorText(reason) {
    switch (reason) {
      case 'invalid_code': return '通行碼不正確。';
      case 'missing_code': return '請輸入邀請碼。';
      case 'throttled': return '嘗試次數太多，請稍後再試。';
      case 'no_code_set':
        return '目前還不能建立帳號，請聯絡網站擁有者。';
      case 'not_approved': return '帳號尚未完成建立，請切換至「建立帳號」並輸入邀請碼。';
      case 'email_unverified': return '請先點擊驗證信中的連結，驗證信箱後再繼續。';
      case 'no_session': return '登入狀態已失效，請重新整理再試。';
      default: return '登入失敗，請稍後再試。';
    }
  }
  const firstRow = data => (Array.isArray(data) ? data[0] : data) || null;
  // The page may run against a project that has not applied the newest
  // migration yet; a missing function falls back to the older flow.
  const missingFunction = error => /PGRST202|42883|could not find the function|function .* does not exist/i
    .test(`${error?.message || ''} ${error?.code || ''} ${error?.details || ''}`);
  // A confirmed address whose invite was checked before the mail was sent
  // becomes a traveller here, without a second form. Returns the profile row
  // from the database, or null when the account still needs the invite.
  async function completeSignup() {
    if (!client) return null;
    try {
      const { data, error } = await client.rpc('atlas_complete_signup', {
        p_user_agent:String(navigator.userAgent || '').slice(0, 300)
      });
      if (error) {
        if (!missingFunction(error)) console.warn('signup could not be completed', error);
        return null;
      }
      const result = firstRow(data);
      return result && result.ok === true ? result : null;
    } catch (error) {
      console.warn('signup could not be completed', error);
      return null;
    }
  }
  // Mail links always return to the atlas page, which owns the reset and
  // confirmation views, even when the request came from the profile page.
  function atlasUrl() {
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/\/profile\/(?:index\.html)?$/, '/');
    // Do not carry filters, demo flags or authentication tokens into the email.
    url.search = '';
    url.hash = '';
    return url.toString();
  }
  function confirmationRedirect() { return atlasUrl(); }
  async function confirmationEnabled() {
    // Fail closed before creating an Auth user if the project would silently
    // auto-confirm arbitrary addresses. The settings endpoint is public.
    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
        headers:{ apikey:config.supabaseAnonKey }
      });
      if (!response.ok) throw new Error(`auth settings HTTP ${response.status}`);
      const settings = await response.json();
      return settings.mailer_autoconfirm === false;
    } catch (error) {
      console.warn('could not check email confirmation', error);
      return null;
    }
  }
  const validEmail = address => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
  async function resendVerification(email) {
    if (state.mode !== 'cloud' || !client) return { ok:false, reason:'登入服務暫時無法使用，請稍後再試。' };
    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!validEmail(address)) return { ok:false, field:'#account-email', reason:'請輸入有效的電子郵件。' };
    try {
      const { error } = await client.auth.resend({ type:'signup', email:address, options:{ emailRedirectTo:confirmationRedirect() } });
      if (error) return { ok:false, reason:signInErrorText(error) };
      // Avoid revealing whether an address already has an account.
      return { ok:true, reason:'如果信箱仍待驗證，驗證信已寄出。請查看收件匣與垃圾郵件。' };
    } catch (error) {
      console.warn('verification email could not be resent', error);
      return { ok:false, reason:signInErrorText(error) };
    }
  }
  api.resendVerification = resendVerification;

  async function signIn({ code, name, email, password, createAccount = false } = {}) {
    if (state.mode === 'demo') { enterDemo('demo-eva'); return { ok:true }; }
    if (state.mode === 'local') return localSignIn(code);
    if (!client) return { ok:false, reason:'登入服務暫時無法使用，請稍後再試。' };
    const value = typeof code === 'string' ? code.trim() : '';
    const traveller = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    if (createAccount && !value) return { ok:false, field:'#access-code', reason:'請輸入邀請碼。' };
    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!validEmail(address)) return { ok:false, field:'#account-email', reason:'請輸入有效的電子郵件。' };
    if (typeof password !== 'string' || !password) return { ok:false, field:'#account-password', reason:'請輸入個人密碼。' };
    if (password.length <= 6) return { ok:false, field:'#account-password', reason:'密碼需超過 6 個字元。' };
    if (createAccount && !traveller) return { ok:false, field:'#traveller-name', reason:'請輸入顯示名稱。' };
    if (authenticating) return { ok:false, reason:'登入中，請稍候。' };
    authenticating = true;
    ++resolveSeq;
    stopSubscription();
    setUser(null);
    setConnection('connecting');
    let accepted = false;
    try {
      if (createAccount) {
        const enabled = await confirmationEnabled();
        if (enabled !== true) {
          return { ok:false, reason:enabled === false
            ? '目前還不能建立帳號，請聯絡網站擁有者。'
            : '網路連線似乎有問題，請檢查網路後再試。' };
        }
      }
      // Check the invite before any mail is sent, so the confirmation link
      // alone can finish the account. Older projects skip this step.
      let prepared = false;
      if (createAccount) {
        const { data:prepData, error:prepError } = await client.rpc('atlas_prepare_signup', {
          p_email:address, p_code:value, p_name:traveller
        });
        if (prepError && !missingFunction(prepError)) return { ok:false, reason:signInErrorText(prepError) };
        if (!prepError) {
          const prep = firstRow(prepData);
          if (!prep || prep.ok !== true) {
            const reason = prep?.reason;
            return {
              ok:false,
              field:reason === 'invalid_code' || reason === 'missing_code' ? '#access-code' : reason === 'invalid_email' ? '#account-email' : undefined,
              reason:reason === 'invalid_email' ? '請輸入有效的電子郵件。' : codeErrorText(reason)
            };
          }
          prepared = true;
        }
      }
      // Never reuse an existing session as proof of the typed password.
      let response = createAccount
        ? await client.auth.signUp({ email:address, password, options:{ emailRedirectTo:confirmationRedirect() } })
        : await client.auth.signInWithPassword({ email:address, password });
      const duplicate = createAccount && (
        /already registered|user_already_exists|email_exists/i.test(`${response.error?.message || ''} ${response.error?.code || ''}`)
        || (!response.error && !response.data?.session && Array.isArray(response.data?.user?.identities) && response.data.user.identities.length === 0)
      );
      // A previously verified but unapproved account can finish after a bad
      // invite, but only after proving its own password. Auth deliberately
      // obfuscates duplicate signups when confirmation is enabled.
      if (duplicate) response = await client.auth.signInWithPassword({ email:address, password });
      if (response.error) {
        const unverified = /email_confirmation_required|email not confirmed|email_not_confirmed|confirm your email/i.test(`${response.error.message || ''} ${response.error.code || ''}`);
        return { ok:false, needsVerification:unverified, reason:signInErrorText(response.error) };
      }
      const attempt = { session:response.data?.session };
      if (createAccount && !duplicate && !attempt.session?.user) {
        // No password, invite or token is retained while waiting for the email.
        writeJSON(TRAVELLER_NAME_KEY, traveller);
        return { ok:false, pendingVerification:true, autoComplete:prepared, reason:prepared
          ? '驗證信已寄出。打開信中的連結，就會自動完成建立並登入。'
          : '如果信箱可註冊，驗證信已寄出。請點擊信中連結，再以原帳密和邀請碼完成建立；若已註冊請直接登入。' };
      }
      if (!attempt.session?.user) return { ok:false, reason:'登入狀態已失效，請重新整理再試。' };
      // Even if configuration changes between the settings check and signup,
      // a newly issued immediate session must not skip the confirmation step.
      if (createAccount && !duplicate) return { ok:false, reason:'目前還不能建立帳號，請聯絡網站擁有者。' };
      if (createAccount) {
        const { data:existingProfile, error:profileError } = await client.from('profiles')
          .select('id').eq('id', attempt.session.user.id).maybeSingle();
        if (profileError) return { ok:false, reason:signInErrorText(profileError) };
        if (existingProfile) return { ok:false, reason:'這個電子郵件已註冊，請改用登入。' };
      }
      // The database independently checks email confirmation and the invite.
      const { data, error } = createAccount
        ? await client.rpc('atlas_redeem_code', {
          p_code:value, p_name:traveller,
          p_user_agent:String(navigator.userAgent || '').slice(0, 300)
        })
        : await client.rpc('atlas_login', {
          p_user_agent:String(navigator.userAgent || '').slice(0, 300)
        });
      if (error) {
        setConnection('error');
        return { ok:false, reason: signInErrorText(error) };
      }
      let result = firstRow(data);
      // The link may have been opened on another device: a returning login
      // finishes an account whose invite was already accepted.
      if (!createAccount && result?.reason === 'not_approved') result = (await completeSignup()) || result;
      if (!result || result.ok !== true) {
        setConnection('online');
        return { ok:false, needsVerification:result?.reason === 'email_unverified', reason: codeErrorText(result?.reason) };
      }
      const profile = {
        id: String(result.user_id || attempt.session.user.id),
        name: typeof result.display_name === 'string' && result.display_name.trim() ? result.display_name.trim() : '旅人',
        avatar: typeof result.avatar_url === 'string' ? result.avatar_url : '',
        email: typeof attempt.session.user.email === 'string' ? attempt.session.user.email : address
      };
      writeJSON(TRAVELLER_NAME_KEY, profile.name);
      profiles.set(profile.id, { ...profile, discoverable: result.discoverable !== false });
      accepted = true;
      setUser(profile);
      startSubscription();
      emit('profiles', profiles);
      await syncPull();
      flush();
      emit('status', status());
      return { ok:true };
    } catch (error) {
      console.warn('sign-in failed', error);
      return { ok:false, reason:signInErrorText(error) };
    } finally {
      if (!accepted) {
        try { await client.auth.signOut(); } catch { /* remain read-only */ }
        setUser(null);
      }
      authenticating = false;
      setConnection(navigator.onLine ? 'online' : 'offline');
    }
  }
  // A session only means something once the code has produced a profile row.
  let resolveSeq = 0;
  let notifiedUnapprovedId = null;
  let notifiedUnverifiedId = null;
  async function resolveSession(session) {
    const seq = ++resolveSeq;
    if (!session?.user) { setUser(null); return; }
    // Never present an unverified session as an editable traveller, even if a
    // stale profile exists. Recovery links keep priority over this prompt.
    if (!session.user.email_confirmed_at) {
      setUser(null);
      if (!recoveryFlow && notifiedUnverifiedId !== session.user.id) {
        notifiedUnverifiedId = session.user.id;
        emit('registration', { stage:'verify', email:session.user.email || '' });
      }
      return;
    }
    notifiedUnverifiedId = null;
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
    // Following a confirmation link creates a session, not a profile. If the
    // invite was accepted before the mail went out, finish the account now
    // and sign the traveller in; otherwise stay read-only and ask for it.
    if (!data && !recoveryFlow) {
      const finished = await completeSignup();
      if (seq !== resolveSeq) return;
      if (finished) {
        notifiedUnapprovedId = null;
        const profile = profileFromRow({ id:finished.user_id || session.user.id, display_name:finished.display_name, avatar_url:finished.avatar_url, discoverable:finished.discoverable });
        profiles.set(profile.id, profile);
        writeJSON(TRAVELLER_NAME_KEY, profile.name);
        setUser({ id:profile.id, name:profile.name, avatar:profile.avatar, email:typeof session.user.email === 'string' ? session.user.email : '' });
        emit('signup-complete', { name:profile.name });
        startSubscription();
        emit('profiles', profiles);
        await syncPull();
        flush();
        return;
      }
    }
    if (!data) {
      setUser(null);
      if (!recoveryFlow && session.user.email_confirmed_at && notifiedUnapprovedId !== session.user.id) {
        notifiedUnapprovedId = session.user.id;
        emit('verification-complete', { email:session.user.email || '' });
      }
      return;
    }
    notifiedUnapprovedId = null;
    const profile = profileFromRow(data);
    profiles.set(profile.id, profile);
    setUser({ id:profile.id, name:profile.name, avatar:profile.avatar, email:typeof session.user.email === 'string' ? session.user.email : '' });
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
    // Stay a read-only visitor; the pull clears every stamp from view.
    await syncPull();
    emit('cities', { reset:true });
  }
  // ---------- password reset ----------
  // The link in the mail must come back to this page, without the query string
  // that started it.
  function recoveryRedirect() {
    try { return atlasUrl(); } catch { return undefined; }
  }
  function recoveryLink() {
    try {
      const query = new URLSearchParams(location.search);
      const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
      return query.get('type') === 'recovery' || hash.get('type') === 'recovery';
    } catch { return false; }
  }
  async function requestPasswordReset(rawEmail) {
    if (state.mode !== 'cloud' || !client) return { ok:false, reason:'unavailable' };
    const address = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok:false, reason:'invalid_email' };
    const { error } = await client.auth.resetPasswordForEmail(address, { redirectTo:recoveryRedirect() });
    return error ? { ok:false, reason:'failed' } : { ok:true };
  }
  function passwordErrorReason(error) {
    const text = `${error?.message || error || ''} ${error?.code || ''}`;
    if (/same_password|different from the old password/i.test(text)) return 'same';
    if (/weak_password|password.*(short|least|weak)/i.test(text)) return 'short';
    if (/session_not_found|session.*missing|auth session missing|jwt expired|invalid jwt|refresh_token_not_found|bad_jwt|user_not_found/i.test(text)) return 'expired';
    if (/reauthentication/i.test(text)) return 'expired';
    if (/failed to fetch|networkerror|load failed/i.test(text)) return 'offline';
    return 'failed';
  }
  async function updatePassword(password) {
    if (state.mode !== 'cloud' || !client) return { ok:false, reason:'unavailable' };
    if (typeof password !== 'string' || password.length <= 6) return { ok:false, reason:'short' };
    // Without the session the link brought, there is nobody to update.
    const { data:current } = await client.auth.getSession();
    if (!current?.session?.user) return { ok:false, reason:'expired' };
    let error = null;
    try { ({ error } = await client.auth.updateUser({ password })); }
    catch (caught) { error = caught; }
    if (error) {
      console.warn('password could not be updated', error);
      return { ok:false, reason:passwordErrorReason(error) };
    }
    const { data } = await client.auth.getSession();
    // Do not let the confirmation/invite prompt replace an active reset view.
    await resolveSession(data?.session || null);
    recoveryFlow = false;
    return { ok:true, needsApproval:!state.user, email:data?.session?.user?.email || '' };
  }
  api.requestPasswordReset = requestPasswordReset;
  api.updatePassword = updatePassword;
  api.recoveryRequested = recoveryLink;
  api.linkError = () => linkError;

  // Read an error the Auth server put on the way back (expired, used, or
  // denied link). Both the hash (implicit links) and the query are checked.
  function readLinkError() {
    try {
      const query = new URLSearchParams(location.search);
      const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
      const code = hash.get('error_code') || query.get('error_code') || hash.get('error') || query.get('error');
      if (!code) return null;
      return { code, description:hash.get('error_description') || query.get('error_description') || '' };
    } catch { return null; }
  }
  // Links built from a custom mail template may carry `token_hash` instead of
  // tokens in the hash; verify those here so either template works.
  function readTokenHash() {
    try {
      const query = new URLSearchParams(location.search);
      const tokenHash = query.get('token_hash');
      const type = query.get('type');
      return tokenHash && type ? { token_hash:tokenHash, type } : null;
    } catch { return null; }
  }
  // Drop auth parameters from the address bar so a reload or a shared link
  // does not replay an expired token or error.
  function cleanAuthParams() {
    try {
      const url = new URL(location.href);
      const authKeys = ['token_hash', 'type', 'error', 'error_code', 'error_description', 'code', 'sb'];
      let changed = false;
      authKeys.forEach(key => { if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; } });
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
      if (['access_token', 'error', 'error_code', 'error_description', 'type'].some(key => hash.has(key))) { url.hash = ''; changed = true; }
      if (changed) history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch { /* leave the address as it is */ }
  }

  function enterDemo(id = 'demo-eva') {
    const user = DEMO_USERS.find(item => item.id === id);
    if (!user) return;
    const sameUser = state.user?.id === user.id;
    setDemoSession(user.id);
    profilesLoadDemo();
    setUser({ id:user.id, name:demoDisplayName(user.id), avatar:'', email:'' });
    // Switching between demo travellers needs a fresh pull; a first sign-in
    // already pulls from the auth change itself.
    if (sameUser || state.connection === 'online') syncPull();
  }
  function exitDemo() {
    setDemoSession(null);
    setUser(null);
    // A signed-out visitor sees no stamps; the view clears with the session.
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
    // Stamps and custom cities are private to signed-in travellers; the
    // database refuses them to anonymous readers too.
    if (!state.user) {
      rowsById.clear();
      citiesById.clear();
      emit('rows', { reset:true });
      emit('cities', { reset:true });
      emit('status', status());
      return { ok:true };
    }
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
        markFailed(op);
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
  // Ask again for everything that failed, e.g. from the retry next to a record.
  api.retry = async () => {
    const ops = readOutbox();
    let cleared = false;
    for (const op of ops) if (op.failed) { delete op.failed; cleared = true; }
    if (cleared) writeOutbox(ops);
    return flush();
  };

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
  // The whole per-traveller snapshot, identity included, so the page can refuse
  // a cache that belongs to somebody else.
  api.cachedSnapshot = () => {
    const raw = readJSON(CACHE_KEY, null);
    if (!raw || typeof raw.userId !== 'string' || !raw.visits || typeof raw.visits !== 'object' || Array.isArray(raw.visits)) return null;
    return raw;
  };
  api.cachedVisits = () => api.cachedSnapshot()?.visits || null;
  // A tagged traveller may take their own tag off somebody else's record; the
  // database function only ever removes auth.uid() from companions.
  api.leaveStamp = async stampId => {
    if (state.mode === 'local' || !state.user || typeof stampId !== 'string') return { ok:false, reason:'local' };
    if (state.mode === 'demo') {
      demoWriteGuarded(store => {
        (store.stamps || []).forEach(row => {
          if (row.id !== stampId) return;
          row.companions = (row.companions || []).filter(id => id !== state.user.id);
        });
      });
      const row = rowsById.get(stampId);
      if (row) rowsById.set(stampId, { ...row, companions:(row.companions || []).filter(id => id !== state.user.id) });
      emit('rows', { reset:true });
      return { ok:true };
    }
    if (!client) return { ok:false, reason:'offline' };
    const { data, error } = await client.rpc('atlas_leave_stamp', { p_stamp_id:stampId });
    if (error) return { ok:false, reason:'failed' };
    const result = Array.isArray(data) ? data[0] : data;
    await syncPull();
    return result && result.ok === true ? { ok:true } : { ok:false, reason:result?.reason || 'failed' };
  };

  window.TravelAtlasAccount = api;
})();
