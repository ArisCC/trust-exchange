import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// action: 'approve' | 'reject' 由對方執行；'withdraw' 由申請方自行撤回
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { branch_code, action } = await req.json()

  if (!branch_code || !['approve', 'reject', 'withdraw'].includes(action)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  const { data: proposal } = await supabase
    .from('match_proposals')
    .select('*')
    .eq('id', id)
    .eq('status', 'confirmed')
    .eq('cancel_status', 'pending')
    .single()

  if (!proposal) return NextResponse.json({ error: '找不到待確認的取消申請' }, { status: 404 })

  if (proposal.from_branch_code !== branch_code && proposal.to_branch_code !== branch_code) {
    return NextResponse.json({ error: '無權操作' }, { status: 403 })
  }

  const isRequester = proposal.cancel_requested_by === branch_code

  if (action === 'withdraw') {
    if (!isRequester) return NextResponse.json({ error: '只有申請方可撤回' }, { status: 403 })
    await supabase.from('match_proposals')
      .update({ cancel_status: 'none', cancel_requested_by: null })
      .eq('id', id)
    return NextResponse.json({ ok: true, status: 'withdrawn' })
  }

  if (isRequester) {
    return NextResponse.json({ error: '不能自行確認取消申請，請由對方操作' }, { status: 400 })
  }

  if (action === 'reject') {
    await supabase.from('match_proposals')
      .update({ cancel_status: 'rejected' })
      .eq('id', id)
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  // approve：還原雙方 remaining_count，將配對標記為 cancelled
  const now = new Date().toISOString()

  const [{ data: fromReq }, { data: toReq }] = await Promise.all([
    supabase.from('exchange_requests').select('*').eq('id', proposal.from_request_id).single(),
    supabase.from('exchange_requests').select('*').eq('id', proposal.to_request_id).single(),
  ])

  if (!fromReq || !toReq) {
    return NextResponse.json({ error: '找不到原始申請' }, { status: 404 })
  }

  await Promise.all([
    supabase.from('match_proposals')
      .update({ status: 'cancelled', cancel_status: 'none', cancel_requested_by: null })
      .eq('id', id),
    supabase.from('exchange_requests').update({
      remaining_count: fromReq.remaining_count + proposal.proposed_count,
      status: 'waiting',
      updated_at: now,
    }).eq('id', proposal.from_request_id),
    supabase.from('exchange_requests').update({
      remaining_count: toReq.remaining_count + proposal.proposed_count,
      status: 'waiting',
      updated_at: now,
    }).eq('id', proposal.to_request_id),
  ])

  return NextResponse.json({ ok: true, status: 'approved' })
}
