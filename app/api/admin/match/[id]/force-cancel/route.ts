import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const { id } = await ctx.params
  const now = new Date().toISOString()

  const { data: proposal } = await supabase
    .from('match_proposals')
    .select('*')
    .eq('id', id)
    .eq('status', 'confirmed')
    .single()

  if (!proposal) return NextResponse.json({ error: '找不到已確認的配對' }, { status: 404 })

  const [{ data: fromReq }, { data: toReq }] = await Promise.all([
    supabase.from('exchange_requests').select('*').eq('id', proposal.from_request_id).single(),
    supabase.from('exchange_requests').select('*').eq('id', proposal.to_request_id).single(),
  ])

  await Promise.all([
    supabase.from('match_proposals')
      .update({ status: 'cancelled', cancel_status: 'none', cancel_requested_by: null })
      .eq('id', id),
    fromReq && supabase.from('exchange_requests').update({
      remaining_count: fromReq.remaining_count + proposal.proposed_count,
      status: 'waiting',
      updated_at: now,
    }).eq('id', proposal.from_request_id),
    toReq && supabase.from('exchange_requests').update({
      remaining_count: toReq.remaining_count + proposal.proposed_count,
      status: 'waiting',
      updated_at: now,
    }).eq('id', proposal.to_request_id),
  ])

  return NextResponse.json({ ok: true })
}
