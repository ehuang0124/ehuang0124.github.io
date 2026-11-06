/* Japanese Tea Finder — app shell
 *
 * 五個畫面：首頁、Quiz、結果、茶款詳情（dialog）、探索目錄。
 * 沒有後端、沒有帳號、不蒐集個資；分享只把答案編碼放進網址。
 */

import { TEAS, TEA_FAMILIES, CAFFEINE_REFERENCE } from './data.js';
import { JAPAN_PATH } from './japan-path.js';
import {
  QUESTIONS, recommend, encodeAnswers, decodeAnswers, SCALE_LABELS
} from './quiz.js';

const STORE = 'tea.quiz.answers.v1';
const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const toastEl = document.getElementById('toast');

const state = {
  lang: document.documentElement.lang.startsWith('zh') ? 'zh' : 'en',
  answers: {},
  index: 0
};

/* ---------------- 文案 ---------------- */
const S = {
  zh: {
    heroEyebrow: '7 題 · 2 分鐘 · 不需要註冊',
    heroTitle: '找到適合你的<br><em>日本茶</em>。',
    heroLede: '從入口的柔滑、茶香，到喝完的餘韻，找一杯屬於你的茶。',
    start: '開始選茶',
    explore: '直接探索茶種',
    heroCap: '茶湯、茶田與器皿：先描述口感，再談茶種。',
    value1: '不用懂茶名：7 題問你想要的稠滑、甘甜、澀度與香氣。',
    value2: '三款茶，各自附上推薦原因、沖泡比例，還有在茶店說得出口的日文。',
    value3: '咖啡因只回答「含／經證實無／未知」，不估算、不猜。',
    catalogLink: '看全部茶款 →',
    progress: (i, n) => `第 ${i} 題／共 ${n} 題`,
    qPrefix: 'QUESTION',
    next: '下一題',
    prev: '上一題',
    seeResult: '看我的推薦',
    skip: '這題跳過',
    skippable: '可跳過',
    caffeineWhy: '選「必須無咖啡因」時，只會留下包裝明確標示「ノンカフェイン／カフェインレス」的商品；玄米茶、焙茶、冠茶都不算。沒有符合商品時，我們不會放寬條件。',
    resultEyebrow: '你的風味輪廓',
    resultTitle: '你的風味輪廓',
    resultLede: '以下是你的偏好，不是化驗值；分數 0–5 是你想要的口感位置。',
    tasteTitle: '偏好雷達',
    top1: '最推薦',
    top2: '相似路線',
    top3: '探索不同路線',
    roleExplore: '探索推薦',
    whyTitle: '推薦原因',
    flavourTitle: '風味標籤',
    caffeineTitle: '咖啡因',
    brewTitle: '建議沖泡',
    purchaseTitle: '在茶店可以這樣說',
    copyJa: '複製日文給茶店',
    copyShare: '分享我的茶譜',
    detail: '查看茶款詳情',
    restart: '換一種風格',
    editAnswers: '修改答案',
    again: '重新測驗',
    emptyTitle: '沒有符合的商品',
    emptyBody: '你選了「必須無咖啡因」。目前資料庫裡沒有包裝明確標示無咖啡因的商品，所以我們不放寬條件、也不拿焙茶或玄米茶充數。',
    emptyAction: '放寬咖啡因條件',
    caffeinated: '含咖啡因',
    caffeinatedUnknown: '含咖啡因 · 數值未知',
    caffeineFree: '經證實無咖啡因',
    caffeineUnknown: '咖啡因數值未知',
    whyLabel: '為什麼這樣標示？',
    refTitle: '官方標準浸出液參考值（mg／100 mL）',
    refNote: '不同茶類的浸出條件不同（玉露是 10 g 茶葉對 60 mL 水），數字不能直接當成同容量實際攝取量。',
    noMeasure: '這款沒有同產品、同沖泡條件的實測值，因此不顯示 mg 數字。',
    verified: '僅限包裝明確標示「ノンカフェイン／カフェインレス」的商品；依商品而定。',
    grams: '茶葉',
    water: '水',
    temp: '水溫',
    time: '時間',
    g: 'g',
    ml: 'mL',
    sec: '秒',
    perLabel: '每份',
    catalogTitle: '直接探索茶種',
    catalogLede: '十三款茶，依口感主軸排列。不想做測驗也可以直接看。',
    filterAll: '全部',
    countLabel: (n) => `${n} 款茶`,
    sourceLabel: '資料來源',
    editorialNote: '風味分數為編輯假設，需經品飲校準。',
    productDependent: '風味依商品而定，不以茶類名稱推定。',
    copied: '已複製',
    copyFail: '複製失敗，請手動選取',
    shareHint: '分享連結只包含你的答案，不含任何個人資料。',
    backHome: '回首頁',
    langLabel: '語言',
    foot: '風味分數是編輯標籤，不是化驗值；咖啡因數字是官方標準浸出液的類別參考值，不能當作同容量實際攝取量比較。'
  },
  en: {
    heroEyebrow: '7 questions · 2 minutes · no sign-up',
    heroTitle: 'Find the Japanese tea<br>that fits <em>you</em>.',
    heroLede: 'From the first silky sip to the finish — find the cup that is yours.',
    start: 'Start the quiz',
    explore: 'Browse the teas',
    heroCap: 'Texture first, tea names later.',
    value1: 'No tea knowledge needed: 7 questions about texture, sweetness, astringency and aroma.',
    value2: 'Three teas, each with a reason, a brew ratio, and the words to ask for it in Japanese.',
    value3: 'Caffeine is answered as contains / verified caffeine-free / unknown — never guessed.',
    catalogLink: 'See all 13 teas →',
    progress: (i, n) => `Question ${i} of ${n}`,
    qPrefix: 'QUESTION',
    next: 'Next',
    prev: 'Back',
    seeResult: 'See my teas',
    skip: 'Skip this one',
    skippable: 'optional',
    caffeineWhy: 'Choosing “must be caffeine-free” keeps only products whose packaging states ノンカフェイン / カフェインレス. Genmaicha, hōjicha and kabusecha never count. If nothing qualifies, we do not loosen the rule.',
    resultEyebrow: 'Your flavour profile',
    resultTitle: 'Your flavour profile',
    resultLede: 'These are your preferences, not measurements. 0–5 is where you want the tea to sit.',
    tasteTitle: 'Preference radar',
    top1: 'Best match',
    top2: 'Similar route',
    top3: 'Different direction',
    roleExplore: 'Sideways pick',
    whyTitle: 'Why this one',
    flavourTitle: 'Flavour tags',
    caffeineTitle: 'Caffeine',
    brewTitle: 'How to brew',
    purchaseTitle: 'What to say in the shop',
    copyJa: 'Copy Japanese for the shop',
    copyShare: 'Share my tea profile',
    detail: 'See full detail',
    restart: 'Try another style',
    editAnswers: 'Change answers',
    again: 'Start over',
    emptyTitle: 'Nothing matches',
    emptyBody: 'You chose “must be caffeine-free”. The catalogue has no product whose packaging explicitly states it, so we will not loosen the rule or pass off hōjicha or genmaicha as decaf.',
    emptyAction: 'Relax the caffeine rule',
    caffeinated: 'Contains caffeine',
    caffeinatedUnknown: 'Contains caffeine · value unknown',
    caffeineFree: 'Verified caffeine-free',
    caffeineUnknown: 'Caffeine value unknown',
    whyLabel: 'Why is it labelled this way?',
    refTitle: 'Official reference infusions (mg / 100 mL)',
    refNote: 'Each category is brewed differently (gyokuro is 10 g of leaf to 60 mL of water), so these numbers are not a per-cup comparison.',
    noMeasure: 'No measurement exists for this product under these brewing conditions, so no mg figure is shown.',
    verified: 'Only products whose packaging states ノンカフェイン / カフェインレス; depends on the product.',
    grams: 'Leaf',
    water: 'Water',
    temp: 'Temp',
    time: 'Time',
    g: 'g',
    ml: 'mL',
    sec: 's',
    perLabel: 'per serving',
    catalogTitle: 'Browse the teas',
    catalogLede: 'Thirteen teas ordered by their texture. No quiz required.',
    filterAll: 'All',
    countLabel: (n) => `${n} teas`,
    sourceLabel: 'Sources',
    editorialNote: 'Flavour scores are editorial assumptions, to be calibrated by tasting.',
    productDependent: 'Flavour depends on the product; a category name proves nothing.',
    copied: 'Copied',
    copyFail: 'Copy failed — please select manually',
    shareHint: 'The shared link contains only your answers, no personal data.',
    backHome: 'Home',
    langLabel: 'Language',
    foot: 'Flavour scores are editorial labels, not lab values. Caffeine figures are official reference infusions by category and are not a per-cup intake comparison.'
  }
};

