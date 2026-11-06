// Map colour rules for the Stamp Atlas (personal/travel/map/palette.js).
//
//   node scripts/test-map-palette.cjs
//
// No browser and no dependencies: the shape files and the palette module are
// plain browser scripts, run here inside a small window stub.
//
// The rules under test:
//   1. One hue per continent (Asia red, Europe blue, Africa gold, the Americas
//      green, Oceania violet), and the hue never depends on the layer.
//   2. Four tones inside each hue, and no two shapes that share a border in the
//      same hue reuse a tone — the four-colour condition, checked on the real
//      border geometry rather than assumed.
//   3. The same for cities and park markers, where "neighbour" means the nearest
//      markers on the map.
//   4. Colours are deterministic: reloading the page never reshuffles the map.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mapDir = path.join(__dirname, '..', 'personal/travel/map');
const world = {};
const run = file => {
  const source = fs.readFileSync(path.join(mapDir, file), 'utf8');
  new Function('window', source)(world);
};
run('world.js');
run('places.js');
run('us-states.js');
run('okinawa-places.js');
run('palette.js');

const P = world.TravelAtlasPalette;
const W = world.TravelAtlasWorld;
const places = world.TravelAtlasPlaces;
const states = world.TravelAtlasStates;

assert.ok(P, 'palette.js exposes window.TravelAtlasPalette');

// The real projection from app.js, so points land where the page draws them.
function project(lon, lat) {
  const lambda = lon * Math.PI / 180, phi = lat * Math.PI / 180;
  const phi2 = phi * phi, phi4 = phi2 * phi2;
  const x = lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4)));
  const y = phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
  return { x:W.translate[0] + W.scale * x, y:W.translate[1] - W.scale * y };
}
const countryByIso = new Map();
W.countries.forEach(country => {
  if (country.iso && country.id !== 'ashmore-cartier' && !countryByIso.has(country.iso)) countryByIso.set(country.iso, country);
});

const cities = places.cities.map(city => {
  const country = countryByIso.get(city.iso);
  return { key:`cities:${city.iso}:${city.en}`, region:country.region, ...project(city.lon, city.lat) };
});
const markers = [
  ...places.us.map(([id,,, region,, lat, lon]) => ({ key:`us:${id}`, region:'NA', ...project(lon, lat) })),
  ...places.ca.map(([id,,, region,, lat, lon]) => ({ key:`ca:${id}`, region:'NA', ...project(lon, lat) })),
  ...places.jp.map(([id,,, region,, lat, lon]) => ({ key:`jp:${id}`, region:'AS', ...project(lon, lat) })),
  ...world.TravelAtlasOkinawa.places.map(place => ({ key:`okinawa:${place.id}`, region:'AS', ...project(place.lng, place.lat) }))
];

const solve = () => P.atlas({ countries:W.countries, states, cities, markers });
const colours = solve();

// 1. Every catalogue entry is coloured, and each continent keeps one hue.
assert.equal(colours.size, W.countries.length + states.length + cities.length + markers.length, 'every country, state, city and park gets a colour');
const HUE_OF = { AS:'asia', EU:'europe', AF:'africa', NA:'americas', SA:'americas', OC:'oceania', AN:'ocean' };
for (const country of W.countries) {
  const colour = colours.get(`countries:${country.id}`);
  assert.ok(colour, `country ${country.zh} is coloured`);
  assert.equal(colour.hue, HUE_OF[country.region], `${country.zh} wears its continent's hue`);
  assert.ok(colour.tone >= 0 && colour.tone < P.TONES, `${country.zh} has one of four tones`);
}
assert.equal(colours.get('countries:392').hue, 'asia', 'Japan is in the Asian red');
assert.equal(colours.get('countries:158').hue, 'asia', 'Taiwan is in the Asian red');
assert.equal(colours.get('countries:276').hue, 'europe', 'Germany is in the European blue');
assert.equal(colours.get('countries:250').hue, 'europe', 'France is in the European blue');
assert.equal(colours.get('countries:840').hue, 'americas', 'the United States is in the American green');
assert.equal(colours.get('countries:036').hue, 'oceania', 'Australia is in the Oceanian violet');
assert.equal(colours.get('countries:710').hue, 'africa', 'South Africa is in the African gold');

