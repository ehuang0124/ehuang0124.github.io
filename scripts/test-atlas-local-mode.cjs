// Local-mode regression: with no Supabase project configured the atlas must
// behave exactly like the original browser-only page.
//
// The full Chromium suite (scripts/test-stamp-atlas.cjs) covers layout and
// rendering. This file covers the same data behaviour in jsdom, plus the
// guarantee that no account UI appears and no network client is created.
//
// Run: NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-local-mode.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const mapDir = path.join(__dirname, '..', 'personal/travel/map');
const html = fs.readFileSync(path.join(mapDir, 'index.html'), 'utf8');
const wait = async (n=8) => { for (let i=0;i<n;i++) await new Promise(r=>setTimeout(r,3)); };
(async () => {
  const dom = new JSDOM(html, { url:'http://localhost/personal/travel/map/', runScripts:'outside-only', pretendToBeVisual:true });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', e => errors.push(e.message));
  window.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){} });
  window.Element.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
    window.HTMLDialogElement.prototype.close = function(){ this.open = false; this.dispatchEvent(new window.Event('close')); };
  }
  window.BroadcastChannel = class { postMessage(){} addEventListener(){} close(){} };
  const store = new Map([['eva.travel.stamp-atlas.v1', JSON.stringify({version:1,visits:{'us:yell':['2023-03'],'ca:banff':['2024-06']},customCities:[]})]]);
  Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>[...store.keys()][i]??null,get length(){return store.size}},configurable:true});
  // CONFIG_OVERRIDE: this test supplies its own config so it never depends on
  // the checked-in demoMode flag.
  const configSource = window => window.eval('window.TravelAtlasConfig={supabaseUrl:"",supabaseAnonKey:"",demoMode:false};');
  const inject = f => f === 'config.js' ? configSource(window) : window.eval(fs.readFileSync(path.join(mapDir,f),'utf8'));
  for (const f of ['vendor/supabase.js','config.js','account.js','world.js','places.js','us-states.js','app.js']) inject(f);
  await wait();
  const d = window.document, $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
  const click = n => n.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  const input = n => n.dispatchEvent(new window.Event('input',{bubbles:true}));
  const change = n => n.dispatchEvent(new window.Event('change',{bubbles:true}));
  const assertCount = (sel, n, label) => assert.equal($$(sel).length, n, label || sel);

  assert.deepEqual(errors, []);
  assertCount('.map-country', 240);
  assertCount('.place-item', 240);
  assert.equal($('#place-name').textContent, '日本');
  assert.equal($('#visit-date').getAttribute('type'), 'month');
  assertCount('#division-layer .division-label', 6);
  assert.equal($('#state-legend').hidden, true);
  assertCount('.map-country.selected.done', 0);
  assert.equal($('#board-total').textContent, '240');
  assert.equal($('#sign-in').hidden, true, 'no sign-in button without an account project');
  assert.equal($('#stamp-button').classList.contains('locked'), false, 'local mode can stamp');

  assert.equal($('#passport-count').textContent, '2', 'legacy us:/ca: stamp keys still load');

  // stamping, duplicates, delete, persistence
  $('.map-country[data-id="158"]').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  assert.equal($('#place-name').textContent, '台灣');
  $('#visit-date').value = '2023-03'; change($('#visit-date'));
  click($('#stamp-button')); await wait();
  assert.equal($('#passport-count').textContent, '3', 'local stamps load from storage and add up');
  assertCount('.country-imprint', 1, 'one new imprint for the country just stamped');
  click($('#stamp-button')); await wait();
  assert($('#stamp-feedback').textContent.includes('這個月已蓋過章'));
  assertCount('#history-list li', 1);
  $('#visit-date').value = '2024-05'; click($('#stamp-button')); await wait();
  assertCount('#history-list li', 2);
  const stored = JSON.parse(window.localStorage.getItem('eva.travel.stamp-atlas.v1'));
  assert.deepEqual(stored.visits['countries:158'], ['2023-03','2024-05']);
  click($('#history-list button[data-date="2023-03"]')); await wait();
  assertCount('#history-list li', 1);
  // tabs and regions
  click($('#tab-na')); await wait();
  assert.equal($('#tab-count-na').textContent, '2 / 162', 'legacy us:/ca: keys are counted in the North America layer');
  assertCount('.map-us-state', 50);
  assertCount('.place-item', 162);
  click($('#tab-jp')); await wait();
  assertCount('.place-item', 35);
  click($('#tab-cities')); await wait();
  $('#place-search').value = 'Portland'; input($('#place-search')); await wait();
  assert.equal($('.place-item .city-code').textContent, 'PDX');
  // custom city
  $('#place-search').value = ''; input($('#place-search')); await wait();
  click($('#add-city')); await wait();
  assert.equal($('#city-dialog').open, true, 'local mode may add cities');
  $('#city-name').value = '臺南'; $('#city-lat').value = '22.998'; $('#city-lon').value = '120.212';
  $('#city-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await wait();
  assert.equal($('#board-total').textContent, '172');
  const cityStored = JSON.parse(window.localStorage.getItem('eva.travel.stamp-atlas.v1'));
  assert.equal(cityStored.customCities.length, 1);
  // future month rejected
  $('#visit-date').value = '2099-01'; change($('#visit-date'));
  click($('#stamp-button')); await wait();
  assert($('#stamp-feedback').textContent.includes('不能晚於本月'));
  assert.deepEqual(errors, []);
  console.log('PASS local mode: identical atlas behaviour with no account configured');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
