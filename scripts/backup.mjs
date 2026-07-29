#!/usr/bin/env node
/**
 * 備份 trust-exchange 資料庫。
 *
 * 必須用 VACUUM INTO 而不是 cp：資料庫開在 WAL 模式，最近的交易還在 .db-wal 裡，
 * 直接複製主檔只會拿到上次 checkpoint 的舊快照。實際發生過 —— 用 cp 備出來的檔案
 * 少了當天全部的活動（36 筆只備到 33 筆）。
 *
 * VACUUM INTO 產生的是含 WAL 內容的一致性快照，且不會鎖住寫入。
 */
import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const DB_PATH =
  process.env.TRUST_EXCHANGE_DB ?? '/Users/l.e.o./leo-data/trust-exchange/trust-exchange.db'
const BACKUP_DIR = process.env.TRUST_EXCHANGE_BACKUP_DIR ?? '/Users/l.e.o./leo-data/trust-exchange/backups'
const KEEP_DAYS = Number(process.env.TRUST_EXCHANGE_BACKUP_KEEP_DAYS ?? 30)

mkdirSync(BACKUP_DIR, { recursive: true })

// 含毫秒，同一秒內重跑才不會撞檔名（VACUUM INTO 遇到既有檔案會直接失敗）
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
const out = join(BACKUP_DIR, `trust-exchange-${stamp}.db`)

const db = new Database(DB_PATH, { readonly: true })
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`)
db.close()

// 驗證備份可讀且結構完整，不然備了等於沒備
const check = new Database(out, { readonly: true })
const integrity = check.pragma('integrity_check', { simple: true })
const requests = check.prepare('SELECT COUNT(*) c FROM exchange_requests').get().c
const proposals = check.prepare('SELECT COUNT(*) c FROM match_proposals').get().c
const contacts = check.prepare('SELECT COUNT(*) c FROM branch_contacts').get().c
check.close()

if (integrity !== 'ok') {
  console.error(`[backup] 備份損毀，integrity_check = ${integrity}`)
  unlinkSync(out)
  process.exit(1)
}

// 比對來源筆數，確認沒有備到不完整的快照
const live = new Database(DB_PATH, { readonly: true })
const liveRequests = live.prepare('SELECT COUNT(*) c FROM exchange_requests').get().c
live.close()
if (requests !== liveRequests) {
  console.error(`[backup] 筆數不符：備份 ${requests} / 來源 ${liveRequests}`)
  process.exit(1)
}

console.log(
  `[backup] ${new Date().toISOString()} ${out.split('/').pop()} ` +
  `申請 ${requests} 配對 ${proposals} 分行聯絡 ${contacts}`
)

// 清掉超過保留天數的舊備份
const cutoff = Date.now() - KEEP_DAYS * 86400_000
let removed = 0
for (const f of readdirSync(BACKUP_DIR)) {
  if (!f.startsWith('trust-exchange-') || !f.endsWith('.db')) continue
  const p = join(BACKUP_DIR, f)
  if (statSync(p).mtimeMs < cutoff) { unlinkSync(p); removed++ }
}
if (removed > 0) console.log(`[backup] 已清除 ${removed} 個超過 ${KEEP_DAYS} 天的備份`)