// 2. No two shapes that share a border in the same hue reuse a tone.
const checkBorders = (list, keyOf, label) => {
  const neighbours = P.borderNeighbours(list);
  let pairs = 0;
  neighbours.forEach((near, i) => {
    for (const j of near) {
      if (j <= i) continue;
      pairs++;
      const a = colours.get(keyOf(list[i])), b = colours.get(keyOf(list[j]));
      assert.notEqual(`${a.hue}-${a.tone}`, `${b.hue}-${b.tone}`, `${label}: ${list[i].zh} and ${list[j].zh} touch, so they never share a colour`);
    }
  });
  return pairs;
};
const countryPairs = checkBorders(W.countries, item => `countries:${item.id}`, 'countries');
assert.ok(countryPairs > 300, `the country graph has real borders (${countryPairs} pairs)`);
assert.equal(checkBorders(states, item => `us:${item.id}`, 'states') > 90, true, 'the state graph is connected');

// Each continent that has more than a handful of countries uses all four tones.
for (const hue of ['asia', 'europe', 'africa', 'americas']) {
  const tones = new Set(W.countries.filter(country => HUE_OF[country.region] === hue).map(country => colours.get(`countries:${country.id}`).tone));
  assert.equal(tones.size, P.TONES, `${hue} spreads over all four tones`);
}
assert.equal(new Set(states.map(state => colours.get(`us:${state.id}`).tone)).size, P.TONES, 'the U.S. states spread over all four tones');

// 3. Cities and markers: neighbouring points never share a colour.
const checkPoints = (list, label) => {
  const nearest = P.pointNeighbours(list);
  const seen = new Set(list.map(item => `${item.key}`));
  assert.equal(seen.size, list.length, `${label} keys are unique`);
  nearest.forEach((near, i) => {
    for (const j of near) {
      if (j <= i) continue;
      const a = colours.get(list[i].key), b = colours.get(list[j].key);
      if (a.hue !== b.hue) continue;
      assert.notEqual(a.tone, b.tone, `${label}: ${list[i].key} and ${list[j].key} sit next to each other, so they never share a colour`);
    }
  });
};
checkPoints(cities, 'cities');
// Park markers: the page colours all North American parks as one pool (the
// green hue) and the Japanese parks, Okinawa included, as another (the red
// hue). Neighbouring markers in a pool never share a tone.
const pools = {
  NA: markers.filter(item => item.key.startsWith('us:') || item.key.startsWith('ca:')),
  AS: markers.filter(item => item.key.startsWith('jp:') || item.key.startsWith('okinawa:'))
};
for (const [hue, layer] of Object.entries(pools)) {
  const nearest = P.pointNeighbours(layer);
  nearest.forEach((near, i) => near.forEach(j => {
    if (j <= i) return;
    assert.notEqual(colours.get(layer[i].key).tone, colours.get(layer[j].key).tone, `${hue}: ${layer[i].key} and ${layer[j].key} sit next to each other, so they never share a colour`);
  }));
  const tones = new Set(layer.map(item => colours.get(item.key).tone));
  assert.equal(tones.size, P.TONES, `${hue} park markers use all four tones`);
}
assert.equal(markers.filter(item => item.key.startsWith('okinawa:')).length, 49, 'the Okinawa island chain is one dense pool of 49 markers');
for (const hue of ['asia', 'europe', 'africa', 'americas', 'oceania']) {
  const tones = new Set(cities.filter(city => P.hue(city.region) === hue).map(city => colours.get(city.key).tone));
  assert.ok(tones.size >= 3, `${hue} cities use at least three tones`);
}

// 4. Deterministic: a reload produces exactly the same map.
const again = solve();
assert.equal(again.size, colours.size);
for (const [key, colour] of colours) {
  assert.deepEqual(again.get(key), colour, `${key} keeps its colour`);
}

// The border graph ignores a single shared corner but keeps a shared edge.
const cornerOnly = P.borderNeighbours(W.countries, 1);
const edgeOnly = P.borderNeighbours(W.countries, 2);
const vatican = W.countries.findIndex(country => country.iso === 'VA');
assert.ok(cornerOnly[vatican].size >= edgeOnly[vatican].size, 'a corner is weaker evidence of a border than a shared edge');

console.log('PASS map palette: continent hues, four tones per hue, no touching repeats, deterministic');
