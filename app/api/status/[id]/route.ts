import { NextRequest, NextResponse } from 'next/server'
import { getRequest } from '@/lib/db'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const request = getRequest(id)

  if (!request) return NextResponse.json({ error: '查無此請求' }, { status: 404 })

  return NextResponse.json(request)
}
