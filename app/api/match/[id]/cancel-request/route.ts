import { NextRequest, NextResponse } from 'next/server'
import { db, getProposal } from '@/lib/db'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { branch_code } = await req.json()

  if (!branch_code) return NextResponse.json({ error: '參數錯誤' }, { status: 400 })

  const proposal = getProposal(id)
  if (!proposal || proposal.status !== 'confirmed') {
    return NextResponse.json({ error: '找不到已確認的配對' }, { status: 404 })
  }

  if (proposal.from_branch_code !== branch_code && proposal.to_branch_code !== branch_code) {
    return NextResponse.json({ error: '無權操作' }, { status: 403 })
  }

  if (proposal.cancel_status === 'pending') {
    return NextResponse.json({ error: '已有待確認的取消申請' }, { status: 400 })
  }

  db.prepare(
    "UPDATE match_proposals SET cancel_status = 'pending', cancel_requested_by = ? WHERE id = ?"
  ).run(branch_code, id)

  return NextResponse.json({ ok: true })
}
