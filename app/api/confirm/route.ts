import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { proposal_id, action } = await req.json()

  if (!proposal_id || !['confirm', 'reject'].includes(action)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  const { data: proposal } = await supabase
    .from('match_proposals')
    .select('*')
    .eq('id', proposal_id)
    .eq('status', 'pending')
    .single()

  if (!proposal) {
    return NextResponse.json({ error: '找不到待確認的提案' }, { status: 404 })
  }

  if (action === 'reject') {
    await supabase.from('match_proposals').update({ status: 'rejected' }).eq('id', proposal_id)
    return NextResponse.json({ status: 'rejected' })
  }

  // 重新讀取雙方最新狀態（防止確認前已被其他操作改動）
  const now = new Date().toISOString()

  const [{ data: fromReq }, { data: toReq }] = await Promise.all([
    supabase.from('exchange_requests').select('*').eq('id', proposal.from_request_id).single(),
    supabase.from('exchange_requests').select('*').eq('id', proposal.to_request_id).single(),
  ])

  if (!fromReq || !toReq) {
    return NextResponse.json({ error: '找不到原始申請' }, { status: 404 })
  }

  // 其中一方已不在等待中，自動 reject 此提案
  if (fromReq.status !== 'waiting' || toReq.status !== 'waiting') {
    await supabase.from('match_proposals').update({ status: 'rejected' }).eq('id', proposal_id)
    return NextResponse.json({ error: '其中一方的申請已不在等待中，提案已自動取消' }, { status: 400 })
  }

  const fromRemaining = fromReq.remaining_count - proposal.proposed_count
  const toRemaining = toReq.remaining_count - proposal.proposed_count

  // 件數不足（被其他提案先佔用），自動 reject
  if (fromRemaining < 0 || toRemaining < 0) {
    await supabase.from('match_proposals').update({ status: 'rejected' }).eq('id', proposal_id)
    return NextResponse.json({ error: '可交換件數不足，提案已自動取消' }, { status: 400 })
  }

  // 原子性更新：條件加上原始 remaining_count，防止 race condition
  const [fromUpdate, toUpdate] = await Promise.all([
    supabase.from('exchange_requests').update({
      remaining_count: fromRemaining,
      status: fromRemaining === 0 ? 'completed' : 'waiting',
      updated_at: now,
    }).eq('id', proposal.from_request_id).eq('remaining_count', fromReq.remaining_count),
    supabase.from('exchange_requests').update({
      remaining_count: toRemaining,
      status: toRemaining === 0 ? 'completed' : 'waiting',
      updated_at: now,
    }).eq('id', proposal.to_request_id).eq('remaining_count', toReq.remaining_count),
  ])

  if (fromUpdate.error || toUpdate.error) {
    return NextResponse.json({ error: '更新失敗，請重試' }, { status: 500 })
  }

  await supabase.from('match_proposals')
    .update({ status: 'confirmed', confirmed_at: now })
    .eq('id', proposal_id)

  // 若任一方 remaining 歸零，自動 reject 其餘 pending 提案
  if (fromRemaining === 0) {
    await supabase.from('match_proposals')
      .update({ status: 'rejected' })
      .or(`from_request_id.eq.${proposal.from_request_id},to_request_id.eq.${proposal.from_request_id}`)
      .eq('status', 'pending')
      .neq('id', proposal_id)
  }
  if (toRemaining === 0) {
    await supabase.from('match_proposals')
      .update({ status: 'rejected' })
      .or(`from_request_id.eq.${proposal.to_request_id},to_request_id.eq.${proposal.to_request_id}`)
      .eq('status', 'pending')
      .neq('id', proposal_id)
  }

  return NextResponse.json({ status: 'confirmed' })
}
