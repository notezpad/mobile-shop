import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * ⚡ CPU / Error-1102 MITIGATION (2026-09-30)
 *
 * Ultra-light endpoint: NO database, NO auth, NO Prisma — just a JSON echo.
 *
 * Purpose: keep-warm ping target. This app runs on Cloudflare Workers where
 * CPU is charged per invocation and COLD ISOLATES pay the full server-bundle
 * module-init cost (~100-200ms CPU). At low traffic (≈0.1 req/sec) almost
 * every request lands on a cold isolate, which is the main reason the median
 * CPU time is so high.
 *
 * Point any free uptime monitor (UptimeRobot / Healthchecks.io / Better Stack)
 * at https://<domain>/api/health with a 1-5 minute interval. Each ping keeps
 * an isolate warm in the placement colo, so real user requests mostly land on
 * an already-initialized isolate instead of paying cold-start CPU again.
 *
 * Deliberately returns NO runtime details (no db status, no version) because
 * the endpoint is public and unauthenticated by design.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        // CDN-cache it for 30s so even a ping storm costs almost zero CPU
        'Cache-Control': 'public, max-age=30',
      },
    }
  )
}
