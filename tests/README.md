# 端對端測試

打真實 HTTP 進 `next start` 的伺服器，驗證整條流程，不是單元測試。

## 怎麼跑

測試會寫入資料，**必須用獨立的資料庫**，不要指到正式庫：

```bash
# 1. 用測試資料庫啟動（每次都要清空，殘留資料會讓斷言失敗）
npm run build
rm -f /tmp/trust-exchange-test.db*
TRUST_EXCHANGE_DB=/tmp/trust-exchange-test.db npx next start -p 3101 &

# 2. 跑測試（兩支各自需要乾淨的資料庫，分開跑）
node tests/flow.mjs        # 登記、提案、確認、取消、婉拒等主流程
node tests/customers.mjs   # 客戶數上限與跨分行累計
```

每支跑完請重新清空資料庫再跑下一支。
