/* Run from the repository root: node scripts/test-tea-quiz.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const base = pathToFileURL(path.join(__dirname, '../personal/tea-quiz/')) + '/';
  const { TEAS, TEA_FAMILIES } = await import(base + 'data.js');
  const { QUESTIONS, recommend, encodeAnswers, decodeAnswers, sanitizeAnswers, missingRequired } = await import(base + 'quiz.js');
  const ids = new Set(TEAS.map((t) => t.id));
  assert.equal(ids.size, TEAS.length);
  assert.equal(QUESTIONS.length, 7);
  assert.equal(TEAS.filter((t) => t.family === 'wakoucha').length, 6);
  for (const tea of TEAS) {
    assert.ok(TEA_FAMILIES[tea.family], tea.id);
    for (const dim of ['body', 'viscosity', 'umami', 'sweetness', 'astringency', 'roast', 'aroma']) {
      assert.ok(Number.isFinite(tea.taste[dim]) && tea.taste[dim] >= 0 && tea.taste[dim] <= 5, `${tea.id}.${dim}`);
    }
    assert.ok(tea.sources.every((url) => new URL(url).protocol === 'https:'), tea.id);
    assert.ok(tea.aromaFamily.length, tea.id);
    /* 結果卡只講「這款茶以什麼聞名」，而且是單句：中英各一句、句尾收掉、中間不再有句號 */
    for (const key of ['knownForZh', 'knownForEn']) {
      const line = tea[key];
      assert.ok(typeof line === 'string' && line.trim().length > 12, `${tea.id}.${key}`);
      assert.equal(line.trim(), line, `${tea.id}.${key} has stray whitespace`);
      const body = line.trim().replace(/[。.!?！？]$/, '');
      assert.ok(!/[。.!?！？]/.test(body), `${tea.id}.${key} must stay one sentence`);
      assert.ok(!/推薦|因為你|你的答案|recommend/i.test(line), `${tea.id}.${key} must not explain the recommendation`);
    }
    if (tea.family === 'wakoucha') {
      assert.equal(tea.caffeine.status, 'contains');
      assert.equal(tea.caffeine.mgPer100ml, null, `${tea.id}: category reference is not a product measurement`);
      assert.ok(!tea.regionZh.includes('／'), `${tea.id}: one origin per recommendation`);
    }
  }
  const answer = (indices) => Object.fromEntries(QUESTIONS.map((q, i) => [q.id, q.options[indices[i]].id]));
  const routes = [
    { name: 'milk tea', indices: [4, 4, 3, 2, 3, 0, 0], top: 'T16', family: 'wakoucha' },
    { name: 'honey aroma', indices: [2, 2, 2, 0, 0, 1, 0], top: 'T15' },
    { name: 'light wakoucha', indices: [0, 0, 0, 0, 3, 0, 0], top: 'T18' },
    { name: 'matcha', indices: [0, 1, 2, 1, 4, 1, 0], top: 'T09' },
    { name: 'roasted', indices: [3, 3, 0, 1, 0, 3, 0], top: 'T11' }
  ];
  for (const route of routes) {
    const report = recommend(answer(route.indices));
    assert.equal(report.results.length, 3, route.name);
    if (route.top) assert.equal(report.results[0].tea.id, route.top, route.name);
    if (route.family) assert.ok(report.results.every((r) => r.tea.family === route.family), route.name);
    for (const row of report.results) {
      /* 結果路徑不解釋推薦原因，也不再輸出沖泡句；卡牌只講這款茶以什麼聞名 */
      assert.equal(row.reasons, undefined, `${route.name}: no recommendation rationale`);
      assert.equal(row.brewNote, undefined, `${route.name}: no brewing note`);
      assert.ok(row.tea.knownForZh.length > 12 && row.tea.knownForEn.length > 12, route.name);
    }
  }
  const strict = recommend(answer([0, 0, 0, 0, 0, 0, 2]));
  assert.ok(strict.results.every((r) => r.tea.caffeine.status === 'verified_free'));
  assert.equal(decodeAnswers('3411321'), null, 'old quiz must not be silently remapped');
  assert.equal(decodeAnswers('v2.9999999'), null);
  assert.equal(decodeAnswers('v2.1------'), null, 'missing required answers');
  assert.equal(decodeAnswers('v2.1111---'), null, 'method is required');
  assert.deepEqual(sanitizeAnswers({ q1: 'green', q2: 'bogus', extra: 'x' }), { q1: 'green' });
  assert.equal(missingRequired({ q1: 'green' }).length, 4);
  const optional = answer([0, 0, 0, 0, 0, 0, 0]);
  delete optional.q6; delete optional.q7;
  assert.deepEqual(decodeAnswers(encodeAnswers(optional)), optional);

  const topHits = new Set();
  const allHits = new Set();
  let combinations = 0;
  function walk(index, answers) {
    if (index === QUESTIONS.length) {
      combinations += 1;
      const report = recommend(answers);
      const again = recommend(answers);
      assert.deepEqual(report.ranked, again.ranked);
      assert.equal(new Set(report.results.map((r) => r.tea.id)).size, report.results.length);
      assert.equal(report.results.length, answers.q7 === 'strict' ? 1 : 3);
      topHits.add(report.results[0].tea.id);
      report.results.forEach((r) => allHits.add(r.tea.id));
      if (answers.q5 === 'milk' && answers.q7 !== 'strict') {
        assert.ok(report.results.every((r) => r.tea.family === 'wakoucha'));
      }
      if (answers.q7 === 'strict') assert.ok(report.results.every((r) => r.tea.caffeine.status === 'verified_free'));
      return;
    }
    for (const option of QUESTIONS[index].options) walk(index + 1, { ...answers, [QUESTIONS[index].id]: option.id });
  }
  walk(0, {});
  assert.equal(combinations, 18000);
  for (const tea of TEAS.filter((t) => t.family === 'wakoucha')) assert.ok(allHits.has(tea.id), `${tea.id} must be reachable`);
  assert.ok(topHits.size >= 14, `unexpectedly narrow recommendation coverage: ${topHits.size}`);
  /* 引擎不再生產任何文案：一筆結果只有茶款、分數、細項、角色與信心標記 */
  const shape = recommend(answer([1, 2, 2, 0, 4, 1, 0])).results.map((r) => Object.keys(r).sort().join(','));
  assert.ok(shape.every((keys) => keys === 'confidence,parts,role,score,tea'), `unexpected result shape: ${shape[0]}`);
  const css = fs.readFileSync(path.join(__dirname, '../personal/tea-quiz/tea.css'), 'utf8');
  assert.match(css, /#app:focus[\s\S]*?#app:focus-visible[\s\S]*?\{[^}]*outline:\s*none/, 'programmatic #app focus must not draw a page border');
  assert.match(css, /\[tabindex="-1"\]:focus-visible[\s\S]*?\{[^}]*outline:\s*none/, 'tabindex="-1" targets must not draw a focus-visible outline');
  console.log(`PASS: ${TEAS.length} teas, 6 wakoucha, ${combinations} deterministic answer combinations, ${topHits.size} top-match styles; one-sentence known-for lines, no recommendation rationale, routing, caffeine and v2 sharing checked.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
