// Mail links (sign-up confirmation, password reset) come back to the atlas
// with a live login in the address: `#access_token=…&refresh_token=…`, or a
// `?token_hash=…` to redeem. Anyone who opens that exact address is signed in
// as its owner, so it must never stay in the address bar long enough to be
// copied, shared, bookmarked or added to the home screen.
//
// This file loads first, without `defer`, and moves those values out of the
// address into `window.TravelAtlasAuthLink` before any other script, style or
// network request runs. account.js takes them from there exactly once.
(() => {
  'use strict';
  const QUERY_KEYS = ['token_hash', 'type', 'error', 'error_code', 'error_description', 'code', 'sb'];
  const HASH_MARKERS = ['access_token', 'refresh_token', 'error', 'error_code', 'error_description'];
  let link = null;
  try {
    const url = new URL(location.href);
    const query = {};
    QUERY_KEYS.forEach(key => {
      if (!url.searchParams.has(key)) return;
      query[key] = url.searchParams.get(key);
      url.searchParams.delete(key);
    });
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const hash = {};
    if (HASH_MARKERS.some(key => hashParams.has(key))) {
      hashParams.forEach((value, key) => { hash[key] = value; });
      url.hash = '';
    }
    if (Object.keys(query).length || Object.keys(hash).length) {
      link = { query, hash };
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
  } catch { /* leave the address as it is; account.js strips it again */ }
  Object.defineProperty(window, 'TravelAtlasAuthLink', { value:link, writable:true, configurable:true });
})();
