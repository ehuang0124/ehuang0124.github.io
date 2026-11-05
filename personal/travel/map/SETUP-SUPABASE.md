# 接上 Supabase：通行碼登入

目標：`https://ehuang0124.github.io/personal/travel/map/` 右上角出現「通行碼登入」。輸入你設定的通行碼就能蓋章；訪客看得到全部戳章但不能改。每次登入都會寫進 Supabase，你可以看到是誰、什麼時候、用什麼裝置登入。

**現況：已經接好。** `config.js` 指向專案 `osffsthnlmndwpxpxtou`，`setup.sql` 已執行，通行碼也已設定（通行碼本身不在這個 repo，只以 bcrypt 雜湊存在資料庫）。下面步驟是從零重建或在別的專案重做時使用。

---

## 1. 建 Supabase 專案

1. <https://supabase.com/dashboard> → **New project**
2. Name：`travel map`；**Database Password**：按 Generate 存進密碼管理器
3. Region：離你近的；Plan：**Free** → **Create new project**
4. **Project Settings → Data API**：抄下 **Project URL** 與 **anon public** key

> anon key 是公開金鑰，會放進網頁；權限由 Postgres RLS 決定。
> **不要**用 `service_role`；`connect-supabase.cjs` 會直接拒絕它。

## 2. 建資料表與函式（1 分鐘）

左側 **SQL Editor → New query**，貼上 [`supabase/setup.sql`](supabase/setup.sql) 全文 → **Run**。
可重複執行。它會建立：

- `profiles`：每位旅人的名稱（只有通過通行碼才會建立）
- `stamps`、`custom_cities`：戳章與自訂城市
- `atlas_access`：通行碼的 bcrypt 雜湊（**沒有**明文）
- `atlas_logins`：誰登入了、時間、瀏覽器、IP
- `atlas_login_attempts`：失敗次數（15 分鐘內 8 次就暫時擋下）
- `atlas_redeem_code()`、`atlas_rotate_code()`、`atlas_access_status()`

## 3. 開啟帳號服務

**Authentication → Sign In / Providers**

- **Email**：開啟
- 同一頁的 **Confirm email**：關閉（否則登入會停在等確認信）

> 頁面會為每個瀏覽器自動建立一個 Supabase 帳號（隨機帳號密碼，存在該瀏覽器），
> 這樣同一個人回訪仍是同一位旅人，也不用多記一組密碼。你唯一要發給朋友的是通行碼。

## 4. 把兩個值寫進網站

```sh
node scripts/connect-supabase.cjs --url https://<ref>.supabase.co --key <anon key> --check
```

`--check` 會實際連線並逐項說明：

```
連線檢查
  auth          OK
  Email 登入    已開啟
  確認信        已關閉
  通行碼        已設定
  資料表 stamps OK
```

沒過的那一項就是下一個要按的按鈕。

## 5. 設定通行碼（也可以隨時換）

Supabase → **SQL Editor → New query**：

```sql
select public.atlas_rotate_code('你的通行碼');
```

- 至少 6 個字元；只存 bcrypt 雜湊，資料庫與 repo 都看不到明文。
- 換碼只要重跑這一行，舊碼立刻失效。已經登入的裝置仍保持登入（它們有自己的 session），
  要讓某台裝置徹底失效，到 **Authentication → Users** 刪掉那個使用者。
- 這個函式只有 dashboard 的 postgres 角色能執行，公開 API 不能呼叫。

## 6. 部署與驗收

1. commit & push → GitHub Pages 重新建置
2. 開 <https://ehuang0124.github.io/personal/travel/map/>
   - 右上角是 **通行碼登入**
   - 輸入名字與通行碼 → 蓋章解鎖
   - 無痕視窗不登入 → 看得到所有戳章，但按「蓋章」只會跳出登入視窗
   - 頁尾「資料來源」顯示 `Supabase（<ref>.supabase.co）`
3. **Table Editor → `atlas_logins`**：每一列就是一次登入

## 7. 看誰登入過

**Table Editor → `atlas_logins`**，或 SQL Editor：

```sql
select created_at, display_name, user_agent, ip
from public.atlas_logins
order by created_at desc
limit 50;
```

| 欄位 | 意思 |
| --- | --- |
| `created_at` | 登入時間（UTC） |
| `display_name` | 登入時填的名字 |
| `user_agent` | 瀏覽器／裝置字串 |
| `ip` | 連線位址（Supabase 轉送的 `x-forwarded-for`） |
| `user_id` | 對應 `profiles.id` 與 `Authentication → Users` |

`atlas_logins`、`atlas_access`、`atlas_login_attempts` 都開了 RLS 且沒有任何 policy，
所以公開 API 讀不到；只有 dashboard 看得到。

## 疑難排解

| 畫面上出現 | 原因 | 解法 |
| --- | --- | --- |
| 「通行碼不正確。」 | 輸入錯，或剛換過碼 | 重輸一次；忘了就重新執行步驟 5 |
| 「嘗試次數太多，請 15 分鐘後再試。」 | 同一 IP 15 分鐘內錯 8 次 | 等 15 分鐘，或到 SQL Editor 刪掉 `atlas_login_attempts` 的紀錄 |
| 「這個專案還沒設定通行碼」 | `atlas_access` 沒有資料 | 執行步驟 5 的 `atlas_rotate_code` |
| 「資料表或函式還沒建立」 | 沒跑 `setup.sql`，或只跑了一半 | 重跑整份 `setup.sql` |
| 「這個專案還要求確認信」 | Confirm email 還開著 | 步驟 3 |
| 「anon key 不正確或已失效」 | 貼到別的專案或貼成 secret key | 步驟 4，重跑 `connect-supabase.cjs` |
| 「連不到 Supabase」 | 網路或 `supabaseUrl` 打錯 | 檢查 `config.js` 的網址 |
| 「RLS 擋下了這次寫入」 | 沒有通過通行碼的 session 想寫入 | 重新登入；確認 `setup.sql` 完整執行 |
| 換裝置沒同步 | 沒登入，或剛好離線 | 登入後會自動補同步 |

## 想改回本機模式

```sh
node scripts/connect-supabase.cjs --disconnect
```

兩個值清空後，頁面回到「本機通行碼」（`config.js` 的 `localGate`）模式：戳章只存在各瀏覽器、
沒有登入紀錄、也不能跨裝置同步。`localGate` 可以一直留著，雲端模式不會用到它。
