(() => {
  'use strict';

  const world = window.TravelAtlasWorld;
  const source = window.TravelAtlasPlaces;
  const stateSource = window.TravelAtlasStates;
  if (!world || !source || !stateSource) return;

  const $ = selector => document.querySelector(selector);
  const svgNS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'eva.travel.stamp-atlas.v1';
  // Accounts are optional. Without a configured project (or in the local demo)
  // `atlasAccount.mode` stays 'local' and every code path below behaves exactly
  // like the original browser-only atlas.
  const account = window.TravelAtlasAccount || null;
  const atlasAccount = {
    mode:'local', signedIn:false, user:null, connection:'local', pending:0,
    realtime:false, rows:[], cities:[], profiles:new Map(), ready:false, demo:false
  };
  const ADOPTED_KEY = userId => `eva.travel.atlas.adopted.${userId}`;
  let friendSelection = null;
  let companionDraft = new Map();
  const CATEGORY_ORDER = ['countries', 'cities', 'na', 'jp'];
  const REGION_NAMES = { AS:'亞洲', EU:'歐洲', AF:'非洲', NA:'北美洲', SA:'南美洲', OC:'大洋洲', AN:'南極周邊' };
  const CONTINENTS = [{ id:'all', label:'全部' }, ...Object.entries(REGION_NAMES).map(([id, label]) => ({ id, label }))];
  const CATEGORIES = {
    countries: { title:'世界國家', map:'01 / THE WHOLE WORLD', description:'點選國家，或搜尋名稱。', note:'國界為地理示意；小型島嶼可從清單選取。', regions:CONTINENTS, initial:'392' },
    cities: { title:'世界主要城市', map:'02 / CITIES OF THE WORLD', description:'選城市，或新增清單沒有的城市。', note:'城市以代表點標示；自訂城市可填座標。', regions:CONTINENTS, initial:'tokyo-jp' },
    na: { title:'北美區', map:'03 / NORTH AMERICA', description:'搜尋美國各州、國家公園與加拿大國家公園。', note:'州界依美國人口普查局示意；公園標記為代表位置。', regions:[
      {id:'all',label:'全部北美'}, {id:'us',label:'美國'}, {id:'ca',label:'加拿大'},
      {id:'na-us-west',label:'美國・西岸'}, {id:'na-us-mountain',label:'美國・山地沙漠'}, {id:'na-us-midwest',label:'美國・中西部'}, {id:'na-us-east',label:'美國・東岸南方'}, {id:'na-us-alaska',label:'阿拉斯加'}, {id:'na-us-hawaii',label:'夏威夷'}, {id:'na-us-territories',label:'美國屬地'},
      {id:'na-ca-pacific',label:'加拿大・太平洋沿岸'}, {id:'na-ca-rockies',label:'加拿大・洛磯草原'}, {id:'na-ca-central',label:'加拿大・安大略魁北克'}, {id:'na-ca-atlantic',label:'加拿大・大西洋沿岸'}, {id:'na-ca-north',label:'加拿大・北方領地'}
    ], initial:'yell' },
    jp: { title:'日本國家公園', map:'04 / JAPAN', description:'選擇地理分區，篩選國家公園。', note:'標示旅行分區，非行政界線；離島可由分區定位。', regions:[{id:'all',label:'全部'},{id:'hokkaido',label:'北海道'},{id:'tohoku',label:'東北'},{id:'kanto',label:'關東・甲信越'},{id:'chubu',label:'中部山岳'},{id:'west',label:'近畿・中國・四國'},{id:'kyushu',label:'九州'},{id:'islands',label:'南方離島'}], initial:'fuji' }
  };
  const WORLD_AREA = { AS:[24,-15,179,78], EU:[-25,29,50,75], AF:[-25,-37,54,38], NA:[-170,0,-50,83], SA:[-85,-56,-30,14], OC:[94,-52,180,16], AN:[68,-58,82,-49] };
  const collator = new Intl.Collator('zh-Hant', { numeric:true });
  const countryByIso = new Map();
  world.countries.forEach(country => {
    if (country.iso && country.id !== 'ashmore-cartier' && !countryByIso.has(country.iso)) countryByIso.set(country.iso, country);
  });

  // Natural Earth 1 raw projection, scaled/translated exactly as the prebuilt world shapes.
  // The projection formula is from d3-geo (ISC). See README.md for its license and source.
  function project(lon, lat) {
    const lambda = Number(lon) * Math.PI / 180;
    const phi = Number(lat) * Math.PI / 180;
    const phi2 = phi * phi;
    const phi4 = phi2 * phi2;
    const x = lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4)));
    const y = phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
    return [world.translate[0] + world.scale * x, world.translate[1] - world.scale * y];
  }
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const todayDate = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  function validDate(month) {
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > today) return false;
    return true;
  }
  function normalizedMonth(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4}-(?:0[1-9]|1[0-2]))(?:-(\d{2}))?$/);
    if (!match || !validDate(match[1])) return null;
    if (match[2]) {
      const day = `${match[1]}-${match[2]}`;
      const parsed = new Date(`${day}T12:00:00Z`);
      if (day > todayDate || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
    }
    return match[1];
  }
  function printedDate(month) { return month ? month.replace('-', '.') : '────.──'; }
  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }
  function makeSvg(tag, attributes) {
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  }
  function slug(text) { return text.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  const catalogue = {
    countries: world.countries.map(c => ({ ...c, category:'countries', key:`countries:${c.id}`, lat:null, lon:null })),
    cities: source.cities.map(city => {
      const country = countryByIso.get(city.iso);
      const [x, y] = project(city.lon, city.lat);
      const id = `${slug(city.en)}-${city.iso.toLowerCase()}`;
      return { ...city, id, category:'cities', key:`cities:${id}`, region:country.region, country:country.zh, x, y };
    }),
    na: [
      ...source.us.map(([id,en,zh,region,where,lat,lon]) => ({ id,en,zh,region:`na-us-${region}`,where,lat,lon,nation:'US',category:'na',key:`us:${id}`,...point(lat,lon) })),
      ...stateSource.map(state => ({ ...state, region:`na-us-${state.region}`, nation:'US', category:'na', key:`us:${state.id}`, where:state.abbr, isState:true })),
      ...source.ca.map(([id,en,zh,region,where,lat,lon]) => ({ id,en,zh,region:`na-ca-${region}`,where,lat,lon,nation:'CA',category:'na',key:`ca:${id}`,...point(lat,lon) }))
    ],
    jp: source.jp.map(([id,en,zh,region,where,lat,lon]) => ({ id,en,zh,region,where,lat,lon,category:'jp',key:`jp:${id}`,...point(lat,lon) }))
  };
  // Stable, collision-free catalogue serials make every saved destination—including
  // every park and custom city—receive a visibly distinct engraved cartouche.
  const placeSerial = new Map(CATEGORY_ORDER.flatMap(cat => catalogue[cat]).map((place, index) => [place.key, index + 1]));
  const countryById = new Map(catalogue.countries.map(place => [place.id,place]));
  const usStateNames = new Map(stateSource.map(state => [state.abbr,state.zh]));
  usStateNames.set('AS','美屬薩摩亞');
  usStateNames.set('VI','美屬維京群島');
  const canadaAdminNames = {
    AB:'亞伯達省', BC:'卑詩省', MB:'曼尼托巴省', NB:'新不倫瑞克省', NL:'紐芬蘭與拉布拉多省',
    NS:'新斯科細亞省', NT:'西北地方', NU:'努納武特地區', ON:'安大略省', PE:'愛德華王子島省',
    QC:'魁北克省', SK:'薩斯喀徹溫省', YT:'育空地區'
  };
  function point(lat, lon) { const [x,y] = project(lon,lat); return {x,y}; }
  function normalizedCustom(raw) {
    if (!raw || typeof raw !== 'object' || !/^custom-[a-zA-Z0-9-]{1,90}$/.test(raw.id) || typeof raw.en !== 'string' || !raw.en.trim() || raw.en.length > 80 || !countryByIso.has(raw.iso)) return null;
    const hasCoords = raw.lat !== null && raw.lon !== null && raw.lat !== undefined && raw.lon !== undefined;
    const lat = hasCoords ? Number(raw.lat) : null;
    const lon = hasCoords ? Number(raw.lon) : null;
    if (hasCoords && (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)) return null;
    return { id:raw.id, en:raw.en.trim(), iso:raw.iso, lat, lon };
  }
  function cityFromCustom(raw) {
    const country = countryByIso.get(raw.iso);
    const [x,y] = raw.lat === null ? [country.x,country.y] : project(raw.lon,raw.lat);
    return { ...raw, zh:raw.en, category:'cities', key:`cities:${raw.id}`, region:country.region, country:country.zh, custom:true, approximate:raw.lat === null, x, y };
  }
  function cleanState(raw) {
    const customCities = [];
    const customIds = new Set();
    if (Array.isArray(raw?.customCities)) for (const row of raw.customCities.slice(0, 500)) {
      const city = normalizedCustom(row);
      if (city && !customIds.has(city.id)) { customCities.push(city); customIds.add(city.id); }
    }
    const knownKeys = new Set(CATEGORY_ORDER.flatMap(cat => catalogue[cat].map(place => place.key)));
    customCities.forEach(city => knownKeys.add(`cities:${city.id}`));
    const visits = Object.create(null);
    if (raw?.visits && typeof raw.visits === 'object' && !Array.isArray(raw.visits)) {
      for (const [key, dates] of Object.entries(raw.visits)) {
        if (knownKeys.has(key) && Array.isArray(dates)) {
          const unique = [...new Set(dates.map(normalizedMonth).filter(Boolean))].sort();
          if (unique.length) visits[key] = unique.slice(0, 200);
        }
      }
    }
    return { version:1, visits, customCities };
  }
  function loadState() {
    try { return cleanState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch { return cleanState(null); }
  }
  const BASE_CATALOGUE = Object.freeze({
    countries:catalogue.countries,
    cities:catalogue.cities.slice(),
    na:catalogue.na,
    jp:catalogue.jp
  });
  let data = loadState();
  data.customCities.forEach(city => catalogue.cities.push(cityFromCustom(city)));
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
    catch { $('#backup-feedback').textContent = '無法儲存；請匯出備份。'; return false; }
  }
  // Persist normalized month-only records on load so day-precision backups migrate once.
  saveState();
  function cloudMode() { return atlasAccount.mode !== 'local'; }
  function signedIn() { return atlasAccount.signedIn && Boolean(atlasAccount.user); }
  function editable() { return !cloudMode() || signedIn(); }
  function ownVisits(place) {
    if (!cloudMode()) return data.visits[place.key] || [];
    if (!signedIn()) return [];
    return [...new Set(atlasAccount.rows.filter(row => row.userId === atlasAccount.user.id && row.placeKey === place.key).map(row => row.month))].sort();
  }
  function visitsOf(place) {
    if (!cloudMode()) return data.visits[place.key] || [];
    return [...new Set(atlasAccount.rows.filter(row => row.placeKey === place.key).map(row => row.month))].sort();
  }
  // Every stamp of one place, grouped by the month it happened, with who was there.
  function stampDetails(place) {
    if (!cloudMode()) return (data.visits[place.key] || []).map(month => ({ month, mine:true, companions:[] }));
    const byMonth = new Map();
    for (const row of atlasAccount.rows) {
      if (row.placeKey !== place.key) continue;
      if (!byMonth.has(row.month)) byMonth.set(row.month, { month:row.month, mine:false, companions:new Set() });
      const entry = byMonth.get(row.month);
      if (row.userId === atlasAccount.user?.id) entry.mine = true;
      (row.companions || []).forEach(id => entry.companions.add(id));
    }
    return [...byMonth.values()].sort((a,b) => a.month.localeCompare(b.month))
      .map(entry => ({ month:entry.month, mine:entry.mine, companions:[...entry.companions] }));
  }
  function myStampId(place, month) {
    return atlasAccount.rows.find(row => row.userId === atlasAccount.user?.id && row.placeKey === place.key && row.month === month)?.id || null;
  }
  function companionsFor(place, month) {
    if (!cloudMode()) return [];
    return [...new Set(atlasAccount.rows.filter(row => row.userId === atlasAccount.user?.id && row.placeKey === place.key && row.month === month).flatMap(row => row.companions || []))];
  }
  function isStamped(place) { return visitsOf(place).length > 0; }
  function sortedPlaces(cat) { return [...catalogue[cat]].sort((a,b) => collator.compare(a.zh,b.zh) || collator.compare(a.en,b.en)); }

  const svg = $('#map-svg');
  const surface = $('#map-surface');
  const countryLayer = $('#country-layer');
  const stateLayer = $('#state-layer');
  const markerLayer = $('#marker-layer');
  const tooltip = $('#map-tooltip');
  const dateInput = $('#visit-date');
  const list = $('#place-list');
  dateInput.max = today;
  dateInput.value = today;
  $('#graticule').setAttribute('d', world.graticule);
  let category = 'countries';
  let region = 'all';
  let visitedOnly = false;
  let query = '';
  const selectedByCategory = Object.fromEntries(CATEGORY_ORDER.map(cat => [cat, CATEGORIES[cat].initial]));
  let view = {x:0,y:0,w:1000,h:520};
  let currentMessage = null;

  function selectedPlace() { return catalogue[category].find(place => place.id === selectedByCategory[category]) || catalogue[category][0]; }
  function showMessage(message, type = '') {
    currentMessage = { message, type, key:selectedPlace().key };
    const feedback = $('#stamp-feedback');
    feedback.textContent = message;
    feedback.className = `stamp-feedback ${type}`;
  }
  // Visitors count the whole atlas; signed-in travellers count their own places.
  function visitorView() { return !signedIn(); }
  function stampCount(cat) {
    return catalogue[cat].filter(visitorView() ? isStamped : ownStamped).length;
  }
  function ownStamped(place) { return ownVisits(place).length > 0; }
  function updateCounters() {
    let total = 0;
    const counted = new Set();
    CATEGORY_ORDER.forEach(cat => {
      const stamped = stampCount(cat);
      // The collection total counts each place once; tab counts describe layers.
      catalogue[cat].forEach(place => { if (visitorView() ? isStamped(place) : ownStamped(place)) counted.add(place.key); });
      $(`#tab-count-${cat}`).textContent = `${stamped} / ${catalogue[cat].length}`;
    });
    total = counted.size;
    $('#passport-count').textContent = total;
    const label = $('#collection-label');
    if (label) label.textContent = signedIn() ? '已蓋章' : (cloudMode() ? '旅人共蓋章' : '已蓋章');
    $('#board-visited').textContent = stampCount(category);
    $('#board-total').textContent = catalogue[category].length;
  }
  function updateCategoryUI() {
    const spec = CATEGORIES[category];
    document.querySelectorAll('.category-tab').forEach(tab => {
      const active = tab.dataset.category === category;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    $('#atlas-panel').setAttribute('aria-labelledby', `tab-${category}`);
    $('#board-title').textContent = spec.title;
    $('#map-caption').textContent = spec.map;
    $('#directory-description').textContent = spec.description;
    $('#index-note').textContent = spec.note;
    $('#add-city').hidden = category !== 'cities';
    $('#state-legend').hidden = category !== 'na' || region === 'ca' || region.startsWith('na-ca-') || region === 'na-us-territories';
    const mapAction = category === 'countries' ? '點選國家' : category === 'cities' ? '點選城市標記' : category === 'na' ? '點選州界或公園標記' : '點選國家公園標記';
    svg.setAttribute('aria-label', `${spec.title}互動地圖。${mapAction}，或搜尋目的地清單。`);
    updateCounters();
  }
  function areaLabel(place) {
    if (place.isState) return `美國州 · ${place.abbr} · 首府 ${place.capital}`;
    if (place.category === 'countries') return `${REGION_NAMES[place.region] || '其他地區'} · 國家與地區`;
    if (place.category === 'cities') return `${REGION_NAMES[place.region] || '世界'} · ${place.country}${place.approximate ? ' · 位置近似' : ''}`;
    if (place.category === 'na') {
      const names = String(place.where || '').split('·').map(code => code.trim()).filter(Boolean).map(code => place.nation === 'US' ? (usStateNames.get(code) || code) : (canadaAdminNames[code] || code));
      return `${place.nation === 'US' ? '美國國家公園' : '加拿大國家公園'} · ${names.join('、')}`;
    }
    return `日本國家公園 · ${place.where}`;
  }
  // Destination-specific postcard plates. stamp-art.js supplies an editorial
  // one-ink vignette (landscape, flower, figure or building) for every catalogue
  // entry; the deterministic terrain below keeps each plate unique.
  function renderStampArt(place) {
    const atlas = window.TravelAtlasStampArt;
    const svg = document.getElementById('stamp-art');
    if (!atlas) return;
    const motif = atlas.find(place);
    let seed = 2166136261;
    for (const char of String(place.id || place.key || place.en || place.zh)) {
      seed ^= char.codePointAt(0);
      seed = Math.imul(seed, 16777619) >>> 0;
    }
    // A faint, place-specific ridge and contour set sits behind every motif, so
    // two destinations sharing an icon still keep their own engraved signature.
    const contours = Array.from({length:3}, (_, row) => {
      const y = 34 + row * 7;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const bend = 2 + seed % 8;
      return `<path d="M2 ${y}q18 ${bend} 34 0t32 0 30 0"/>`;
    }).join('');
    const serial = placeSerial.get(place.key) || (() => {
      const next = placeSerial.size + 1;
      placeSerial.set(place.key, next);
      return next;
    })();
    const plate = `<g class="t-4">${contours}</g>`;
    svg.innerHTML = `${plate}${atlas.render(motif)}<text class="art-serial" x="97" y="57">${String(serial).padStart(3,'0')}</text>`;
    svg.setAttribute('aria-label', `${motif.label}，${motif.kind}圖稿，${place.zh}專屬構圖，圖稿編號 ${serial}`);
    const caption = $('#plate-motif');
    if (caption) caption.textContent = atlas.label(place, motif);
    const kind = $('#plate-kind');
    if (kind) kind.textContent = motif.kind;
  }
  function renderDetail() {
    const place = selectedPlace();
    if (!place) return;
    const stamps = visitsOf(place);
    $('#place-name').textContent = place.zh;
    const code = category === 'cities' ? (place.code || '') : '';
    $('#place-code').textContent = code;
    $('#place-code').setAttribute('aria-label', code ? `城市代碼 ${code}` : '');
    $('#place-code').hidden = !code;
    $('#place-en').textContent = place.en === place.zh ? '' : place.en.toUpperCase();
    $('#place-location').textContent = areaLabel(place);
    const face = $('#stamp-face');
    face.classList.toggle('pending', stamps.length === 0);
    face.classList.toggle('long-name', [...place.zh].length > 6);
    $('#stamp-face-name').textContent = place.zh;
    renderStampArt(place);
    $('#stamp-face-date').textContent = printedDate(stamps.at(-1) || (validDate(dateInput.value) ? dateInput.value : ''));
    const history = $('#stamp-history');
    history.hidden = stamps.length === 0;
    $('#history-count').textContent = cloudMode() ? `${stamps.length} 個月份 · ${atlasAccount.rows.filter(row => row.placeKey === place.key).length} 枚戳章` : `${stamps.length} 枚戳章`;
    const historyList = $('#history-list');
    historyList.replaceChildren();
    [...stampDetails(place)].reverse().forEach(detail => {
      const row = makeElement('li');
      const time = makeElement('time', '', printedDate(detail.month));
      time.dateTime = detail.month;
      row.append(time);
      if (cloudMode()) {
        row.classList.toggle('not-mine', !detail.mine);
        const names = companionNames(detail.companions);
        const who = makeElement('span', 'history-who', names.length ? `與 ${names.join('、')}` : (detail.mine ? '獨自旅行' : ''));
        row.append(who);
        if (!detail.mine) {
          const mine = makeElement('span', 'history-mine-mark', '他人');
          mine.title = '這枚戳章來自其他旅人';
          row.append(mine);
        }
      }
      const removable = !cloudMode() || (detail.mine && signedIn());
      if (removable) {
        const remove = makeElement('button', '', '×');
        remove.type = 'button';
        remove.dataset.date = detail.month;
        remove.setAttribute('aria-label', `移除${place.zh} ${printedDate(detail.month)} 的戳章`);
        row.append(remove);
      }
      historyList.append(row);
    });
    renderCompanionControls(place);
    applyPermission();
    $('#delete-city').hidden = !place.custom || !editable() || (cloudMode() && !isMineCustom(place));
    if (currentMessage?.key === place.key) showMessage(currentMessage.message, currentMessage.type);
    else {
      currentMessage = null;
      showMessage(stamps.length ? '選擇另一個月份記錄到訪。' : '選月份後蓋章。');
    }
  }
  function isMineCustom(place) {
    return !cloudMode() ? true : atlasAccount.cities.some(city => city.id === place.id && city.userId === atlasAccount.user?.id);
  }
  function personName(id) {
    return atlasAccount.profiles.get(id)?.name || '已移除的旅人';
  }
  function companionNames(ids) { return [...new Set(ids)].filter(Boolean).map(personName); }
  function activeCompanionIds() {
    if (!cloudMode() || !signedIn()) return [];
    const place = selectedPlace();
    if (!place) return [];
    const month = dateInput.value;
    const stored = companionsFor(place, month);
    return stored.length ? stored : [...companionDraft.keys()];
  }
  function renderCompanionChips(ids) {
    const container = $('#companion-chips');
    container.replaceChildren();
    ids.forEach(id => {
      const profile = atlasAccount.profiles.get(id);
      const chip = makeElement('span', 'companion-chip');
      if (profile?.avatar) {
        const image = makeElement('img');
        image.src = profile.avatar; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        chip.append(image);
      } else chip.append(makeElement('span', 'companion-initial', [...personName(id)][0] || '旅'));
      chip.append(makeElement('span', '', personName(id)));
      const remove = makeElement('button', '', '×');
      remove.type = 'button';
      remove.dataset.removeCompanion = id;
      remove.setAttribute('aria-label', `移除同行旅伴 ${personName(id)}`);
      chip.append(remove);
      container.append(chip);
    });
  }
  function renderCompanionControls(place) {
    const block = $('#companion-block');
    const chips = $('#companion-chips');
    const manage = $('#companion-manage');
    const note = $('#companion-note');
    const others = cloudMode() ? [...new Set(atlasAccount.profiles.keys())].filter(id => id !== atlasAccount.user?.id) : [];
    if (!cloudMode()) {
      chips.replaceChildren();
      manage.hidden = true;
      note.textContent = '登入後可以標記一起旅行的朋友。';
      if (signedIn()) note.textContent = '';
      return;
    }
    if (!signedIn()) {
      chips.replaceChildren();
      manage.hidden = true;
      note.textContent = '登入後可以標記一起旅行的朋友。';
      return;
    }
    manage.hidden = false;
    manage.disabled = !editable();
    const ids = activeCompanionIds();
    renderCompanionChips(ids);
    if (!others.length) note.textContent = '目前還沒有其他旅人登入過這個地圖；他們登入後就能一起標記。';
    else if (!ids.length) note.textContent = '你可以標記這趟旅程的同行者，蓋章後會一起顯示在共同旅程裡。';
    else note.textContent = '';
  }

  function renderRegions() {
    const container = $('#region-controls');
    const fragment = document.createDocumentFragment();
    CATEGORIES[category].regions.forEach(area => {
      const count = area.id === 'all' ? catalogue[category].length : catalogue[category].filter(place => matchesRegion(place,area.id)).length;
      if (!count && area.id !== 'all') return;
      const button = makeElement('button', '', area.label);
      button.type = 'button';
      button.dataset.region = area.id;
      button.setAttribute('aria-pressed', String(region === area.id));
      button.append(makeElement('span', '', String(count)));
      fragment.append(button);
    });
    container.replaceChildren(fragment);
  }
  function matchesRegion(place, target = region) {
    if (target === 'all') return true;
    if (category === 'na') {
      if (target === 'us') return place.region.startsWith('na-us-');
      if (target === 'ca') return place.region.startsWith('na-ca-');
    }
    return place.region === target;
  }
  function visiblePlaces() {
    const term = query.normalize('NFKD').toLocaleLowerCase().trim();
    return sortedPlaces(category).filter(place => matchesRegion(place) && (!visitedOnly || isStamped(place)) && (!term || `${place.zh} ${place.code || ''} ${place.abbr || ''} ${place.en} ${place.country || ''} ${place.where || ''} ${place.capital || ''}`.normalize('NFKD').toLocaleLowerCase().includes(term)));
  }
  function renderDirectory(resetScroll = false) {
    const oldScroll = resetScroll ? 0 : list.scrollTop;
    const places = visiblePlaces();
    $('#result-count').textContent = `${places.length} / ${catalogue[category].length} 個目的地`;
    const fragment = document.createDocumentFragment();
    if (!places.length) {
      const empty = makeElement('div', 'empty-results');
      empty.append(makeElement('strong', '', visitedOnly && !query ? '還沒有蓋章的地方。' : '沒有找到這一站。'));
      empty.append(makeElement('span', '', visitedOnly ? '切換「只看已蓋章」，或換個分區再找找。' : '試試其他關鍵字，或選擇「全部」分區。'));
      fragment.append(empty);
    } else places.forEach((place, index) => {
      const button = makeElement('button', `place-item${isStamped(place) ? ' done' : ''}`);
      button.type = 'button';
      button.dataset.place = place.id;
      if (selectedPlace()?.id === place.id) button.setAttribute('aria-current', 'true');
      button.append(makeElement('span', 'item-index', String(index + 1).padStart(3, '0')));
      const info = makeElement('span', 'item-info');
      const name = makeElement('strong', 'item-place-name', place.zh);
      if (category === 'cities' && place.code) {
        const code = makeElement('span', 'city-code', place.code);
        code.setAttribute('aria-label', `城市代碼 ${place.code}`);
        name.append(code);
      }
      info.append(name, makeElement('small', '', place.en === place.zh ? place.country : place.en));
      button.append(info, makeElement('span', 'item-status', isStamped(place) ? '✳' : '·'));
      button.lastElementChild.setAttribute('aria-hidden', 'true');
      fragment.append(button);
    });
    list.replaceChildren(fragment);
    list.scrollTop = oldScroll;
  }

  function mapRatio() { return Math.max(1, (surface.clientWidth || 800) / (surface.clientHeight || 500)); }
  function clampView(raw) {
    if (raw.w >= 1000) return {x:0,y:0,w:1000,h:520};
    const w = Math.max(12,Math.min(1000,raw.w));
    const h = Math.max(8,Math.min(520,raw.h));
    return { x:Math.max(0,Math.min(1000-w,raw.x)), y:Math.max(0,Math.min(520-h,raw.y)), w, h };
  }
  function viewAround(x,y,width) {
    // A portrait viewport cannot show a 1000:520 world at the same aspect ratio.
    // When zooming in from the globe, crop the sides first, then zoom both axes.
    const h = Math.min(520,width / mapRatio());
    const w = Math.min(width,h * mapRatio());
    return clampView({x:x-w/2,y:y-h/2,w,h});
  }
  function viewFromBounds([x1,y1,x2,y2],padding,minWidth) {
    const ratio = mapRatio();
    const width = Math.min(990,Math.max(minWidth,x2-x1+padding*2,(y2-y1+padding*2)*ratio));
    return viewAround((x1+x2)/2,(y1+y2)/2,width);
  }
  function viewFromGeo([minLon,minLat,maxLon,maxLat],padding,minWidth) {
    const points = [];
    for (const lon of [minLon,(minLon+maxLon)/2,maxLon]) for (const lat of [minLat,(minLat+maxLat)/2,maxLat]) points.push(project(lon,lat));
    return viewFromBounds([Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))],padding,minWidth);
  }
  function viewFromPoints(points,padding,minWidth) {
    return viewFromBounds([Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))],padding,minWidth);
  }
  function defaultView() {
    if (category === 'countries' || category === 'cities') return region === 'all' ? {x:0,y:0,w:1000,h:520} : viewFromGeo(WORLD_AREA[region],14,70);
    if (category === 'na' && region === 'all') return viewFromGeo([-170,5,-50,83],16,280);
    if (category === 'na' && region === 'us') return viewFromGeo([-127,23,-66,52],12,190);
    if (category === 'na' && region === 'ca') return viewFromBounds(countryByIso.get('CA').bbox,13,200);
    if (category === 'jp' && region === 'all') return viewFromPoints(catalogue.jp,11,115);
    const points = catalogue[category].filter(matchesRegion);
    if (category === 'na' && region === 'na-us-territories') return viewAround(selectedPlace().x,selectedPlace().y,100);
    return points.length ? viewFromPoints(points,category === 'jp' ? 9 : 13,category === 'jp' ? 40 : 75) : {x:0,y:0,w:1000,h:520};
  }
  function setView(next) {
    const framed = clampView(next);
    const scaleChanged = view.w !== framed.w || view.h !== framed.h;
    view = framed;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    surface.classList.toggle('zoomed',view.w < 500);
    // A drag changes only the viewBox origin; rebuilding every marker on every
    // pointermove would make the map feel sticky on a phone.
    if (scaleChanged) renderMarkers();
  }
  function focusPlace(place) {
    if (category === 'countries') {
      const [x1,y1,x2,y2] = place.bbox;
      const width = Math.min(270,Math.max(86,x2-x1+22,(y2-y1+20)*mapRatio()));
      setView(viewAround(place.x,place.y,width));
    } else if (place.isState && place.abbr === 'AK') setView(viewAround(place.x,place.y,190));
    else if (place.isState) setView(viewFromBounds(place.bbox,8,34));
    else setView(viewAround(place.x,place.y,category === 'cities' ? 140 : category === 'jp' ? 45 : 83));
  }
  function resetView() { setView(defaultView()); }

  // Draw land once, then change its ink / interactivity for the active layer.
  const countryPaths = new Map();
  world.countries.forEach(country => {
    const path = makeSvg('path', { d:country.d, class:'map-country', 'data-id':country.id });
    path.addEventListener('pointerenter', event => {
      if (!path.classList.contains('selectable')) return;
      showTooltip(placeTooltip(countryById.get(country.id)), event);
    });
    path.addEventListener('pointermove', event => { if (path.classList.contains('selectable')) showTooltip(placeTooltip(countryById.get(country.id)),event); });
    path.addEventListener('pointerleave', hideTooltip);
    countryPaths.set(country.id,path);
    countryLayer.append(path);
  });
  const statePaths = new Map();
  stateSource.forEach(state => {
    const path = makeSvg('path',{d:state.d,class:'map-us-state','data-id':state.id});
    path.addEventListener('pointerenter',event => showTooltip(placeTooltip(catalogue.na.find(place => place.id === state.id)),event));
    path.addEventListener('pointermove',event => showTooltip(placeTooltip(catalogue.na.find(place => place.id === state.id)),event));
    path.addEventListener('pointerleave',hideTooltip);
    statePaths.set(state.id,path);
    stateLayer.append(path);
  });
  function renderUSStates() {
    const showStates = category === 'na' && region !== 'ca' && !region.startsWith('na-ca-') && region !== 'na-us-territories';
    stateLayer.classList.toggle('active',showStates);
    for (const state of stateSource) {
      const path = statePaths.get(state.id);
      const place = catalogue.na.find(item => item.id === state.id);
      const allowed = showStates && matchesRegion(place) && (!visitedOnly || isStamped(place));
      path.classList.toggle('selectable',allowed);
      path.classList.toggle('outside',showStates && !allowed);
      path.classList.toggle('done',showStates && isStamped(place));
      path.classList.toggle('selected',showStates && selectedPlace()?.id === state.id);
    }
    if (selectedPlace()?.isState) stateLayer.append(statePaths.get(selectedPlace().id));
  }
  function renderCountries() {
    world.countries.forEach(country => {
      const path = countryPaths.get(country.id);
      const place = countryById.get(country.id);
      const allowed = category === 'countries' && matchesRegion(place) && (!visitedOnly || isStamped(place));
      path.classList.toggle('selectable', allowed);
      path.classList.toggle('outside', category === 'countries' && !allowed);
      path.classList.toggle('done', category === 'countries' && isStamped(place));
      path.classList.toggle('selected', category === 'countries' && selectedPlace()?.id === country.id);
      path.classList.toggle('relevant', category === 'na' && (country.iso === 'US' || country.iso === 'CA') || category === 'jp' && country.iso === 'JP');
    });
  }
  function renderMarkers() {
    const fragment = document.createDocumentFragment();
    const scale = Math.min((svg.clientWidth || 800) / view.w,(svg.clientHeight || 500) / view.h);
    if (category === 'countries') {
      // The large impression lives on the postcard; little postmarks live on
      // the map itself so visited countries look collected, not just coloured.
      for (const place of catalogue.countries.filter(p => matchesRegion(p) && isStamped(p))) {
        const mark = makeSvg('g',{class:'country-imprint','aria-hidden':'true'});
        mark.append(makeSvg('circle',{class:'imprint-outer',cx:place.x,cy:place.y,r:7/scale}));
        mark.append(makeSvg('circle',{class:'imprint-inner',cx:place.x,cy:place.y,r:4.6/scale}));
        mark.append(makeSvg('circle',{class:'imprint-dot',cx:place.x,cy:place.y,r:1.4/scale}));
        fragment.append(mark);
      }
    } else {
      const points = catalogue[category].filter(place => !place.isState && matchesRegion(place) && (!visitedOnly || isStamped(place)));
      points.sort((a,b) => Number(a.id === selectedPlace().id) - Number(b.id === selectedPlace().id));
      const radius = 4.5 / scale;
      for (const place of points) {
        // Keep circles small on screen at every zoom, but make their pointer target comfortable.
        const group = makeSvg('g', {class:`map-point${isStamped(place) ? ' done' : ''}${selectedPlace().id === place.id ? ' selected' : ''}`, 'data-id':place.id});
        group.append(makeSvg('circle',{class:'point-hit',cx:place.x,cy:place.y,r:14/scale}));
        group.append(makeSvg('circle',{class:'point-halo',cx:place.x,cy:place.y,r:radius*2.5}));
        group.append(makeSvg('circle',{class:'point-stamp',cx:place.x,cy:place.y,r:radius*1.65}));
        group.append(makeSvg('circle',{class:'point-outer',cx:place.x,cy:place.y,r:radius}));
        group.append(makeSvg('circle',{class:'point-center',cx:place.x,cy:place.y,r:Math.max(radius*.21,.2)}));
        group.addEventListener('pointerenter',event => showTooltip(placeTooltip(place),event));
        group.addEventListener('pointermove',event => showTooltip(placeTooltip(place),event));
        group.addEventListener('pointerleave',hideTooltip);
        fragment.append(group);
      }
    }
    markerLayer.replaceChildren(fragment);
  }
  function renderMap() { renderCountries(); renderUSStates(); renderMarkers(); }
  // Keep the map uncluttered: reveal place and administrative context only on hover.
  function placeTooltip(place) {
    const dates = visitsOf(place);
    const name = category === 'cities' && place.code ? `${place.zh} · ${place.code}` : place.zh;
    const details = `${name} · ${areaLabel(place)}`;
    return dates.length ? `${details} · ${printedDate(dates.at(-1))}` : details;
  }
  function showTooltip(name,event) {
    tooltip.textContent = name;
    tooltip.hidden = false;
    const bounds = surface.getBoundingClientRect();
    const left = Math.min(Math.max(12,event.clientX-bounds.left+12),Math.max(12,bounds.width-tooltip.offsetWidth-8));
    const top = Math.min(Math.max(12,event.clientY-bounds.top-tooltip.offsetHeight-10),Math.max(12,bounds.height-tooltip.offsetHeight-8));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  function hideTooltip() { tooltip.hidden = true; }
  function selectPlace(id,focus = false,fromIndex = false) {
    const place = catalogue[category].find(p => p.id === id);
    if (!place) return;
    selectedByCategory[category] = id;
    currentMessage = null;
    renderDetail();
    if (focus) focusPlace(place);
    renderMap();
    renderDirectory();
    hideTooltip();
    if (fromIndex) {
      const target = matchMedia('(max-width: 840px)').matches ? $('.stamp-panel') : $('.atlas-grid');
      target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    }
  }
  function chooseCategory(next,focusTab = false) {
    if (!CATEGORIES[next]) return;
    category = next;
    region = 'all';
    visitedOnly = false;
    query = '';
    $('#visited-filter').setAttribute('aria-pressed','false');
    $('#place-search').value = '';
    currentMessage = null;
    updateCategoryUI();
    renderRegions();
    renderDetail();
    resetView();
    renderMap();
    renderDirectory(true);
    if (focusTab) $(`#tab-${next}`).focus();
  }
  function chooseRegion(next) {
    if (!CATEGORIES[category].regions.some(item => item.id === next)) return;
    region = next;
    updateCategoryUI();
    const options = sortedPlaces(category).filter(matchesRegion);
    if (options.length && !matchesRegion(selectedPlace())) selectedByCategory[category] = options[0].id;
    currentMessage = null;
    renderRegions();
    renderDetail();
    resetView();
    renderMap();
    renderDirectory(true);
  }
  function refreshAfterStamp(message,type) {
    updateCounters();
    renderRegions();
    renderDetail();
    renderMap();
    renderDirectory();
    showMessage(message,type);
  }

  // Delegate all map selection so country paths, state shapes, and marker hits stay clickable.
  svg.addEventListener('click',event => {
    const target = event.target.closest('.map-point,.map-country.selectable,.map-us-state.selectable');
    if (!target) return;
    const id = target.dataset.id;
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    selectPlace(id,true);
  });

  // Pointer drag pans only when begun on the sea; land and markers stay clickable.
  let drag = null;
  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.map-point,.map-country,.map-us-state')) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,origin:{...view}};
    svg.setPointerCapture(event.pointerId);
    svg.classList.add('is-dragging');
  });
  svg.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const scale = Math.min(svg.clientWidth/drag.origin.w,svg.clientHeight/drag.origin.h);
    setView(clampView({...drag.origin,x:drag.origin.x-(event.clientX-drag.x)/scale,y:drag.origin.y-(event.clientY-drag.y)/scale}));
  });
  function stopDragging(event) {
    if (drag?.id === event.pointerId) { drag = null; svg.classList.remove('is-dragging'); }
  }
  svg.addEventListener('pointerup',stopDragging);
  svg.addEventListener('pointercancel',stopDragging);
  svg.addEventListener('lostpointercapture',stopDragging);
  $('#zoom-in').addEventListener('click',() => setView(viewAround(view.x+view.w/2,view.y+view.h/2,Math.max(12,view.w*.72))));
  $('#zoom-out').addEventListener('click',() => {
    const width = Math.min(1000,view.w/ .72);
    setView(width >= 980 ? {x:0,y:0,w:1000,h:520} : viewAround(view.x+view.w/2,view.y+view.h/2,width));
  });
  $('#zoom-reset').addEventListener('click',resetView);
  window.addEventListener('resize',() => {
    // Reframe the current view to the new aspect ratio without losing its centre.
    const centerX = view.x+view.w/2, centerY = view.y+view.h/2;
    setView(view.w === 1000 ? {x:0,y:0,w:1000,h:520} : viewAround(centerX,centerY,view.w));
    renderMarkers(); // Pixel scale also changes when the SVG itself is resized.
  });
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click',() => chooseCategory(tab.dataset.category));
    tab.addEventListener('keydown',event => {
      const index = CATEGORY_ORDER.indexOf(tab.dataset.category);
      const next = event.key === 'ArrowRight' ? (index+1)%CATEGORY_ORDER.length : event.key === 'ArrowLeft' ? (index+CATEGORY_ORDER.length-1)%CATEGORY_ORDER.length : event.key === 'Home' ? 0 : event.key === 'End' ? CATEGORY_ORDER.length-1 : null;
      if (next !== null) {event.preventDefault();chooseCategory(CATEGORY_ORDER[next],true);}
    });
  });
  $('#region-controls').addEventListener('click',event => {
    const button = event.target.closest('button[data-region]');
    if (button) chooseRegion(button.dataset.region);
  });
  list.addEventListener('click',event => {
    const button = event.target.closest('button[data-place]');
    if (button) selectPlace(button.dataset.place,true,true);
  });
  $('#place-search').addEventListener('input',event => { query=event.target.value; renderDirectory(true); });
  $('#visited-filter').addEventListener('click',event => {
    visitedOnly = !visitedOnly;
    event.currentTarget.setAttribute('aria-pressed',String(visitedOnly));
    renderMap();renderDirectory(true);
  });
  dateInput.addEventListener('change',() => {
    const valid = validDate(dateInput.value) && dateInput.checkValidity();
    dateInput.setAttribute('aria-invalid',String(!valid));
    companionDraft.clear();
    if (!visitsOf(selectedPlace()).length) $('#stamp-face-date').textContent = printedDate(valid ? dateInput.value : '');
    // A stored month carries its own companions; a new month starts empty.
    if (cloudMode() && signedIn()) renderCompanionControls(selectedPlace());
  });
  function stampSucceeded() {
    const face = $('#stamp-face');
    face.classList.remove('fresh');
    void face.offsetWidth;
    face.classList.add('fresh');
    face.addEventListener('animationend', () => face.classList.remove('fresh'),{once:true});
  }
  $('#stamp-button').addEventListener('click',() => {
    const date = dateInput.value;
    if (!validDate(date) || !dateInput.checkValidity()) {dateInput.setAttribute('aria-invalid','true');showMessage('請選擇有效月份（不能晚於本月）。','error');dateInput.focus();return;}
    if (!editable()) {openAccountDialog('登入後才能蓋章。');return;}
    dateInput.setAttribute('aria-invalid','false');
    const place = selectedPlace();
    const stamps = ownVisits(place);
    if (stamps.includes(date)) {showMessage('這個月已蓋過章。','error');return;}
    const companions = activeCompanionIds();
    if (!cloudMode()) {
      data.visits[place.key] = [...stamps,date].sort();
      const saved = saveState();
      refreshAfterStamp(saved ? `已記錄 ${printedDate(date)}。` : '無法儲存；請匯出備份。','success');
      stampSucceeded();
      return;
    }
    const pending = { id:`pending-${Date.now()}`, userId:atlasAccount.user.id, placeKey:place.key, month:date, companions, pending:true };
    atlasAccount.rows.push(pending);
    optimisticRows.set(`${pending.userId}|${pending.placeKey}|${pending.month}`, pending);
    companionDraft.clear();
    refreshAfterStamp(companions.length ? `已記錄 ${printedDate(date)}，與 ${companionNames(companions).join('、')} 同行。` : `已記錄 ${printedDate(date)}。`,'success');
    stampSucceeded();
    account?.upsertStamp({ placeKey:place.key, month:date, companions });
  });
  $('#history-list').addEventListener('click',event => {
    const button = event.target.closest('button[data-date]');
    if (!button) return;
    const place = selectedPlace(), date = button.dataset.date;
    if (!editable()) {openAccountDialog('登入後才能修改戳章。');return;}
    if (cloudMode()) {
      const id = myStampId(place, date);
      atlasAccount.rows = atlasAccount.rows.filter(row => !(row.userId === atlasAccount.user?.id && row.placeKey === place.key && row.month === date));
      optimisticRows.delete(`${atlasAccount.user?.id}|${place.key}|${date}`);
      refreshAfterStamp(`已移除 ${printedDate(date)} 的戳章。`);
      account?.deleteStamp({ id, placeKey:place.key, month:date });
      return;
    }
    const remaining = visitsOf(place).filter(d => d !== date);
    if (remaining.length) data.visits[place.key] = remaining;
    else delete data.visits[place.key];
    const saved = saveState();
    refreshAfterStamp(saved ? `已移除 ${printedDate(date)} 的戳章。` : '無法儲存；請匯出備份。');
  });

  // A small, optional supplement to the editorial cities index.
  const cityDialog = $('#city-dialog');
  const countrySelect = $('#city-country');
  [...countryByIso.values()].sort((a,b) => collator.compare(a.zh,b.zh)).forEach(c => {
    const option = makeElement('option','',`${c.zh} · ${c.en}`);
    option.value = c.iso;
    countrySelect.append(option);
  });
  $('#add-city').addEventListener('click',() => {
    if (!editable()) { openAccountDialog('登入後才能新增城市。'); return; }
    $('#city-form').reset();
    $('#city-error').textContent = '';
    countrySelect.value = 'TW';
    cityDialog.showModal();
    $('#city-name').focus();
  });
  $('#city-cancel').addEventListener('click',() => cityDialog.close());
  cityDialog.addEventListener('click',event => { if (event.target === cityDialog) cityDialog.close(); });
  $('#city-form').addEventListener('submit',event => {
    event.preventDefault();
    const name = $('#city-name').value.trim();
    const iso = countrySelect.value;
    const latText = $('#city-lat').value.trim(), lonText = $('#city-lon').value.trim();
    const error = $('#city-error');
    if (!name || !countryByIso.has(iso)) {error.textContent = '請填入城市名稱與國家或地區。';return;}
    if (!!latText !== !!lonText) {error.textContent = '緯度和經度要一起填寫，或都留空。';return;}
    if (catalogue.cities.some(city => city.iso === iso && city.en.toLocaleLowerCase() === name.toLocaleLowerCase())) {error.textContent = '清單裡已經有這座城市了，直接搜尋它吧。';return;}
    const raw = normalizedCustom({ id:`custom-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, en:name, iso, lat:latText ? Number(latText) : null, lon:lonText ? Number(lonText) : null });
    if (!raw) {error.textContent = '座標不正確，緯度需在 -90～90、經度需在 -180～180。';return;}
    data.customCities.push(raw);
    catalogue.cities.push(cityFromCustom(raw));
    saveState();
    if (cloudMode() && signedIn()) {
      atlasAccount.cities.push({ id:raw.id, userId:atlasAccount.user.id, en:raw.en, iso:raw.iso, lat:raw.lat, lon:raw.lon });
      account?.upsertCity(raw);
    }
    cityDialog.close();
    region = 'all';query = '';$('#place-search').value = '';
    selectedByCategory.cities = raw.id;
    updateCategoryUI();renderRegions();renderDetail();focusPlace(selectedPlace());renderMap();renderDirectory(true);
    showMessage('城市已加入；選月份蓋章。','success');
    $('.stamp-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'});
  });
  $('#delete-city').addEventListener('click',() => {
    const place = selectedPlace();
    if (!place.custom || !confirm(`要移除「${place.en}」及這座城市的所有戳章嗎？`)) return;
    data.customCities = data.customCities.filter(city => city.id !== place.id);
    catalogue.cities = catalogue.cities.filter(city => city.id !== place.id);
    delete data.visits[place.key];
    selectedByCategory.cities = CATEGORIES.cities.initial;
    saveState();
    updateCategoryUI();renderRegions();renderDetail();resetView();renderMap();renderDirectory(true);
    showMessage('已移除這座自訂城市。');
  });

  $('#export-stamps').addEventListener('click',() => {
    const payload = {version:1, exportedAt:new Date().toISOString(), visits:data.visits, customCities:data.customCities};
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link = makeElement('a');
    link.href=url;link.download=`eva-travel-stamps-${today}.json`;
    document.body.append(link);link.click();link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    $('#backup-feedback').textContent = '備份已下載。請妥善保存這份戳章紀錄。';
  });
  $('#import-stamps').addEventListener('change',async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!editable()) {event.target.value='';openAccountDialog('登入後才能匯入備份。');return;}
    try {
      if (file.size > 2_000_000) throw new Error('備份檔案過大（上限 2 MB）。');
      const raw = JSON.parse(await file.text());
      if (raw?.version !== 1 || !raw.visits || !Array.isArray(raw.customCities)) throw new Error('不是這張地圖的戳章備份，或版本不相容。');
      const incoming = cleanState(raw);
      const existingIds = new Set(data.customCities.map(city => city.id));
      incoming.customCities.forEach(city => {if (!existingIds.has(city.id)) {data.customCities.push(city);catalogue.cities.push(cityFromCustom(city));}});
      for (const [key,dates] of Object.entries(incoming.visits)) data.visits[key] = [...new Set([...(data.visits[key] || []),...dates])].sort();
      const saved = saveState();
      const imported = Object.values(incoming.visits).reduce((sum,dates)=>sum+dates.length,0);
      if (cloudMode() && signedIn()) {
        for (const city of incoming.customCities) {
          if (atlasAccount.cities.some(existing => existing.id === city.id)) continue;
          atlasAccount.cities.push({ id:city.id, userId:atlasAccount.user.id, ...city });
          account?.upsertCity(city);
        }
        for (const [placeKey, months] of Object.entries(incoming.visits)) for (const month of months) {
          if (atlasAccount.rows.some(row => row.userId === atlasAccount.user.id && row.placeKey === placeKey && row.month === month)) continue;
          atlasAccount.rows.push({ id:`pending-${month}-${placeKey}`, userId:atlasAccount.user.id, placeKey, month, companions:[], pending:true });
          account?.upsertStamp({ placeKey, month, companions:[] });
        }
      }
      updateCategoryUI();renderRegions();renderDetail();renderMap();renderDirectory();
      const savedNote = cloudMode() ? `備份已匯入並與雲端紀錄合併（${imported} 枚戳章）。` : (saved ? `備份已匯入並與原有紀錄合併（${imported} 枚戳章）。` : '匯入完成，但無法儲存；請另存備份。');
      $('#backup-feedback').textContent = savedNote;
    } catch (error) { $('#backup-feedback').textContent = `匯入失敗：${error.message}`; }
    finally { event.target.value = ''; }
  });

  // ---------- accounts, companions, and cross-device sync ----------
  const accountDialog = $('#account-dialog');
  const companionDialog = $('#companion-dialog');
  const accountMenu = $('#account-menu');
  const accountMenuButton = $('#account-menu-button');

  function openAccountDialog(message = '') {
    $('#account-error').textContent = message;
    if (!accountDialog.open) accountDialog.showModal();
  }
  function closeAccountMenu() {
    accountMenu.hidden = true;
    accountMenuButton.setAttribute('aria-expanded', 'false');
  }
  function statusText() {
    if (!cloudMode()) return '本機模式：資料存在這個瀏覽器。';
    if (!signedIn()) return '訪客模式：可以瀏覽所有戳章，登入後才能蓋章。';
    const parts = [];
    const pending = atlasAccount.pending || 0;
    if (atlasAccount.connection === 'offline') parts.push('離線');
    else if (atlasAccount.connection === 'error') parts.push('連線異常，將自動重試');
    else if (pending) parts.push(`同步中（${pending} 筆待上傳）`);
    else parts.push('已同步');
    if (atlasAccount.realtime && atlasAccount.connection === 'online') parts.push('即時');
    if (atlasAccount.lastSyncAt && !pending) {
      const at = new Date(atlasAccount.lastSyncAt);
      parts.push(`${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')} 更新`);
    }
    return parts.join(' · ');
  }
  const STAMP_BUTTON_MARKUP = '<span aria-hidden="true">✳</span> 蓋下這一章 <span aria-hidden="true">↗</span>';
  function applyPermission() {
    const locked = !editable();
    const button = $('#stamp-button');
    button.classList.toggle('locked', locked);
    button.setAttribute('aria-disabled', String(locked));
    button.title = locked ? '登入後才能蓋章' : '';
    // eslint-disable-next-line no-unsafe-innerhtml -- static markup, no user input
    if (locked) button.textContent = '登入後蓋章';
    else if (button.dataset.locked === 'true') button.innerHTML = STAMP_BUTTON_MARKUP;
    button.dataset.locked = String(locked);
    $('#stamp-feedback').classList.toggle('locked', locked);
  }
  function renderAccount() {
    const signin = $('#sign-in');
    const card = $('#account-card');
    const action = $('#account-action');
    const demo = atlasAccount.mode === 'demo';
    if (signedIn()) {
      signin.hidden = true;
      card.hidden = false;
      const user = atlasAccount.user;
      const avatar = $('#account-avatar');
      if (user.avatar) {
        avatar.src = user.avatar;
        avatar.alt = '';
        avatar.hidden = false;
        avatar.referrerPolicy = 'no-referrer';
        avatar.onerror = () => { avatar.hidden = true; };
      }
      else avatar.hidden = true;
      $('#account-name').textContent = user.name;
      action.hidden = false;
      action.textContent = demo ? '示範模式 · 切換旅人' : '登出';
      const profile = atlasAccount.profiles.get(user.id);
      $('#discoverable-toggle').checked = profile ? profile.discoverable !== false : true;
      $('#account-menu-status').textContent = statusText();
    } else {
      signin.hidden = !cloudMode();
      card.hidden = true;
      closeAccountMenu();
      action.hidden = !cloudMode();
      action.textContent = '登入';
    }
    if ($('#backup-hint')) {
      $('#backup-hint').textContent = cloudMode()
        ? (signedIn() ? '匯出的備份只含你自己的戳章；匯入會與雲端紀錄合併。' : '訪客只能瀏覽。登入後可匯出、匯入與同步戳章。')
        : '資料只存在此瀏覽器；匯出備份可轉移或還原。';
    }
    $('#account-demo').hidden = atlasAccount.mode !== 'demo';
    renderDemoSwitch();
    applyPermission();
  }
  function refreshStatus() {
    if (signedIn()) {
      $('#account-menu-status').textContent = statusText();
      const chip = $('#account-action');
      if (chip && !chip.hidden) chip.textContent = atlasAccount.mode === 'demo' ? '示範模式 · 切換旅人' : '登出';
    }
    if ($('#export-stamps')) $('#export-stamps').disabled = !editable();
    if ($('#import-stamps')) $('#import-stamps').disabled = !editable();
  }

  function refreshAll(message, type) {
    updateCategoryUI();
    renderRegions();
    renderDetail();
    renderMap();
    renderDirectory();
    renderFriends();
    renderAccount();
    refreshStatus();
    if (message) showMessage(message, type);
  }

  // Rebuild the visible model from the account transport. Any number of patches
  // may be replayed; the result is identical because the store is a full snapshot.
  // Rows the page has drawn but the transport has not confirmed yet. They are
  // always this user's own, so folding them back in cannot leak anyone else's.
  const optimisticRows = new Map();
  function foldOptimistic(rows) {
    if (!signedIn()) { optimisticRows.clear(); return rows; }
    const seen = new Map(rows.map(row => [`${row.userId}|${row.placeKey}|${row.month}`, row]));
    for (const [key, row] of optimisticRows) {
      const actual = seen.get(key);
      if (actual && actual.id && !String(actual.id).startsWith('pending-')) optimisticRows.delete(key);
      else if (!actual) seen.set(key, row);
    }
    return [...seen.values()].sort((a,b) => a.month.localeCompare(b.month));
  }
  function applyAccount() {
    if (!account) return;
    atlasAccount.mode = account.mode;
    atlasAccount.rows = foldOptimistic(account.rows());
    atlasAccount.cities = account.cities();
    atlasAccount.profiles = account.profiles();
    // Custom cities are rebuilt from the editorial list every time, so a
    // transient empty snapshot can never erase the editorial index.
    const cities = BASE_CATALOGUE.cities.slice();
    const seen = new Set(cities.map(place => place.id));
    atlasAccount.cities.forEach(city => {
      if (seen.has(city.id)) return;
      seen.add(city.id);
      cities.push(cityFromCustom(city));
    });
    if (!cloudMode()) {
      data.customCities.forEach(city => {
        if (seen.has(city.id)) return;
        seen.add(city.id);
        cities.push(cityFromCustom(city));
      });
    }
    catalogue.cities = cities;
  }
  // Local records from before sign-in are uploaded once, then merged by month.
  function adoptLocalOnce() {
    if (!cloudMode() || !signedIn() || atlasAccount.mode !== 'cloud' || !account?.adoptLocal) return;
    const marker = ADOPTED_KEY(atlasAccount.user.id);
    try { if (localStorage.getItem(marker)) return; } catch { return; }
    const hasLocal = Object.keys(data.visits).length > 0 || data.customCities.length > 0;
    try { localStorage.setItem(marker, new Date().toISOString()); } catch { /* ignore */ }
    if (!hasLocal) return;
    account.adoptLocal({ visits:data.visits, customCities:data.customCities }).then(() => {
      data.visits = {};
      data.customCities = [];
      catalogue.cities = catalogue.cities.filter(place => !place.custom);
      saveState();
      $('#backup-feedback').textContent = '已把這個瀏覽器的舊戳章上傳到你的帳號。';
      applyAccount();
      refreshAll();
    });
  }
  // Remember a per-user snapshot so a phone reload without a network still shows stamps.
  function writeCache() {
    if (!cloudMode() || !signedIn() || !account?.writeCache) return;
    const visits = {};
    for (const row of atlasAccount.rows) {
      if (row.userId !== atlasAccount.user.id) continue;
      (visits[row.placeKey] ||= []).push(row.month);
    }
    for (const key of Object.keys(visits)) visits[key] = [...new Set(visits[key])].sort();
    const customCities = atlasAccount.cities.filter(city => city.userId === atlasAccount.user.id)
      .map(city => ({ id:city.id, en:city.en, iso:city.iso, lat:city.lat, lon:city.lon }));
    account.writeCache({ version:1, userId:atlasAccount.user.id, visits, customCities });
  }

  if (account) {
    atlasAccount.mode = account.mode;
    account.on('ready', () => {
      atlasAccount.ready = true;
      if (account.cachedVisits?.()) {
        const cached = account.cachedVisits();
        for (const [key, months] of Object.entries(cached)) {
          if (!Array.isArray(months)) continue;
          data.visits[key] = [...new Set([...(data.visits[key] || []), ...months])].sort();
        }
      }
      applyAccount();
      refreshAll();
    });
    account.on('auth', user => {
      const was = signedIn();
      // Sync the transport's identity first: every helper below reads these.
      atlasAccount.mode = account.mode;
      atlasAccount.signedIn = Boolean(user);
      atlasAccount.user = user;
      atlasAccount.rows = account.rows();
      atlasAccount.cities = account.cities();
      atlasAccount.profiles = account.profiles();
      companionDraft.clear();
      if (!user) { friendSelection = null; closeAccountMenu(); if (accountDialog.open) accountDialog.close(); }
      if (was && !user) { atlasAccount.rows = []; atlasAccount.connection = 'online'; }
      applyAccount();
      refreshAll();
      if (user) {
        adoptLocalOnce();
        writeCache();
      }
    });
    account.on('rows', () => {
      atlasAccount.mode = account.mode;
      atlasAccount.signedIn = Boolean(account.user);
      atlasAccount.user = account.user || null;
      atlasAccount.rows = account.rows();
      atlasAccount.cities = account.cities();
      atlasAccount.profiles = account.profiles();
      applyAccount();
      refreshAll();
      writeCache();
    });
    account.on('cities', () => { applyAccount(); refreshAll(); });
    account.on('profiles', () => {
      atlasAccount.profiles = account.profiles();
      if (signedIn()) { renderCompanionControls(selectedPlace()); renderFriends(); }
      renderAccount();
    });
    account.on('status', status => {
      atlasAccount.connection = status.connection;
      atlasAccount.pending = status.pending;
      atlasAccount.realtime = status.realtime;
      atlasAccount.lastSyncAt = status.lastSyncAt;
      refreshStatus();
    });
    account.on('error', message => {
      $('#account-error').textContent = message;
      $('#backup-feedback').textContent = `登入失敗：${message}`;
    });
  }

  $('#sign-in').addEventListener('click', () => openAccountDialog());
  $('#account-action').addEventListener('click', () => {
    if (!signedIn()) { openAccountDialog(); return; }
    if (atlasAccount.mode === 'demo') { openAccountDialog(); return; }
    if (confirm('要登出嗎？戳章會保留在雲端，下次登入後同步回來。')) account?.signOut();
  });
  $('#account-dialog-close').addEventListener('click', () => accountDialog.close());
  accountDialog.addEventListener('click', event => { if (event.target === accountDialog) accountDialog.close(); });
  $('#account-google').addEventListener('click', () => {
    if (atlasAccount.mode === 'local') {
      $('#account-error').textContent = '這個頁面還沒有連結雲端專案；請先依 README 設定 config.js。';
      return;
    }
    account?.signIn();
  });
  $('#account-demo').addEventListener('click', () => {
    account?.enterDemo('demo-eva');
    accountDialog.close();
  });
  // Only the local demo can pretend to be another person's account.
  function renderDemoSwitch() {
    const wrap = $('#demo-switch');
    const select = $('#demo-user');
    if (!wrap || !select) return;
    const isDemo = atlasAccount.mode === 'demo' && signedIn();
    wrap.hidden = !isDemo;
    if (!isDemo) return;
    const users = account?.demoUsers?.() || [];
    if (select.options.length !== users.length) {
      select.replaceChildren();
      users.forEach(user => {
        const option = makeElement('option', '', user.name);
        option.value = user.id;
        select.append(option);
      });
    }
    select.value = atlasAccount.user.id;
  }
  accountMenuButton.addEventListener('click', () => {
    const open = accountMenu.hidden;
    accountMenu.hidden = !open;
    accountMenuButton.setAttribute('aria-expanded', String(open));
    if (open) $('#account-menu-status').textContent = statusText();
  });
  document.addEventListener('click', event => {
    if (accountMenu.hidden) return;
    if (!event.target.closest('#account-card')) closeAccountMenu();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAccountMenu(); });
  $('#sync-now').addEventListener('click', async () => {
    $('#account-menu-status').textContent = '同步中…';
    await account?.refresh();
    await account?.flush();
    $('#account-menu-status').textContent = statusText();
  });
  $('#sign-out').addEventListener('click', () => {
    closeAccountMenu();
    account?.signOut();
  });
  $('#demo-user').addEventListener('change', event => {
    account?.setDemoUser(event.target.value);
    friendSelection = null;
    closeAccountMenu();
  });
  $('#discoverable-toggle').addEventListener('change', async event => {
    const ok = await account?.setDiscoverable(event.target.checked);
    if (!ok) event.target.checked = !event.target.checked;
    $('#account-menu-status').textContent = event.target.checked ? '其他旅人可以標記你。' : '其他旅人不能標記你。';
  });

  // Companion picker: any signed-in traveller can be tagged.
  function openCompanionDialog() {
    if (!signedIn()) { openAccountDialog('登入後才能標記旅伴。'); return; }
    const container = $('#companion-options');
    container.replaceChildren();
    const place = selectedPlace();
    const ids = new Set(activeCompanionIds());
    const others = [...atlasAccount.profiles.values()].filter(profile => profile.id !== atlasAccount.user?.id && profile.discoverable !== false);
    if (!others.length) {
      const empty = makeElement('p', 'companion-empty', '還沒有其他旅人登入過。把這個頁面分享給他們，登入後就能一起標記。');
      container.append(empty);
    }
    others.sort((a,b) => collator.compare(a.name, b.name)).forEach(profile => {
      const label = makeElement('label', 'companion-option');
      const input = makeElement('input');
      input.type = 'checkbox';
      input.value = profile.id;
      input.checked = ids.has(profile.id);
      if (profile.avatar) {
        const image = makeElement('img');
        image.src = profile.avatar; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        label.append(input, image);
      } else label.append(input, makeElement('span', 'companion-initial', [...profile.name][0] || '旅'));
      label.append(makeElement('span', '', profile.name));
      container.append(label);
    });
    $('#companion-error').textContent = '';
    companionDialog.dataset.placeKey = place?.key || '';
    if (!companionDialog.open) companionDialog.showModal();
  }
  $('#companion-manage').addEventListener('click', openCompanionDialog);
  $('#companion-cancel').addEventListener('click', () => companionDialog.close());
  companionDialog.addEventListener('click', event => { if (event.target === companionDialog) companionDialog.close(); });
  $('#companion-form').addEventListener('submit', event => {
    event.preventDefault();
    const place = selectedPlace();
    if (!place) return;
    const checked = [...$('#companion-options').querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
    const month = dateInput.value;
    const stored = companionsFor(place, month);
    const recordId = myStampId(place, month);
    companionDraft.clear();
    companionDialog.close();
    if (recordId) {
      atlasAccount.rows = atlasAccount.rows.map(row => row.userId === atlasAccount.user?.id && row.placeKey === place.key && row.month === month ? { ...row, companions:checked } : row);
      account?.upsertStamp({ placeKey:place.key, month, companions:checked });
      refreshAfterStamp(checked.length ? `這趟旅程標記了 ${companionNames(checked).join('、')}。` : '已清除這趟旅程的旅伴。', 'success');
      return;
    }
    checked.forEach(id => companionDraft.set(id, true));
    renderCompanionControls(place);
    showMessage(checked.length ? `將與 ${companionNames(checked).join('、')} 同行；選好月份後蓋章。` : '選月份後蓋章。', 'success');
  });
  $('#companion-chips').addEventListener('click', event => {
    const button = event.target.closest('button[data-remove-companion]');
    if (!button) return;
    const place = selectedPlace();
    if (!place) return;
    const id = button.dataset.removeCompanion, month = dateInput.value;
    const recordId = myStampId(place, month);
    if (recordId) {
      const next = companionsFor(place, month).filter(person => person !== id);
      atlasAccount.rows = atlasAccount.rows.map(row => row.userId === atlasAccount.user?.id && row.placeKey === place.key && row.month === month ? { ...row, companions:next } : row);
      account?.upsertStamp({ placeKey:place.key, month, companions:next });
      refreshAfterStamp(`已從這趟旅程移除 ${personName(id)}。`);
      return;
    }
    companionDraft.delete(id);
    renderCompanionControls(place);
  });

  // Shared trips: places stamped in the same month by you and the chosen traveller.
  function friendCandidates() {
    const ids = new Set([...atlasAccount.profiles.keys()]);
    atlasAccount.rows.forEach(row => { ids.add(row.userId); (row.companions || []).forEach(id => ids.add(id)); });
    ids.delete(atlasAccount.user?.id);
    return [...ids].map(id => ({ id, name:personName(id), avatar:atlasAccount.profiles.get(id)?.avatar || '' }))
      .sort((a,b) => collator.compare(a.name, b.name));
  }
  function sharedMoments(friendId) {
    if (!friendId || !signedIn()) return [];
    const me = atlasAccount.user.id;
    const mine = atlasAccount.rows.filter(row => row.userId === me);
    const theirs = atlasAccount.rows.filter(row => row.userId === friendId);
    const myKey = new Set(mine.map(row => `${row.placeKey}|${row.month}`));
    const theirKey = new Set(theirs.map(row => `${row.placeKey}|${row.month}`));
    const moments = new Map();
    const add = (row, byMe) => {
      const key = `${row.placeKey}|${row.month}`;
      const entry = moments.get(key) || { placeKey:row.placeKey, month:row.month, byMe:false, byThem:false };
      entry[byMe ? 'byMe' : 'byThem'] = true;
      moments.set(key, entry);
    };
    // A trip counts as shared when either traveller tagged the other, or when
    // both independently stamped the same place in the same month.
    mine.forEach(row => {
      if ((row.companions || []).includes(friendId) || theirKey.has(`${row.placeKey}|${row.month}`)) add(row, true);
    });
    theirs.forEach(row => {
      if ((row.companions || []).includes(me) || myKey.has(`${row.placeKey}|${row.month}`)) add(row, false);
    });
    const places = new Map();
    CATEGORY_ORDER.forEach(cat => catalogue[cat].forEach(place => places.set(place.key, place)));
    return [...moments.values()]
      .map(entry => ({ ...entry, name:places.get(entry.placeKey)?.zh || entry.placeKey, place:places.get(entry.placeKey) }))
      .sort((a,b) => b.month.localeCompare(a.month) || collator.compare(a.name, b.name));
  }
  function renderFriends() {
    const section = $('#friends-section');
    if (!section) return;
    const tabs = $('#friends-tabs');
    const listEl = $('#friends-list');
    const empty = $('#friends-empty');
    const candidates = friendCandidates();
    if (!signedIn() || atlasAccount.mode === 'local') {
      tabs.replaceChildren();
      listEl.replaceChildren();
      $('#friends-shared').textContent = '0';
      empty.hidden = false;
      empty.textContent = atlasAccount.mode === 'local'
        ? '登入並連結雲端後，這裡會顯示你和朋友一起走過的地方。'
        : '登入後，標記過旅伴的旅程會出現在這裡。';
      return;
    }
    // Until you pick a tab, show whoever shares the most stamps with you.
    const chosen = candidates.some(person => person.id === friendSelection) ? friendSelection : (() => {
      const ranked = candidates.map(person => ({ id:person.id, shared:sharedMoments(person.id).length }))
        .sort((a,b) => b.shared - a.shared);
      return ranked[0]?.shared ? ranked[0].id : (candidates[0]?.id || null);
    })();
    tabs.replaceChildren();
    candidates.forEach(person => {
      const tab = makeElement('button');
      tab.type = 'button';
      tab.dataset.friend = person.id;
      tab.setAttribute('aria-selected', String(person.id === chosen));
      tab.setAttribute('role', 'tab');
      if (person.avatar) {
        const image = makeElement('img');
        image.src = person.avatar; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        tab.append(image);
      } else tab.append(makeElement('span', 'companion-initial', [...person.name][0] || '旅'));
      tab.append(makeElement('span', '', person.name));
      tabs.append(tab);
    });
    const moments = sharedMoments(chosen);
    $('#friends-shared').textContent = String(moments.length);
    listEl.replaceChildren();
    moments.forEach(moment => {
      const item = makeElement('li');
      const button = makeElement('button', 'friends-place');
      button.type = 'button';
      button.append(makeElement('span', 'friends-place-name', moment.name));
      button.dataset.placeName = moment.name;
      if (moment.place) {
        button.addEventListener('click', () => {
          const cat = moment.place.category;
          if (cat && cat !== category) { chooseCategory(cat); }
          selectPlace(moment.place.id, true, true);
        });
      }
      if (moment.byThem && !moment.byMe) item.append(makeElement('span', 'friends-who', '對方紀錄'));
      const time = makeElement('time', '', printedDate(moment.month));
      time.dateTime = moment.month;
      item.append(button, time);
      listEl.append(item);
    });
    empty.hidden = moments.length > 0;
    if (!moments.length) {
      empty.textContent = candidates.length
        ? '還沒有共同去過的地方。蓋章時標記旅伴，或等對方也蓋下同一個月份。'
        : '還沒有其他旅人。把這個頁面分享給朋友，登入後就能一起蓋章。';
    }
  }
  $('#friends-tabs').addEventListener('click', event => {
    const button = event.target.closest('button[data-friend]');
    if (!button) return;
    friendSelection = button.dataset.friend;
    renderFriends();
  });

  chooseCategory('countries');
  renderAccount();
  // On a signed-out visit, show the browser's own records while the cloud loads.
  if (account) account.init().then(() => {
    if (!signedIn()) { atlasAccount.mode = account.mode; refreshAll(); }
    else { applyAccount(); refreshAll(); writeCache(); }
  });
})();
