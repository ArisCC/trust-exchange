import { NextRequest, NextResponse } from 'next/server'
import { db, getProposal, getRequest, nowISO } from '@/lib/db'

type Result =
  | { error: string; status: number }
  | { status: 'withdrawn' | 'rejected' | 'approved' }

// action: 'approve' | 'reject' 由對方執行；'withdraw' 由申請方自行撤回
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { branch_code, action } = await req.json()

  if (!branch_code || !['approve', 'reject', 'withdraw'].includes(action)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  const result = db.transaction((): Result => {
    const proposal = getProposal(id)
    if (!proposal || proposal.status !== 'confirmed' || proposal.cancel_status !== 'pending') {
      return { error: '找不到待確認的取消申請', status: 404 }
    }

    if (proposal.from_branch_code !== branch_code && proposal.to_branch_code !== branch_code) {
      return { error: '無權操作', status: 403 }
    }

    const isRequester = proposal.cancel_requested_by === branch_code

    if (action === 'withdraw') {
      if (!isRequester) return { error: '只有申請方可撤回', status: 403 }
      db.prepare(
        "UPDATE match_proposals SET cancel_status = 'none', cancel_requested_by = NULL WHERE id = ?"
      ).run(id)
      return { status: 'withdrawn' }
    }

    if (isRequester) {
      return { error: '不能自行確認取消申請，請由對方操作', status: 400 }
    }

    if (action === 'reject') {
      db.prepare("UPDATE match_proposals SET cancel_status = 'rejected' WHERE id = ?").run(id)
      return { status: 'rejected' }
    }

    // approve：還原雙方 remaining_count，將配對標記為 cancelled
    const fromReq = getRequest(proposal.from_request_id)
    const toReq = getRequest(proposal.to_request_id)
    if (!fromReq || !toReq) return { error: '找不到原始申請', status: 404 }

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
    restore.run(proposal.proposed_count, now, fromReq.id)
    restore.run(proposal.proposed_count, now, toReq.id)

    return { status: 'approved' }
  }).immediate()

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, status: result.status })
}
