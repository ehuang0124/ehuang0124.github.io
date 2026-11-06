// Local-mode regression: with no Supabase project configured the atlas stores
// records in this browser only, and still requires the local traveller
// passphrase (`config.localGate`) before anything can be stamped.

// The full Chromium suite (scripts/test-stamp-atlas.cjs) covers layout and
// rendering. This file covers the same data behaviour in jsdom, plus the
// guarantee that a signed-out visitor cannot stamp and that no network client
// is created.
//
// Run: NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-local-mode.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
  // Removing a stamp asks first; the test drives the answer.
  const confirmations = [];
  let confirmAnswer = true;
  window.confirm = message => { confirmations.push(message); return confirmAnswer; };
  const store = new Map([['eva.travel.stamp-atlas.v1', JSON.stringify({version:1,visits:{'us:yell':['2023-03'],'ca:banff':['2024-06']},customCities:[]})]]);
  Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>[...store.keys()][i]??null,get length(){return store.size}},configurable:true});
  // CONFIG_OVERRIDE: this test supplies its own config so it never depends on
  // the checked-in demoMode flag.
  const passphrase = 'local-test-passphrase';
  const passphraseHash = crypto.createHash('sha256').update(passphrase).digest('hex');
  const configSource = window => window.eval(`window.TravelAtlasConfig={supabaseUrl:"",supabaseAnonKey:"",demoMode:false,localGate:{name:"Eva Huang",passphraseHash:"${passphraseHash}"}};`);
  const inject = f => f === 'config.js' ? configSource(window) : window.eval(fs.readFileSync(path.join(mapDir,f),'utf8'));
  for (const f of ['vendor/supabase.js','config.js','account.js','world.js','places.js','okinawa-places.js','us-states.js','app.js']) inject(f);
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
  // Since the hover-label change, static labels live in #map-tooltip instead.
  assertCount('#map-svg text, #map-svg title', 0, 'no baked-in map labels');
  assert.equal($('#map-tooltip').hidden, true, 'the tooltip starts hidden');
  assert.equal($('#state-legend').hidden, true);
  assertCount('.map-country.selected.done', 0);
  assert.equal($('#board-total').textContent, '240');
  assert.equal($('#sign-in').hidden, false, 'the sign-in control sits in the top bar in every mode');
  assert.equal($('#stamp-button').classList.contains('locked'), true, 'a signed-out visitor cannot stamp');
  assert($('#stamp-button').textContent.includes('登入後蓋章'));
  assert($('#stamp-button svg'), 'a stamp-shaped icon remains visible');
  assertCount('.place-item .flag', 237, 'countries with an ISO code carry a flag (three disputed entries have no ISO code)');
  assertCount('.place-item[data-place="somaliland"] .flag', 0, 'no flag where there is no ISO code');
  assert.equal($('#place-flag img').getAttribute('src'), './flags/jp.svg', 'the selected country shows its flag');
  assert.equal($('#passport-count').textContent, '2', 'legacy us:/ca: stamp keys still load');

  // A visitor may read the atlas but a stamp click only opens the sign-in dialog.
  $('.map-country[data-id="158"]').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  assert.equal($('#place-name').textContent, '台灣');
  click($('#stamp-button')); await wait();
  assert.equal($('#account-dialog').open, true, 'stamping without sign-in asks for the passphrase');
  assert.equal($('#local-signin').hidden, false, 'the local passphrase field is offered');
  assert($('#account-error').textContent.includes('登入後才能蓋章'));
  assert.equal($('#passport-count').textContent, '2', 'nothing was written');
  assert.equal(JSON.parse(window.localStorage.getItem('eva.travel.stamp-atlas.v1')).visits['countries:158'], undefined);

  // Wrong passphrase is rejected.
  $('#passphrase').value = 'nope';
  click($('#local-signin-submit')); await wait();
  assert($('#account-error').textContent.includes('不正確'));
  assert.equal($('#account-dialog').open, true);
  // Right passphrase signs the traveller in.
  $('#passphrase').value = passphrase;
  click($('#local-signin-submit')); await wait();
  assert.equal($('#account-dialog').open, false, 'the dialog closes after signing in');
  assert.equal($('#account-card').hidden, false);
  assert.equal($('#account-name').textContent, 'Eva Huang');
  assert.equal($('#stamp-button').classList.contains('locked'), false, 'signed-in travellers may stamp');
  assert($('#data-source').textContent.includes('此瀏覽器'), 'the footer names where the data lives');

  // stamping, duplicates, delete, persistence
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
  // A removal must be confirmed: cancelling leaves the record untouched.
  confirmAnswer = false;
  click($('#history-list button[data-date="2023-03"]')); await wait();
  assertCount('#history-list li', 2, 'cancelling the confirmation keeps both months');
  confirmAnswer = true;
  click($('#history-list button[data-date="2023-03"]')); await wait();
  assertCount('#history-list li', 1, 'confirming removes one month');
  assert(confirmations.at(-1).includes('2023.03'), 'the confirmation names the month being removed');
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
  // A search term is an index over every category, and a result that belongs to
  // another layer is still reachable from the tab you are on.
  $('#place-search').value = '優勝美地'; input($('#place-search')); await wait();
  const crossResults = $$('#place-list button[data-place]');
  assert.equal(crossResults.length, 1, 'the term reaches a place on another layer');
  assert(crossResults[0].textContent.includes('優勝美地'));
  click(crossResults[0]); await wait();
  assert.equal(d.body.dataset.atlasTheme, 'na', 'selecting it follows the place into its own tab');
  assert($('#place-name').textContent.includes('優勝美地'));
  assert.equal($('#place-search').value, '優勝美地', 'the typed term survives the jump');
  // Nothing found: the empty state offers to add the typed name as a city, and
  // the form opens with the name already filled in.
  $('#place-search').value = 'zzzz'; input($('#place-search')); await wait();
  assert.equal($$('#place-list button[data-place]').length, 0);
  const addOwn = $('#place-list button[data-add-city]');
  assert(addOwn, 'a missing destination can be added from the empty state');
  assert(addOwn.textContent.includes('zzzz'));
  click(addOwn); await wait();
  assert.equal($('#city-dialog').open, true);
  assert.equal($('#city-name').value, 'zzzz', 'the typed name is carried into the form');
  click($('#city-cancel')); await wait();
  click($('#tab-cities')); await wait();
  assert.equal(d.body.dataset.atlasTheme, 'cities');
  assert.equal($('#place-search').value, '', 'changing tab clears the index term');
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
  // Signing out locks the atlas again.
  click($('#account-menu-button')); await wait();
  click($('#sign-out')); await wait();
  assert.equal($('#stamp-button').classList.contains('locked'), true);
  assert.equal($('#account-card').hidden, true);
  assert.deepEqual(errors, []);
  console.log('PASS local mode: browser-only records, passphrase gate, flags, no network client');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
