import { NextRequest, NextResponse } from 'next/server'
import { db, type ExchangeRequest } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const exclude = searchParams.get('exclude') // 排除自己的分行

  // 地區篩選在前端做（地區對照表在 lib/branches）
  const rows = db
    .prepare(
      `SELECT * FROM exchange_requests
       WHERE status = 'waiting' AND remaining_count > 0
         AND (@exclude IS NULL OR branch_code != @exclude)
       ORDER BY created_at ASC`
    )
    .all({ exclude }) as ExchangeRequest[]

  return NextResponse.json(rows)
}
