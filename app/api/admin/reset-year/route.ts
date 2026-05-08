import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const now = new Date().toISOString()

  // Count what will be affected before resetting
  const [{ count: activeRequests }, { count: activeProposals }] = await Promise.all([
    supabase.from('exchange_requests').select('*', { count: 'exact', head: true })
      .in('status', ['waiting', 'completed']),
    supabase.from('match_proposals').select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'confirmed']),
  ])

  // Cancel all active exchange requests
  const { error: reqErr } = await supabase
    .from('exchange_requests')
    .update({ status: 'cancelled', updated_at: now })
    .in('status', ['waiting', 'completed'])

  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })

  // Cancel all active proposals
  const { error: propErr } = await supabase
    .from('match_proposals')
    .update({ status: 'cancelled', cancel_status: 'none', cancel_requested_by: null })
    .in('status', ['pending', 'confirmed'])

  if (propErr) return NextResponse.json({ error: propErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    reset: {
      requests: activeRequests ?? 0,
      proposals: activeProposals ?? 0,
    },
  })
}
