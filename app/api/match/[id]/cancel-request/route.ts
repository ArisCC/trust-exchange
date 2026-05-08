import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { branch_code } = await req.json()

  if (!branch_code) return NextResponse.json({ error: '參數錯誤' }, { status: 400 })

  const { data: proposal } = await supabase
    .from('match_proposals')
    .select('*')
    .eq('id', id)
    .eq('status', 'confirmed')
    .single()

  if (!proposal) return NextResponse.json({ error: '找不到已確認的配對' }, { status: 404 })

  if (proposal.from_branch_code !== branch_code && proposal.to_branch_code !== branch_code) {
    return NextResponse.json({ error: '無權操作' }, { status: 403 })
  }

  if (proposal.cancel_status === 'pending') {
    return NextResponse.json({ error: '已有待確認的取消申請' }, { status: 400 })
  }

  await supabase
    .from('match_proposals')
    .update({ cancel_status: 'pending', cancel_requested_by: branch_code })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
