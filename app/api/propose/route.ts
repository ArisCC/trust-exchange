import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { from_request_id, to_request_id, proposed_count } = await req.json()

  if (!from_request_id || !to_request_id || !proposed_count || proposed_count < 1) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  const [{ data: fromReq }, { data: toReq }] = await Promise.all([
    supabase.from('exchange_requests').select('*').eq('id', from_request_id).single(),
    supabase.from('exchange_requests').select('*').eq('id', to_request_id).single(),
  ])

  if (!fromReq || !toReq) {
    return NextResponse.json({ error: '找不到申請' }, { status: 404 })
  }
  if (fromReq.status !== 'waiting' || toReq.status !== 'waiting') {
    return NextResponse.json({ error: '申請已不在等待中' }, { status: 400 })
  }
  if ((fromReq.trust_type ?? 'disability') !== (toReq.trust_type ?? 'disability')) {
    return NextResponse.json({ error: '信託類型不符，無法配對' }, { status: 400 })
  }

  // 計算雙方已被 pending 提案佔用的件數（含正向與反向）
  const [{ data: fromPending }, { data: toPending }] = await Promise.all([
    supabase.from('match_proposals').select('proposed_count')
      .or(`from_request_id.eq.${from_request_id},to_request_id.eq.${from_request_id}`)
      .eq('status', 'pending'),
    supabase.from('match_proposals').select('proposed_count')
      .or(`from_request_id.eq.${to_request_id},to_request_id.eq.${to_request_id}`)
      .eq('status', 'pending'),
  ])

  const fromCommitted = (fromPending ?? []).reduce((s, p) => s + p.proposed_count, 0)
  const toCommitted = (toPending ?? []).reduce((s, p) => s + p.proposed_count, 0)
  const fromAvailable = fromReq.remaining_count - fromCommitted
  const toAvailable = toReq.remaining_count - toCommitted

  if (proposed_count > fromAvailable) {
    return NextResponse.json(
      { error: `提案件數超過可用件數（您實際可用 ${fromAvailable} 件）` },
      { status: 400 }
    )
  }
  if (proposed_count > toAvailable) {
    return NextResponse.json(
      { error: `對方可用件數不足（對方實際可用 ${toAvailable} 件）` },
      { status: 400 }
    )
  }

  // 確認這兩筆申請之間沒有任何方向的 pending 提案
  const [{ data: forward }, { data: reverse }] = await Promise.all([
    supabase.from('match_proposals').select('id')
      .eq('from_request_id', from_request_id)
      .eq('to_request_id', to_request_id)
      .eq('status', 'pending')
      .maybeSingle(),
    supabase.from('match_proposals').select('id')
      .eq('from_request_id', to_request_id)
      .eq('to_request_id', from_request_id)
      .eq('status', 'pending')
      .maybeSingle(),
  ])

  if (forward || reverse) {
    return NextResponse.json({ error: '這兩筆申請之間已有待確認的提案' }, { status: 400 })
  }

  const { data: proposal, error } = await supabase
    .from('match_proposals')
    .insert({
      from_request_id,
      to_request_id,
      from_branch_code: fromReq.branch_code,
      from_branch_name: fromReq.branch_name,
      to_branch_code: toReq.branch_code,
      to_branch_name: toReq.branch_name,
      proposed_count,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(proposal)
}
