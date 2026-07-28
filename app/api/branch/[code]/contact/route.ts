import { NextRequest, NextResponse } from 'next/server'
import { getBranchContact, setBranchContact } from '@/lib/db'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  return NextResponse.json(
    getBranchContact(code) ?? { branch_code: code, contact_info: null, notification_email: null }
  )
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const { contact_info, notification_email } = await req.json()

  const email = (notification_email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: '通知信箱格式不正確' }, { status: 400 })
  }

  setBranchContact(code, contact_info ?? null, email || null)
  return NextResponse.json({ ok: true })
}