const t = (key, ...args) => {
  const value = S[state.lang][key];
  return typeof value === 'function' ? value(...args) : value;
};

const L = (zh, en) => (state.lang === 'zh' ? zh : en);

/* ---------------- 小工具 ---------------- */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  });
  children.flat().forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

function say(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(say.timer);
  say.timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    say(t('copied'));
  } catch {
    const area = el('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' }, text);
    document.body.append(area);
    area.select();
    try { document.execCommand('copy'); say(t('copied')); }
    catch { say(t('copyFail')); }
    area.remove();
  }
}

function tasteTags(tea) {
  const s = SCALE_LABELS[state.lang];
  const entries = Object.entries(tea.taste).map(([dim, value]) => ({ dim, value }));
  entries.sort((a, b) => b.value - a.value);
  return entries.filter((x) => x.value >= 3).slice(0, 4).map(({ dim, value }) =>
    el('span', { class: 'tag' }, `${s[dim]} `, el('b', {}, `${value}/5`))
  );
}

function tasteRows(target) {
  const s = SCALE_LABELS[state.lang];
  return el('div', { class: 'taste-panel' },
    Object.entries(s).map(([dim, label]) => {
      const value = target[dim];
      return el('div', { class: 'taste-row' },
        el('div', { class: 'name', html: `<b>${label.split(' ')[0]}</b>${label.split(' ').slice(1).join(' ')}` }),
        el('div', { class: 'taste-bars', role: 'img', 'aria-label': `${label} ${value}/5` },
          [1, 2, 3, 4, 5].map((n) => el('i', { class: n <= Math.round(value) ? 'on' : '' }))
        ),
        el('div', { class: 'val' }, `${Number.isInteger(value) ? value : value.toFixed(1)}/5`)
      );
    })
  );
}

