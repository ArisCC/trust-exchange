import { NextRequest, NextResponse } from 'next/server'
import { db, getProposal, getRequest } from '@/lib/db'

/**
 * 撤回自己送出的提案。
 *
 * 提案一送出就會佔住雙方的件數，但原本只有被提案方能處理（確認或婉拒），
 * 提案方沒有任何辦法收回。對方若一直不處理，件數就永遠鎖著——正式資料裡
 * 出現過卡了 88 天的提案，雙方各有數件動不了。
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { branch_code } = await req.json().catch(() => ({}))

  if (!branch_code) return NextResponse.json({ error: '參數錯誤' }, { status: 400 })

  const result = db.transaction(() => {
    const proposal = getProposal(id)
    if (!proposal || proposal.status !== 'pending') {
      return { error: '找不到待確認的提案', status: 404 }
    }
    // 只有提案方能撤回；被提案方要用「婉拒」
    if (proposal.from_branch_code !== branch_code) {
      return { error: '只有提出方可以撤回，若要拒絕請用婉拒', status: 403 }
    }

    db.prepare("UPDATE match_proposals SET status = 'cancelled' WHERE id = ?").run(id)
    return null
  }).immediate()

  if (result) return NextResponse.json({ error: result.error }, { status: result.status })

  const proposal = getProposal(id)!
  return NextResponse.json({
    ok: true,
    to_branch_name: proposal.to_branch_name,
    released: proposal.proposed_count,
    still_waiting: getRequest(proposal.from_request_id)?.remaining_count ?? 0,
  })
}
