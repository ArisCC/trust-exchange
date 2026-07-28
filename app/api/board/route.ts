import { NextRequest, NextResponse } from 'next/server'
import { db, type ExchangeRequest } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const exclude = searchParams.get('exclude') // 排除自己的分行

  // 地區篩選在前端做（地區對照表在 lib/branches）
  const rows = db
    .prepare(
      `SELECT r.*, c.contact_info
       FROM exchange_requests r
       LEFT JOIN branch_contacts c ON c.branch_code = r.branch_code
       WHERE r.status = 'waiting' AND r.remaining_count > 0
         AND (@exclude IS NULL OR r.branch_code != @exclude)
       ORDER BY r.created_at ASC`
    )
    .all({ exclude }) as ExchangeRequest[]

  return NextResponse.json(rows)
}
