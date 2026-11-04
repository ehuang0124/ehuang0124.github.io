(() => {
  'use strict';

  const world = window.TravelAtlasWorld;
  const source = window.TravelAtlasPlaces;
  const stateSource = window.TravelAtlasStates;
  if (!world || !source || !stateSource) return;

  const $ = selector => document.querySelector(selector);
  const svgNS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'eva.travel.stamp-atlas.v1';
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
  let data = loadState();
  data.customCities.forEach(city => catalogue.cities.push(cityFromCustom(city)));
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
    catch { $('#backup-feedback').textContent = '無法儲存；請匯出備份。'; return false; }
  }
  // Persist normalized month-only records on load so day-precision backups migrate once.
  saveState();
  function visitsOf(place) { return data.visits[place.key] || []; }
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
  function stampCount(cat) { return catalogue[cat].filter(isStamped).length; }
  function updateCounters() {
    let total = 0;
    CATEGORY_ORDER.forEach(cat => {
      const stamped = stampCount(cat);
      total += stamped;
      $(`#tab-count-${cat}`).textContent = `${stamped} / ${catalogue[cat].length}`;
    });
    $('#passport-count').textContent = total;
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
  // Engraved, one-ink landmark vignettes for the postcard impression. The motifs are
  // editorial shorthand, not a claim that every destination has only one identity.
  function renderStampArt(place) {
    const key = `${place.en || ''} ${place.zh || ''}`.toLowerCase();
    const motifs = [
      [/kyoto|京都/, 'pagoda', '古都・五重塔'], [/tokyo|東京/, 'tower', '東京鐵塔'], [/paris|巴黎/, 'tower', '艾菲爾鐵塔'],
      [/new york|紐約/, 'skyline', '城市天際線'], [/fuji|富士|hakone|箱根/, 'fuji', '富士山'],
      [/taipei|臺北|台北/, 'tower', '城市地標'], [/hawai|夏威夷|okinawa|沖繩/, 'wave', '島嶼海岸'],
      [/yosemite|優勝美地/, 'mountain', '山谷與群峰'], [/banff|班夫|rocky|洛磯/, 'mountain', '山岳風景'],
      [/sakura|cherry|櫻/, 'flower', '花枝'], [/national park|國家公園/, 'mountain', '山野風景']
    ];
    const found = motifs.find(([pattern]) => pattern.test(key));
    const type = found?.[1] || (place.category === 'jp' || place.category === 'na' ? 'mountain' : 'sun');
    const drawings = {
      fuji:'<path d="M8 45 38 9l12 15 8-10 34 31Z"/><path d="m30 19 8-10 9 11-7-3-5 4-4-3Zm29 4 4-5 5 7-5-2-3 2Z"/><path d="M5 47h90M12 51h76"/>',
      pagoda:'<path d="M50 7v39M31 14h38L50 7Zm-7 12h52L50 14Zm-6 12h64L50 26Zm-6 12h76L50 38Zm29-34v-5"/><path d="M39 46v-9h22v9M34 52h32"/>',
      tower:'<path d="M50 7 43 45h14L50 7Zm-8 13h16M45 34h10M39 45h22M46 26h8M36 52h28"/><circle cx="50" cy="8" r="2"/>',
      skyline:'<path d="M9 48V28h12v20m4 0V17h17v31m4 0V9h14v39m4 0V25h13v23m4 0V33h14v15M6 51h88"/><path d="M31 22v3m8-3v3m-8 5v3m8-3v3m13-17v3m0 6v3"/>',
      wave:'<path d="M6 35q13-13 26 0t26 0 26 0 12 0M6 44q13-13 26 0t26 0 26 0 12 0"/><path d="M35 29q-4-14 13-22 17 9 12 22M50 9v20M12 25q8-11 16-1M73 20q8-11 16-1"/>',
      flower:'<path d="M50 29q-2 11 0 22m0-12q-12-12-20-2 8 12 20 8m0-2q12-13 20-2-8 12-20 8"/><path d="M50 27c-8-5-5-13 0-15 5 2 8 10 0 15Zm-2-7c-10 1-12-7-8-12 6 0 11 5 8 12Zm4 0c10 1 12-7 8-12-6 0-11 5-8 12Z"/><path d="M10 52h80"/>',
      mountain:'<path d="m7 48 25-31 14 18 12-15 35 28H7Z"/><path d="m25 26 7-9 7 9-7-3Zm27 0 6-6 7 8-7-3-3 3ZM6 51h88"/>',
      sun:'<circle cx="50" cy="25" r="12"/><path d="M50 5v6m0 28v6M30 25h-6m52 0h-6M36 11l5 5m18 18 5 5m0-28-5 5M41 34l-5 5M8 49q12-9 24 0t24 0 24 0 12 0M8 53h84"/>'
    };
    const svg = document.getElementById('stamp-art');
    svg.innerHTML = drawings[type];
    svg.setAttribute('aria-label', found?.[2] || '旅行地景插畫');
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
    $('#history-count').textContent = `${stamps.length} 枚戳章`;
    const historyList = $('#history-list');
    historyList.replaceChildren();
    [...stamps].reverse().forEach(date => {
      const row = makeElement('li');
      const time = makeElement('time', '', printedDate(date));
      time.dateTime = date;
      const remove = makeElement('button', '', '×');
      remove.type = 'button';
      remove.dataset.date = date;
      remove.setAttribute('aria-label', `移除${place.zh} ${printedDate(date)} 的戳章`);
      row.append(time, remove);
      historyList.append(row);
    });
    $('#delete-city').hidden = !place.custom;
    if (currentMessage?.key === place.key) showMessage(currentMessage.message, currentMessage.type);
    else {
      currentMessage = null;
      showMessage(stamps.length ? '選擇另一個月份記錄到訪。' : '選月份後蓋章。');
    }
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
    if (!visitsOf(selectedPlace()).length) $('#stamp-face-date').textContent = printedDate(valid ? dateInput.value : '');
  });
  $('#stamp-button').addEventListener('click',() => {
    const date = dateInput.value;
    if (!validDate(date) || !dateInput.checkValidity()) {dateInput.setAttribute('aria-invalid','true');showMessage('請選擇有效月份（不能晚於本月）。','error');dateInput.focus();return;}
    dateInput.setAttribute('aria-invalid','false');
    const place = selectedPlace();
    const stamps = visitsOf(place);
    if (stamps.includes(date)) {showMessage('這個月已蓋過章。','error');return;}
    data.visits[place.key] = [...stamps,date].sort();
    const saved = saveState();
    refreshAfterStamp(saved ? `已記錄 ${printedDate(date)}。` : '無法儲存；請匯出備份。','success');
    const face = $('#stamp-face');
    face.classList.remove('fresh');
    void face.offsetWidth;
    face.classList.add('fresh');
    face.addEventListener('animationend',() => face.classList.remove('fresh'),{once:true});
  });
  $('#history-list').addEventListener('click',event => {
    const button = event.target.closest('button[data-date]');
    if (!button) return;
    const place = selectedPlace(), date = button.dataset.date;
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
    try {
      if (file.size > 2_000_000) throw new Error('備份檔案過大（上限 2 MB）。');
      const raw = JSON.parse(await file.text());
      if (raw?.version !== 1 || !raw.visits || !Array.isArray(raw.customCities)) throw new Error('不是這張地圖的戳章備份，或版本不相容。');
      const incoming = cleanState(raw);
      const existingIds = new Set(data.customCities.map(city => city.id));
      incoming.customCities.forEach(city => {if (!existingIds.has(city.id)) {data.customCities.push(city);catalogue.cities.push(cityFromCustom(city));}});
      for (const [key,dates] of Object.entries(incoming.visits)) data.visits[key] = [...new Set([...(data.visits[key] || []),...dates])].sort();
      const saved = saveState();
      updateCategoryUI();renderRegions();renderDetail();renderMap();renderDirectory();
      $('#backup-feedback').textContent = saved ? `備份已匯入並與原有紀錄合併（${Object.values(incoming.visits).reduce((sum,dates)=>sum+dates.length,0)} 枚戳章）。` : '匯入完成，但無法儲存；請另存備份。';
    } catch (error) { $('#backup-feedback').textContent = `匯入失敗：${error.message}`; }
    finally { event.target.value = ''; }
  });

  chooseCategory('countries');
})();
