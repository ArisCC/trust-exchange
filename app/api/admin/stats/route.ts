import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }

  const [
    { count: totalRequests },
    { count: waitingRequests },
    { count: completedRequests },
    { count: totalMatches },
    { data: recentMatches },
    { data: topBranches },
  ] = await Promise.all([
    supabase.from('exchange_requests').select('*', { count: 'exact', head: true }),
    supabase.from('exchange_requests').select('*', { count: 'exact', head: true }).eq('status', 'waiting'),
    supabase.from('exchange_requests').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('match_proposals').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('match_proposals').select('*').eq('status', 'confirmed').order('confirmed_at', { ascending: false }).limit(10),
    supabase.from('match_proposals').select('from_branch_code, from_branch_name').eq('status', 'confirmed'),
  ])

  const branchCount: Record<string, { name: string; count: number }> = {}
  for (const m of topBranches ?? []) {
    if (!branchCount[m.from_branch_code]) {
      branchCount[m.from_branch_code] = { name: m.from_branch_name, count: 0 }
    }
    branchCount[m.from_branch_code].count++
  }
  const activeBranches = Object.entries(branchCount)
    .map(([code, v]) => ({ code, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return NextResponse.json({
    totalRequests: totalRequests ?? 0,
    waitingRequests: waitingRequests ?? 0,
    completedRequests: completedRequests ?? 0,
    totalMatches: totalMatches ?? 0,
    recentMatches: recentMatches ?? [],
    activeBranches,
  })
}
