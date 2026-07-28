import { NextRequest, NextResponse } from 'next/server'
import {
  db,
  getRequest,
  newId,
  nowISO,
  pendingCommitted,
  type ExchangeRequest,
  type MatchProposal,
} from '@/lib/db'
import { notifyProposal } from '@/lib/notify'

type Result =
  | { ok: true; proposal: MatchProposal; fromReq: ExchangeRequest; toReq: ExchangeRequest }
  | { ok: false; error: string; status: number }

export async function POST(req: NextRequest) {
  const { from_request_id, to_request_id, proposed_count } = await req.json()

  if (!from_request_id || !to_request_id || !proposed_count || proposed_count < 1) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  // 整段檢查＋寫入放在同一個 transaction，避免兩個併發提案都通過件數檢查。
  // immediate 讓交易一開始就取得寫入鎖，不會在升級鎖時撞上 SQLITE_BUSY。
  const run = db.transaction((): Result => {
    const fromReq = getRequest(from_request_id)
    const toReq = getRequest(to_request_id)

    if (!fromReq || !toReq) return { ok: false, error: '找不到申請', status: 404 }
    if (fromReq.status !== 'waiting' || toReq.status !== 'waiting') {
      return { ok: false, error: '申請已不在等待中', status: 400 }
    }
    if (fromReq.trust_type !== toReq.trust_type) {
      return { ok: false, error: '信託類型不符，無法配對', status: 400 }
    }

    // 扣掉已被其他 pending 提案佔用的件數
    const fromAvailable = fromReq.remaining_count - pendingCommitted(from_request_id)
    const toAvailable = toReq.remaining_count - pendingCommitted(to_request_id)

    if (proposed_count > fromAvailable) {
      return { ok: false, error: `提案件數超過可用件數（您實際可用 ${fromAvailable} 件）`, status: 400 }
    }
    if (proposed_count > toAvailable) {
      return { ok: false, error: `對方可用件數不足（對方實際可用 ${toAvailable} 件）`, status: 400 }
    }

    // 確認這兩筆申請之間沒有任何方向的 pending 提案
    const dup = db
      .prepare(
        `SELECT id FROM match_proposals
         WHERE status = 'pending'
           AND ((from_request_id = @from AND to_request_id = @to)
             OR (from_request_id = @to AND to_request_id = @from))`
      )
      .get({ from: from_request_id, to: to_request_id })

    if (dup) return { ok: false, error: '這兩筆申請之間已有待確認的提案', status: 400 }

    const id = newId()
    db.prepare(
      `INSERT INTO match_proposals
         (id, from_request_id, to_request_id, from_branch_code, from_branch_name,
          to_branch_code, to_branch_name, proposed_count, status, cancel_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'none', ?)`
    ).run(
      id,
      from_request_id,
      to_request_id,
      fromReq.branch_code,
      fromReq.branch_name,
      toReq.branch_code,
      toReq.branch_name,
      proposed_count,
      nowISO()
    )

    const proposal = db.prepare('SELECT * FROM match_proposals WHERE id = ?').get(id) as MatchProposal
    return { ok: true, proposal, fromReq, toReq }
  })

  const result = run.immediate()

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  notifyProposal(result.proposal, result.toReq, result.fromReq)
  return NextResponse.json(result.proposal)
}
