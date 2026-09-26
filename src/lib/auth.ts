// src/lib/auth.ts — replace only hashPassword and verifyPassword
// Drop bcryptjs (CPU-intensive, causes Error 1102 on Cloudflare Workers).
// Use Web Crypto PBKDF2 which is native and fast in Workers.

const ITERATIONS = 100_000
const KEY_LEN = 32
const DIGEST = 'SHA-256'
const SEP = ':'

async function pbkdf2Hash(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: DIGEST, salt, iterations: ITERATIONS },
    keyMaterial, KEY_LEN * 8
  )
  const hashHex = Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  const saltHex = Array.from(salt)
    .map(b => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2${SEP}${saltHex}${SEP}${hashHex}`
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return pbkdf2Hash(password, salt)
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Legacy bcrypt hash (starts with $2b$ or $2a$)
  if (stored.startsWith('$2')) {
    const bcrypt = await import('bcryptjs')
    return bcrypt.compare(password, stored)
  }
  // New PBKDF2 format: "pbkdf2:<saltHex>:<hashHex>"
  const parts = stored.split(SEP)
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false
  const saltBytes = Uint8Array.from(
    parts[1].match(/.{2}/g)!.map(h => parseInt(h, 16))
  )
  const expected = await pbkdf2Hash(password, saltBytes)
  // Constant-time compare
  const a = new TextEncoder().encode(expected)
  const b = new TextEncoder().encode(stored)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
