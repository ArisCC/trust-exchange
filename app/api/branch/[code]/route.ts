import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params

  const { data: myRequests } = await supabase
    .from('exchange_requests')
    .select('*')
    .eq('branch_code', code)
    .order('created_at', { ascending: false })

  // 自動修正：remaining=0 但 status 還是 waiting 的舊資料
  const stale = (myRequests ?? []).filter(r => r.remaining_count === 0 && r.status === 'waiting')
  if (stale.length > 0) {
    await supabase.from('exchange_requests')
      .update({ status: 'completed' })
      .in('id', stale.map(r => r.id))
    stale.forEach(r => { r.status = 'completed' })
  }

  const allIds = (myRequests ?? []).map(r => r.id)
  // 只用未取消的申請 ID 查詢配對資料，避免已取消的申請帶出舊配對
  const activeIds = (myRequests ?? []).filter(r => r.status !== 'cancelled').map(r => r.id)

  if (allIds.length === 0) {
    return NextResponse.json({
      myRequests: [],
      incomingProposals: [],
      outgoingProposals: [],
      confirmedMatches: [],
      pastHistory: [],
    })
  }

  const activeList = activeIds.join(',')
  const allList = allIds.join(',')

  const [
    { data: incomingProposals },
    { data: outgoingProposals },
    { data: rawConfirmedMatches },
    { data: pastHistory },
  ] = await Promise.all([
    activeIds.length > 0
      ? supabase.from('match_proposals').select('*')
          .in('to_request_id', activeIds)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),

    activeIds.length > 0
      ? supabase.from('match_proposals').select('*')
          .in('from_request_id', activeIds)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),

    activeIds.length > 0
      ? supabase.from('match_proposals').select('*')
          .or(`from_request_id.in.(${activeList}),to_request_id.in.(${activeList})`)
          .eq('status', 'confirmed')
          .order('confirmed_at', { ascending: false })
      : Promise.resolve({ data: [] }),

    supabase.from('match_proposals').select('*')
      .or(`from_request_id.in.(${allList}),to_request_id.in.(${allList})`)
      .in('status', ['cancelled', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  // 過濾掉對方申請也已取消的已確認配對（處理舊資料不一致的情況）
  const confirmedMatches = rawConfirmedMatches ?? []
  let filteredConfirmed = confirmedMatches
  if (confirmedMatches.length > 0) {
    const otherIds = confirmedMatches.map(m =>
      activeIds.includes(m.from_request_id) ? m.to_request_id : m.from_request_id
    )
    const uniqueOtherIds = [...new Set(otherIds)]
    const { data: otherRequests } = await supabase
      .from('exchange_requests')
      .select('id, status')
      .in('id', uniqueOtherIds)

    const cancelledOtherIds = new Set(
      (otherRequests ?? []).filter(r => r.status === 'cancelled').map(r => r.id)
    )
    filteredConfirmed = confirmedMatches.filter(m => {
      const otherId = activeIds.includes(m.from_request_id) ? m.to_request_id : m.from_request_id
      return !cancelledOtherIds.has(otherId)
    })
  }

  return NextResponse.json({
    myRequests: myRequests ?? [],
    incomingProposals: incomingProposals ?? [],
    outgoingProposals: outgoingProposals ?? [],
    confirmedMatches: filteredConfirmed,
    pastHistory: pastHistory ?? [],
  })
}
