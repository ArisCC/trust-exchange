// 把 Supabase 匯出的 JSON 匯入本機 SQLite。
// schema 直接沿用 lib/db.ts（import 時會自動建表），避免 schema 兩份定義漂移。
import { readFileSync } from 'node:fs'
import { db } from '../lib/db.ts'

// 一次性遷移用：EXPORT_DIR 放 Supabase REST API 匯出的
// exchange_requests.json 與 match_proposals.json
const EXPORT_DIR = process.env.EXPORT_DIR
if (!EXPORT_DIR) {
  console.error('請設定 EXPORT_DIR 環境變數，指向匯出的 JSON 目錄')
  process.exit(1)
}

// 時間統一正規化成 ISO Z 格式，確保字串排序與時間排序一致
const iso = (v) => (v == null ? null : new Date(v).toISOString())

const requests = JSON.parse(readFileSync(`${EXPORT_DIR}/exchange_requests.json`, 'utf8'))
const proposals = JSON.parse(readFileSync(`${EXPORT_DIR}/match_proposals.json`, 'utf8'))

const insReq = db.prepare(`
  INSERT OR REPLACE INTO exchange_requests
    (id, branch_code, branch_name, trust_type, requested_count, remaining_count,
     contact_info, notification_email, status, created_at, updated_at)
  VALUES (@id, @branch_code, @branch_name, @trust_type, @requested_count, @remaining_count,
          @contact_info, @notification_email, @status, @created_at, @updated_at)
`)

const insProp = db.prepare(`
  INSERT OR REPLACE INTO match_proposals
    (id, from_request_id, to_request_id, from_branch_code, from_branch_name,
     to_branch_code, to_branch_name, proposed_count, status,
     cancel_requested_by, cancel_status, created_at, confirmed_at)
  VALUES (@id, @from_request_id, @to_request_id, @from_branch_code, @from_branch_name,
          @to_branch_code, @to_branch_name, @proposed_count, @status,
          @cancel_requested_by, @cancel_status, @created_at, @confirmed_at)
`)

db.transaction(() => {
  for (const r of requests) {
    insReq.run({
      ...r,
      trust_type: r.trust_type ?? 'disability',
      contact_info: r.contact_info ?? null,
      notification_email: r.notification_email ?? null,
      created_at: iso(r.created_at),
      updated_at: iso(r.updated_at ?? r.created_at),
    })
  }
  for (const p of proposals) {
    insProp.run({
      ...p,
      cancel_requested_by: p.cancel_requested_by ?? null,
      cancel_status: p.cancel_status ?? 'none',
      created_at: iso(p.created_at),
      confirmed_at: iso(p.confirmed_at),
    })
  }
})()

const n = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c
console.log(`exchange_requests: ${n('exchange_requests')} 筆（來源 ${requests.length}）`)
console.log(`match_proposals : ${n('match_proposals')} 筆（來源 ${proposals.length}）`)