function caffeineStatusLabel(tea) {
  if (tea.caffeine.status === 'verified_free') return t('caffeineFree');
  if (tea.caffeine.status === 'unknown') return t('caffeineUnknown');
  /* 含咖啡因但沒有同產品實測值：兩個事實一起講，不給捏造的 mg */
  if (tea.caffeine.mgPer100ml === null) return t('caffeinatedUnknown');
  return t('caffeinated');
}

function caffeineBlock(tea) {
  const free = tea.caffeine.status === 'verified_free';
  const reference = CAFFEINE_REFERENCE.map((row) =>
    el('li', {}, `${L(row.zh, row.en)} — ${row.mg} mg`)
  );
  const noteText = tea.caffeine.mgPer100ml === null
    ? t('noMeasure')
    : L(tea.caffeine.referenceZh, tea.caffeine.referenceEn);

  return el('div', { class: `caffeine${free ? ' free' : ''}` },
    el('div', { class: 'status' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), caffeineStatusLabel(tea)),
    el('p', { class: 'note' }, noteText),
    tea.caffeine.status === 'verified_free'
      ? el('p', { class: 'note' }, t('verified'))
      : null,
    el('details', { class: 'why' },
      el('summary', {}, t('whyLabel')),
      el('p', { class: 'small', style: 'margin-top:8px' }, t('refTitle')),
      el('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, reference),
      el('p', { class: 'small', style: 'margin:8px 0 0' }, t('refNote')),
      el('p', { class: 'small', style: 'margin:8px 0 0' },
        el('a', { href: 'https://www.maff.go.jp/j/syouan/seisaku/risk_analysis/priority/hazard_chem/caffeine.html', target: '_blank', rel: 'noreferrer' }, '農林水産省')
      )
    )
  );
}

function brewBlock(tea) {
  const b = tea.brew;
  if (b.method === 'label') {
    return el('p', { class: 'small muted', style: 'margin:0' }, L('依商品包裝標示沖泡。', 'Brew as the product label says.'));
  }
  const cells = [];
  if (b.grams) cells.push(el('div', {}, el('b', {}, `${b.grams} ${t('g')}`), el('span', {}, t('grams'))));
  if (b.ml) cells.push(el('div', {}, el('b', {}, `${b.ml} ${t('ml')}`), el('span', {}, t('water'))));
  if (b.temp) cells.push(el('div', {}, el('b', {}, `${b.temp}°C`), el('span', {}, t('temp'))));
  if (b.seconds) cells.push(el('div', {}, el('b', {}, `${b.seconds} ${t('sec')}`), el('span', {}, t('time'))));
  return el('div', { class: 'brew' }, cells);
}

function purchaseBlock(tea) {
  const words = tea.purchaseJa.join(' ・ ');
  return el('div', {},
    el('p', { class: 'kw', style: 'margin:0 0 10px' }, tea.purchaseJa.map((w) => el('span', {}, w))),
    el('button', {
      type: 'button',
      class: 'btn secondary small',
      onclick: () => copy(words)
    }, t('copyJa'))
  );
}

function sourceBlock(tea) {
  return el('p', { class: 'tiny muted', style: 'margin:10px 0 0' },
    `${t('sourceLabel')}：`,
    tea.sources.map((url, i) => el('a', { href: url, target: '_blank', rel: 'noreferrer' }, i === 0 ? '農林水産省' : url)),
    ` ・ ${t('editorialNote')}`
  );
}

/* Approximate locations, not boundaries or a claim about an individual product. */
const ORIGINS = {
  T01: [[136.55, 34.96]], T02: [[130.44, 31.38]], T03: [[130.56, 33.21]],
  T04: [[129.99, 33.10]], T05: [[129.99, 33.10]], T06: [[138.09, 35.10]],
  T07: [[138.01, 34.77]], T08: [[138.21, 34.96]], T09: [[135.80, 34.89]],
  T10: [[137.06, 34.86]], T12: [[129.99, 33.10], [138.33, 34.95]]
};
function originMap(tea) {
  const points = ORIGINS[tea.id] || [];
  const markers = points.map(([lon, lat]) => {
    const x = ((lon - 128) * 10).toFixed(1), y = ((46 - lat) * 12.5).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="6" class="map-halo"/><circle cx="${x}" cy="${y}" r="3" class="map-pin"/>`;
  }).join('');
  const note = points.length ? L('圓點為概略位置', 'Dots show approximate locations')
    : tea.id === 'T11' ? L('日本各地，無單一產地', 'Made across Japan; no single origin')
    : L('產地依商品標示，未標點', 'Origin varies by product; no location marked');
  return el('figure', { class: 'origin-map' },
    el('div', { class: 'map-art', 'aria-hidden': 'true', html: `<svg viewBox="0 0 180 200"><path d="${JAPAN_PATH}" class="map-land"/>${markers}</svg>` }),
    el('figcaption', {}, el('span', { class: 'map-kicker' }, L('產地 / ORIGIN', 'ORIGIN / JAPAN')),
      el('strong', {}, L(tea.regionZh, tea.regionEn)), el('small', {}, note))
  );
}

const QUESTION_ART = [
  ['◌', '〜', '◒', '●'], ['✧', '◉', '♨', '◌'], ['○', '◔', '◑'],
  ['☁', '❧', '✿', '♨'], ['○', '◔', '◑', '●'], ['☾', '☼', '☀', '✧'], ['◡', '◷', '❄', '☕']
];
function teaArtwork(kind) {
  return el('div', { class: `tea-art tea-art-${kind}`, 'aria-hidden': 'true' },
    el('span', { class: 'tea-art-label' }, kind === 'quiz' ? 'A MOMENT FOR TEA' : 'YOUR CUP OF TEA'));
}

/* ---------------- 茶款詳情 ---------------- */
function openTea(id) {
  const tea = TEAS.find((x) => x.id === id);
  if (!tea) return;
  document.getElementById('sheet-title').textContent = L(tea.nameZh, tea.nameEn);
  document.getElementById('sheet-ja').textContent = tea.nameJa;
  const body = document.getElementById('sheet-body');
  body.replaceChildren(
    el('p', { class: 'rc-region', style: 'margin-top:0' }, L(tea.regionZh, tea.regionEn), ` ・ ${TEA_FAMILIES[tea.family][state.lang]}`),
    el('p', { class: 'rc-copy' }, L(tea.copyZh, tea.copyEn)),
    originMap(tea),
    el('p', { class: 'small muted' }, L(tea.processingZh, tea.processingEn)),
    el('div', { class: 'rc-section' }, el('h4', {}, t('flavourTitle')), el('div', { class: 'tags', style: 'margin-bottom:12px' }, tasteTags(tea)), tasteRows(tea.taste)),
    el('div', { class: 'rc-section' }, el('h4', {}, t('caffeineTitle')), caffeineBlock(tea)),
    el('div', { class: 'rc-section' }, el('h4', {}, t('brewTitle')), brewBlock(tea)),
    el('div', { class: 'rc-section' }, el('h4', {}, t('purchaseTitle')), purchaseBlock(tea)),
    sourceBlock(tea)
  );
  openSheet();
}

/* ---------------- 首頁 ---------------- */
function viewLanding() {
  document.body.dataset.view = 'home';
  const hero = el('section', { class: 'hero' },
    el('p', { class: 'eyebrow' }, t('heroEyebrow')),
    el('h1', { html: t('heroTitle') }),
    el('p', { class: 'lede' }, t('heroLede')),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn', onclick: startQuiz }, t('start'), el('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')),
      el('a', { class: 'btn secondary', href: '#/teas' }, t('explore'))
    ),
    el('figure', { class: 'hero-figure' },
      el('div', { html: cupArt() }),
      el('figcaption', {}, t('heroCap'))
    ),
    el('ul', { class: 'value-list' },
      ['value1', 'value2', 'value3'].map((key) => el('li', {}, t(key)))
    )
  );

  app.replaceChildren(hero);
}

function cupArt() {
  return `
  <svg viewBox="0 0 780 320" role="img" aria-label="A cup of green tea with rising steam, drawn in fine lines">
    <defs>
      <linearGradient id="tea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6E8C63"/><stop offset="1" stop-color="#3C5B40"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#C9B48C"/><stop offset="1" stop-color="#B69C70"/>
      </linearGradient>
    </defs>
    <rect width="780" height="320" fill="#FBF9F3"/>
    <g opacity=".5" stroke="#E5E1D6" stroke-width="1">
      <path d="M0 236 H780"/><path d="M0 268 H780"/>
    </g>
    <ellipse cx="390" cy="250" rx="196" ry="26" fill="#EFEDE3"/>
    <path d="M262 178 C258 232 306 258 390 258 C474 258 522 232 518 178 Z" fill="#FFFFFF" stroke="#D3CEBF"/>
    <path d="M276 186 C274 226 312 246 390 246 C468 246 506 226 504 186 Z" fill="url(#tea)" opacity=".92"/>
    <ellipse cx="390" cy="184" rx="118" ry="17" fill="#FFFFFF" stroke="#D3CEBF"/>
    <ellipse cx="390" cy="184" rx="110" ry="12" fill="url(#tea)" opacity=".35"/>
    <path d="M518 196 c34 4 52 20 44 38 -8 18 -32 22 -54 18" fill="none" stroke="#D3CEBF" stroke-width="3" stroke-linecap="round"/>
    <g fill="none" stroke="#B69C70" stroke-width="2" stroke-linecap="round" opacity=".85">
      <path d="M336 160 c-14 -18 12 -30 -2 -48 -10 -13 2 -24 6 -32"/>
      <path d="M390 152 c-16 -22 14 -34 -2 -54 -9 -12 2 -22 5 -30"/>
      <path d="M442 160 c-14 -18 12 -30 -2 -48 -10 -13 2 -24 6 -32"/>
    </g>
    <g stroke="#496B51" stroke-width="1.6" fill="none" opacity=".9">
      <path d="M104 208 c0 -34 26 -60 58 -60 -2 34 -26 58 -58 60 Z" fill="#EDF1E9"/>
      <path d="M104 208 c18 -6 34 -22 44 -44"/>
      <path d="M676 214 c0 -30 22 -54 50 -54 -2 30 -23 52 -50 54 Z" fill="#EDF1E9"/>
    </g>
    <g fill="url(#gold)" opacity=".7">
      <circle cx="640" cy="86" r="3"/><circle cx="664" cy="104" r="2"/><circle cx="118" cy="98" r="2"/>
    </g>
  </svg>`;
}

/* ---------------- Quiz ---------------- */
function startQuiz() {
  state.answers = {};
  state.index = 0;
  persist();
  location.hash = '#/quiz';
  viewQuiz();
}

function persist() {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ answers: state.answers, index: state.index }));
  } catch { /* 私密模式忽略 */ }
}

function restore() {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      state.answers = data.answers || {};
      state.index = Number.isInteger(data.index) ? data.index : 0;
    }
  } catch { /* ignore */ }
}

function viewQuiz() {
  document.body.dataset.view = 'quiz';
  const total = QUESTIONS.length;
  const i = Math.min(state.index, total - 1);
  const q = QUESTIONS[i];

  const fill = el('div', { class: 'progress-fill', style: `width:${((i) / total) * 100}%` });
  const progress = el('div', { class: 'progress-top' },
    el('div', { class: 'progress-meta' },
      el('span', {}, el('b', {}, `${i + 1}`), ` / ${total}`),
      el('span', {}, q.optional ? t('skippable') : L('必答', 'required'))
    ),
    el('div', { class: 'progress-track', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(total), 'aria-valuenow': String(i + 1), 'aria-label': t('progress', i + 1, total) }, fill)
  );

  /* 選了哪一項只靠這個 class：填色、邊框與右邊的 ✓ 都跟著它 */
  const syncChecked = () => {
    app.querySelectorAll('.option').forEach((label) => {
      const fieldId = label.getAttribute('for');
      const field = fieldId ? document.getElementById(fieldId) : null;
      label.classList.toggle('is-checked', Boolean(field && field.checked));
    });
  };

  /* 選項是一組 radio，但不畫任何 radio 圓點；群組名稱直接指向題目標題 */
  const group = el('div', { class: 'options', role: 'radiogroup', 'aria-labelledby': 'q-title' });
  q.options.forEach((option) => {
    const id = `${q.id}-${option.id}`;
    const checked = state.answers[q.id] === option.id;
    const input = el('input', { type: 'radio', name: q.id, id, value: option.id, checked: checked || null });
    /* 選了就記住，並直接跳轉到下一題（不需按下一題按鈕）。
       使用者可以回頭改答案，但在選取時會立即切換畫面。
       螢幕閱讀器會跟著新的題目標題。 */
    input.addEventListener('change', () => {
      state.answers[q.id] = option.id;
      persist();
      syncChecked();
      advance(); // 直接跳轉到下一題
    });
    /* 整個選項就是一顆按鈕：不畫圓形 radio、不標 A/B/C，點下去就選好了。 */
    const label = el('label', { class: 'option', for: id },
      el('span', { class: 'option-icon', 'aria-hidden': 'true' }, QUESTION_ART[i][q.options.indexOf(option)]),
      el('span', { class: 'label' }, L(option.zh, option.en)),
      el('span', { class: 'mark', 'aria-hidden': 'true' }, '✓')
    );
    /* 真正的 input 只留給鍵盤與螢幕閱讀器；焦點框只給鍵盤，滑鼠與觸控點選不留外框 */
    input.addEventListener('focus', () => {
      if (input.matches(':focus-visible')) label.classList.add('is-focused');
    });
    input.addEventListener('blur', () => label.classList.remove('is-focused'));
    group.append(input, label);
  });

  // 只有咖啡因這題需要一段說明：它會改變候選集，必須先講清楚
  const questionNote = q.id === 'q5'
    ? el('details', { class: 'why', style: 'margin-top:14px' },
        el('summary', {}, t('whyLabel')),
        el('p', { class: 'small', style: 'margin:8px 0 0' }, t('caffeineWhy'))
      )
    : null;

  const section = el('section', { class: 'question', 'aria-labelledby': 'q-title' },
    teaArtwork('quiz'),
    el('p', { class: 'qnum' }, `${t('qPrefix')} ${String(i + 1).padStart(2, '0')}`),
    el('h2', { id: 'q-title' }, L(q.zh, q.en)),
    q.hintZh ? el('p', { class: 'hint' }, L(q.hintZh, q.hintEn)) : null,
    group,
    questionNote
  );

  const isLast = i === total - 1;
  const canProceed = Boolean(state.answers[q.id]) || Boolean(q.optional);

  const nav = el('div', { class: 'quiz-nav' },
    el('div', { class: 'quiz-nav-in' },
      el('button', {
        type: 'button', class: 'btn secondary',
        onclick: () => go(i - 1), disabled: i === 0 ? true : null
      }, '← ', t('prev')),
      q.optional
        ? el('button', { type: 'button', class: 'skip', onclick: advance }, t('skip'))
        : el('span', { class: 'skip', style: 'text-decoration:none' }, ''),
      // 選項按下會自動跳轉，此按鈕隱藏（不需手動按下一題）
      el('button', {
        type: 'button', class: 'btn',
        disabled: true,
        style: 'display:none',
        onclick: () => (isLast ? finish() : advance())
      }, isLast ? t('seeResult') : t('next'), el('span', { class: 'arrow', 'aria-hidden': 'true' }, isLast ? '✦' : '→'))
    )
  );

  app.replaceChildren(el('div', { class: 'quiz-wrap' }, progress, section, nav));

  /* 畫面固定在一個視窗高度內，換題時只把選項區帶回頂端。 */
  const optionList = app.querySelector('.options');
  if (optionList) optionList.scrollTop = 0;

  syncChecked();
  const current = app.querySelector('input:checked');
  if (current) current.focus({ preventScroll: true });
}

function advance() {
  if (state.index >= QUESTIONS.length - 1) { finish(); return; }
  go(state.index + 1);
}

function go(index) {
  state.index = Math.max(0, Math.min(QUESTIONS.length - 1, index));
  persist();
  viewQuiz();
}

function finish() {
  const code = encodeAnswers(state.answers);
  state.index = 0;
  persist();
  location.hash = `#/result/${code}`;
  viewResults(code);
}

/* ---------------- 結果 ---------------- */
function roleLabel(role) {
  if (role === 'top1') return t('top1');
  if (role === 'top2') return t('top2');
  if (role === 'top3') return t('top3');
  return t('roleExplore');
}

function resultCard(row, index) {
  const { tea, reasons, role } = row;
  const card = el('article', { class: `result-card${index === 0 ? ' top' : ''}` },
    el('div', { class: 'rc-head' },
      el('div', { class: 'rc-rank' }, el('span', { class: 'n' }, String(index + 1)), roleLabel(role)),
      el('div', { class: 'rc-title' },
        el('h3', {}, L(tea.nameZh, tea.nameEn)),
        el('span', { class: 'rc-ja', lang: 'ja' }, tea.nameJa)
      ),
      el('p', { class: 'rc-region' }, L(tea.regionZh, tea.regionEn), ` ・ ${TEA_FAMILIES[tea.family][state.lang]}`),
      el('p', { class: 'rc-copy' }, L(tea.copyZh, tea.copyEn)),
      originMap(tea)
    ),
    el('div', { class: 'rc-body' },
      el('div', { class: 'rc-section' },
        el('h4', {}, t('whyTitle')),
        el('ul', { class: 'reasons' }, reasons.map((r) => el('li', {}, r.text)))
      ),
      el('div', { class: 'rc-section' },
        el('h4', {}, t('flavourTitle')),
        el('div', { class: 'tags' }, tasteTags(tea))
      ),
      el('div', { class: 'rc-section' }, el('h4', {}, t('caffeineTitle')), caffeineBlock(tea)),
      el('div', { class: 'rc-section' }, el('h4', {}, t('brewTitle')), brewBlock(tea)),
      el('div', { class: 'rc-section' }, el('h4', {}, t('purchaseTitle')), purchaseBlock(tea)),
      el('div', { class: 'share-bar' },
        el('button', { type: 'button', class: 'btn secondary small', onclick: () => openTea(tea.id) }, t('detail'))
      ),
      sourceBlock(tea)
    )
  );
  return card;
}

function viewResults(code) {
  document.body.dataset.view = 'result';
  const answers = Object.keys(state.answers).length ? state.answers : decodeAnswers(code);
  if (answers) state.answers = answers;

  /* 沒有任何可用答案（例如壞掉的分享連結）就不要假裝有結果。 */
  if (!Object.keys(state.answers).length) {
    if (location.hash !== '#/') location.replace('#/');
    viewLanding();
    return;
  }

  const report = recommend(state.answers, state.lang);

  if (report.empty) {
    app.replaceChildren(
      el('section', { class: 'result-hero' },
        el('p', { class: 'eyebrow' }, t('resultEyebrow')),
        el('div', { class: 'empty' },
          el('h2', {}, t('emptyTitle')),
          el('p', { class: 'small muted' }, t('emptyBody')),
          el('div', { class: 'actions center' },
            el('button', {
              type: 'button', class: 'btn',
              onclick: () => { state.answers.q5 = 'low'; viewResults(encodeAnswers(state.answers)); }
            }, t('emptyAction')),
            el('a', { class: 'btn secondary', href: '#/quiz' }, t('editAnswers'))
          )
        )
      )
    );
    return;
  }

  const profile = report.profile;
  const header = el('section', { class: 'result-hero' },
    teaArtwork('result'),
    el('p', { class: 'eyebrow' }, t('resultEyebrow')),
    el('h1', { style: 'font-size:clamp(26px,6.4vw,38px);margin-bottom:12px' },
      el('span', { style: 'display:block;font-family:var(--jf-serif)' }, L(profile.zh, profile.en)),
      el('span', { style: 'display:block;font-family:var(--jf-mono);font-size:12px;letter-spacing:.18em;color:var(--jf-gold);text-transform:uppercase;margin-top:6px' }, L(profile.en, profile.zh))
    ),
    el('p', { class: 'small muted' }, t('resultLede')),
    el('div', { class: 'card', style: 'margin-top:18px' },
      el('h3', { style: 'font-size:14px;font-family:var(--jf-sans);letter-spacing:.12em;text-transform:uppercase;color:var(--jf-muted);margin-bottom:10px' }, t('tasteTitle')),
      tasteRows(report.prefs.target)
    ),
    el('div', { class: 'actions' },
      el('a', { class: 'btn secondary small', href: '#/quiz' }, t('editAnswers')),
      el('button', { type: 'button', class: 'btn secondary small', onclick: startQuiz }, t('restart')),
      el('button', {
        type: 'button', class: 'btn small',
        onclick: () => copy(shareUrl())
      }, t('copyShare'))
    ),
    el('p', { class: 'tiny muted', style: 'margin-top:8px' }, t('shareHint'))
  );

  const cards = report.results.map((row, index) => resultCard(row, index));
  const tail = el('div', { style: 'margin-top:26px' },
    el('div', { class: 'notice' }, L(
      '推薦只依你剛才的答案與茶款標籤比對；資料庫裡的風味分數是編輯假設，尚未經大規模品飲校準。',
      'Recommendations compare your answers with editorial flavour labels only; those scores have not yet been calibrated by large-scale tasting.'
    )),
    el('p', { style: 'margin-top:14px' }, el('a', { href: '#/teas' }, t('catalogLink')))
  );

  app.replaceChildren(header, ...cards, tail);
}

function shareUrl() {
  return `${location.origin}${location.pathname}#/result/${encodeAnswers(state.answers)}`;
}

/* ---------------- 目錄 ---------------- */
let catalogFilter = 'all';

function viewCatalog() {
  document.body.dataset.view = 'catalog';
  const families = [['all', t('filterAll')], ...Object.entries(TEA_FAMILIES).map(([key, value]) => [key, value[state.lang]])];
  const list = TEAS
    .filter((tea) => catalogFilter === 'all' || tea.family === catalogFilter)
    .sort((a, b) => b.taste.viscosity - a.taste.viscosity || b.taste.body - a.taste.body || a.id.localeCompare(b.id));

  const chips = el('div', { class: 'filters', role: 'group', 'aria-label': L('依茶類篩選', 'Filter by tea family') },
    families.map(([key, label]) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(catalogFilter === key),
        onclick: () => { catalogFilter = key; viewCatalog(); }
      }, label)
    )
  );

  const items = el('div', { class: 'cat-list' },
    list.map((tea) => el('button', {
      type: 'button', class: 'cat-item', style: 'text-align:left;cursor:pointer',
      onclick: () => openTea(tea.id)
    },
      el('div', { class: 'row' },
        el('span', { class: 'name' }, L(tea.nameZh, tea.nameEn)),
        el('span', { class: 'ja', lang: 'ja' }, tea.nameJa)
      ),
      el('div', { class: 'meta' }, L(tea.regionZh, tea.regionEn), ` ・ ${TEA_FAMILIES[tea.family][state.lang]} ・ `,
        tea.caffeine.status === 'verified_free' ? t('caffeineFree') : t('caffeinated')),
      el('div', { class: 'mini-bars', 'aria-hidden': 'true' },
        [1, 2, 3, 4, 5].map((n) => el('i', { class: n <= tea.taste.viscosity ? 'on' : '' })),
        el('i', { style: 'flex:0 0 6px;background:transparent' }),
        [1, 2, 3, 4, 5].map((n) => el('i', { class: n <= tea.taste.umami ? 'on' : '' }))
      ),
      el('div', { class: 'meta', style: 'margin-top:2px' }, L('左：稠滑 ／ 右：鮮味', 'Left: silky texture · Right: umami'))
    ))
  );

  app.replaceChildren(
    el('section', { class: 'catalog' },
      el('p', { class: 'eyebrow' }, t('catalogTitle')),
      el('h1', { style: 'font-size:clamp(26px,6.4vw,38px)' }, t('catalogTitle')),
      el('p', { class: 'lede' }, t('catalogLede')),
      chips,
      el('p', { class: 'count' }, t('countLabel', list.length)),
      items,
      el('p', { class: 'small muted', style: 'margin-top:20px' }, L(
        '咖啡因一律先說「含咖啡因／經證實無咖啡因／數值未知」，不給個別產品估算值。',
        'Caffeine is always stated first as contains / verified caffeine-free / unknown — never as an estimated per-product dose.'
      )),
      el('div', { class: 'actions' },
        el('a', { class: 'btn', href: '#/quiz' }, t('start')),
        el('a', { class: 'btn secondary', href: '#/' }, t('backHome'))
      )
    )
  );
}

/* ---------------- 路由 ---------------- */
function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/quiz')) { viewQuiz(); return; }
  if (hash.startsWith('#/result')) {
    const code = hash.split('/')[2] || '';
    viewResults(code);
    return;
  }
  if (hash.startsWith('#/teas')) { viewCatalog(); return; }
  viewLanding();
}

