/* Japanese Tea Finder — app shell
 *
 * 五個畫面：首頁、Quiz、結果、茶款詳情（dialog）、探索目錄。
 * 沒有後端、沒有帳號、不蒐集個資；分享只把答案編碼放進網址。
 */

import { TEAS, TEA_FAMILIES, FAMILY_IMAGES, CAFFEINE_REFERENCE } from './data.js';
import { JAPAN_PATH } from './japan-path.js';
import {
  QUESTIONS, recommend, encodeAnswers, decodeAnswers, SCALE_LABELS, AROMA_LABELS, sanitizeAnswers, missingRequired
} from './quiz.js';

const STORE = 'tea.quiz.answers.v2';
const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const toastEl = document.getElementById('toast');

const state = {
  lang: document.documentElement.lang.startsWith('zh') ? 'zh' : 'en',
  answers: {},
  index: 0,
  step: 0,
  resultCode: null
};

/* ---------------- 文案 ---------------- */
const S = {
  zh: {
    heroTitle: '找到適合你的<br><em>日本茶</em>。',
    heroLede: '從靜岡的茶園、宇治的石臼，到鹿兒島的茶葉。用你熟悉的味道，找一杯屬於你的日本茶。',
    start: '開始選茶',
    explore: '直接探索茶種',
    heroCap: '茶園與茶葉的真實風景。照片經裁切、縮圖，依原授權使用。',
    catalogLink: `看全部 ${TEAS.length} 款茶 →`,
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
    resultLede: '以下是你選的風味方向，不是化驗值；未回答的部分以中間值呈現。',
    tasteTitle: '偏好雷達',
    top1: '最推薦',
    top2: '相似路線',
    top3: '另一種相近風格',
    roleExplore: '探索推薦',
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
    catalogTitle: '直接探索茶種',
    catalogLede: `${TEAS.length} 款茶，依口感主軸排列。其中 ${TEAS.filter((tea) => tea.family === 'wakoucha').length} 款和紅茶，從輕盈蜜香到濃厚奶茶路線。`,
    filterAll: '全部',
    countLabel: (n) => `${n} 款茶`,
    sourceLabel: '資料來源',
    editorialNote: '風味分數為編輯假設，需經品飲校準。',
    productDependent: '風味依商品而定，不以茶類名稱推定。',
    copied: '已複製',
    copyFail: '複製失敗，請手動選取',
    shareHint: '分享連結只包含你的答案，不含任何個人資料。',
    profileBtn: '風味偏好',
    profileSheetTitle: '你的風味偏好',
    deckGuide: '左右滑動查看 3 款推薦',
    deckAria: '推薦茶款卡牌',
    stepsAria: '選擇第幾款',
    prevTea: '上一款',
    nextTea: '下一款',
    shareShort: '分享茶譜',
    fullInfo: '茶款詳情',
    guideTitle: '三張卡牌怎麼看',
    roleHintTop1: '七個維度都最靠近你的答案',
    roleHintTop2: '同一條路線的第二個選擇',
    roleHintTop3: '同一茶類裡的另一種個性',
    roleHintExplore: '刻意換一條路線，讓三張不完全一樣',
    deckStatus: (i, n, name) => `第 ${i} 款，共 ${n} 款：${name}`,
    goTo: (i, name) => `看第 ${i} 款：${name}`,
    imgAlt: (family) => `${family}茶湯的水彩插畫，一杯放在米紙上的茶`,
    cultivarLabel: '品種',
    backHome: '回首頁',
    langLabel: '語言',
    foot: '風味分數是編輯標籤，不是化驗值；咖啡因數字是官方標準浸出液的類別參考值，不能當作同容量實際攝取量比較。'
  },
  en: {
    heroTitle: 'Find the Japanese tea<br>that fits <em>you</em>.',
    heroLede: 'Tea fields in Shizuoka, a stone mill in Uji, leaves from Kagoshima. Find your Japanese tea through flavours you already know.',
    start: 'Start the quiz',
    explore: 'Browse the teas',
    heroCap: 'Real tea gardens and leaves. Photographs cropped and resized under their original licences.',
    catalogLink: `See all ${TEAS.length} teas →`,
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
    resultLede: 'Your chosen flavour direction, not measurements. Unanswered dimensions sit at the midpoint.',
    tasteTitle: 'Preference radar',
    top1: 'Best match',
    top2: 'Similar route',
    top3: 'A neighbouring style',
    roleExplore: 'Sideways pick',
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
    catalogTitle: 'Browse the teas',
    catalogLede: `${TEAS.length} teas ordered by texture, including ${TEAS.filter((tea) => tea.family === 'wakoucha').length} wakoucha from light honeyed cups to milk-tea styles.`,
    filterAll: 'All',
    countLabel: (n) => `${n} teas`,
    sourceLabel: 'Sources',
    editorialNote: 'Flavour scores are editorial assumptions, to be calibrated by tasting.',
    productDependent: 'Flavour depends on the product; a category name proves nothing.',
    copied: 'Copied',
    copyFail: 'Copy failed — please select manually',
    shareHint: 'The shared link contains only your answers, no personal data.',
    profileBtn: 'Profile',
    profileSheetTitle: 'Your flavour profile',
    deckGuide: 'Swipe left or right to explore three teas',
    deckAria: 'Recommended teas',
    stepsAria: 'Choose a card',
    prevTea: 'Previous',
    nextTea: 'Next',
    shareShort: 'Share',
    fullInfo: 'Tea details',
    guideTitle: 'How to read the three cards',
    roleHintTop1: 'Closest to all seven of your answers',
    roleHintTop2: 'The second choice on the same route',
    roleHintTop3: 'A different character within the same family',
    roleHintExplore: 'A deliberate change of route, so the three are not all alike',
    deckStatus: (i, n, name) => `Tea ${i} of ${n}: ${name}`,
    goTo: (i, name) => `Show tea ${i}: ${name}`,
    imgAlt: (family) => `Watercolour illustration of a cup of ${family} tea on cream paper`,
    cultivarLabel: 'Cultivar',
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

function sourceName(url) {
  const host = new URL(url).hostname;
  const names = {
    'www.maff.go.jp': '農林水産省', 'www.oguri-farm.com': '小栗農園',
    'chasho.yamachou.net': '静岡茶匠の逸品', 'susumuya.com': 'すすむ屋茶店',
    'www.wazukakoucha.jp': '和束紅茶', 'changetea.jp': '茶の間・柴本俊史'
  };
  return names[host] || host;
}
function sourceBlock(tea) {
  return el('p', { class: 'tiny muted', style: 'margin:10px 0 0' },
    `${t('sourceLabel')}：`,
    tea.sources.flatMap((url, i) => [i ? ' ・ ' : '', el('a', { href: url, target: '_blank', rel: 'noreferrer' }, sourceName(url))]),
    ` ・ ${t('editorialNote')}`
  );
}

/* Approximate locations, not boundaries or a claim about an individual product. */
const ORIGINS = {
  T01: [[136.55, 34.96]], T02: [[130.44, 31.38]], T03: [[130.56, 33.21]],
  T04: [[129.99, 33.10]], T05: [[129.99, 33.10]], T06: [[138.09, 35.10]],
  T07: [[138.01, 34.77]], T08: [[138.21, 34.96]], T09: [[135.80, 34.89]],
  T10: [[137.06, 34.86]], T12: [[138.22, 34.74]],
  T14: [[138.31, 35.02]], T15: [[138.22, 34.74]], T16: [[130.55, 31.50]],
  T17: [[135.94, 34.80]], T18: [[135.94, 34.80]]
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

/* ---------------- 茶款詳情 ---------------- */
function openTea(id, { fromResult = false } = {}) {
  const tea = TEAS.find((x) => x.id === id);
  if (!tea) return;
  document.getElementById('sheet-title').textContent = L(tea.nameZh, tea.nameEn);
  document.getElementById('sheet-ja').textContent = tea.nameJa;
  const body = document.getElementById('sheet-body');
  body.replaceChildren(...teaDetails(tea, fromResult));
  openSheet();
}

function teaDetails(tea, fromResult = false) {
  // 結果卡牌開啟的詳情維持精簡；從茶款目錄進入時仍保留這些資料。
  const caffeineAndBrew = fromResult ? [] : [
    el('div', { class: 'rc-section' }, el('h4', {}, t('caffeineTitle')), caffeineBlock(tea)),
    el('div', { class: 'rc-section' }, el('h4', {}, t('brewTitle')), brewBlock(tea))
  ];
  return [
    el('figure', { class: 'sheet-media' },
      el('img', {
        src: familyImage(tea),
        alt: t('imgAlt', TEA_FAMILIES[tea.family][state.lang]),
        width: '1264', height: '848', loading: 'lazy', decoding: 'async'
      })
    ),
    el('p', { class: 'rc-region', style: 'margin-top:0' }, L(tea.regionZh, tea.regionEn), ` ・ ${TEA_FAMILIES[tea.family][state.lang]}`),
    el('p', { class: 'rc-copy' }, L(tea.copyZh, tea.copyEn)),
    el('p', { class: 'rc-cultivar' }, t('cultivarLabel'), ' · ', el('span', { lang: 'ja' }, tea.cultivar)),
    originMap(tea),
    el('p', { class: 'small muted' }, L(tea.processingZh, tea.processingEn)),
    el('div', { class: 'rc-section' }, el('h4', {}, t('flavourTitle')),
      el('div', { class: 'tags', style: 'margin-bottom:8px' }, tasteTags(tea)),
      el('div', { class: 'aroma-tags', style: 'margin:0 0 12px' }, tea.aromaFamily.map((family) => el('span', {}, AROMA_LABELS[family][state.lang]))),
      tasteRows(tea.taste)),
    ...caffeineAndBrew,
    el('div', { class: 'rc-section' }, el('h4', {}, t('purchaseTitle')), purchaseBlock(tea)),
    sourceBlock(tea)
  ];
}

/* ---------------- 首頁 ---------------- */
function viewLanding() {
  document.body.dataset.view = 'home';
  const hero = el('section', { class: 'hero' },
    el('h1', { html: t('heroTitle') }),
    el('p', { class: 'lede' }, t('heroLede')),
    heroCollage(),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn', onclick: startQuiz }, t('start'), el('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')),
      el('a', { class: 'btn secondary', href: '#/teas' }, t('explore'))
    ),
    el('p', { class: 'hero-routes' },
      el('a', { href: '#/teas/sencha' }, L('煎茶・茶園', 'Sencha · tea fields')),
      el('span', { 'aria-hidden': 'true' }, '／'),
      el('a', { href: '#/teas/matcha' }, L('抹茶', 'Matcha')),
      el('span', { 'aria-hidden': 'true' }, '／'),
      el('a', { href: '#/teas/wakoucha' }, L('和紅茶・產地與品種', 'Wakoucha · origins & cultivars'))
    )
  );

  app.replaceChildren(hero);
}

const HERO_PHOTOS = [
  {
    file: 'hero-shizuoka.webp', width: 500, height: 333, class: 'photo-shizuoka',
    zh: '靜岡・袋井茶園', en: 'Shizuoka · Fukuroi', kicker: 'SHIZUOKA',
    altZh: '靜岡縣袋井市的茶園，整齊茶樹沿著坡地排列，茶園間立著防霜風扇。',
    altEn: 'Rows of tea bushes on a slope in Fukuroi, Shizuoka, with frost-prevention fans.',
    credit: 'MaedaAkihiko', url: 'https://commons.wikimedia.org/wiki/File:Tea-plantation_Shizuoka-Fukuroi.jpg'
  },
  {
    file: 'hero-uji.webp', width: 900, height: 600, class: 'photo-uji',
    zh: '京都・宇治抹茶', en: 'Kyoto · Uji matcha', kicker: 'UJI, KYOTO',
    altZh: '京都宇治的傳統石臼正在研磨碾茶，細緻抹茶粉堆在石臼邊緣。',
    altEn: 'A traditional stone mill grinding tencha in Uji, Kyoto, with fine matcha around its edge.',
    credit: 'Derjochenmeyer', url: 'https://commons.wikimedia.org/wiki/File:Matcha_stone_mill_grinding_tencha_into_powder.jpg'
  },
  {
    file: 'hero-kagoshima.webp', width: 800, height: 800, class: 'photo-kagoshima',
    zh: '鹿兒島・煎茶葉', en: 'Kagoshima · Sencha', kicker: 'KAGOSHIMA',
    altZh: '鹿兒島產さえみどり品種的深蒸煎茶乾葉，細長深綠茶葉堆在白色背景上。',
    altEn: 'Dry deep-steamed Saemidori sencha leaves grown in Kagoshima, photographed on white.',
    credit: 'Difference engine', url: 'https://commons.wikimedia.org/wiki/File:2017_Kagoshima_sencha.jpg'
  }
];
function heroCollage() {
  return el('figure', { class: 'hero-figure' },
    el('div', { class: 'tea-collage', role: 'group', 'aria-label': L('日本茶產地照片拼貼', 'Japanese tea origins photo collage') },
      HERO_PHOTOS.map((photo, index) => el('div', { class: `photo-tile ${photo.class}` },
        el('img', { src: `/personal/tea-quiz/assets/${photo.file}`, width: photo.width, height: photo.height, alt: L(photo.altZh, photo.altEn), loading: 'eager', decoding: 'async' }),
        el('span', { class: 'photo-number', 'aria-hidden': 'true' }, `0${index + 1}`),
        el('span', { class: 'photo-mask', 'aria-hidden': 'true' },
          el('small', {}, photo.kicker), el('strong', {}, L(photo.zh, photo.en)))
      ))
    ),
    el('figcaption', {},
      el('span', {}, t('heroCap')),
      el('span', { class: 'photo-credits' },
        HERO_PHOTOS.flatMap((photo, index) => [index ? ' · ' : '', el('a', { href: photo.url, target: '_blank', rel: 'noreferrer' }, photo.credit)]),
        ' / ', el('a', { href: 'https://creativecommons.org/licenses/by-sa/4.0/', target: '_blank', rel: 'noreferrer' }, 'CC BY-SA 4.0')
      )
    )
  );
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
      state.answers = sanitizeAnswers(data.answers);
      state.index = Number.isInteger(data.index) ? Math.max(0, Math.min(QUESTIONS.length - 1, data.index)) : 0;
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
  const group = el('div', { class: 'options', role: 'radiogroup', 'aria-labelledby': 'q-title', 'aria-describedby': q.hintZh ? 'q-hint' : null });
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
      el('span', { class: 'label' }, L(option.zh, option.en),
        option.subZh ? el('span', { class: 'sub' }, L(option.subZh, option.subEn)) : null),
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
  const questionNote = q.key === 'caffeine'
    ? el('details', { class: 'why', style: 'margin-top:14px' },
        el('summary', {}, t('whyLabel')),
        el('p', { class: 'small', style: 'margin:8px 0 0' }, t('caffeineWhy'))
      )
    : null;

  const section = el('section', { class: 'question', 'aria-labelledby': 'q-title' },
    el('p', { class: 'qnum' }, `${t('qPrefix')} ${String(i + 1).padStart(2, '0')}`),
    el('h2', { id: 'q-title', tabindex: '-1' }, L(q.zh, q.en)),
    q.hintZh ? el('p', { class: 'hint', id: 'q-hint' }, L(q.hintZh, q.hintEn)) : null,
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
        ? el('button', { type: 'button', class: 'skip', onclick: () => { delete state.answers[q.id]; persist(); advance(); } }, t('skip'))
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
  document.getElementById('q-title').focus({ preventScroll: true });
}

function advance() {
  const q = QUESTIONS[state.index];
  if (!q.optional && !state.answers[q.id]) return;
  if (state.index >= QUESTIONS.length - 1) { finish(); return; }
  go(state.index + 1);
}

function go(index) {
  state.index = Math.max(0, Math.min(QUESTIONS.length - 1, index));
  persist();
  viewQuiz();
}

function finish() {
  const missing = missingRequired(state.answers);
  if (missing.length) { go(QUESTIONS.findIndex((q) => q.id === missing[0])); return; }
  const code = encodeAnswers(state.answers);
  state.index = 0;
  state.step = 0;
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

/* 一次顯示一張完整茶款詳情，左右滑動切換推薦。 */
const deck = { total: 0, index: 0, cards: [], dots: [], status: null, results: [] };

function roleHint(role) {
  if (role === 'top1') return t('roleHintTop1');
  if (role === 'top2') return t('roleHintTop2');
  if (role === 'top3') return t('roleHintTop3');
  return t('roleHintExplore');
}

/* 茶種的飲品插畫：認茶類用，不是某一支商品的實拍照 */
function familyImage(tea) {
  return FAMILY_IMAGES[tea.family] || FAMILY_IMAGES.sencha;
}

function profileCard(row, index) {
  const { tea, role } = row;
  const titleId = `pc-title-${index}`;
  return el('article', {
    class: `profile-card${index === 0 ? ' top' : ''}`,
    'aria-labelledby': titleId,
    'data-step': String(index)
  },
    el('div', { class: 'pc-body result-detail' },
      el('p', { class: 'result-rank' }, `${index + 1} · ${roleLabel(role)}`),
      el('h2', { class: 'pc-title', id: titleId }, L(tea.nameZh, tea.nameEn)),
      el('p', { class: 'pc-ja', lang: 'ja' }, tea.nameJa),
      el('p', { class: 'pc-role' }, roleHint(role)),
      ...teaDetails(tea, true)
    )
  );
}

/* 只換卡牌，不重繪整頁：按鈕與焦點都留著，鍵盤使用者不會被丟回頁首 */
function setStep(index) {
  if (!deck.total) return;
  const next = Math.max(0, Math.min(deck.total - 1, index));
  deck.index = next;
  state.step = next;

  deck.cards.forEach((card, i) => {
    const active = i === next;
    card.classList.toggle('is-active', active);
    card.toggleAttribute('inert', !active);
    card.setAttribute('aria-hidden', String(!active));
    if (active) {
      const body = card.querySelector('.pc-body');
      if (body) body.scrollTop = 0;
    }
  });

  deck.dots.forEach((dot, i) => {
    dot.classList.toggle('is-active', i === next);
  });

  const row = deck.results[next];
  deck.status.textContent = t('deckStatus', next + 1, deck.total, L(row.tea.nameZh, row.tea.nameEn));
}

function buildDeck(report) {
  deck.total = report.results.length;
  deck.results = report.results;
  deck.cards = report.results.map((row, i) => profileCard(row, i));

  deck.dots = report.results.map(() => el('span', { class: 'deck-indicator' }));
  deck.status = el('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });

  const stage = el('div', { class: 'deck', role: 'group', 'aria-label': t('deckAria'), tabindex: '0' }, deck.cards);
  let start = null;
  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  stage.addEventListener('pointerup', (event) => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) setStep(deck.index + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { start = null; });
  const indicators = el('div', { class: 'deck-indicators', 'aria-hidden': 'true' }, deck.dots);
  return { stage, indicators };

}

function viewResults(code) {
  const answers = decodeAnswers(code);
  if (answers) { state.answers = answers; state.index = 0; persist(); }

  /* 壞掉或舊版分享碼回首頁，不拿其他答案充數。 */
  if (!answers) {
    document.body.dataset.view = 'result-empty';
    if (location.hash !== '#/') location.replace('#/');
    viewLanding();
    return;
  }

  const report = recommend(state.answers, state.lang);

  if (report.empty) {
    document.body.dataset.view = 'result-empty';
    app.replaceChildren(
      el('section', { class: 'result-hero' },
        el('p', { class: 'eyebrow' }, t('resultEyebrow')),
        el('div', { class: 'empty' },
          el('h2', {}, t('emptyTitle')),
          el('p', { class: 'small muted' }, t('emptyBody')),
          el('div', { class: 'actions center' },
            el('button', {
              type: 'button', class: 'btn',
              onclick: () => { state.answers.q7 = 'low'; persist(); const next = encodeAnswers(state.answers); location.hash = `#/result/${next}`; viewResults(next); }
            }, t('emptyAction')),
            el('a', { class: 'btn secondary', href: '#/quiz' }, t('editAnswers'))
          )
        )
      )
    );
    return;
  }

  /* 換一組新答案就回到第一張；只是切換語言則停在原本那一張 */
  if (state.resultCode !== code) {
    state.resultCode = code;
    state.step = 0;
  }

  document.body.dataset.view = 'result';
  const profile = report.profile;
  const { stage, indicators } = buildDeck(report);

  app.replaceChildren(
    el('section', { class: 'result-shell', 'aria-labelledby': 'result-heading' },
      el('div', { class: 'result-top' },
        el('p', { class: 'eyebrow' }, t('resultEyebrow')),
        el('button', { type: 'button', class: 'chip profile-open', onclick: () => openProfile(report) }, t('profileBtn'))
      ),
      el('h1', { class: 'sr-only', id: 'result-heading' }, `${t('resultTitle')}：${L(profile.zh, profile.en)}`),
      el('p', { class: 'deck-guide' },
        el('strong', { class: 'deck-profile' }, L(profile.zh, profile.en)), ` · ${t('deckGuide')}`),
      stage,
      deck.status,
      indicators
    )
  );

  setStep(state.step);
}

/* 風味偏好、角色說明與其他出口：從卡牌右上角打開，不佔卡面空間 */
function openProfile(report) {
  document.getElementById('sheet-title').textContent = t('profileSheetTitle');
  document.getElementById('sheet-ja').textContent = L(report.profile.en, report.profile.zh);
  const body = document.getElementById('sheet-body');
  body.replaceChildren(
    el('p', { class: 'small muted', style: 'margin-top:0' }, t('resultLede')),
    el('div', { class: 'rc-section', style: 'margin-top:14px' },
      el('h4', {}, t('tasteTitle')),
      tasteRows(report.prefs.target)
    ),
    el('div', { class: 'rc-section' },
      el('h4', {}, t('guideTitle')),
      el('ul', { class: 'role-legend' }, report.results.map((row, i) =>
        el('li', {},
          el('b', {}, `${i + 1} · ${roleLabel(row.role)}`),
          el('span', {}, roleHint(row.role))
        )
      ))
    ),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn small', onclick: () => copy(shareUrl()) }, t('copyShare')),
      el('a', { class: 'btn secondary small', href: '#/quiz', onclick: () => closeSheet() }, t('editAnswers')),
      el('button', {
        type: 'button', class: 'btn secondary small',
        onclick: () => { closeSheet(); startQuiz(); }
      }, t('restart'))
    ),
    el('p', { class: 'tiny muted', style: 'margin-top:10px' }, t('shareHint')),
    el('p', { style: 'margin:14px 0 0' },
      el('a', { href: '#/teas', onclick: () => closeSheet() }, t('catalogLink')))
  );
  openSheet();
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
        onclick: () => { catalogFilter = key; location.hash = key === 'all' ? '#/teas' : `#/teas/${key}`; viewCatalog(); }
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
  if (hash.startsWith('#/teas')) {
    const family = hash.split('/')[2];
    if (family && Object.hasOwn(TEA_FAMILIES, family)) catalogFilter = family;
    else if (!family) catalogFilter = 'all';
    viewCatalog(); return;
  }
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

/* 鍵盤：Quiz 與結果卡牌都用左右鍵移動 */
document.addEventListener('keydown', (event) => {
  if (document.activeElement?.tagName === 'INPUT') return;
  if (sheet.open || sheet.hasAttribute('open')) return;
  if (location.hash.startsWith('#/quiz')) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(state.index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); advance(); }
    return;
  }
  if (location.hash.startsWith('#/result') && deck.total) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); setStep(deck.index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); setStep(deck.index + 1); }
  }
});

restore();
route();
