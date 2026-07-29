import { NextRequest, NextResponse } from 'next/server'
import {
  db,
  getBranchContact,
  nowISO,
  placeholders,
  type ExchangeRequest,
  type MatchProposal,
} from '@/lib/db'

const EMPTY = {
  myRequests: [],
  incomingProposals: [],
  outgoingProposals: [],
  confirmedMatches: [],
  pastHistory: [],
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params

  // 自動修正：remaining=0 但 status 還是 waiting 的舊資料
  db.prepare(
    `UPDATE exchange_requests SET status = 'completed', updated_at = ?
     WHERE branch_code = ? AND remaining_count = 0 AND status = 'waiting'`
  ).run(nowISO(), code)

  const contact =
    getBranchContact(code) ?? { branch_code: code, contact_info: null, notification_email: null }

  // 與每家分行、每種信託類型已經換掉的件數（已確認＋待確認佔用中）。
  // 提案畫面用它提醒「同一客戶在同一分行只能計一件」的上限。
  const exchanged = db
    .prepare(
      `SELECT
         CASE WHEN p.from_branch_code = @me THEN p.to_branch_code ELSE p.from_branch_code END AS branch_code,
         r.trust_type,
         SUM(p.proposed_count) AS count
       FROM match_proposals p
       JOIN exchange_requests r ON r.id = p.from_request_id
       WHERE p.status IN ('confirmed', 'pending')
         AND (p.from_branch_code = @me OR p.to_branch_code = @me)
       GROUP BY branch_code, r.trust_type`
    )
    .all({ me: code }) as { branch_code: string; trust_type: string; count: number }[]

  const myRequests = db
    .prepare('SELECT * FROM exchange_requests WHERE branch_code = ? ORDER BY created_at DESC')
    .all(code) as ExchangeRequest[]

  if (myRequests.length === 0) return NextResponse.json({ ...EMPTY, contact, exchanged })

  const allIds = myRequests.map(r => r.id)
  // 只用未取消的申請 ID 查詢配對資料，避免已取消的申請帶出舊配對
  const activeIds = myRequests.filter(r => r.status !== 'cancelled').map(r => r.id)

  const allPh = placeholders(allIds.length)

  const pastHistory = db
    .prepare(
      `SELECT * FROM match_proposals
       WHERE (from_request_id IN (${allPh}) OR to_request_id IN (${allPh}))
         AND status IN ('cancelled', 'rejected')
       ORDER BY created_at DESC LIMIT 30`
    )
    .all(...allIds, ...allIds) as MatchProposal[]

  if (activeIds.length === 0) {
    return NextResponse.json({ ...EMPTY, contact, exchanged, myRequests, pastHistory })
  }

  const ph = placeholders(activeIds.length)

  const incomingProposals = db
    .prepare(
      `SELECT * FROM match_proposals
       WHERE to_request_id IN (${ph}) AND status = 'pending'
       ORDER BY created_at DESC`
    )
    .all(...activeIds) as MatchProposal[]

  const outgoingProposals = db
    .prepare(
      `SELECT * FROM match_proposals
       WHERE from_request_id IN (${ph}) AND status = 'pending'
       ORDER BY created_at DESC`
    )
    .all(...activeIds) as MatchProposal[]

  // JOIN 排除對方申請已取消的已確認配對（處理舊資料不一致的情況）。
  // 我方必為未取消（來自 activeIds），故兩側皆未取消 == 對方未取消。
  const confirmedMatches = db
    .prepare(
      `SELECT p.* FROM match_proposals p
       JOIN exchange_requests rf ON rf.id = p.from_request_id
       JOIN exchange_requests rt ON rt.id = p.to_request_id
       WHERE p.status = 'confirmed'
         AND (p.from_request_id IN (${ph}) OR p.to_request_id IN (${ph}))
         AND rf.status != 'cancelled' AND rt.status != 'cancelled'
       ORDER BY p.confirmed_at DESC`
    )
    .all(...activeIds, ...activeIds) as MatchProposal[]

  return NextResponse.json({
    contact,
    exchanged,
    myRequests,
    incomingProposals,
    outgoingProposals,
    confirmedMatches,
    pastHistory,
  })
}
