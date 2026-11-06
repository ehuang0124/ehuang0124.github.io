/* 選茶 Quiz — 題目、偏好向量與推薦引擎
 *
 * 依規格 §3（MVP 7 題）與 §5（Rule-based + Weighted Scoring）實作。
 * 引擎是確定性的：同樣的答案一定得到同樣的結果，沒有 LLM、沒有隨機。
 *
 * 權重（規格建議值）：口感與稠滑 30%、甘甜鮮味 25%、澀度 20%、香氣 10%、
 * 使用情境與泡法 15%。咖啡因「盡量少」是軟性降權，「必須無咖啡因」是硬過濾。
 */

import { TEAS } from './data.js';

const DIMS = ['body', 'viscosity', 'umami', 'sweetness', 'astringency', 'roast', 'aroma'];

/* ---------- 題目 ---------- */
/* 每個選項給出它影響的維度目標值（0–5）。沒被問到的維度保持 3（中性）。 */
export const QUESTIONS = [
  {
    id: 'q1',
    key: 'texture',
    zh: '你喜歡茶湯喝起來是什麼感覺？',
    en: 'How should the tea feel in your mouth?',
    hintZh: '選最接近的一款，不用想茶種。',
    hintEn: 'Pick what sounds closest — no tea knowledge needed.',
    options: [
      { id: 'light', zh: '清爽如水', en: 'Light, almost like water', target: { body: 1, viscosity: 1, umami: 2 } },
      { id: 'smooth', zh: '柔順圓潤', en: 'Smooth and round', target: { body: 3, viscosity: 2, umami: 3 } },
      { id: 'silky', zh: '微微稠滑、有包覆感', en: 'Slightly silky, coating', target: { body: 3, viscosity: 4, umami: 4 } },
      { id: 'thick', zh: '濃厚像高湯', en: 'Thick, like broth', target: { body: 5, viscosity: 4, umami: 5 } }
    ]
  },
  {
    id: 'q2',
    key: 'flavour',
    zh: '你偏好的味道？',
    en: 'Which flavour pulls you in?',
    options: [
      { id: 'sweet', zh: '清甜', en: 'Clean sweetness', target: { sweetness: 4, umami: 2 } },
      { id: 'umami', zh: '鮮味 umami', en: 'Umami savouriness', target: { umami: 5, sweetness: 2 } },
      { id: 'roasted', zh: '焙炒溫香', en: 'Toasted, warm', target: { roast: 4, sweetness: 2 } },
      { id: 'balanced', zh: '平衡、不特別突出', en: 'Balanced, nothing loud', target: { sweetness: 3, umami: 3, roast: 1 } }
    ]
  },
  {
    id: 'q3',
    key: 'astringency',
    zh: '你能接受多少澀味？',
    en: 'How much astringency can you take?',
    options: [
      { id: 'none', zh: '幾乎不要', en: 'Almost none', target: { astringency: 0.5 } },
      { id: 'some', zh: '一點可以', en: 'A little is fine', target: { astringency: 2 } },
      { id: 'enjoy', zh: '喜歡有收斂感', en: 'I like the grip', target: { astringency: 4 } }
    ]
  },
  {
    id: 'q4',
    key: 'aroma',
    zh: '你希望什麼香氣？',
    en: 'What aroma do you want?',
    options: [
      { id: 'subtle', zh: '低調柔和', en: 'Quiet and soft', target: { aroma: 1 }, families: ['cover'] },
      { id: 'grassy', zh: '青草清香', en: 'Fresh-cut grass', target: { aroma: 2 }, families: ['green'] },
      { id: 'floral', zh: '花香', en: 'Floral', target: { aroma: 4 }, families: ['cover', 'fruity'] },
      { id: 'toasty', zh: '炒焙香', en: 'Roasted', target: { aroma: 3 }, families: ['roasted', 'rice'] }
    ]
  },
  {
    id: 'q5',
    key: 'caffeine',
    zh: '你對咖啡因的要求？',
    en: 'What do you need from caffeine?',
    optional: true,
    options: [
      { id: 'none', zh: '必須無咖啡因', en: 'Must be caffeine-free', caffeine: 'strict' },
      { id: 'low', zh: '盡量少', en: 'As little as possible', caffeine: 'low' },
      { id: 'normal', zh: '一般即可', en: 'Normal is fine', caffeine: 'ok' },
      { id: 'any', zh: '不在意', en: 'Don’t care', caffeine: 'any' }
    ]
  },
  {
    id: 'q6',
    key: 'occasion',
    zh: '最常什麼時候飲用？',
    en: 'When will you usually drink it?',
    optional: true,
    options: [
      { id: 'evening', zh: '晚上', en: 'In the evening', occasion: 'evening' },
      { id: 'allday', zh: '全天', en: 'All day', occasion: 'allday' },
      { id: 'morning', zh: '早晨提神', en: 'Morning wake-up', occasion: 'morning' },
      { id: 'tasting', zh: '特別品飲', en: 'A special tasting', occasion: 'tasting' }
    ]
  },
  {
    id: 'q7',
    key: 'method',
    zh: '你想怎麼喝？',
    en: 'How do you want to brew it?',
    options: [
      { id: 'daily', zh: '日常、容易泡', en: 'Easy, everyday', method: 'daily' },
      { id: 'slow', zh: '願意低溫慢泡', en: 'Happy to brew low and slow', method: 'slow' },
      { id: 'cold', zh: '冷泡', en: 'Cold brew', method: 'cold' },
      { id: 'milk', zh: '紅茶或加奶', en: 'Black tea or with milk', method: 'milk' }
    ]
  }
];

