import { NextRequest, NextResponse } from 'next/server'
import { db, type MatchProposal } from '@/lib/db'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }

  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c

  const recentMatches = db
    .prepare(
      `SELECT * FROM match_proposals WHERE status = 'confirmed'
       ORDER BY confirmed_at DESC LIMIT 10`
    )
    .all() as MatchProposal[]

  const activeBranches = db
    .prepare(
      `SELECT from_branch_code AS code, from_branch_name AS name, COUNT(*) AS count
       FROM match_proposals WHERE status = 'confirmed'
       GROUP BY from_branch_code
       ORDER BY count DESC LIMIT 5`
    )
    .all() as { code: string; name: string; count: number }[]

  return NextResponse.json({
    totalRequests: count('SELECT COUNT(*) c FROM exchange_requests'),
    waitingRequests: count("SELECT COUNT(*) c FROM exchange_requests WHERE status = 'waiting'"),
    completedRequests: count("SELECT COUNT(*) c FROM exchange_requests WHERE status = 'completed'"),
    totalMatches: count("SELECT COUNT(*) c FROM match_proposals WHERE status = 'confirmed'"),
    recentMatches,
    activeBranches,
  })
}
