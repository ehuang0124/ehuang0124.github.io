/* Japanese Tea Finder — sensory quiz, version 2.
 * Deterministic editorial matching; flavour scores are not laboratory measurements.
 * The versioned share code deliberately rejects v1 codes rather than remapping
 * answers to questions that no longer mean the same thing.
 */
import { TEAS } from './data.js';

export const QUIZ_VERSION = 'v2';
const DIMS = ['body', 'viscosity', 'umami', 'sweetness', 'astringency', 'roast', 'aroma'];

export const QUESTIONS = [
  {
    id: 'q1', key: 'aroma', zh: '把茶杯湊近鼻尖，你想聞到什麼？', en: 'Bring the cup to your nose. What would you like to smell?',
    hintZh: '不用想茶名，選一個讓你想停下來的香氣。', hintEn: 'Forget the tea names. Choose an aroma you would pause for.',
    options: [
      { id: 'green', zh: '青草、嫩葉與海苔', en: 'Fresh grass, young leaves and nori', subZh: '像走進剛下過雨的茶園', subEn: 'Like a tea garden after rain', target: { aroma: 2, roast: 0 }, families: ['green', 'cover'] },
      { id: 'floral', zh: '花朵與清新果香', en: 'Flowers and fresh fruit', subZh: '輕盈、明亮，香氣先抵達', subEn: 'Light and bright, with aroma arriving first', target: { aroma: 4, roast: 1 }, families: ['floral', 'fruity'] },
      { id: 'honey', zh: '蜂蜜與甜薯', en: 'Honey and sweet potato', subZh: '溫暖的甜香，讓我想慢下來', subEn: 'A warm sweetness that makes me slow down', target: { aroma: 3, roast: 2 }, families: ['honey', 'fruity'] },
      { id: 'toasted', zh: '炒米、堅果與焙火', en: 'Toasted rice, nuts and roast', subZh: '像剛打開一袋炒香的穀物', subEn: 'Like opening a bag of freshly toasted grains', target: { aroma: 3, roast: 4 }, families: ['roasted', 'rice'] },
      { id: 'malty', zh: '麥芽與可可', en: 'Malt and cocoa', subZh: '熟悉的紅茶調，香氣更厚一點', subEn: 'A familiar black-tea note, with a little more depth', target: { aroma: 4, roast: 3 }, families: ['malty', 'cocoa'] }
    ]
  },
  {
    id: 'q2', key: 'flavour', zh: '第一口，最想嚐到哪種味道？', en: 'What would you like the first sip to taste like?',
    options: [
      { id: 'sweet', zh: '清甜，慢慢回甘', en: 'Clean sweetness that lingers', subZh: '不用加糖，也有舒服的甜韻', subEn: 'A gentle sweetness without adding sugar', target: { sweetness: 4, umami: 2 } },
      { id: 'umami', zh: '鮮味，像一口清湯', en: 'Savoury umami, like a clear broth', subZh: '茶的鮮與甘，比苦澀更明顯', subEn: 'Savouriness and sweetness ahead of bitterness', target: { umami: 5, sweetness: 3 } },
      { id: 'honeyed', zh: '果蜜般的甜韻', en: 'A fruit-and-honey-like finish', subZh: '甜香柔和，適合配一塊點心', subEn: 'Soft sweet aromatics, lovely beside a small sweet', target: { sweetness: 5, umami: 2, roast: 1 } },
      { id: 'toasty', zh: '焙炒的溫暖滋味', en: 'Warm, toasted flavour', subZh: '想要炒香，而不是青草味', subEn: 'Toasty warmth rather than grassy freshness', target: { roast: 4, sweetness: 2, umami: 2 } },
      { id: 'balanced', zh: '甜、鮮、茶味都有一點', en: 'A balance of sweetness, umami and tea', subZh: '沒有哪一種味道特別搶戲', subEn: 'No single note taking all the attention', target: { sweetness: 3, umami: 3, roast: 2 } }
    ]
  },
  {
    id: 'q3', key: 'texture', zh: '茶湯在嘴裡，你喜歡哪種份量？', en: 'How much weight should the tea have on your palate?',
    options: [
      { id: 'light', zh: '輕盈，像水一樣', en: 'Light, almost like water', subZh: '喝完覺得乾淨，沒有負擔', subEn: 'A clean, unburdened finish', target: { body: 1, viscosity: 1 } },
      { id: 'round', zh: '柔順，剛好圓潤', en: 'Smooth and gently round', subZh: '有一點厚度，但不濃重', subEn: 'Some substance, without heaviness', target: { body: 3, viscosity: 2 } },
      { id: 'silky', zh: '微微稠滑，包住舌頭', en: 'Silky, gently coating the tongue', subZh: '喜歡茶湯慢慢滑過的感覺', subEn: 'I like the tea to glide slowly across my tongue', target: { body: 3, viscosity: 4 } },
      { id: 'full', zh: '厚實，茶味很有存在感', en: 'Full, with a clear presence', subZh: '想喝到一杯有份量的茶', subEn: 'I want a cup with substance', target: { body: 5, viscosity: 3 } }
    ]
  },
  {
    id: 'q4', key: 'finish', zh: '喝完後，舌頭喜歡什麼感覺？', en: 'How would you like your palate to feel afterwards?',
    hintZh: '澀感是舌面微微乾、收緊的感覺，不是辣味。', hintEn: 'Astringency is that gently dry, tightening feeling — not spiciness.',
    options: [
      { id: 'soft', zh: '柔柔的，幾乎不乾澀', en: 'Soft, with almost no dryness', subZh: '希望最後留下的是甘甜', subEn: 'Let sweetness be the last thing I notice', target: { astringency: 0.5 } },
      { id: 'fresh', zh: '一點收斂，剛好清爽', en: 'A little grip, a fresh finish', subZh: '有茶的感覺，但不要咬舌', subEn: 'Clearly tea, but not mouth-puckering', target: { astringency: 2 } },
      { id: 'bold', zh: '明顯一點，收尾俐落', en: 'A firmer, more defined finish', subZh: '我喜歡茶留下清楚的輪廓', subEn: 'I like tea to leave a clear outline', target: { astringency: 4 } }
    ]
  },
  {
    id: 'q5', key: 'method', zh: '這杯茶，你打算怎麼喝？', en: 'How will you make this cup?',
    options: [
      { id: 'daily', zh: '熱水一沖，日常慢慢喝', en: 'Hot water, an everyday cup', subZh: '茶壺或急須，簡單就好', subEn: 'A teapot or kyusu is enough', method: 'daily' },
      { id: 'slow', zh: '留一段時間，細細品飲', en: 'Set aside time for a tasting', subZh: '願意控制水溫，也願意等', subEn: 'Happy to mind the temperature and wait', method: 'slow' },
      { id: 'cold', zh: '放進冰箱，隔天喝冷泡', en: 'Cold brew for tomorrow', subZh: '喜歡冰涼、柔和的味道', subEn: 'I like a cool, gentle cup', method: 'cold' },
      { id: 'milk', zh: '加牛奶，做一杯奶茶', en: 'With milk, as a milk tea', subZh: '希望奶香裡還喝得到茶', subEn: 'I still want to taste the tea through the milk', method: 'milk' },
      { id: 'whisk', zh: '用茶筅，刷一碗抹茶', en: 'Whisk a bowl of matcha', subZh: '想要濃郁茶香與綿密口感', subEn: 'I want rich tea aroma and a fine froth', method: 'whisk' }
    ]
  },
  {
    id: 'q6', key: 'occasion', zh: '想把這杯茶，留給哪個時刻？', en: 'When would you like this tea alongside you?', optional: true,
    options: [
      { id: 'morning', zh: '早晨，配早餐', en: 'Morning, with breakfast', occasion: 'morning' },
      { id: 'afternoon', zh: '午後，配一塊點心', en: 'Afternoon, with something sweet', occasion: 'afternoon' },
      { id: 'evening', zh: '晚上，讀幾頁書', en: 'Evening, with a few pages of a book', occasion: 'evening' },
      { id: 'anytime', zh: '隨時，想喝就喝', en: 'Whenever I feel like a cup', occasion: 'anytime' }
    ]
  },
  {
    id: 'q7', key: 'caffeine', zh: '這杯茶，需要避開咖啡因嗎？', en: 'Does this cup need to avoid caffeine?', optional: true,
    options: [
      { id: 'normal', zh: '不用，一般茶就可以', en: 'No, regular tea is fine', caffeine: 'ok' },
      { id: 'low', zh: '盡量少一點', en: 'A little less, if possible', caffeine: 'low' },
      { id: 'strict', zh: '只選明確標示無咖啡因的商品', en: 'Only explicitly labelled caffeine-free products', caffeine: 'strict' }
    ]
  }
];