export const SCALE_LABELS = {
  zh: { body: '茶湯厚度 Body', viscosity: '稠滑 Umami-body', umami: '鮮味 Umami', sweetness: '甘甜 Sweetness', astringency: '澀味 Astringency', roast: '焙香 Roast', aroma: '香氣 Aroma' },
  en: { body: 'Body', viscosity: 'Silky texture', umami: 'Umami', sweetness: 'Sweetness', astringency: 'Astringency', roast: 'Roast', aroma: 'Aroma' }
};

/* ---------- 偏好向量 ---------- */
export function buildPreference(answers = {}) {
  const target = {};
  DIMS.forEach((d) => { target[d] = 3; });
  const prefs = { target, families: [], caffeine: 'any', occasion: 'allday', method: 'daily', answered: 0 };

  QUESTIONS.forEach((q) => {
    const answer = answers[q.id];
    if (!answer) return;
    prefs.answered += 1;
    const option = q.options.find((o) => o.id === answer);
    if (!option) return;
    if (option.target) Object.entries(option.target).forEach(([k, v]) => { target[k] = v; });
    if (option.families) prefs.families = option.families;
    if (option.caffeine) prefs.caffeine = option.caffeine;
    if (option.occasion) prefs.occasion = option.occasion;
    if (option.method) prefs.method = option.method;
  });

  return prefs;
}

/* ---------- 相似度 ---------- */
const closeness = (teaValue, wanted) => 1 - Math.abs(teaValue - wanted) / 5;

const FAMILY_AFFINITY = {
  gyokuro: ['cover'],
  kabuse: ['cover', 'green'],
  sencha: ['green'],
  kamairi: ['roasted', 'green'],
  matcha: ['cover', 'green'],
  genmaicha: ['roasted', 'rice'],
  wakoucha: ['fruity', 'roasted'],
  decaf: ['green', 'roasted', 'cover']
};

/* 泡法契合度：回傳 0–1 */
function methodFit(tea, method) {
  const easy = tea.brew.method === 'kyusu' && (tea.brew.temp ?? 80) >= 70;
  const lowAndSlow = (tea.brew.temp ?? 80) <= 60 || tea.brew.method === 'chasen';
  switch (method) {
    case 'slow': return lowAndSlow ? 1 : tea.brew.method === 'chasen' ? 1 : 0.45;
    case 'cold': return ['sencha', 'kabuse', 'gyokuro', 'matcha'].includes(tea.family) ? 0.9 : tea.family === 'wakoucha' ? 0.5 : 0.6;
    case 'milk': return tea.family === 'wakoucha' || tea.family === 'matcha' ? 1 : 0.25;
    case 'daily': return easy ? 1 : lowAndSlow ? 0.35 : 0.6;
    default: return 0.7;
  }
}

