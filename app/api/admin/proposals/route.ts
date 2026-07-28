import { NextRequest, NextResponse } from 'next/server'
import { db, type MatchProposal } from '@/lib/db'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') === 'pending' ? 'pending' : 'confirmed'
  // 排序欄位不能用參數綁定，先收斂成固定字串再拼接
  const orderBy = type === 'confirmed' ? 'confirmed_at' : 'created_at'

  const rows = db
    .prepare(
      `SELECT * FROM match_proposals WHERE status = ?
       ORDER BY ${orderBy} DESC LIMIT 200`
    )
    .all(type) as MatchProposal[]

  return NextResponse.json(rows)
}
