import { NextRequest, NextResponse } from 'next/server'
import { db, type ExchangeRequest } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const exclude = searchParams.get('exclude') // 排除自己的分行

  // remaining_count 還沒扣掉「已被其他分行的待確認提案佔住」的件數，
  // 直接顯示會讓人看到 1 件、送出後才被擋（對方實際可用 0 件）。
  // 這裡一併算出 pending_count，讓看板顯示真正能交換的數字。
  // 地區篩選在前端做（地區對照表在 lib/branches）
  const rows = db
    .prepare(
      `SELECT r.*, c.contact_info,
         (SELECT COALESCE(SUM(p.proposed_count), 0) FROM match_proposals p
           WHERE (p.from_request_id = r.id OR p.to_request_id = r.id)
             AND p.status = 'pending') AS pending_count
       FROM exchange_requests r
       LEFT JOIN branch_contacts c ON c.branch_code = r.branch_code
       WHERE r.status = 'waiting' AND r.remaining_count > 0
         AND (@exclude IS NULL OR r.branch_code != @exclude)
       ORDER BY r.created_at ASC`
    )
    .all({ exclude }) as (ExchangeRequest & { pending_count: number })[]

  return NextResponse.json(rows)
}