/* 飲用情境契合度：回傳 0–1 */
function occasionFit(tea, occasion) {
  const strong = tea.caffeine.mgPer100ml !== null && tea.caffeine.mgPer100ml >= 30;
  const veryStrong = tea.family === 'matcha' || tea.family === 'gyokuro';
  switch (occasion) {
    case 'evening': return tea.caffeine.status === 'verified_free' ? 1 : veryStrong ? 0.1 : strong ? 0.35 : 0.65;
    case 'morning': return veryStrong ? 0.9 : strong ? 0.85 : 0.55;
    case 'tasting': return veryStrong ? 1 : tea.taste.umami >= 4 ? 0.9 : 0.5;
    default: return 0.7;
  }
}

/* 咖啡因軟性降權（嚴格需求已在硬過濾處理） */
function caffeineMultiplier(tea, prefs) {
  if (prefs.caffeine === 'strict') return 1;
  if (prefs.caffeine === 'low') {
    if (tea.caffeine.status === 'verified_free') return 1.03;
    const strong = tea.caffeine.mgPer100ml !== null && tea.caffeine.mgPer100ml >= 30;
    if (strong || tea.family === 'matcha') return 0.82;
    if (tea.caffeine.mgPer100ml === null) return 0.94;
    return 0.97;
  }
  return 1;
}

export function scoreTea(tea, prefs) {
  const t = tea.taste;
  const target = prefs.target;

  const texture = (closeness(t.body, target.body) + closeness(t.viscosity, target.viscosity)) / 2;
  const sweetUmami = (closeness(t.sweetness, target.sweetness) + closeness(t.umami, target.umami)) / 2;
  const astringency = closeness(t.astringency, target.astringency);

  const families = FAMILY_AFFINITY[tea.family] || [];
  const familyMatch = prefs.families.length
    ? (prefs.families.some((f) => families.includes(f)) ? 1 : 0.45)
    : 0.7;
  const aroma = closeness(t.aroma, target.aroma) * 0.6 + familyMatch * 0.4;

  const context = (methodFit(tea, prefs.method) + occasionFit(tea, prefs.occasion)) / 2;

  const raw = texture * 0.30 + sweetUmami * 0.25 + astringency * 0.20 + aroma * 0.10 + context * 0.15;
  const decafPenalty = tea.family === 'decaf' && prefs.caffeine !== 'strict' && prefs.caffeine !== 'low' ? 0.9 : 1;
  return {
    tea,
    score: raw * caffeineMultiplier(tea, prefs) * decafPenalty,
    parts: { texture, sweetUmami, astringency, aroma, context }
  };
}

/* ---------- 多樣性（規格 §5 Step D）---------- */
/* Top 3 不全部出自同一茶類：若三名同類，保留第一、第二，第三換成另一風格中最高分者。 */
function diversify(ranked, count = 3) {
  const picks = [];
  const taken = new Set();
  for (const row of ranked) {
    if (picks.length >= count) break;
    if (picks.length === 2 && picks.every((p) => p.tea.family === picks[0].tea.family) && row.tea.family === picks[0].tea.family) continue;
    picks.push(row);
    taken.add(row.tea.id);
  }
  // 若因多樣性跳過而不足，補回原排序
  for (const row of ranked) {
    if (picks.length >= count) break;
    if (!taken.has(row.tea.id)) { picks.push(row); taken.add(row.tea.id); }
  }
  return picks;
}

/* ---------- 解釋（固定結構模板）---------- */
/* 每條理由都綁定「一題答案 → 一個維度」，所以句子一定讀得通，也不會重複同一題。
 * 用語只描述編輯標籤，不假裝是化學分析或個人化預測。 */

const DIM_WORD = {
  body: { zh: '茶湯厚度', en: 'body' },
  viscosity: { zh: '稠滑感', en: 'silky texture' },
  umami: { zh: '鮮味', en: 'umami' },
  sweetness: { zh: '甘甜', en: 'sweetness' },
  astringency: { zh: '澀味', en: 'astringency' },
  roast: { zh: '焙香', en: 'roast' },
  aroma: { zh: '香氣強度', en: 'aroma intensity' }
};

