import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { case_count, contact_info } = await req.json()

  if (!case_count || case_count < 1) {
    return NextResponse.json({ error: '件數不正確' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('exchange_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: '找不到申請' }, { status: 404 })
  if (existing.status !== 'waiting') return NextResponse.json({ error: '已完成的申請無法編輯' }, { status: 400 })

  // 計算已承諾件數：已確認配對 + pending 中承諾的
  const { data: pendingProposals } = await supabase
    .from('match_proposals')
    .select('proposed_count')
    .or(`from_request_id.eq.${id},to_request_id.eq.${id}`)
    .eq('status', 'pending')

  const confirmedMatched = existing.requested_count - existing.remaining_count
  const pendingCommitted = (pendingProposals ?? []).reduce((s, p) => s + p.proposed_count, 0)
  const totalCommitted = confirmedMatched + pendingCommitted

  if (case_count < totalCommitted) {
    return NextResponse.json({
      error: `件數不可低於已承諾的 ${totalCommitted} 件（已配對 ${confirmedMatched} 件＋待確認 ${pendingCommitted} 件）`
    }, { status: 400 })
  }

  const newRemaining = case_count - confirmedMatched

  const { error } = await supabase
    .from('exchange_requests')
    .update({
      requested_count: case_count,
      remaining_count: newRemaining,
      status: newRemaining === 0 ? 'completed' : 'waiting',
      contact_info: contact_info ?? existing.contact_info,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const now = new Date().toISOString()

  // 拒絕所有 pending 提案
  await supabase
    .from('match_proposals')
    .update({ status: 'rejected' })
    .or(`from_request_id.eq.${id},to_request_id.eq.${id}`)
    .eq('status', 'pending')

  // 找出所有已確認的配對，把對方的件數還回去
  const { data: confirmedMatches } = await supabase
    .from('match_proposals')
    .select('*')
    .or(`from_request_id.eq.${id},to_request_id.eq.${id}`)
    .eq('status', 'confirmed')

  if (confirmedMatches && confirmedMatches.length > 0) {
    for (const match of confirmedMatches) {
      const otherRequestId = match.from_request_id === id ? match.to_request_id : match.from_request_id
      const { data: otherReq } = await supabase
        .from('exchange_requests')
        .select('*')
        .eq('id', otherRequestId)
        .single()

      if (otherReq) {
        await supabase.from('exchange_requests').update({
          remaining_count: otherReq.remaining_count + match.proposed_count,
          status: 'waiting',
          updated_at: now,
        }).eq('id', otherRequestId)
      }
    }

    // 把這些配對標為 cancelled
    await supabase
      .from('match_proposals')
      .update({ status: 'cancelled', cancel_requested_by: null, cancel_status: 'none' })
      .or(`from_request_id.eq.${id},to_request_id.eq.${id}`)
      .eq('status', 'confirmed')
  }

  // 取消申請本身
  const { error } = await supabase
    .from('exchange_requests')
    .update({ status: 'cancelled', updated_at: now })
    .eq('id', id)
    .eq('status', 'waiting')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
