import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// 健康檢查：確認 DB 檔案可讀寫
export async function GET() {
  const { c } = db.prepare('SELECT COUNT(*) c FROM exchange_requests').get() as { c: number }
  return NextResponse.json({ ok: true, requests: c, time: new Date().toISOString() })
}
