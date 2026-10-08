/**
 * ⚡ SANDBOX DEMO ADAPTER (2026-10-08):
 * النسخة الأصلية بتقرأ متغيرات البيئة من Cloudflare Workers runtime
 * (getCloudflareContext). هنا بنقرأ من process.env العادية — كفاية تماماً
 * لبيئة التطوير المحلية.
 */

type EnvRecord = Record<string, unknown>

const globalRuntime = globalThis as typeof globalThis & {
  __MOBILE_SHOP_RUNTIME_ENV__?: EnvRecord
  __env__?: EnvRecord
  __ENV__?: EnvRecord
  env?: EnvRecord
  process?: { env?: Record<string, string | undefined> }
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return asNonEmptyString((value as { value?: unknown }).value)
  }
  return undefined
}

/** Install runtime env (no-op compat for the Cloudflare version). */
export function installRuntimeEnv(env: unknown) {
  globalRuntime.__MOBILE_SHOP_RUNTIME_ENV__ = env as EnvRecord
}

export function readEnv(name: string): string | undefined {
  // 1) process.env (Node / Next.js dev)
  const fromProcess = asNonEmptyString(process.env?.[name])
  if (fromProcess) return fromProcess

  // 2) Injected runtime env (compat)
  const sources: EnvRecord[] = [
    globalRuntime.__MOBILE_SHOP_RUNTIME_ENV__ ?? {},
    globalRuntime.__env__ ?? {},
    globalRuntime.__ENV__ ?? {},
  ]
  for (const src of sources) {
    const v = asNonEmptyString(src[name])
    if (v) return v
  }
  return undefined
}

export function readDatabaseUrl(): string | undefined {
  return (
    readEnv('DATABASE_URL') ??
    readEnv('POSTGRES_PRISMA_URL') ??
    readEnv('POSTGRES_URL')
  )
}

export function isProductionRuntime(): boolean {
  return process.env?.NODE_ENV === 'production'
}