function levelWord(value, lang) {
  if (value <= 1) return lang === 'zh' ? '很低' : 'very low';
  if (value <= 2) return lang === 'zh' ? '偏低' : 'low';
  if (value <= 3) return lang === 'zh' ? '中等' : 'medium';
  if (value <= 4) return lang === 'zh' ? '偏高' : 'high';
  return lang === 'zh' ? '最高' : 'the highest';
}

/* Q1 談的是整體口感（body + viscosity），Q2 談的維度取它設定最多的那一項。 */
function q2Dimension(option) {
  if (!option || !option.target) return 'umami';
  const entries = Object.entries(option.target).sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function reasonFor(questionId, tea, answers, lang) {
  const question = QUESTIONS.find((q) => q.id === questionId);
  const option = question?.options.find((o) => o.id === answers[questionId]);
  if (!option) return null;
  const word = lang === 'zh' ? option.zh : option.en;

  if (questionId === 'q1') {
    return lang === 'zh'
      ? `你說想要「${word}」的口感；這款稠滑感 ${tea.taste.viscosity}／5、茶湯厚度 ${tea.taste.body}／5。`
      : `You asked for “${word}”; this one sits at ${tea.taste.viscosity}/5 on silky texture and ${tea.taste.body}/5 on body.`;
  }
  if (questionId === 'q2') {
    const dim = q2Dimension(option);
    const dimWord = DIM_WORD[dim][lang];
    return lang === 'zh'
      ? `你偏好的味道是「${word}」；這款${dimWord} ${tea.taste[dim]}／5（${levelWord(tea.taste[dim], lang)}）。`
      : `Your flavour pick was “${word}”; this tea scores ${tea.taste[dim]}/5 on ${dimWord} — ${levelWord(tea.taste[dim], lang)}.`;
  }
  if (questionId === 'q3') {
    return lang === 'zh'
      ? `你能接受的澀味是「${word}」；這款澀味 ${tea.taste.astringency}／5。`
      : `On astringency you chose “${word}”; this tea is ${tea.taste.astringency}/5.`;
  }
  if (questionId === 'q4') {
    return lang === 'zh'
      ? `你希望的香氣是「${word}」；這款香氣強度 ${tea.taste.aroma}／5。`
      : `You wanted a “${word}” aroma; this tea’s aroma intensity is ${tea.taste.aroma}/5.`;
  }
  return null;
}

export function buildReasons(tea, prefs, answers, lang = 'zh') {
  /* 依「與偏好差距」排序，只取最貼近的兩題當理由 */
  const candidates = ['q1', 'q2', 'q3', 'q4']
    .filter((id) => answers[id])
    .map((id) => {
      const question = QUESTIONS.find((q) => q.id === id);
      const option = question.options.find((o) => o.id === answers[id]);
      let gap = 0;
      let count = 0;
      if (id === 'q1') {
        gap += Math.abs(tea.taste.viscosity - (option.target?.viscosity ?? prefs.target.viscosity));
        gap += Math.abs(tea.taste.body - (option.target?.body ?? prefs.target.body));
        count = 2;
      } else if (id === 'q2') {
        const dim = q2Dimension(option);
        gap = Math.abs(tea.taste[dim] - (option.target?.[dim] ?? prefs.target[dim]));
        count = 1;
      } else if (id === 'q3') {
        gap = Math.abs(tea.taste.astringency - (option.target?.astringency ?? prefs.target.astringency));
        count = 1;
      } else if (id === 'q4') {
        gap = Math.abs(tea.taste.aroma - (option.target?.aroma ?? prefs.target.aroma));
        count = 1;
      }
      return { id, gap: count ? gap / count : gap };
    })
    .sort((a, b) => a.gap - b.gap);

  const reasons = [];
  for (const { id } of candidates) {
    if (reasons.length >= 2) break;
    const reason = reasonFor(id, tea, answers, lang);
    if (reason) reasons.push({ dim: id, text: reason });
  }

  /* 第三條：泡法（規格 §5 Step E 要求至少兩條，這裡固定補泡法讓卡片可執行） */
  const methodNote = {
    slow: {
      zh: `你說願意低溫慢泡；這款建議 ${tea.brew.temp ?? '—'}°C、${tea.brew.seconds ?? '—'} 秒。`,
      en: `You said you would brew low and slow; ${tea.brew.temp ?? '—'}°C for ${tea.brew.seconds ?? '—'} s fits.`
    },
    cold: {
      zh: '你想冷泡：同一份茶葉放進冷水，冰箱 4–6 小時，風味更甜、更少澀。',
      en: 'For cold brew: the same leaf in cold water, 4–6 h in the fridge — sweeter, less astringent.'
    },
    milk: {
      zh: '你選了紅茶或加奶，這款的焙香與甜度不會被牛奶蓋掉。',
      en: 'You chose black tea or milk; this one’s roast and sweetness survive the milk.'
    },
    daily: {
      zh: '日常泡法：茶壺、熱水、一分鐘上下，不需要器材。',
      en: 'Everyday brewing: a pot, hot water, about a minute — no equipment.'
    }
  }[prefs.method];
  if (methodNote) reasons.push({ dim: 'method', text: lang === 'zh' ? methodNote.zh : methodNote.en });

  return reasons;
}

/* ---------- 風味輪廓命名 ---------- */
export function profileFor(prefs) {
  const t = prefs.target;
  if (t.viscosity >= 3.5 && t.astringency <= 2) return { zh: '柔滑甘醇型', en: 'Mellow & Silky', code: 'mellow' };
  if (t.umami >= 4 && t.body >= 4) return { zh: '濃厚鮮味型', en: 'Deep Umami', code: 'deep' };
  if (t.roast >= 3.5) return { zh: '焙香溫潤型', en: 'Toasted & Warm', code: 'toasty' };
  if (t.aroma >= 3.5) return { zh: '花香清雅型', en: 'Floral & Fragrant', code: 'floral' };
  if (t.body <= 2 && t.viscosity <= 2) return { zh: '清透輕盈型', en: 'Light & Clear', code: 'light' };
  if (t.sweetness >= 3.5) return { zh: '甘甜圓潤型', en: 'Sweet & Round', code: 'sweet' };
  return { zh: '均衡日常型', en: 'Balanced Everyday', code: 'balanced' };
}

/* ---------- 主推薦 ---------- */
export function recommend(answers = {}, lang = 'zh') {
  const prefs = buildPreference(answers);

  // Step A：硬過濾
  let eligible = TEAS;
  let hardFiltered = false;
  if (prefs.caffeine === 'strict') {
    eligible = TEAS.filter((t) => t.caffeine.status === 'verified_free');
    hardFiltered = true;
  }

  if (!eligible.length) {
    return { empty: true, prefs, hardFiltered, results: [], ranked: [] };
  }

  // Step B–C：加權相似度
  const ranked = eligible
    .map((tea) => scoreTea(tea, prefs))
    .sort((a, b) => b.score - a.score || a.tea.id.localeCompare(b.tea.id));

  // Step D：多樣性
  const picks = diversify(ranked, 3);

  const topFamily = picks[0].tea.family;
  const results = picks.map((row, index) => {
    const role = index === 0 ? 'top1' : index === 1 ? 'top2' : (row.tea.family === topFamily ? 'top3' : 'explore');
    return {
      ...row,
      role,
      reasons: buildReasons(row.tea, prefs, answers, lang),
      confidence: row.tea.confidence
    };
  });

  return {
    empty: false,
    prefs,
    profile: profileFor(prefs, lang),
    hardFiltered,
    results,
    ranked: ranked.map((r) => ({ id: r.tea.id, score: r.score }))
  };
}

/* ---------- 分享用答案編碼（不含個資）---------- */
export function encodeAnswers(answers) {
  return QUESTIONS.map((q) => {
    const answer = answers[q.id];
    if (!answer) return '-';
    const index = q.options.findIndex((o) => o.id === answer);
    return index >= 0 ? String(index + 1) : '-';
  }).join('');
}

export function decodeAnswers(code) {
  if (!code || typeof code !== 'string') return null;
  const chars = code.trim().split('');
  if (chars.length !== QUESTIONS.length) return null;
  const answers = {};
  let valid = 0;
  chars.forEach((ch, i) => {
    if (ch === '-' || ch === '0' || ch === '') return;
    const index = Number(ch) - 1;
    const option = QUESTIONS[i].options[index];
    if (option) { answers[QUESTIONS[i].id] = option.id; valid += 1; }
  });
  return valid >= 3 ? answers : null;
}
