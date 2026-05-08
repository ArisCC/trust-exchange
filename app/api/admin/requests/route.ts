import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // waiting | completed | cancelled | all
  const q = searchParams.get('q') ?? ''

  let query = supabase
    .from('exchange_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (status && status !== 'all') query = query.eq('status', status)
  if (q) query = query.or(`branch_name.ilike.%${q}%,branch_code.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
