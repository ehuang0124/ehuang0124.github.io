// Stamp Atlas profile page: the full account settings that the header menu
// only links to. Transport, sessions and writes all go through account.js;
// this file only renders and wires the controls.
(() => {
  'use strict';

  const account = window.TravelAtlasAccount || null;
  const STORAGE_KEY = 'eva.travel.stamp-atlas.v1';
  const $ = selector => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  // A demonstration stays a demonstration on every page it visits.
  const demoQuery = params.has('demo') ? '?demo=1' : '';
  document.querySelectorAll('.profile-map-link').forEach(link => { link.href = `../${demoQuery}`; });
  $('#profile-signin-link').href = demoQuery ? '../?demo=1&signin=1' : '../?signin=1';

  let nameDirty = false;
  let ready = false;

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function monthLabel(month) {
    const [year, number] = String(month || '').split('-');
    return year && number ? `${year} 年 ${Number(number)} 月` : '';
  }
  // Same scope as the map: a signed-in traveller counts their own records.
  function footprint() {
    const user = account?.user;
    if (!user) return { places:0, visits:0, companions:0, latest:'' };
    if (account.mode === 'local') {
      const visits = readJSON(STORAGE_KEY, {})?.visits || {};
      const months = Object.values(visits).filter(list => Array.isArray(list) && list.length);
      const all = months.flat().filter(month => typeof month === 'string').map(month => month.slice(0, 7)).sort();
      return { places:months.length, visits:all.length, companions:0, latest:all.at(-1) || '' };
    }
    const mine = account.myRows();
    const companions = new Set(mine.flatMap(row => row.companions || []).filter(id => id !== user.id));
    const months = mine.map(row => row.month).sort();
    return {
      places:new Set(mine.map(row => row.placeKey)).size,
      visits:new Set(mine.map(row => `${row.placeKey}|${row.month}`)).size,
      companions:companions.size,
      latest:months.at(-1) || ''
    };
  }
  function statusText() {
    const status = account?.status?.() || {};
    if (account?.mode === 'demo') return '示範模式';
    if (account?.mode === 'local') return '已登入（本機通行碼）';
    if (status.connection === 'offline') return '離線';
    if (status.connection === 'error') return '連線異常，將自動重試';
    if (status.pending) return `同步中（${status.pending} 筆待上傳）`;
    const parts = ['已同步'];
    if (status.lastSyncAt) {
      const at = new Date(status.lastSyncAt);
      parts.push(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')} 更新`);
    }
    return parts.join(' · ');
  }

  function render() {
    const user = account?.user || null;
    $('#profile-loading').hidden = ready;
    $('#profile-signed-out').hidden = !ready || Boolean(user);
    $('#profile-content').hidden = !user;
    if (!user) return;
    const cloud = account.mode === 'cloud';
    const demo = account.mode === 'demo';
    $('#account-profile-name').textContent = user.name;
    const emailNote = demo ? '示範帳號（沒有電子郵件）' : account.mode === 'local' ? '本機通行碼登入（沒有電子郵件）' : '—';
    $('#account-profile-email').textContent = user.email || emailNote;
    const image = $('#profile-avatar-img');
    if (user.avatar) {
      image.src = user.avatar;
      image.referrerPolicy = 'no-referrer';
      image.hidden = false;
      image.onerror = () => { image.hidden = true; };
    } else image.hidden = true;
    $('#profile-avatar-initial').textContent = user.avatar ? '' : ([...user.name][0] || '旅');
    $('#profile-sync-status').textContent = statusText();
    $('#sync-now').hidden = !cloud;
    const nameInput = $('#profile-name-input');
    if (document.activeElement !== nameInput && !nameDirty) nameInput.value = user.name;

    const stats = footprint();
    $('#stat-places').textContent = String(stats.places);
    $('#stat-visits').textContent = String(stats.visits);
    $('#stat-companions').textContent = String(stats.companions);
    $('#stat-companions-row').hidden = account.mode === 'local';
    $('#stat-latest').textContent = stats.latest ? `最近一次蓋章：${monthLabel(stats.latest)}` : '';

    $('#profile-password-card').hidden = !(cloud && user.email);
    $('#profile-companion-card').hidden = !(cloud || demo);
    const profile = account.profile(user.id);
    $('#discoverable-toggle').checked = profile ? profile.discoverable !== false : true;

    const demoCard = $('#demo-switch');
    demoCard.hidden = !demo;
    if (demo) {
      const select = $('#demo-user');
      const users = account.demoUsers();
      if (select.options.length !== users.length) {
        select.replaceChildren(...users.map(item => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = account.profile(item.id)?.name || item.name;
          return option;
        }));
      }
      select.value = user.id;
    }
  }

  if (!account) {
    ready = true;
    render();
    return;
  }
  ['auth', 'profiles', 'rows', 'status'].forEach(event => account.on(event, render));

  $('#profile-name-input').addEventListener('input', () => {
    nameDirty = true;
    $('#profile-feedback').textContent = '';
  });
  $('#profile-name-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!account.user) return;
    const button = $('#profile-save');
    const feedback = $('#profile-feedback');
    feedback.classList.remove('error');
    button.disabled = true;
    feedback.textContent = '儲存中…';
    let result;
    try { result = await account.updateDisplayName($('#profile-name-input').value); }
    catch { result = { ok:false, reason:'名稱暫時無法儲存，請稍後再試。' }; }
    finally { button.disabled = false; }
    if (!result?.ok) {
      feedback.classList.add('error');
      feedback.textContent = result?.reason || '名稱暫時無法儲存，請稍後再試。';
      return;
    }
    nameDirty = false;
    $('#profile-name-input').value = result.name;
    render();
    feedback.textContent = result.unchanged ? '顯示名稱沒有變更。' : `顯示名稱已更新為「${result.name}」。`;
  });

  $('#profile-reset-password').addEventListener('click', async () => {
    const button = $('#profile-reset-password');
    const feedback = $('#profile-password-feedback');
    const email = account.user?.email || '';
    feedback.classList.remove('error');
    if (!email) { feedback.textContent = '這個登入方式沒有電子郵件，無法寄送重設信。'; return; }
    button.disabled = true;
    feedback.textContent = '正在寄送重設信…';
    let result;
    try { result = await account.requestPasswordReset(email); }
    catch { result = { ok:false }; }
    finally { button.disabled = false; }
    if (!result?.ok) feedback.classList.add('error');
    feedback.textContent = result?.ok
      ? `重設密碼的信已寄到 ${email}；請到信箱打開連結，設定新密碼。`
      : '目前無法寄出重設密碼的信，請稍後再試。';
  });

  $('#discoverable-toggle').addEventListener('change', async event => {
    const feedback = $('#discoverable-feedback');
    const wanted = event.target.checked;
    const ok = await account.setDiscoverable(wanted);
    if (!ok) event.target.checked = !wanted;
    feedback.classList.toggle('error', !ok);
    feedback.textContent = !ok ? '暫時無法儲存，請稍後再試。'
      : wanted ? '其他旅人可以標記你。' : '其他旅人不能標記你。';
  });

  $('#sync-now').addEventListener('click', async () => {
    const button = $('#sync-now');
    button.disabled = true;
    $('#profile-sync-status').textContent = '同步中…';
    try { await account.refresh(); await account.flush(); }
    finally { button.disabled = false; render(); }
  });

  $('#demo-user').addEventListener('change', event => account.setDemoUser(event.target.value));

  $('#sign-out').addEventListener('click', async () => {
    $('#sign-out').disabled = true;
    try { await account.signOut(); }
    finally { location.href = `../${demoQuery}`; }
  });

  render();
  account.init().then(() => { ready = true; render(); }, () => { ready = true; render(); });
})();
