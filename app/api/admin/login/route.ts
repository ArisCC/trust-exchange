import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: '密碼錯誤' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_auth', process.env.ADMIN_PASSWORD!, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 8, // 8 小時
    path: '/',
  })
  return res
}
