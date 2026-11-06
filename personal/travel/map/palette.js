// Map colour for the Stamp Atlas.
//
// Two rules, both deterministic so a place keeps its colour on every device:
//
// 1. One continent, one hue. Asia is red, Europe blue, Africa gold, the
//    Americas green and Oceania violet; every colour is a paper-and-ink tint
//    that sits under the atlas's own crimson and navy rather than competing
//    with them.
// 2. Four tones inside a hue. Neighbouring shapes in the same continent draw
//    different steps of that hue (0 = lightest … 3 = darkest), so land reads as
//    separate countries instead of one wash. Four tones are always enough: the
//    largest group (the 58 African countries) needs four, and the solver below
//    verifies no two shapes that touch ever share a tone.
//
// Countries and U.S. states touch by land, so their neighbours come from the
// shared border vertices in the shape data. Cities and park markers are points,
// where "neighbour" means "close on screen": two markers are neighbours unless
// a third marker sits between them, which is the same four-tone idea applied to
// a scatter of points.
window.TravelAtlasPalette = (() => {
  const FAMILIES = {
    AS: { hue:'asia', zh:'亞洲' },
    EU: { hue:'europe', zh:'歐洲' },
    AF: { hue:'africa', zh:'非洲' },
    NA: { hue:'americas', zh:'美洲' },
    SA: { hue:'americas', zh:'美洲' },
    OC: { hue:'oceania', zh:'大洋洲' },
    AN: { hue:'ocean', zh:'極地海域' }
  };
  const HUE_NAMES = { asia:'紅', europe:'藍', africa:'金', americas:'綠', oceania:'紫', ocean:'灰' };
  const TONES = 4;
  const family = region => FAMILIES[region] || FAMILIES.AN;
  const hue = region => family(region).hue;
  const label = region => family(region).zh;

  function vertices(d) {
    return new Set(String(d).match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g) || []);
  }
  function coordinates(d) {
    const out = [];
    const pattern = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
    let match;
    while ((match = pattern.exec(String(d)))) out.push({ x:+match[1], y:+match[2] });
    return out;
  }

  // Shapes that share at least `minShared` border vertices are neighbours; one
  // shared vertex is only a corner (Chiricahua used to be dropped that way).
  function borderNeighbours(list, minShared = 2) {
    const index = new Map();
    list.forEach((item, i) => {
      for (const vertex of vertices(item.d)) {
        if (!index.has(vertex)) index.set(vertex, []);
        index.get(vertex).push(i);
      }
    });
    const shared = list.map(() => new Map());
    for (const group of index.values()) {
      if (group.length < 2) continue;
      for (const a of group) for (const b of group) {
        if (a !== b) shared[a].set(b, (shared[a].get(b) || 0) + 1);
      }
    }
    return list.map((_, i) => new Set([...shared[i]].filter(([, count]) => count >= minShared).map(([j]) => j)));
  }

  // Points are neighbours unless a third point sits between them: the classic
  // point-graph rule, which keeps the graph planar enough for four tones.
  function pointNeighbours(points) {
    const n = points.length;
    const graph = points.map(() => new Set());
    for (let i = 0; i < n; i++) {
      const a = points[i];
      for (let j = i + 1; j < n; j++) {
        const b = points[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const span = dx * dx + dy * dy;
        if (span === 0) { graph[i].add(j); graph[j].add(i); continue; }
        let blocked = false;
        for (let k = 0; k < n && !blocked; k++) {
          if (k === i || k === j) continue;
          const p = points[k];
          const ax = p.x - a.x, ay = p.y - a.y;
          if (ax * dx + ay * dy < 0) continue;          // behind A
          if (ax * ax + ay * ay >= span) continue;      // beyond B
          const bx = p.x - b.x, by = p.y - b.y;
          if (ax * bx + ay * by < 0) blocked = true;    // inside A–B circle
        }
        if (!blocked) { graph[i].add(j); graph[j].add(i); }
      }
    }
    return graph;
  }

  function serial(node) {
    return ((Math.imul(node + 1, 2654435761) >>> 0) >>> 8) % TONES;
  }

  // Proper colouring with no ink limit: each node takes the smallest ink its
  // neighbours are not already using.
  function pack(graph, nodes) {
    const inside = new Set(nodes);
    const inks = new Map();
    for (const node of nodes) {
      const taken = new Set([...graph[node]].filter(j => inside.has(j) && inks.has(j)).map(j => inks.get(j)));
      let ink = 0;
      while (taken.has(ink)) ink++;
      inks.set(node, ink);
    }
    return inks;
  }

  // Fold many inks into the four tones. Start from a balanced guess, then let
  // each ink move to whichever tone clashes with the fewest neighbours.
  function fold(graph, inks) {
    const inkNodes = new Map();
    for (const [node, ink] of inks) {
      if (!inkNodes.has(ink)) inkNodes.set(ink, []);
      inkNodes.get(ink).push(node);
    }
    // How many borders each pair of inks shares.
    const clashes = new Map();
    for (const [node, ink] of inks) {
      for (const other of graph[node]) {
        if (!inks.has(other)) continue;
        const neighbour = inks.get(other);
        if (neighbour === ink) continue;
        const key = ink < neighbour ? `${ink}:${neighbour}` : `${neighbour}:${ink}`;
        clashes.set(key, (clashes.get(key) || 0) + 1);
      }
    }
    const inkList = [...inkNodes.keys()];
    const size = ink => inkNodes.get(ink).length;
    const toneOf = new Map();
    const load = [0, 0, 0, 0];
    // Largest ink first takes the emptiest tone it can.
    [...inkList].sort((a, b) => size(b) - size(a) || a - b).forEach(ink => {
      let tone = 0;
      for (let step = 1; step < TONES; step++) if (load[step] < load[tone]) tone = step;
      toneOf.set(ink, tone);
      load[tone] += size(ink);
    });
    const cost = ink => {
      let total = 0;
      for (const [key, weight] of clashes) {
        const [a, b] = key.split(':').map(Number);
        if (a !== ink && b !== ink) continue;
        const pair = a === ink ? b : a;
        if (toneOf.has(pair) && toneOf.get(pair) === toneOf.get(ink)) total += weight;
      }
      return total;
    };
    // Hill-climb: an ink moves only when it strictly lowers the clashes.
    for (let pass = 0; pass < 24; pass++) {
      let moved = false;
      for (const ink of inkList) {
        const current = toneOf.get(ink), before = cost(ink);
        let bestTone = current, bestCost = before;
        load[current] -= size(ink);
        for (let step = 0; step < TONES; step++) {
          if (step === current) continue;
          toneOf.set(ink, step);
          const after = cost(ink);
          const balancing = after === bestCost && load[step] + size(ink) < load[bestTone] + (bestTone === current ? 0 : size(ink));
          if (after < bestCost || balancing) { bestCost = after; bestTone = step; }
        }
        toneOf.set(ink, bestTone);
        load[bestTone] += size(ink);
        if (bestTone !== current) moved = true;
      }
      if (!moved) break;
    }
    const tones = new Map();
    for (const [node, ink] of inks) tones.set(node, toneOf.get(ink));
    return tones;
  }

  // Greedy colouring in "most constrained first" order (saturation first, then
  // remaining degree). Inside one continent four tones are always enough. Among
  // the free steps, the least-used one wins, so a continent uses its whole
  // range instead of drifting pale.
  function toneGraph(graph, nodes) {
    const inside = new Set(nodes);
    const neighbours = i => [...graph[i]].filter(j => inside.has(j));
    const tones = new Map();
    const used = [0, 0, 0, 0];
    let guard = 0;
    while (tones.size < nodes.length) {
      if (++guard > nodes.length * 8 + 64) return null;
      let pick = null, pickSaturation = -1, pickDegree = -1;
      for (const node of nodes) {
        if (tones.has(node)) continue;
        const free = neighbours(node);
        const saturation = new Set(free.filter(j => tones.has(j)).map(j => tones.get(j))).size;
        const degree = free.filter(j => !tones.has(j)).length;
        if (saturation > pickSaturation || (saturation === pickSaturation && degree > pickDegree)) {
          pick = node; pickSaturation = saturation; pickDegree = degree;
        }
      }
      const taken = new Set(neighbours(pick).filter(j => tones.has(j)).map(j => tones.get(j)));
      let tone = -1;
      for (let step = 0; step < TONES; step++) {
        if (taken.has(step)) continue;
        if (tone < 0 || used[step] < used[tone]) tone = step;
      }
      if (tone < 0) return null;
      tones.set(pick, tone);
      used[tone]++;
    }
    return tones;
  }

  // Colours land within one hue. North and South America share the green hue,
  // so they are solved together: two touching countries drawn in the same green
  // still get different steps. Each hue group is coloured on its own, which
  // spreads the four tones over the shapes that actually touch.
  function assign(items, graph, groupOf = item => item.region) {
    const groups = new Map();
    items.forEach((item, i) => {
      const key = hue(groupOf(item) || 'AN');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    const tones = new Array(items.length).fill(0);
    for (const nodes of groups.values()) {
      const solved = toneGraph(graph, nodes);
      // An island touches no land, so nothing constrains it. Spread those
      // shapes over the four steps by a fixed serial instead of leaving a whole
      // ocean in one flat step.
      for (const node of nodes) {
        if (graph[node].size === 0) tones[node] = serial(node);
      }
      if (solved) {
        for (const [node, tone] of solved) if (graph[node].size) tones[node] = tone;
        continue;
      }
      // Only a shape group that genuinely needs more than four colours lands
      // here (a dense marker cluster such as the Okinawa island chain). Colour
      // it properly with as many inks as it needs, then fold those inks back
      // into four tones, giving each ink the tone its neighbours use least.
      for (const [node, tone] of fold(graph, pack(graph, nodes))) tones[node] = tone;
    }
    return tones.map((tone, i) => {
      const region = groupOf(items[i]) || 'AN';
      return { family:hue(region), hue:hue(region), tone };
    });
  }

  // Every map layer in the atlas, coloured in one pass: land shapes touch, so
  // they use shared borders; markers are points. Returns `key -> {family,hue,tone}`
  // for the catalogue's own keys (`countries:de`, `cities:town-fr`, `us:hale` …).
  // `entries` are already reduced to what colouring needs:
  //   countries / states: { id, region, d }  (shapes that share a border)
  //   cities / markers:   { key, region, x, y }  (points on the map)
  function atlas(entries) {
    const colours = new Map();
    const pairs = {
      countries: (entries.countries || []).filter(item => item && item.d),
      states: (entries.states || []).filter(item => item && item.d)
    };
    const land = (list, keyOf, groupOf) => {
      const tones = assign(list, borderNeighbours(list), groupOf);
      list.forEach((item, i) => colours.set(keyOf(item), tones[i]));
    };
    // Countries are grouped by their atlas region (AS/EU/AF/NA/SA/OC/AN), the
    // U.S. states all share one group, and both layers keep their storage keys.
    land(pairs.countries, item => `countries:${item.id}`, item => item.region);
    land(pairs.states, item => `us:${item.id}`, () => 'NA');
    const points = (list, keyOf, regionOf) => {
      const graph = pointNeighbours(list);
      const tones = assign(list, graph, regionOf);
      list.forEach((item, i) => colours.set(keyOf(item), tones[i]));
    };
    points(entries.cities || [], item => item.key, item => item.region);
    points(entries.markers || [], item => item.key, item => item.region);
    return colours;
  }

  return Object.freeze({
    FAMILIES, HUE_NAMES, TONES,
    family, hue, label, assign, atlas,
    borderNeighbours, pointNeighbours
  });
})();
