import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const region = searchParams.get('region')
  const exclude = searchParams.get('exclude') // 排除自己的分行

  let query = supabase
    .from('exchange_requests')
    .select('*')
    .eq('status', 'waiting')
    .gt('remaining_count', 0)
    .order('created_at', { ascending: true })

  if (exclude) query = query.neq('branch_code', exclude)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 若有地區篩選，在應用層過濾（地區資料在前端）
  return NextResponse.json(data)
}
