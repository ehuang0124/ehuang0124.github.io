# 接上 Supabase：帳號登入

目標：`https://ehuang0124.github.io/personal/travel/map/` 右上角出現「帳號登入」。新帳號先驗證電子郵件，再以個人密碼與邀請碼完成建立；之後使用相同電子郵件與密碼登入就能蓋章。訪客看得到全部戳章但不能改。每次登入都會寫進 Supabase，你可以看到是誰、什麼時候、用什麼裝置登入。

**既有專案升級：** 部署前，請在 SQL Editor 重跑 [`supabase/setup.sql`](supabase/setup.sql)，
或依需要套用 [`20261106_stamp_guards.sql`](supabase/migrations/20261106_stamp_guards.sql) 與
[`20261106_require_verified_email.sql`](supabase/migrations/20261106_require_verified_email.sql)（都可重複執行）。
這會新增只供已核准帳號登入的 `atlas_login()`、記錄規則 `atlas_guard_stamp()`、
「被標記的人自己解除」的 `atlas_leave_stamp()`，並讓註冊、登入與 RLS 都要求已驗證的電子郵件（都不會刪除戳章）。
請在 Auth 開啟 **Confirm email**、把最低密碼長度改為 **7**，並把頁面網址加進 **Redirect URLs**（見步驟 3）。
已完成確認的既有帳號不受影響。
`config.js` 仍指向專案 `osffsthnlmndwpxpxtou`。2026-11-05 已以
[`20261105_add_atlas_login.sql`](supabase/migrations/20261105_add_atlas_login.sql) 補上線上缺少的登入函式，
沒有更換邀請碼、刪除帳號或戳章。2026-11-06 已套用 `require_verified_email` 並開啟 **Confirm email**；既有兩個帳號皆已確認，三枚戳章未更動。Auth 的最低密碼長度目前仍為 6；請至後台改成 **7**，與頁面限制一致。

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
- `atlas_guard_stamp()`（戳章不能換人、不能填未來月份，同行者只能是已核准且允許被標記的旅人）
- `atlas_leave_stamp()`（被標記的人只能移除自己的標記，不能改動那筆到訪）

## 3. 開啟帳號服務

**Authentication → Sign In / Providers**

- **Email**：開啟
- 同一頁的 **Confirm email**：開啟
- **Authentication → URL Configuration → Redirect URLs**：允許 `https://ehuang0124.github.io/personal/travel/map/`

> 每位旅人使用自己的電子郵件與密碼；第一次切換至「建立帳號」，填邀請碼與顯示名稱後會收到驗證信。點擊信中的連結，再回來輸入個人密碼與邀請碼，才會建立旅人資料。
> 未驗證的電子郵件不能建立旅人資料、登入或通過寫入權限檢查，避免重複或隨意增生的帳號留下旅行資料。
> 密碼由 Supabase Auth 管理，頁面不儲存密碼或邀請碼，只保留登入 session。
> **Authentication → Settings → Password security**：最低密碼長度設為 **7**，讓 API 也強制執行。
> 電子郵件只用來驗證與辨識帳號，不會顯示在公開地圖上。

**Authentication → URL Configuration → Redirect URLs**：加入

```
https://ehuang0124.github.io/personal/travel/map/
```

「忘記密碼」寄出的信會回到這個網址（頁面會自動切到「重設密碼」）。
本機測試時，把同一個路徑的 `http://localhost:<port>/personal/travel/map/` 也加進去。
寄信服務用 Supabase 預設即可，但免費方案的寄信次數有限；大量重設請求會失敗，
要穩定寄信請在 **Project Settings → Authentication → SMTP** 換成自己的寄件服務。

## 4. 把兩個值寫進網站

```sh
node scripts/connect-supabase.cjs --url https://<ref>.supabase.co --key <anon key> --check
```

`--check` 會實際連線並逐項說明：

