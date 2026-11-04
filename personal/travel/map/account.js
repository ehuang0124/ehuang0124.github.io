// Stamp Atlas accounts, cloud sync, companions, and live updates.
//
// Transport only: this module owns sign-in, the cloud rows, and realtime events.
// app.js owns the map and the local record model. When no Supabase project is
// configured the module stays inert and the atlas behaves as a purely local page.
(() => {
  'use strict';

  const config = window.TravelAtlasConfig || {};
  const CACHE_KEY = 'eva.travel.stamp-atlas.v1';
  const OUTBOX_KEY = 'eva.travel.atlas.outbox.v1';
  const DEMO_KEY = 'eva.travel.atlas.demo.v1';
  const DEMO_SESSION_KEY = 'eva.travel.atlas.demo.session';
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
  function pickAvatar(meta) { return typeof meta?.avatar_url === 'string' ? meta.avatar_url : (typeof meta?.picture === 'string' ? meta.picture : ''); }
  function displayName(meta, email) {
    const name = meta?.full_name || meta?.name || meta?.user_name;
    if (typeof name === 'string' && name.trim()) return name.trim();
    return typeof email === 'string' && email.includes('@') ? email.split('@')[0] : '旅人';
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
  function canEdit() { return state.mode === 'local' || Boolean(state.user); }

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
          const user = session?.user || null;
          if (!user) { setUser(null); return; }
          const profile = {
            id:user.id,
            name:displayName(user.user_metadata, user.email),
            avatar:pickAvatar(user.user_metadata),
            email:user.email || ''
          };
          const changed = state.user?.id !== profile.id;
          setUser(profile);
          profiles.set(profile.id, { ...profile, discoverable:true });
          saveProfile(profile);
          startSubscription();
          if (changed) {
            // Load this traveller's rows before announcing them, so the page
            // never renders an empty collection for a signed-in account.
            syncPull().then(() => { emit('auth', profile); refreshConnection(); return flush(); }).catch(() => { emit('auth', profile); });
          } else emit('auth', profile);
          flush();
        });
        const { data } = await client.auth.getSession();
        if (!data?.session) { setConnection('online'); emit('ready', status()); await syncPull(); }
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
  async function saveProfile(profile) {
    if (!client || !profile) return;
    const payload = {
      id:profile.id,
      display_name:profile.name,
      avatar_url:profile.avatar || '',
      updated_at:new Date().toISOString()
    };
    try { await client.from('profiles').upsert(payload, { onConflict:'id' }); }
    catch (error) { console.warn('profile save failed', error); }
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
  async function signIn() {
    if (state.mode === 'demo') { enterDemo('demo-eva'); return; }
    if (!client) return;
    setConnection('connecting');
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await client.auth.signInWithOAuth({ provider:'google', options:{ redirectTo, queryParams:{ prompt:'select_account' } } });
    if (error) { setConnection('error'); emit('error', error.message); }
  }
  async function signOut() {
    if (state.mode === 'demo') { exitDemo(); return; }
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
