import { NextRequest, NextResponse } from 'next/server'
import { db, getRequest, nowISO, pendingCommitted, type MatchProposal } from '@/lib/db'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  // 聯絡方式屬於分行，改由 /api/branch/[code]/contact 維護
  const { case_count } = await req.json()

  if (!case_count || case_count < 1) {
    return NextResponse.json({ error: '件數不正確' }, { status: 400 })
  }

  const result = db.transaction(() => {
    const existing = getRequest(id)
    if (!existing) return { error: '找不到申請', status: 404 }
    if (existing.status !== 'waiting') {
      return { error: '已完成的申請無法編輯', status: 400 }
    }

    // 已承諾件數：已確認配對扣掉的 + pending 提案佔用的
    const confirmedMatched = existing.requested_count - existing.remaining_count
    const pendingCount = pendingCommitted(id)
    const totalCommitted = confirmedMatched + pendingCount

    if (case_count < totalCommitted) {
      return {
        error: `件數不可低於已承諾的 ${totalCommitted} 件（已配對 ${confirmedMatched} 件＋待確認 ${pendingCount} 件）`,
        status: 400,
      }
    }

    const newRemaining = case_count - confirmedMatched

    db.prepare(
      `UPDATE exchange_requests
       SET requested_count = ?, remaining_count = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).run(case_count, newRemaining, newRemaining === 0 ? 'completed' : 'waiting', nowISO(), id)

    return null
  }).immediate()

  if (result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  db.transaction(() => {
    const now = nowISO()

    // 婉拒所有 pending 提案
    db.prepare(
      `UPDATE match_proposals SET status = 'rejected'
       WHERE (from_request_id = @id OR to_request_id = @id) AND status = 'pending'`
    ).run({ id })

    // 已確認的配對：把對方的件數還回去，再把配對標為取消
    const confirmed = db
      .prepare(
        `SELECT * FROM match_proposals
         WHERE (from_request_id = @id OR to_request_id = @id) AND status = 'confirmed'`
      )
      .all({ id }) as MatchProposal[]

    // 已取消的申請不因為還件而復活，其餘回到 waiting
    const restore = db.prepare(
      `UPDATE exchange_requests
       SET remaining_count = remaining_count + ?,
           status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'waiting' END,
           updated_at = ?
       WHERE id = ?`
    )
    for (const m of confirmed) {
      const otherId = m.from_request_id === id ? m.to_request_id : m.from_request_id
      restore.run(m.proposed_count, now, otherId)
    }

    if (confirmed.length > 0) {
      db.prepare(
        `UPDATE match_proposals
         SET status = 'cancelled', cancel_requested_by = NULL, cancel_status = 'none'
         WHERE (from_request_id = @id OR to_request_id = @id) AND status = 'confirmed'`
      ).run({ id })
    }

    // 取消申請本身
    db.prepare(
      "UPDATE exchange_requests SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'waiting'"
    ).run(now, id)
  }).immediate()

  return NextResponse.json({ ok: true })
}
