// Connect /personal/travel/map/ to a Supabase project (access-code sign-in, sync).
//
//   node scripts/connect-supabase.cjs --url https://abcdefgh.supabase.co --key eyJhbGciOi...
//   node scripts/connect-supabase.cjs --url ... --key ... --check
//   node scripts/connect-supabase.cjs --disconnect
//
// The anon (publishable) key is designed to be public: it is shipped in the
// browser and Row Level Security is what protects the rows. A service_role key
// must NEVER be used here and the script refuses it.
const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, '..', 'personal/travel/map/config.js');
const SITE_URL = 'https://ehuang0124.github.io/personal/travel/map/';

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}
function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}
function readJwtPayload(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
  catch { return null; }
}
function validateUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { fail(`--url 不是有效網址：${raw}`); }
  if (url.protocol !== 'https:') fail('--url 必須是 https:// 開頭。');
  if (url.pathname !== '/' || url.search || url.hash) fail('--url 只要專案根網址，例如 https://abcdefgh.supabase.co（不要帶路徑）。');
  if (!/(^|\.)supabase\.co$/.test(url.hostname)) {
    console.warn(`! ${url.hostname} 看起來不是 Supabase 官方網域；若是自架實例請自行確認。`);
  }
  return url.origin;
}
function validateKey(key) {
  if (typeof key !== 'string' || key.length < 20) fail('--key 看起來不是 Supabase 的 anon key。');
  if (key.startsWith('sb_publishable_')) return { kind: 'publishable' };
  const payload = readJwtPayload(key);
  if (!payload) fail('--key 不是 JWT 格式，也不是 sb_publishable_ 開頭的 publishable key。');
  if (payload.role === 'service_role') {
    fail('這是 service_role（伺服器專用）金鑰，會繞過所有權限。請改用 Project Settings → API 的 anon / publishable key。');
  }
  if (payload.role !== 'anon') fail(`--key 的 role 是「${payload.role || '未知'}」，這個頁面需要 anon key。`);
  return { kind: 'jwt', role: payload.role };
}
function projectRef(url) {
  return new URL(url).hostname.split('.')[0];
}

async function check(url, key) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const report = [];
  try {
    const settings = await fetch(`${url}/auth/v1/settings`, { headers });
    if (!settings.ok) report.push(['auth', `HTTP ${settings.status}`, 'anon key 可能不正確。']);
    else {
      const body = await settings.json();
      report.push(['auth', 'OK', '']);
      // Each browser signs in with a generated account, so email sign-up has to
      // be open and must not wait for a confirmation mail.
      report.push(['Email 登入', body?.external?.email ? '已開啟' : '未開啟', body?.external?.email ? '' : '到 Authentication → Sign In / Providers → Email 開啟。']);
      report.push(['確認信', body?.mailer_autoconfirm ? '已關閉' : '仍要確認', body?.mailer_autoconfirm ? '' : '同頁關閉「Confirm email」，否則登入只能停在等信。']);
    }
  } catch (error) {
    report.push(['auth', '連不上', `${error.message}（請確認網路與專案網址）`]);
  }
  try {
    const response = await fetch(`${url}/rest/v1/rpc/atlas_access_status`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (response.ok) {
      const body = await response.json();
      const configured = Boolean(body?.configured);
      report.push(['通行碼', configured ? '已設定' : '還沒設定', configured ? '' : "到 SQL Editor 執行 select public.atlas_rotate_code('新的通行碼');"]);
    } else {
      report.push(['通行碼', `HTTP ${response.status}`, '先在 SQL Editor 執行 setup.sql（它會建立 atlas_access 與相關函式）。']);
    }
  } catch (error) {
    report.push(['通行碼', '連不上', error.message]);
  }
  try {
    const response = await fetch(`${url}/rest/v1/stamps?select=id&limit=1`, { headers });
    if (response.ok) report.push(['資料表 stamps', 'OK', '']);
    else {
      const text = await response.text();
      const missing = /does not exist|42P01/i.test(text) || response.status === 404;
      report.push(['資料表 stamps', missing ? '不存在' : `HTTP ${response.status}`, missing ? '到 SQL Editor 執行 personal/travel/map/supabase/setup.sql。' : '請確認金鑰與 RLS 設定。']);
    }
  } catch (error) {
    report.push(['資料表 stamps', '連不上', error.message]);
  }
  const width = Math.max(...report.map(([label]) => [...label].length)) + 2;
  console.log('\n連線檢查');
  for (const [label, status, hint] of report) {
    const pad = ' '.repeat(Math.max(1, width - [...label].length));
    console.log(`  ${label}${pad}${status}${hint ? `  → ${hint}` : ''}`);
  }
  console.log('');
}

(async () => {
  if (process.argv.includes('--disconnect')) {
    const source = fs.readFileSync(configPath, 'utf8');
    const next = source
      .replace(/supabaseUrl:\s*'[^']*'/, "supabaseUrl: ''")
      .replace(/supabaseAnonKey:\s*'[^']*'/, "supabaseAnonKey: ''");
    fs.writeFileSync(configPath, next);
    console.log('已移除 Supabase 設定；頁面回到「本機通行碼 + 這個瀏覽器」模式。');
    return;
  }

  const rawUrl = arg('url');
  const rawKey = arg('key');
  if (!rawUrl || !rawKey) {
    console.error('用法：node scripts/connect-supabase.cjs --url https://<專案>.supabase.co --key <anon key> [--check]');
    console.error('      node scripts/connect-supabase.cjs --disconnect');
    process.exit(1);
  }
  const url = validateUrl(rawUrl);
  validateKey(rawKey);
  const ref = projectRef(url);

  if (process.argv.includes('--check')) await check(url, rawKey);

  const source = fs.readFileSync(configPath, 'utf8');
  if (!/supabaseUrl:\s*'[^']*'/.test(source) || !/supabaseAnonKey:\s*'[^']*'/.test(source)) {
    fail('config.js 找不到 supabaseUrl / supabaseAnonKey 欄位。');
  }
  const next = source
    .replace(/supabaseUrl:\s*'[^']*'/, `supabaseUrl: '${url}'`)
    .replace(/supabaseAnonKey:\s*'[^']*'/, `supabaseAnonKey: '${rawKey}'`);
  fs.writeFileSync(configPath, next);

  console.log(`\n✓ 已寫入 ${path.relative(process.cwd(), configPath)}`);
  console.log(`  supabaseUrl:     ${url}`);
  console.log(`  supabaseAnonKey: ${rawKey.slice(0, 12)}…${rawKey.slice(-6)}（公開金鑰，權限由 RLS 控管）`);
  console.log(`
接著確認這三件事（都只要做一次）：\n\n  1. 資料表    https://supabase.com/dashboard/project/${ref}/sql/new
     貼上 personal/travel/map/supabase/setup.sql 全文並 Run。\n\n  2. 帳號服務  Authentication → Sign In / Providers
     Email: 開啟；同頁關閉「Confirm email」。
     （旅人使用個人電子郵件、密碼與邀請碼；Auth Settings 的最低密碼長度設為 12。）\n\n  3. 通行碼    同一頁的 SQL Editor：
       select public.atlas_rotate_code('你的通行碼');
     之後要換碼，重跑這一行就好。\n\n設定完成後：${SITE_URL} 右上角會出現「帳號登入」；
每次登入都寫進 Supabase 的 atlas_logins（Table Editor 就看得到）。
要檢查設定是否正確，再跑一次並加上 --check。
`);
})().catch(error => fail(error.message));
