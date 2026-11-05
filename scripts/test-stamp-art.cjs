// Node-only regression test for the destination postcard plates.
// Run: node scripts/test-stamp-art.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mapDir = path.join(root, 'personal/travel/map');
const context = { window: {} };
vm.createContext(context);
for (const file of ['world.js', 'places.js', 'us-states.js', 'stamp-art.js']) {
  vm.runInContext(fs.readFileSync(path.join(mapDir, file), 'utf8'), context, { filename: file });
}
const world = context.window.TravelAtlasWorld;
const places = context.window.TravelAtlasPlaces;
const states = context.window.TravelAtlasStates;
const atlas = context.window.TravelAtlasStampArt;
assert(atlas, 'stamp-art.js must publish window.TravelAtlasStampArt');

const slug = text => text.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const regionOfCountry = new Map(world.countries.map(c => [c.iso, c.region]));
const catalogue = [
  ...world.countries.map(c => ({ category: 'countries', iso: c.iso, id: c.id, region: c.region, zh: c.zh })),
  ...places.cities.map(c => ({ category: 'cities', iso: c.iso, id: `${slug(c.en)}-${c.iso.toLowerCase()}`, region: regionOfCountry.get(c.iso) || 'AS', zh: c.zh })),
  ...places.us.map(p => ({ category: 'na', key: `us:${p[0]}`, id: p[0], region: `na-us-${p[3]}`, zh: p[2] })),
  ...states.map(s => ({ category: 'na', isState: true, abbr: s.abbr, key: `us:${s.id}`, id: s.id, region: `na-us-${s.region}`, zh: s.zh })),
  ...places.ca.map(p => ({ category: 'na', key: `ca:${p[0]}`, id: p[0], region: `na-ca-${p[3]}`, zh: p[2] })),
  ...places.jp.map(p => ({ category: 'jp', key: `jp:${p[0]}`, id: p[0], region: p[3], zh: p[2] }))
];
assert.equal(catalogue.length, 608, 'the destination index must cover every catalogue entry');

// Every named plate resolves to a real drawing and a known kind.
const ids = new Set();
for (const motif of Object.values(atlas.motifs)) {
  assert(!ids.has(motif.id), `duplicate plate id ${motif.id}`);
  ids.add(motif.id);
  assert(motif.label && typeof motif.label === 'string', `${motif.id} needs a caption`);
  assert(atlas.kinds.includes(motif.kind), `${motif.id} has an unknown kind`);
  assert(atlas.art[motif.art], `${motif.id} points at a missing drawing ${motif.art}`);
  const plate = atlas.art[motif.art];
  assert.equal(plate.length, 3, `${motif.art} must have three tonal layers`);
  assert(plate.every(layer => typeof layer === 'string' && layer.length), `${motif.art} has an empty layer`);
  const markup = atlas.render(motif);
  for (const tone of ['t-1', 't-2', 't-3']) assert(markup.includes(`class="${tone}"`), `${motif.id} is missing the ${tone} layer`);
  assert(!/<script|on\w+\s*=/i.test(markup), `${motif.id} contains unsafe markup`);
}

// Every curated destination points at a real plate.
for (const [name, table] of Object.entries({
  country: atlas.country, city: atlas.city, usPark: atlas.usPark,
  caPark: atlas.caPark, jpPark: atlas.jpPark, state: atlas.state, region: atlas.region
})) {
  for (const [key, id] of Object.entries(table)) assert(atlas.motifs[id], `${name} ${key} points at a missing plate ${id}`);
}

// Famous local scenery, flowers, figures and buildings are assigned deliberately.
const expected = [
  [{ category: 'countries', iso: 'JP' }, 'fuji'],
  [{ category: 'countries', iso: 'FR' }, 'eiffel'],
  [{ category: 'countries', iso: 'NL' }, 'windmill'],
  [{ category: 'countries', iso: 'CA' }, 'maple'],
  [{ category: 'countries', iso: 'EG' }, 'pyramid'],
  [{ category: 'countries', iso: 'AU' }, 'kangaroo'],
  [{ category: 'countries', iso: 'IN' }, 'taj'],
  [{ category: 'countries', iso: 'IE' }, 'shamrock'],
  [{ category: 'cities', id: 'kyoto-jp', iso: 'JP' }, 'geisha'],
  [{ category: 'cities', id: 'paris-fr', iso: 'FR' }, 'eiffel'],
  [{ category: 'cities', id: 'amsterdam-nl', iso: 'NL' }, 'tulip'],
  [{ category: 'cities', id: 'venice-it', iso: 'IT' }, 'gondola'],
  [{ category: 'cities', id: 'sydney-au', iso: 'AU' }, 'opera'],
  [{ category: 'na', key: 'us:yell', id: 'yell' }, 'geyser'],
  [{ category: 'na', key: 'us:grca', id: 'grca' }, 'canyon'],
  [{ category: 'na', key: 'ca:banff', id: 'banff' }, 'lake'],
  [{ category: 'na', isState: true, abbr: 'CA' }, 'redwood'],
  [{ category: 'na', isState: true, abbr: 'AZ' }, 'cactus'],
  [{ category: 'jp', id: 'fuji' }, 'fuji'],
  [{ category: 'jp', id: 'yoshino' }, 'sakura'],
  [{ category: 'jp', id: 'kushiro' }, 'crane']
];
for (const [place, id] of expected) assert.equal(atlas.find(place).id, id, `${place.id || place.abbr || place.iso} should use ${id}`);

// All 608 destinations get a stable, captionable plate. Region-only fallbacks
// are labelled as such instead of implying a destination-specific landmark.
const scopes = {};
const used = new Set();
for (const place of catalogue) {
  const motif = atlas.find(place);
  assert(motif, `${place.key || place.id} has no plate`);
  assert(atlas.art[motif.art], `${place.id} resolves to a missing drawing`);
  assert(atlas.kinds.includes(motif.kind));
  assert(['place', 'country', 'region'].includes(motif.scope));
  assert.equal(atlas.find(place).id, motif.id, `${place.id} is not deterministic`);
  const caption = atlas.label(place, motif);
  assert(caption.includes(motif.label));
  assert(motif.scope === 'region' ? caption.startsWith('地區意象') : caption.includes(place.zh));
  scopes[motif.scope] = (scopes[motif.scope] || 0) + 1;
  used.add(motif.id);
}
assert(scopes.place > 500, 'most destinations should have their own curated plate');
assert(scopes.region < 20, 'only a few small territories should need a regional plate');
assert.deepEqual([...atlas.kinds].filter(kind => [...used].some(id => atlas.motifs[id].kind === kind)), [...atlas.kinds], 'all four icon families must be used');
assert(used.size >= 95, 'the collection should use most of its named plates');
console.log(`PASS stamp art: ${catalogue.length} destinations, ${used.size} named plates, ${Object.keys(atlas.art).length} engravings, four tonal layers, scopes ${JSON.stringify(scopes)}`);
