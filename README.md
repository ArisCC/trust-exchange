# 信託案件交換平台

分行之間交換信託案件的媒合平台。支援三種信託類型：身心障礙預開式、一般預開式、安養信託(30萬)。

## 技術架構

- **Next.js 16**（App Router）＋ TypeScript ＋ Tailwind CSS
- **SQLite**（better-sqlite3）—— 單一檔案資料庫，不需要另外跑 DB 服務
- **Resend** —— 配對提案／配對成功的 email 通知（選用）

## 專案結構

```
app/
  page.tsx              首頁：選分行進入
  branch/[code]/        分行主頁：登記申請、處理提案、查看配對
  board/                配對媒合看板：瀏覽其他分行、送出提案
  admin/                管理者後台
  api/
    submit              登記交換申請
    board               看板資料（waiting 且還有剩餘件數的申請）
    branch/[code]       分行主頁的所有資料
    propose             送出配對提案
    confirm             確認／婉拒提案
    request/[id]        編輯（PATCH）／取消（DELETE）申請
    match/[id]/…        已確認配對的取消流程（需雙方同意）
    admin/…             後台 API（cookie 驗證）
lib/
  db.ts                 SQLite 連線、schema、共用查詢（server-only）
  types.ts              前後端共用型別與常數（會進 client bundle，不可 import Node 模組）
  notify.ts             Resend email 通知
  branches.ts           分行代號對照表
```

## 資料模型

**exchange_requests** —— 一筆「某分行想交換 N 件某類型信託」的申請

| 欄位 | 說明 |
|---|---|
| `trust_type` | `disability` / `general` / `care`，只有同類型能配對 |
| `requested_count` | 登記的總件數 |
| `remaining_count` | 還沒配對掉的件數 |
| `contact_info` | 聯絡方式（分機等），公開顯示在看板 |
| `notification_email` | 通知信箱，填了才會收到通知信 |
| `status` | `waiting` / `completed` / `cancelled` |

**match_proposals** —— A 分行對 B 分行送出的配對提案

| 欄位 | 說明 |
|---|---|
| `status` | `pending` / `confirmed` / `rejected` / `cancelled` |
| `cancel_status` | 已確認的配對要取消時，需對方同意：`none` / `pending` / `rejected` |

### 件數怎麼算

一筆申請的「實際可用件數」= `remaining_count` −（所有 pending 提案佔用的件數）。

送出提案時只是佔用，不扣 `remaining_count`；等對方按確認才真的扣。這樣同一批件數不會被重複承諾出去。`remaining_count` 歸零時 `status` 自動變 `completed`，其餘 pending 提案自動婉拒。

所有「先檢查再寫入」的流程（送出提案、確認配對、取消還原）都包在 SQLite transaction 裡，避免併發時兩個提案都通過檢查。

## 開發

```bash
npm install
npm run dev
```

環境變數放 `.env.local`：

```
TRUST_EXCHANGE_DB=/path/to/trust-exchange.db   # 預設 /Users/l.e.o./leo-data/trust-exchange/trust-exchange.db
ADMIN_PASSWORD=…                                # 後台密碼
NEXT_PUBLIC_BASE_URL=https://exchange.aris7.me  # 通知信裡的連結
RESEND_API_KEY=…                                # 沒設定就不寄通知信，不影響配對功能
NOTIFY_FROM=信託案件交換平台 <noreply@aris7.me>
```

資料表會在第一次連線時自動建立，不用手動跑 migration。

## 部署

跑在 Mac mini 上，由 LaunchAgent 常駐、Cloudflare Tunnel 對外：

- LaunchAgent：`~/Library/LaunchAgents/me.aris7.trust-exchange.plist`（port 3100，開機自動啟動，crash 自動重啟）
- Tunnel：`~/.cloudflared/config.yml` 的 `exchange.aris7.me → 127.0.0.1:3100`
- 日誌：`~/Library/Logs/trust-exchange.{out,err}.log`

改完程式要重新部署：

```bash
npm run build && launchctl kickstart -k gui/$(id -u)/me.aris7.trust-exchange
```

備份資料庫直接複製檔案即可：

```bash
cp /Users/l.e.o./leo-data/trust-exchange/trust-exchange.db ~/backup/
```
