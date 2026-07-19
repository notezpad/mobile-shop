import { getCloudflareContext } from '@opennextjs/cloudflare'

type EnvRecord = Record<string, unknown>

type GlobalWithRuntimeEnv = typeof globalThis & {
  __MOBILE_SHOP_RUNTIME_ENV__?: EnvRecord
  __env__?: EnvRecord
  __ENV__?: EnvRecord
  env?: EnvRecord
  process?: { env?: Record<string, string | undefined> }
}

const globalRuntime = globalThis as GlobalWithRuntimeEnv

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  // Some dashboards/wrappers expose values as { value: "..." }.
  if (value && typeof value === 'object' && 'value' in value) {
    return asNonEmptyString((value as { value?: unknown }).value)
  }

  return undefined
}

function readKnownProcessEnv(name: string): string | undefined {
  // Keep direct process.env.X references here. Some Cloudflare/OpenNext builds
  // only preserve/static-rewrite named env access, while dynamic process.env[name]
  // can be empty in the Worker runtime.
  switch (name) {
    case 'DATABASE_URL':
      return asNonEmptyString(process.env.DATABASE_URL)
    case 'POSTGRES_PRISMA_URL':
      return asNonEmptyString(process.env.POSTGRES_PRISMA_URL)
    case 'POSTGRES_URL':
      return asNonEmptyString(process.env.POSTGRES_URL)
    case 'DIRECT_URL':
      return asNonEmptyString(process.env.DIRECT_URL)
    case 'JWT_SECRET':
      return asNonEmptyString(process.env.JWT_SECRET)
    case 'NODE_ENV':
      return asNonEmptyString(process.env.NODE_ENV)
    default:
      return undefined
  }
}

function readFromObject(env: EnvRecord | undefined, name: string): string | undefined {
  return env ? asNonEmptyString(env[name]) : undefined
}

function readFromCloudflareContext(name: string): string | undefined {
  try {
    const maybeContext = getCloudflareContext()

    // Newer @opennextjs/cloudflare returns the context synchronously for route
    // handlers. Older/SSG async mode returns a Promise, which cannot be read from
    // this synchronous Prisma factory, so we deliberately fall through.
    if (maybeContext && typeof (maybeContext as unknown as Promise<unknown>).then !== 'function') {
      return readFromObject((maybeContext as unknown as { env?: EnvRecord }).env, name)
    }
  } catch {
    // Outside request scope or unsupported runtime — try the other sources.
  }

  return undefined
}

export function installRuntimeEnv(env: unknown) {
  if (!env || typeof env !== 'object') return

  const runtimeEnv = env as EnvRecord
  globalRuntime.__MOBILE_SHOP_RUNTIME_ENV__ = runtimeEnv

  const processEnv = { ...(globalRuntime.process?.env ?? {}) }
  for (const [key, value] of Object.entries(runtimeEnv)) {
    const stringValue = asNonEmptyString(value)
    if (stringValue) processEnv[key] = stringValue
  }

  globalRuntime.process = {
    ...(globalRuntime.process ?? {}),
    env: processEnv,
  }
}

export function readEnv(name: string): string | undefined {
  return (
    readFromObject(globalRuntime.__MOBILE_SHOP_RUNTIME_ENV__, name) ??
    readFromCloudflareContext(name) ??
    readKnownProcessEnv(name) ??
    readFromObject(globalRuntime.process?.env, name) ??
    readFromObject(globalRuntime.__env__, name) ??
    readFromObject(globalRuntime.__ENV__, name) ??
    readFromObject(globalRuntime.env, name)
  )
}

export function readDatabaseUrl(): string | undefined {
  // DATABASE_URL is the expected name. The others are safe aliases in case the
  // DB connection was added under a common provider-generated name.
  return (
    readEnv('DATABASE_URL') ??
    readEnv('POSTGRES_PRISMA_URL') ??
    readEnv('POSTGRES_URL') ??
    readEnv('DIRECT_URL')
  )
}

export function isProductionRuntime(): boolean {
  return readEnv('NODE_ENV') === 'production'
}
