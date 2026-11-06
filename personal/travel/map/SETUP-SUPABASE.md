# 接上 Supabase：帳號登入

目標：`https://ehuang0124.github.io/personal/travel/map/` 右上角出現「帳號登入」。使用個人電子郵件與密碼登入後就能蓋章；邀請碼只在建立帳號時使用；訪客看得到全部戳章但不能改。每次登入都會寫進 Supabase，你可以看到是誰、什麼時候、用什麼裝置登入。

**既有專案升級：** 部署前，請在 SQL Editor 重跑 [`supabase/setup.sql`](supabase/setup.sql)，
新增只供已核准帳號登入的 `atlas_login()`（不會刪除戳章），並把 Auth 的最低密碼長度改為 **7**。
`config.js` 仍指向專案 `osffsthnlmndwpxpxtou`；本次只更新 repo，未變更線上專案設定。

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
- `atlas_redeem_code()`（建立帳號時驗證邀請碼）、`atlas_login()`（既有帳號登入紀錄）、`atlas_rotate_code()`、`atlas_access_status()`

## 3. 開啟帳號服務

**Authentication → Sign In / Providers**

- **Email**：開啟
- 同一頁的 **Confirm email**：關閉（否則登入會停在等確認信）

> 每位旅人使用自己的電子郵件與密碼；第一次切換至「建立帳號」，再填邀請碼與顯示名稱。
> 密碼由 Supabase Auth 管理，頁面不儲存密碼，只保留登入 session。
> **Authentication → Settings → Password security**：最低密碼長度設為 **7**，讓 API 也強制執行。
> 電子郵件用來辨識帳號，不會顯示在公開地圖上。目前關閉確認信，不提供信箱所有權驗證。

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
- 換碼只影響之後建立帳號；已核准帳號仍用自己的電子郵件與密碼登入，不必再輸入邀請碼。
  已經登入的裝置也保持登入（它們有自己的 session），
  要讓某台裝置徹底失效，到 **Authentication → Users** 刪掉那個使用者。
- 這個函式只有 dashboard 的 postgres 角色能執行，公開 API 不能呼叫。

## 6. 部署與驗收

1. commit & push → GitHub Pages 重新建置
2. 開 <https://ehuang0124.github.io/personal/travel/map/>
   - 右上角是 **帳號登入**
   - 第一次：輸入電子郵件、超過 6 字元的個人密碼、邀請碼，在「建立帳號」頁面填名字 → 蓋章解鎖
   - 之後：在「登入」頁面只用相同電子郵件與密碼登入，其他裝置也會回到同一份紀錄
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
| 「電子郵件或個人密碼不正確。」 | 帳號或密碼錯誤 | 檢查輸入；首次使用請切換至「建立帳號」。忘記密碼時請網站擁有者由 Authentication → Users 協助復原 |
| 「這個電子郵件已註冊」 | 重複註冊 | 切換至「登入」，使用原密碼登入 |
| 「帳號尚未完成建立」 | Auth 帳號有建立，但邀請碼未通過 | 切換至「建立帳號」，使用同一電子郵件、密碼與正確邀請碼重試 |
| 「密碼需超過 6 個字元。」 | 密碼少於 7 字元 | 使用至少 7 字元；Auth → Settings → Password security 的最低長度設為 7 |
| 「通行碼不正確。」 | 輸入錯，或剛換過碼 | 重輸一次；忘了就重新執行步驟 5 |
| 「嘗試次數太多，請 15 分鐘後再試。」 | 同一 IP 15 分鐘內錯 8 次 | 等 15 分鐘，或到 SQL Editor 刪掉 `atlas_login_attempts` 的紀錄 |
| 「這個專案還沒設定通行碼」 | `atlas_access` 沒有資料 | 執行步驟 5 的 `atlas_rotate_code` |
| 「資料表或函式還沒建立」 | 沒跑 `setup.sql`，或只跑了一半 | 重跑整份 `setup.sql` |
| 「這個專案還要求確認信」 | Confirm email 還開著 | 步驟 3 |
| 「anon key 不正確或已失效」 | 貼到別的專案或貼成 secret key | 步驟 4，重跑 `connect-supabase.cjs` |
| 「連不到 Supabase」 | 網路或 `supabaseUrl` 打錯 | 檢查 `config.js` 的網址 |
| 「RLS 擋下了這次寫入」 | 沒有通過通行碼的 session 想寫入 | 重新登入；確認 `setup.sql` 完整執行 |
| 換裝置沒同步 | 沒登入，或剛好離線 | 登入後會自動補同步 |

## 舊版裝置帳號

舊版的隨機裝置帳號不再用來登入，先前儲存的明文裝置密碼會被移除。
既有 session 不會自動撤銷；既有戳章也不會刪除。新電子郵件帳號有新的 user id，
不會因為名字相同就取得舊帳號的戳章。需要保留舊帳號時，請網站擁有者先在
**Authentication → Users** 確認舊 user id，透過管理端安全地更新該帳號的電子郵件與密碼；
不要公開或分享密碼。若直接建立新帳號，舊戳章仍公開可讀，但不屬於新帳號。

## 想改回本機模式

```sh
node scripts/connect-supabase.cjs --disconnect
```

兩個值清空後，頁面回到「本機通行碼」（`config.js` 的 `localGate`）模式：戳章只存在各瀏覽器、
沒有登入紀錄、也不能跨裝置同步。`localGate` 可以一直留著，雲端模式不會用到它。