```
連線檢查
  auth          OK
  Email 登入    已開啟
  Email 驗證    已開啟
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
   - 第一次：在「建立帳號」輸入電子郵件、超過 6 字元的個人密碼、邀請碼與名字 → 到信箱點擊驗證連結 → 回來重新輸入個人密碼與邀請碼 → 蓋章解鎖
   - 沒收到信：在驗證畫面按「重新寄送驗證信」；未完成驗證前不會建立旅人資料
   - 之後：在「登入」頁面只用相同電子郵件與密碼登入，其他裝置也會回到同一份紀錄
   - 忘記密碼：在「登入」頁面按「忘記密碼？」→ 填電子郵件 → 到信箱打開連結 → 設定新密碼，再用新密碼登入
   - 蓋完章時，到訪紀錄右側會先顯示「待同步」，後端確認後才變成「已同步」；拒絕寫入時顯示「未同步」與「重試」
   - 無痕視窗不登入 → 看得到所有戳章，但按「蓋章」只會跳出登入視窗
   - 頁尾「資料來源」顯示「資料來源：你的帳號（跨裝置同步）」；畫面不會出現專案位址或後端名稱，錯誤訊息也一律不含設定細節（原因請看瀏覽器 console 或 Network 面板）
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

畫面上的訊息一律不含後端細節；診斷時請開瀏覽器 console 或 Network 面板，對照下表。

| 畫面上出現 | 原因 | 解法 |
| --- | --- | --- |
| 「電子郵件或個人密碼不正確。」 | 帳號或密碼錯誤 | 檢查輸入；首次使用請切換至「建立帳號」。忘記密碼請按「忘記密碼？」寄出重設信 |
| 「這個電子郵件還沒驗證」或出現驗證信畫面 | 尚未點擊確認連結 | 到信箱完成驗證；沒收到就按重新寄送。Auth → Providers → Email 必須開啟 Confirm email |
| 「重設密碼的信已寄出」但沒收到 | 頁面網址不在 Redirect URLs、寄信服務未設定或額度用完 | 回到步驟 3 加入 Redirect URLs、檢查 SMTP 與垃圾信件匣 |
| 「目前無法寄出重設密碼的信，請稍後再試。」 | 同上，或電子郵件格式不對 | 先在欄位填入完整電子郵件；再檢查 Redirect URLs 與寄信設定 |
| 「無法更新密碼，請重新打開信中的連結再試一次。」 | 連結逾時，或已在別的裝置完成 | 重新申請一次重設信 |
| 某筆紀錄一直顯示「未同步」 | 寫入被拒（RLS、規則、離線） | 按「重試」；仍失敗就查看 console，確認 `setup.sql` 完整執行 |
| 「這個電子郵件已註冊」 | 重複註冊 | 切換至「登入」，使用原密碼登入 |
| 「帳號尚未完成建立，請切換至『建立帳號』並輸入邀請碼。」 | Auth 帳號有建立，但邀請碼未通過 | 切換至「建立帳號」，使用同一電子郵件、密碼與正確邀請碼重試 |
| 「密碼太短，請換一組超過 6 個字元的密碼。」 | 密碼少於 7 字元 | 使用至少 7 字元；Auth → Settings → Password security 的最低長度設為 7 |
| 「通行碼不正確。」 | 輸入錯，或剛換過碼 | 重輸一次；忘了就重新執行步驟 5 |
| 「嘗試次數太多，請稍後再試。」 | 同一 IP 15 分鐘內錯 8 次 | 等 15 分鐘，或到 SQL Editor 刪掉 `atlas_login_attempts` 的紀錄 |
| 「目前還不能建立帳號，請聯絡網站擁有者。」 | `atlas_access` 沒有資料，或註冊被關閉 | 擁有者請重跑步驟 3–5 |
| 「登入服務暫時無法使用，請稍後再試。」 | 沒跑 `setup.sql`，或只跑了一半、金鑰貼錯 | 重跑整份 `setup.sql`；檢查步驟 4 的 anon key |
| 「網路連線似乎有問題，請檢查網路後再試。」 | 網路，或 `supabaseUrl` 打錯 | 檢查 `config.js` 的網址與網路連線 |
| 「登入或註冊太頻繁，請稍後再試。」 | 短時間嘗試太多次 | 稍後再試 |
| 「同步暫時無法完成，請稍後再試。」 | 離線、RLS 拒絕寫入，或設定缺漏 | 重新登入；確認 `setup.sql` 完整執行；細節見 console |
| 換裝置沒同步 | 沒登入，或剛好離線 | 登入後會自動補同步 |

## 登入／建立帳號 Tab

- 點選 Tab 或使用左右方向鍵、Home／End 切換；登入只要電子郵件與密碼。
- 建立帳號才顯示名字與邀請碼。再次點選同一個 Tab 不會清空正在填的表單；真正切換時清除密碼與邀請碼。
- 按 Enter、手機鍵盤送出或密碼管理器的表單提交都走相同流程，不會只關閉視窗。
- 邀請碼錯誤時，視窗留在「建立帳號」；以相同電子郵件、原先密碼與正確邀請碼重試。
- 新帳號送出後會切到「驗證電子郵件」。此時還不是可寫入的旅人帳號；可重送驗證信，或點過連結後按「我已完成驗證」繼續。
- 從驗證連結返回地圖時，若信箱已確認但還沒有旅人資料，頁面會直接帶回「建立帳號」的最後一步。密碼與邀請碼不會被保存，因此要重新輸入。

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
