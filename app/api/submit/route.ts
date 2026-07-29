import { NextRequest, NextResponse } from 'next/server'
import { db, newId, nowISO } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { branch_code, branch_name, trust_type, case_count, customer_count } = await req.json()

  const validTypes = ['disability', 'general', 'care']
  if (!branch_code || !branch_name || !case_count || case_count < 1) {
    return NextResponse.json({ error: '請填寫分行代號與件數' }, { status: 400 })
  }
  if (!validTypes.includes(trust_type)) {
    return NextResponse.json({ error: '請選擇信託類型' }, { status: 400 })
  }

  // 客戶數選填；填了就必須介於 1 與件數之間（件數不可能來自比它更多的客戶）
  const customers = customer_count == null || customer_count === '' ? null : Number(customer_count)
  if (customers !== null && (!Number.isInteger(customers) || customers < 1 || customers > case_count)) {
    return NextResponse.json({ error: `客戶數需介於 1 與 ${case_count} 之間` }, { status: 400 })
  }

  // 聯絡方式屬於分行，在 /api/branch/[code]/contact 單獨維護，這裡不重複收
  const id = newId()
  const now = nowISO()

  db.prepare(
    `INSERT INTO exchange_requests
       (id, branch_code, branch_name, trust_type, requested_count, remaining_count,
        customer_count, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`
  ).run(id, branch_code, branch_name, trust_type, case_count, case_count, customers, now, now)

  return NextResponse.json({ id })
}
