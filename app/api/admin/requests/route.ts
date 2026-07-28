import { NextRequest, NextResponse } from 'next/server'
import { db, type ExchangeRequest } from '@/lib/db'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // waiting | completed | cancelled | all
  const q = searchParams.get('q') ?? ''

  const statusFilter = status && status !== 'all' ? status : null
  const like = q ? `%${q}%` : null

  const rows = db
    .prepare(
      `SELECT * FROM exchange_requests
       WHERE (@status IS NULL OR status = @status)
         AND (@like IS NULL OR branch_name LIKE @like OR branch_code LIKE @like)
       ORDER BY created_at DESC LIMIT 200`
    )
    .all({ status: statusFilter, like }) as ExchangeRequest[]

  return NextResponse.json(rows)
}
