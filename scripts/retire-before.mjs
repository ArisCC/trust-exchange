#!/usr/bin/env node
/**
 * 退役某個日期之前的申請與待確認提案。
 *
 * 用途：平台上線初期的登記，分行多半私下電話喬完就沒回來更新，留在看板上
 * 變成別家分行看得到卻換不到的幽靈件數。這支把整個時期的紀錄一次退役。
 *
 * 刻意不走「撤下登記」的流程（DELETE /api/request/[id]）：那條路會把件數
 * 還給配對的對方並讓對方的登記復活回 waiting。實際資料中就有一筆早已用完的
 * 五月登記會因此被復活，等於製造新的幽靈件數。這裡是退役整個時期，不是
 * 逐筆撤銷交易，所以直接標記狀態、不還原件數。
 *
 * 已確認的配對保留為 confirmed —— 那是實際發生過的事實。分行頁與看板本來
 * 就會濾掉任一方已取消的配對，不會再顯示。
 *
 * 用法：node scripts/retire-before.mjs 2026-07-01 [--apply]
 * 不加 --apply 只做預演，不寫入。
 */
import Database from 'better-sqlite3'

const cutoff = process.argv[2]
const apply = process.argv.includes('--apply')
const DB_PATH =
  process.env.TRUST_EXCHANGE_DB ?? '/Users/l.e.o./leo-data/trust-exchange/trust-exchange.db'

if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff ?? '')) {
  console.error('用法：node scripts/retire-before.mjs YYYY-MM-DD [--apply]')
  process.exit(1)
}

const db = new Database(DB_PATH)
db.pragma('busy_timeout = 5000')

// 先確認沒有跨期配對，否則退役舊資料會動到新資料的件數
const cross = db
  .prepare(
    `SELECT COUNT(*) n FROM match_proposals p
     JOIN exchange_requests f ON f.id = p.from_request_id
     JOIN exchange_requests t ON t.id = p.to_request_id
     WHERE p.status IN ('pending', 'confirmed')
       AND ((f.created_at < @cut) != (t.created_at < @cut))`
  )
  .get({ cut: cutoff }).n

if (cross > 0) {
  console.error(`✗ 有 ${cross} 筆配對跨越這個日期，退役會影響到之後的資料，已中止。`)
  process.exit(1)
}

const target = db
  .prepare(`SELECT status, COUNT(*) n FROM exchange_requests WHERE created_at < ? GROUP BY status`)
  .all(cutoff)
const pendings = db
  .prepare(
    `SELECT COUNT(*) n FROM match_proposals p
     JOIN exchange_requests f ON f.id = p.from_request_id
     WHERE p.status = 'pending' AND f.created_at < ?`
  )
  .get(cutoff).n

console.log(`${apply ? '執行' : '預演'}：退役 ${cutoff} 之前的資料`)
target.forEach(r => console.log(`  申請 ${r.status.padEnd(10)} ${r.n} 筆 → cancelled`))
console.log(`  待確認提案 ${pendings} 筆 → cancelled（件數釋出）`)

if (!apply) {
  console.log('\n（預演模式，未寫入。加上 --apply 才會實際執行）')
  process.exit(0)
}

const result = db.transaction(() => {
  const now = new Date().toISOString()
  const props = db
    .prepare(
      `UPDATE match_proposals SET status = 'cancelled', cancel_status = 'none', cancel_requested_by = NULL
       WHERE status = 'pending'
         AND from_request_id IN (SELECT id FROM exchange_requests WHERE created_at < @cut)`
    )
    .run({ cut: cutoff }).changes
  const reqs = db
    .prepare(
      `UPDATE exchange_requests SET status = 'cancelled', updated_at = @now
       WHERE created_at < @cut AND status != 'cancelled'`
    )
    .run({ cut: cutoff, now }).changes
  // 已確認配對上若還掛著「等待對方同意取消」的旗標，雙方登記都退役後它就成了
  // 孤兒，會一直被當成未處理事項統計，這裡一併清掉
  const flags = db
    .prepare(
      `UPDATE match_proposals SET cancel_status = 'none', cancel_requested_by = NULL
       WHERE cancel_status != 'none'
         AND from_request_id IN (SELECT id FROM exchange_requests WHERE created_at < @cut)`
    )
    .run({ cut: cutoff }).changes
  return { props, reqs, flags }
}).immediate()

console.log(`\n✓ 已退役：申請 ${result.reqs} 筆、待確認提案 ${result.props} 筆、殘留取消旗標 ${result.flags} 筆`)

const left = db
  .prepare(`SELECT COUNT(*) n FROM exchange_requests WHERE status = 'waiting' AND remaining_count > 0`)
  .get().n
console.log(`看板剩餘 ${left} 筆等待配對`)
