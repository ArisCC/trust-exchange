import { NextRequest, NextResponse } from 'next/server'
import { db, newId, nowISO } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { branch_code, branch_name, trust_type, case_count, contact_info, notification_email } =
    await req.json()

  const validTypes = ['disability', 'general', 'care']
  if (!branch_code || !branch_name || !case_count || case_count < 1) {
    return NextResponse.json({ error: '請填寫分行代號與件數' }, { status: 400 })
  }
  if (!validTypes.includes(trust_type)) {
    return NextResponse.json({ error: '請選擇信託類型' }, { status: 400 })
  }

  const email = (notification_email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: '通知信箱格式不正確' }, { status: 400 })
  }

  const id = newId()
  const now = nowISO()

  db.prepare(
    `INSERT INTO exchange_requests
       (id, branch_code, branch_name, trust_type, requested_count, remaining_count,
        contact_info, notification_email, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`
  ).run(
    id,
    branch_code,
    branch_name,
    trust_type,
    case_count,
    case_count,
    contact_info || null,
    email || null,
    now,
    now
  )

  return NextResponse.json({ id })
}
