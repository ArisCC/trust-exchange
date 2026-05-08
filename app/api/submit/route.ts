import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { branch_code, branch_name, trust_type, case_count, contact_info } = await req.json()

  const validTypes = ['disability', 'general', 'care']
  if (!branch_code || !branch_name || !case_count || case_count < 1) {
    return NextResponse.json({ error: '請填寫分行代號與件數' }, { status: 400 })
  }
  if (!validTypes.includes(trust_type)) {
    return NextResponse.json({ error: '請選擇信託類型' }, { status: 400 })
  }

  const { data: request, error } = await supabase
    .from('exchange_requests')
    .insert({
      branch_code,
      branch_name,
      trust_type,
      requested_count: case_count,
      remaining_count: case_count,
      contact_info: contact_info || null,
      status: 'waiting',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: request.id })
}
