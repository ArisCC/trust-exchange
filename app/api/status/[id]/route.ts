import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { data, error } = await supabase
    .from('exchange_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: '查無此請求' }, { status: 404 })

  return NextResponse.json(data)
}
