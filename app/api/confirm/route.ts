import { NextRequest, NextResponse } from 'next/server'
import { db, getProposal, getRequest, nowISO, type ExchangeRequest, type MatchProposal } from '@/lib/db'
import { notifyConfirmed, notifyRejected } from '@/lib/notify'

type Result =
  | { kind: 'confirmed'; proposal: MatchProposal; fromReq: ExchangeRequest; toReq: ExchangeRequest }
  | { kind: 'rejected'; proposal: MatchProposal; fromReq: ExchangeRequest | undefined }
  | { kind: 'error'; error: string; status: number }

/** 某筆申請的件數歸零後，自動婉拒它身上其餘的 pending 提案 */
function rejectOtherPending(requestId: string, keepProposalId: string) {
  db.prepare(
    `UPDATE match_proposals SET status = 'rejected'
     WHERE (from_request_id = @req OR to_request_id = @req)
       AND status = 'pending' AND id != @keep`
  ).run({ req: requestId, keep: keepProposalId })
}

export async function POST(req: NextRequest) {
  const { proposal_id, action } = await req.json()

  if (!proposal_id || !['confirm', 'reject'].includes(action)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  const run = db.transaction((): Result => {
    const proposal = getProposal(proposal_id)
    if (!proposal || proposal.status !== 'pending') {
      return { kind: 'error', error: '找不到待確認的提案', status: 404 }
    }

    if (action === 'reject') {
      db.prepare("UPDATE match_proposals SET status = 'rejected' WHERE id = ?").run(proposal_id)
      return { kind: 'rejected', proposal, fromReq: getRequest(proposal.from_request_id) }
    }

    const fromReq = getRequest(proposal.from_request_id)
    const toReq = getRequest(proposal.to_request_id)
    if (!fromReq || !toReq) return { kind: 'error', error: '找不到原始申請', status: 404 }

    // 其中一方已不在等待中，自動婉拒此提案
    if (fromReq.status !== 'waiting' || toReq.status !== 'waiting') {
      db.prepare("UPDATE match_proposals SET status = 'rejected' WHERE id = ?").run(proposal_id)
      return { kind: 'error', error: '其中一方的申請已不在等待中，提案已自動取消', status: 400 }
    }

    const fromRemaining = fromReq.remaining_count - proposal.proposed_count
    const toRemaining = toReq.remaining_count - proposal.proposed_count

    // 件數不足（被其他提案先佔用），自動婉拒
    if (fromRemaining < 0 || toRemaining < 0) {
      db.prepare("UPDATE match_proposals SET status = 'rejected' WHERE id = ?").run(proposal_id)
      return { kind: 'error', error: '可交換件數不足，提案已自動取消', status: 400 }
    }

    const now = nowISO()
    const updateReq = db.prepare(
      `UPDATE exchange_requests
       SET remaining_count = ?, status = ?, updated_at = ?
       WHERE id = ?`
    )
    updateReq.run(fromRemaining, fromRemaining === 0 ? 'completed' : 'waiting', now, fromReq.id)
    updateReq.run(toRemaining, toRemaining === 0 ? 'completed' : 'waiting', now, toReq.id)

    db.prepare("UPDATE match_proposals SET status = 'confirmed', confirmed_at = ? WHERE id = ?")
      .run(now, proposal_id)

    if (fromRemaining === 0) rejectOtherPending(fromReq.id, proposal_id)
    if (toRemaining === 0) rejectOtherPending(toReq.id, proposal_id)

    return { kind: 'confirmed', proposal, fromReq, toReq }
  })

  const result = run.immediate()

  if (result.kind === 'error') {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  if (result.kind === 'rejected') {
    if (result.fromReq) notifyRejected(result.proposal, result.fromReq)
    return NextResponse.json({ status: 'rejected' })
  }

  notifyConfirmed(result.proposal, result.fromReq, result.toReq)
  return NextResponse.json({ status: 'confirmed' })
}