export const SCALE_LABELS = {
  zh: { body: '茶湯厚度 Body', viscosity: '稠滑 Texture', umami: '鮮味 Umami', sweetness: '甘甜 Sweetness', astringency: '澀感 Astringency', roast: '焙香 Roast', aroma: '香氣 Aroma' },
  en: { body: 'Body', viscosity: 'Silky texture', umami: 'Umami', sweetness: 'Sweetness', astringency: 'Astringency', roast: 'Roast', aroma: 'Aroma' }
};
export const AROMA_LABELS = {
  green: { zh: '嫩葉清香', en: 'fresh leaves' }, cover: { zh: '覆下茶香', en: 'shaded-tea aroma' },
  floral: { zh: '花香', en: 'floral notes' }, fruity: { zh: '果香', en: 'fruit-like notes' },
  honey: { zh: '蜜香', en: 'honey-like notes' }, roasted: { zh: '焙火香', en: 'roasted notes' },
  rice: { zh: '炒米香', en: 'toasted rice' }, malty: { zh: '麥芽香', en: 'malt' }, cocoa: { zh: '可可調', en: 'cocoa-like notes' }
};

export function sanitizeAnswers(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(QUESTIONS.flatMap((q) => {
    const value = input[q.id];
    return q.options.some((o) => o.id === value) ? [[q.id, value]] : [];
  }));
}
export function missingRequired(answers) {
  return QUESTIONS.filter((q) => !q.optional && !answers[q.id]).map((q) => q.id);
}
export function buildPreference(input = {}) {
  const answers = sanitizeAnswers(input);
  const target = Object.fromEntries(DIMS.map((d) => [d, 3]));
  const prefs = { target, families: [], caffeine: 'any', occasion: 'anytime', method: 'daily', answered: 0 };
  for (const q of QUESTIONS) {
    const option = q.options.find((o) => o.id === answers[q.id]);
    if (!option) continue;
    prefs.answered += 1;
    if (option.target) Object.assign(target, option.target);
    if (option.families) prefs.families = option.families;
    for (const key of ['caffeine', 'occasion', 'method']) if (option[key]) prefs[key] = option[key];
  }
  return prefs;
}

