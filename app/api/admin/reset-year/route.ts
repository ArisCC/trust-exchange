import { NextRequest, NextResponse } from 'next/server'
import { db, nowISO } from '@/lib/db'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const reset = db.transaction(() => {
    const requests = db
      .prepare(
        "SELECT COUNT(*) c FROM exchange_requests WHERE status IN ('waiting', 'completed')"
      )
      .get() as { c: number }
    const proposals = db
      .prepare(
        "SELECT COUNT(*) c FROM match_proposals WHERE status IN ('pending', 'confirmed')"
      )
      .get() as { c: number }

    db.prepare(
      `UPDATE exchange_requests SET status = 'cancelled', updated_at = ?
       WHERE status IN ('waiting', 'completed')`
    ).run(nowISO())

    db.prepare(
      `UPDATE match_proposals
       SET status = 'cancelled', cancel_status = 'none', cancel_requested_by = NULL
       WHERE status IN ('pending', 'confirmed')`
    ).run()

    return { requests: requests.c, proposals: proposals.c }
  }).immediate()

  return NextResponse.json({ ok: true, reset })
}
