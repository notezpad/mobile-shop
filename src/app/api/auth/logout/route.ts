import { withDb } from '@/lib/db'
import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function __POST() {
  await clearSession()
  return NextResponse.json({ ok: true })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