/* ---------------- 語言 ---------------- */
function setLang(lang) {
  state.lang = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('.lang-switch button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  });
  document.getElementById('foot-note').textContent = S[lang].foot;
  if (sheet.open || sheet.hasAttribute('open')) closeSheet();
  route();
  app.focus({ preventScroll: true });
}

document.querySelectorAll('.lang-switch button').forEach((button) => {
  button.addEventListener('click', () => setLang(button.dataset.lang));
});

/* <dialog> 在很舊的瀏覽器沒有 showModal；退化成一張普通覆蓋層，
   功能（關閉、Esc、內容）仍然可用。 */
const supportsDialog = typeof sheet.showModal === 'function';
function openSheet() {
  if (supportsDialog) sheet.showModal();
  else { sheet.setAttribute('open', ''); sheet.classList.add('fallback'); document.body.style.overflow = 'hidden'; }
}
function closeSheet() {
  if (supportsDialog) sheet.close();
  else { sheet.removeAttribute('open'); sheet.classList.remove('fallback'); document.body.style.overflow = ''; }
}

document.getElementById('sheet-close').addEventListener('click', closeSheet);
sheet.addEventListener('click', (event) => {
  if (event.target === sheet) sheet.close();
});

window.addEventListener('hashchange', () => {
  route();
  app.focus({ preventScroll: true });
});

/* 鍵盤：左右鍵在 Quiz 前後移動 */
document.addEventListener('keydown', (event) => {
  if (!location.hash.startsWith('#/quiz')) return;
  if (document.activeElement?.tagName === 'INPUT') return;
  if (event.key === 'ArrowLeft') { go(state.index - 1); }
  if (event.key === 'ArrowRight') { go(state.index + 1); }
});

restore();
route();
