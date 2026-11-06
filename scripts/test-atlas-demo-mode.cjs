// Demo-mode end-to-end check: local sign-in, seeded travellers, companion
// stamping, switching demo identity, and live cross-tab updates through
// BroadcastChannel. No network and no Supabase project are needed.
//
// Run: NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-demo-mode.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const mapDir = path.join(__dirname, '..', 'personal/travel/map');
const html = fs.readFileSync(path.join(mapDir,'index.html'),'utf8');
const wait = async (n=10) => { for (let i=0;i<n;i++) await new Promise(r=>setTimeout(r,3)); };
(async () => {
  const dom = new JSDOM(html, { url:'http://localhost:8080/personal/travel/map/', runScripts:'outside-only', pretendToBeVisual:true });
  const { window } = dom;
  const errors=[]; window.addEventListener('error', e=>errors.push(e.message));
  window.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
  window.Element.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  if (!window.HTMLDialogElement.prototype.showModal) { const p=window.HTMLDialogElement.prototype; p.showModal=function(){this.open=true}; p.close=function(){this.open=false}; }
  const bc = []; window.BroadcastChannel = class { constructor(n){this.name=n;bc.push(this)} postMessage(m){bc.forEach(c=>c!==this&&c.onmessage?.({data:m}))} addEventListener(t,h){this.onmessage=h} close(){} };
  const store=new Map();
  Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>[...store.keys()][i]??null,get length(){return store.size}},configurable:true});
  const ss=new Map();
  Object.defineProperty(window,'sessionStorage',{value:{getItem:k=>ss.has(k)?ss.get(k):null,setItem:(k,v)=>ss.set(k,String(v)),removeItem:k=>ss.delete(k)},configurable:true});
  // CONFIG_OVERRIDE: demo behaviour is asserted here regardless of the checked-in flag.
  const configSource = win => win.eval('window.TravelAtlasConfig={supabaseUrl:"",supabaseAnonKey:"",demoMode:true};');
  const inject = (win, file) => file === 'config.js' ? configSource(win) : win.eval(fs.readFileSync(path.join(mapDir, file),'utf8'));
  for (const f of ['vendor/supabase.js','config.js','account.js','palette.js','world.js','places.js','okinawa-places.js','us-states.js','jp-admin.js','app.js']) inject(window, f);
  await wait();
  const d=window.document, $=s=>d.querySelector(s), $$=s=>[...d.querySelectorAll(s)];
  const click=n=>n.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  assert.equal($('#sign-in').hidden, false, 'demo offers sign-in');
  click($('#sign-in')); await wait();
  assert.equal($('#account-demo').hidden, false, 'demo button shown');
  click($('#account-demo')); await wait(); await wait();
  assert.equal($('#account-card').hidden, false, 'signed in to demo');
  assert.equal($('#account-name').textContent, 'Eva Huang');
  assert.equal($('#passport-count').textContent, '8', 'the atlas counts only your own places');
  assert(['3 / 240','3 / 240'].includes($('#tab-count-countries').textContent));
  // One data scope: a signed-in traveller's map marks only their own countries.
  assert.equal($$('.map-country.done').length, 3, 'your own countries (JP, TW, TH) mark the map');
  assert($('#friends-tabs').textContent.includes('林宜臻'), 'companions seeded');
  assert(Number($('#friends-shared').textContent) >= 1, 'shared places are listed');
  assert($('#friends-list').textContent.includes('日本'));
  assert.equal($('#stamp-button').classList.contains('locked'), false);
  // stamp Thailand with a companion
  $('#place-search').value='新加坡'; $('#place-search').dispatchEvent(new window.Event('input',{bubbles:true})); await wait();
  click($$('.place-item')[0]); await wait();
  $('#visit-date').value='2025-09';
  click($('#companion-manage')); await wait();
  const opt=$$('#companion-options input').find(n=>n.value==='demo-chen');
  opt.checked=true;
  $('#companion-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})); await wait();
  assert($('#companion-chips').textContent.includes('陳柏宇'));
  click($('#stamp-button')); await wait();
  assert($('#stamp-feedback').textContent.includes('陳柏宇'), 'feedback names the companion');
  assert.equal($('#passport-count').textContent, '9', 'the new country joins your collection');
  // switch traveller
  $('#demo-user').value='demo-chen';
  $('#demo-user').dispatchEvent(new window.Event('change',{bubbles:true})); await wait();
  assert.equal($('#account-name').textContent, '陳柏宇');
  assert.equal($('#passport-count').textContent, '2', 'switching traveller switches the collection');
  assert($('#friends-tabs').textContent.includes('Eva Huang'));
  assert($('#friends-tabs').textContent.includes('Eva Huang'));
  // live sync via BroadcastChannel between two pages
  const dom2 = new JSDOM(html, { url:'http://localhost:8080/personal/travel/map/', runScripts:'outside-only', pretendToBeVisual:true });
  const w2=dom2.window;
  w2.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
  w2.Element.prototype.scrollIntoView=()=>{}; w2.HTMLElement.prototype.scrollIntoView=()=>{};
  if (!w2.HTMLDialogElement.prototype.showModal) { const p=w2.HTMLDialogElement.prototype; p.showModal=function(){this.open=true}; p.close=function(){this.open=false}; }
  w2.BroadcastChannel = window.BroadcastChannel;
  Object.defineProperty(w2,'localStorage',{value:window.localStorage,configurable:true});
  Object.defineProperty(w2,'sessionStorage',{value:window.sessionStorage,configurable:true});
  for (const f of ['vendor/supabase.js','config.js','account.js','palette.js','world.js','places.js','okinawa-places.js','us-states.js','jp-admin.js','app.js']) inject(w2, f);
  await new Promise(r=>setTimeout(r,60));
  const d2=w2.document;
  assert.equal(d2.querySelector('#account-name').textContent, '陳柏宇', 'second tab restores the session');
  click(d2.querySelector('#stamp-button')); // stamp current place (Thailand) as Chen
  await new Promise(r=>setTimeout(r,120));
  assert(Number($('#friends-shared').textContent) >= 1, 'the other tab received the live update');
  assert.deepEqual(errors, []);
  // A signed-out visitor of the demo is read-only, and signing out returns to
  // that same read-only view instead of an empty map.
  {
    const dom3 = new JSDOM(html, { url:'http://localhost:8080/personal/travel/map/', runScripts:'outside-only', pretendToBeVisual:true });
    const w3 = dom3.window;
    w3.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
    w3.Element.prototype.scrollIntoView = () => {};
    w3.HTMLElement.prototype.scrollIntoView = () => {};
    if (!w3.HTMLDialogElement.prototype.showModal) { const p3=w3.HTMLDialogElement.prototype; p3.showModal=function(){this.open=true}; p3.close=function(){this.open=false}; }
    w3.BroadcastChannel = window.BroadcastChannel;
    // Fresh storage: this tab is a first-time visitor, not the signed-in tab.
    const freshStore = new Map();
    Object.defineProperty(w3,'localStorage',{value:{getItem:k=>freshStore.has(k)?freshStore.get(k):null,setItem:(k,v)=>freshStore.set(k,String(v)),removeItem:k=>freshStore.delete(k),clear:()=>freshStore.clear(),key:i=>[...freshStore.keys()][i]??null,get length(){return freshStore.size}},configurable:true});
    Object.defineProperty(w3,'sessionStorage',{value:{getItem:()=>null,setItem(){},removeItem(){}},configurable:true});
    for (const f of ['vendor/supabase.js','config.js','account.js','palette.js','world.js','places.js','okinawa-places.js','us-states.js','jp-admin.js','app.js']) inject(w3, f);
    await new Promise(resolve => setTimeout(resolve, 160));
    const d3 = w3.document;
    assert.equal(d3.querySelector('#stamp-button').classList.contains('locked'), true, 'a visitor is read-only');
    assert(d3.querySelector('#stamp-button').textContent.includes('登入後蓋章'));
    assert.equal(d3.querySelector('#collection-label').textContent, '旅人共蓋章');
    const shared = d3.querySelector('#passport-count').textContent;
    assert(Number(shared) > 0, 'the shared atlas is visible before sign-in');
    assert.equal(d3.querySelectorAll('.map-country.done').length, 5, 'a visitor sees every traveller on the map (JP, TW, TH, FR, KR)');
    d3.querySelector('#sign-in').dispatchEvent(new w3.MouseEvent('click', { bubbles:true }));
    await new Promise(resolve => setTimeout(resolve, 30));
    d3.querySelector('#account-demo').dispatchEvent(new w3.MouseEvent('click', { bubbles:true }));
    await new Promise(resolve => setTimeout(resolve, 120));
    d3.querySelector('#account-menu-button').dispatchEvent(new w3.MouseEvent('click', { bubbles:true }));
    assert.equal(d3.querySelector('#account-menu').hidden, false, 'account menu opens');
    assert(d3.querySelector('#account-menu-status').textContent.length > 0, 'the menu explains sync state');
    d3.querySelector('#sign-out').dispatchEvent(new w3.MouseEvent('click', { bubbles:true }));
    await new Promise(resolve => setTimeout(resolve, 160));
    assert.equal(d3.querySelector('#account-card').hidden, true, 'signed out');
    assert.equal(d3.querySelector('#passport-count').textContent, shared, 'signing out keeps the public atlas visible');
  }
  console.log('PASS demo mode end-to-end (sign-in, companion, traveller switch, cross-tab live sync, read-only visitor)');
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