const closeness = (value, wanted) => 1 - Math.abs(value - wanted) / 5;
const GREEN_FAMILIES = ['sencha', 'gyokuro', 'kabuse', 'kamairi', 'genmaicha'];
export function methodFit(tea, method) {
  switch (method) {
    case 'milk': return tea.family === 'wakoucha' ? (tea.milkFit ?? 0.7) : tea.family === 'matcha' ? 0.9 : 0.15;
    case 'whisk': return tea.family === 'matcha' ? 1 : 0.1;
    case 'slow': return tea.family === 'gyokuro' ? 1 : tea.family === 'matcha' ? 0.8 : tea.brew.method === 'kyusu' ? 0.65 : 0.5;
    case 'cold': return GREEN_FAMILIES.includes(tea.family) ? 0.9 : tea.family === 'wakoucha' ? 0.8 : tea.family === 'matcha' ? 0.55 : 0.6;
    default: return tea.brew.method === 'label' ? 0.5 : tea.family === 'gyokuro' ? 0.5 : 0.9;
  }
}
function occasionFit(tea, occasion) {
  if (occasion === 'evening') return tea.caffeine.status === 'verified_free' ? 1 : ['gyokuro', 'matcha'].includes(tea.family) ? 0.25 : 0.55;
  if (occasion === 'morning') return tea.family === 'wakoucha' || tea.family === 'matcha' ? 0.95 : 0.75;
  if (occasion === 'afternoon') return tea.taste.sweetness >= 4 || tea.family === 'matcha' ? 1 : 0.7;
  return 0.75;
}
function caffeineMultiplier(tea, prefs) {
  if (prefs.caffeine !== 'low') return 1;
  if (tea.caffeine.status === 'verified_free') return 1;
  // Never compare gyokuro's concentrated reference infusion with other categories.
  if (['gyokuro', 'matcha', 'wakoucha'].includes(tea.family)) return 0.82;
  return tea.caffeine.mgPer100ml === null ? 0.94 : 0.97;
}
export function scoreTea(tea, prefs) {
  const wanted = prefs.target;
  const t = tea.taste;
  const aromaFamilies = prefs.families.length
    ? prefs.families.filter((f) => tea.aromaFamily.includes(f)).length / prefs.families.length : 0.5;
  const parts = {
    aroma: closeness(t.aroma, wanted.aroma) * 0.35 + aromaFamilies * 0.65,
    flavour: (closeness(t.sweetness, wanted.sweetness) + closeness(t.umami, wanted.umami) + closeness(t.roast, wanted.roast)) / 3,
    texture: (closeness(t.body, wanted.body) + closeness(t.viscosity, wanted.viscosity)) / 2,
    finish: closeness(t.astringency, wanted.astringency),
    context: (methodFit(tea, prefs.method) * 2 + occasionFit(tea, prefs.occasion)) / 3
  };
  const raw = parts.aroma * 0.25 + parts.flavour * 0.25 + parts.texture * 0.20 + parts.finish * 0.15 + parts.context * 0.15;
  const decafPenalty = tea.family === 'decaf' && prefs.caffeine !== 'strict' ? (prefs.caffeine === 'low' ? 0.9 : 0.82) : 1;
  return { tea, parts, score: raw * caffeineMultiplier(tea, prefs) * decafPenalty };
}

