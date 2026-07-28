import { NextRequest, NextResponse } from 'next/server'
import { db, getProposal, nowISO } from '@/lib/db'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const { id } = await ctx.params

  const result = db.transaction(() => {
    const proposal = getProposal(id)
    if (!proposal || proposal.status !== 'confirmed') {
      return { error: '找不到已確認的配對' }
    }

    db.prepare(
      `UPDATE match_proposals
       SET status = 'cancelled', cancel_status = 'none', cancel_requested_by = NULL
       WHERE id = ?`
    ).run(id)

    // 已取消的申請不因為還件而復活，其餘回到 waiting
    const restore = db.prepare(
      `UPDATE exchange_requests
       SET remaining_count = remaining_count + ?,
           status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'waiting' END,
           updated_at = ?
       WHERE id = ?`
    )
    const now = nowISO()
    restore.run(proposal.proposed_count, now, proposal.from_request_id)
    restore.run(proposal.proposed_count, now, proposal.to_request_id)

    return null
  }).immediate()

  if (result) return NextResponse.json({ error: result.error }, { status: 404 })
  return NextResponse.json({ ok: true })
}
