# 接上 Supabase + Google 登入

目標：`https://ehuang0124.github.io/personal/travel/map/` 右上角從「登入」變成「使用 Google 登入」；戳章存進 Supabase，跨裝置同步，訪客看得到全部戳章但不能改。

需要：一個 Google 帳號（同時用來登入 Supabase 與建立 OAuth 憑證）。大約 15 分鐘，全部免費。

現況：`config.js` 的 `supabaseUrl` 與 `supabaseAnonKey` 都是空的，所以頁面跑在「本機通行碼 + 只存在這個瀏覽器」模式。做完下面 7 步就會切換成雲端模式。

---

## 1. 建 Supabase 專案

1. <https://supabase.com/dashboard> → 用 GitHub 或 Google 登入 → **New project**
2. Name：`travel-atlas`；**Database Password**：按 Generate 並存進密碼管理器（平時用不到，但不要弄丟）
3. Region：`East US (North Virginia)` 或離你近的；Plan：**Free** → **Create new project**（等 1–2 分鐘）
4. 建好後到 **Project Settings → Data API**（舊介面叫 **API**），抄下兩個值：
   - **Project URL**：`https://<ref>.supabase.co`
   - **anon public** key：`eyJ...`（新版可能是 `sb_publishable_...`）

> `anon` 金鑰是設計成公開的，會被放進網頁。真正的權限由 Postgres RLS 決定。
> **不要**用 `service_role` 金鑰（它會繞過所有權限）；`connect-supabase.cjs` 會直接拒絕它。

## 2. 建資料表（1 分鐘）

Supabase 左側 **SQL Editor → New query**，把 [`supabase/setup.sql`](supabase/setup.sql) 全文貼上 → **Run**。

看到 `Success. No rows returned` 就對了。腳本可重複執行，會建立：

- `profiles`（每位旅人的名稱／頭像／是否可被標記）
- `stamps`（每位旅人 × 每個地點 × 每個月份，含同行旅伴）
- `custom_cities`（自訂城市）

同時開啟 RLS（**任何人可讀、只有本人可寫**）並加入 realtime publication。

## 3. 建 Google OAuth 憑證（最容易卡住的一步）

1. <https://console.cloud.google.com/> → 上方專案選單 → **New project** → 名稱 `travel-atlas` → **Create**
2. 左側 **APIs & Services → OAuth consent screen**（新版介面在 **Google Auth Platform → Branding / Audience**）
   - User type：**External** → Create
   - App name：`Eva Travel Atlas`；User support email、Developer contact：你的 email
   - Scopes：不用加（預設的 `openid` / `email` / `profile` 就夠）
   - **Test users**：加上你自己的 Gmail（Testing 模式下只有名單內的人能登入）
   - 想開放給朋友：之後按 **Publish app**（只用 email/profile，不需要 Google 驗證）
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type：**Web application**
   - Name：`Travel Atlas`
   - **Authorized redirect URIs**（**最關鍵的一格**）：`https://<ref>.supabase.co/auth/v1/callback`
     - `<ref>` 是步驟 1 專案網址的前段。Supabase 的 Providers 頁面也會直接顯示這一串，可直接複製。
   - **Create** → 抄下 **Client ID** 與 **Client secret**

## 4. 在 Supabase 開啟 Google

**Authentication → Providers → Google → Enable** → 貼上 Client ID 與 Client secret → **Save**。

## 5. 設定回跳網址

**Authentication → URL Configuration**

- **Site URL**：`https://ehuang0124.github.io`
- **Redirect URLs** 增加一筆：`https://ehuang0124.github.io/personal/travel/map/`（結尾斜線要一致）

## 6. 把兩個值寫進網站

在 repo 根目錄執行：

```sh
node scripts/connect-supabase.cjs --url https://<ref>.supabase.co --key <anon key> --check
```

`--check` 會實際連線檢查三件事，並直接告訴你少了哪一步：

```
連線檢查
  auth          OK
  Google 登入   已開啟
  Email 登入    已開啟
  資料表 stamps OK
```

不想跑指令的話，把 **Project URL** 與 **anon key** 貼給 Arena 的代理，它會幫你寫進 `config.js` 並部署。
（這兩個值本來就會公開在網頁原始碼裡，貼出來不危險；`service_role` 與資料庫密碼則絕對不要貼。）

## 7. 部署與驗收

1. commit & push（或請代理處理）→ GitHub Pages 重新建置
2. 開 <https://ehuang0124.github.io/personal/travel/map/>
   - 右上角變成 **使用 Google 登入**
   - 第一次登入時，這個瀏覽器原有的本機戳章會**上傳一次**到你的帳號（標記寫入 `eva.travel.atlas.adopted.<user-id>`，不會重複上傳）
   - 用另一台裝置／無痕視窗登入同一帳號，戳章應該出現；登出後仍看得到全部戳章，但蓋章會要求登入
   - 頁尾「資料來源」變成 `Supabase（<ref>.supabase.co）`
3. 在 Supabase **Table Editor** 看 `stamps`：每一列就是一枚戳章；用 `Authentication → Users` 看登入者。

## 疑難排解

| 畫面上出現 | 原因 | 解法 |
| --- | --- | --- |
| 「Supabase 還沒開啟 Google 登入」 | Providers 沒有 Enable，或 Client ID/Secret 貼錯 | 步驟 4 |
| `redirect_uri_mismatch`／「回跳網址沒有被授權」 | Google 或 Supabase 的回跳網址少一個字 | 步驟 3、5 |
| 「資料表還沒建立」 | 沒跑 `setup.sql` | 步驟 2 |
| 「anon key 不正確或已失效」 | 貼成 `service_role`、或貼到別的專案 | 步驟 1、6 |
| Google 顯示「這個應用程式未經驗證」 | OAuth consent 還在 Testing | 把自己加進 Test users，或 Publish app |
| 登入後沒有戳章、Console 出現 `42501` | RLS 政策沒建好 | 重跑 `setup.sql` |
| 換裝置沒同步 | 沒登入同一個帳號，或離線 | 重新登入；恢復連線後會自動補同步 |

登入失敗時，頁面會把 Supabase 的英文錯誤翻成上面這幾句，並標出要按哪個後台選項；
失敗訊息也會從網址列清掉，重新整理不會重複出現。

## 想改回本機模式

```sh
node scripts/connect-supabase.cjs --disconnect
```

兩個值清空後，頁面回到「本機通行碼」（`config.js` 的 `localGate`）模式，戳章只存在各瀏覽器。
`localGate` 可以一直留著，雲端模式不會用到它。