/* An explicit milk-tea choice is a route, not a cue to force an unrelated green
 * tea into the top three. Otherwise keep the third recommendation exploratory. */
function diversify(ranked, prefs, count = 3) {
  const pool = prefs.method === 'milk' ? ranked.filter((r) => r.tea.family === 'wakoucha') : ranked;
  const picks = [];
  for (const row of pool) {
    if (picks.length >= count) break;
    if (prefs.method !== 'milk' && picks.length === 2 && picks.every((r) => r.tea.family === picks[0].tea.family) && row.tea.family === picks[0].tea.family) continue;
    picks.push(row);
  }
  for (const row of ranked) {
    if (picks.length >= count) break;
    if (!picks.some((r) => r.tea.id === row.tea.id)) picks.push(row);
  }
  return picks;
}

/* 結果卡不解釋「為什麼推薦這款」：貼近理由與分數對照已整段移除。
 * 剩下唯一與答案有關的句子是 methodNote —— 依選定的喝法給這款茶的沖泡方式。 */
export function methodNote(tea, method, lang = 'zh') {
  const b = tea.brew;
  if (b.method === 'label') return lang === 'zh' ? '你選了自己的喝法；這款請依商品包裝標示沖泡。' : 'Follow the product label for your chosen way of drinking.';
  if (method === 'milk') {
    if (tea.family === 'wakoucha') return lang === 'zh'
      ? `你想做奶茶：先用 ${b.grams} g 茶葉、${Math.round(b.ml / 2)} mL 熱水沖濃，再加入溫牛奶；從少量奶開始，保留茶香。`
      : `For milk tea, start with ${b.grams} g leaf and ${Math.round(b.ml / 2)} mL hot water, then add a little warm milk. Increase milk to taste.`;
    return lang === 'zh' ? `你想做奶茶：先用 ${b.grams} g 抹茶刷勻，再慢慢加入牛奶，從少量奶開始。` : `For milk tea, whisk ${b.grams} g matcha first, then gradually add milk to taste.`;
  }
  if (method === 'cold') return tea.family === 'matcha'
    ? (lang === 'zh' ? '冷飲抹茶不是浸泡茶葉：用少量冷水刷勻，再加入冷水與冰塊。' : 'Cold matcha is not steeped: whisk with a little cold water, then add cold water and ice.')
    : (lang === 'zh' ? `你想冷泡：${b.grams} g 茶葉加 ${b.ml} mL 冷水，冷藏 4–6 小時後濾出茶葉，當天喝完。` : `For cold brew, refrigerate ${b.grams} g leaf in ${b.ml} mL cold water for 4–6 hours. Strain and drink that day.`);
  if (method === 'whisk' || tea.family === 'matcha') return lang === 'zh'
    ? `你想慢慢品茶：${b.grams} g 抹茶過篩，加 ${b.ml} mL、${b.temp}°C 的水，刷出細緻泡沫。`
    : `For a mindful bowl, sift ${b.grams} g matcha, add ${b.ml} mL water at ${b.temp}°C and whisk to a fine froth.`;
  return lang === 'zh'
    ? `照你的喝法，先試 ${b.grams} g 茶葉、${b.ml} mL 水、${b.temp}°C、${b.seconds} 秒，再依口感微調。`
    : `For your chosen cup, start with ${b.grams} g leaf, ${b.ml} mL water at ${b.temp}°C for ${b.seconds} seconds; then adjust to taste.`;
}
export function profileFor(prefs) {
  const t = prefs.target;
  if (prefs.method === 'milk') return { zh: '茶香奶茶型', en: 'Tea-forward Milk Tea', code: 'milk' };
  if (prefs.method === 'whisk') return { zh: '濃郁抹茶型', en: 'Rich & Whisked', code: 'matcha' };
  if (prefs.families.includes('malty')) return { zh: '麥芽醇香型', en: 'Malty & Aromatic', code: 'malty' };
  if (t.roast >= 3.5) return { zh: '焙香溫潤型', en: 'Toasted & Warm', code: 'toasty' };
  if (t.umami >= 4 && t.body >= 3) return { zh: '濃厚鮮味型', en: 'Deep Umami', code: 'deep' };
  if (t.viscosity >= 3.5 && t.astringency <= 2) return { zh: '柔滑甘醇型', en: 'Mellow & Silky', code: 'mellow' };
  if (prefs.families.includes('floral')) return { zh: '花果清雅型', en: 'Floral & Fruity', code: 'floral' };
  if (prefs.families.includes('honey')) return { zh: '蜜香甜韻型', en: 'Honeyed & Gentle', code: 'honey' };
  if (t.body <= 2 && t.viscosity <= 2) return { zh: '清透輕盈型', en: 'Light & Clear', code: 'light' };
  if (t.sweetness >= 3.5) return { zh: '甘甜圓潤型', en: 'Sweet & Round', code: 'sweet' };
  return { zh: '均衡日常型', en: 'Balanced Everyday', code: 'balanced' };
}
export function recommend(input = {}, lang = 'zh') {
  const answers = sanitizeAnswers(input);
  const prefs = buildPreference(answers);
  const eligible = prefs.caffeine === 'strict' ? TEAS.filter((t) => t.caffeine.status === 'verified_free') : TEAS;
  const hardFiltered = prefs.caffeine === 'strict';
  if (!eligible.length) return { empty: true, prefs, hardFiltered, results: [], ranked: [] };
  const ranked = eligible.map((tea) => scoreTea(tea, prefs)).sort((a, b) => b.score - a.score || a.tea.id.localeCompare(b.tea.id));
  const results = diversify(ranked, prefs).map((row, index) => ({
    ...row,
    role: index === 0 ? 'top1' : index === 1 ? 'top2' : row.tea.family === ranked[0].tea.family ? 'top3' : 'explore',
    brewNote: methodNote(row.tea, prefs.method, lang), confidence: row.tea.confidence
  }));
  return { empty: false, prefs, profile: profileFor(prefs), hardFiltered, results, ranked: ranked.map((r) => ({ id: r.tea.id, score: r.score })) };
}

/* v2 codes are not interchangeable with the original seven-question quiz. */
export function encodeAnswers(input) {
  const answers = sanitizeAnswers(input);
  return `${QUIZ_VERSION}.${QUESTIONS.map((q) => {
    const index = q.options.findIndex((o) => o.id === answers[q.id]);
    return index < 0 ? '-' : String(index + 1);
  }).join('')}`;
}
export function decodeAnswers(code) {
  if (typeof code !== 'string' || !/^v2\.[1-5-]{7}$/.test(code)) return null;
  const answers = {};
  const chars = code.slice(3).split('');
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (char === '-') continue;
    /* 位數超出該題的選項數（例如手改網址）就不是有效的分享碼，回首頁。 */
    const option = QUESTIONS[index].options[Number(char) - 1];
    if (!option) return null;
    answers[QUESTIONS[index].id] = option.id;
  }
  return missingRequired(answers).length ? null : answers;
}
