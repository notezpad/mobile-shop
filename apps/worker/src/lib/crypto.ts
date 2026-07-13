/**
 * Password & PIN hashing using Web Crypto API (PBKDF2).
 *
 * Compatible with both Cloudflare Workers runtime and modern browsers.
 * Hash format: `pbkdf2$<iterations>$<base64-salt>$<base64-hash>`
 *
 * The same algorithm runs client-side for offline PIN verification.
 *
 * ⚠️ CLOUDFLARE WORKERS LIMIT: WebCrypto's PBKDF2 implementation on Workers
 * rejects iteration counts above 100,000 with
 * `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
 * supported`. The `PBKDF2_ITERATIONS` constant must stay ≤ 100,000, and
 * `verifySecret` defensively rejects any stored hash whose declared iteration
 * count exceeds that ceiling so that a stale/migrated hash fails as
 * "invalid credentials" (401) instead of crashing the request (500).
 */
import {
  PBKDF2_ITERATIONS,
  PBKDF2_KEY_LENGTH,
  PBKDF2_SALT_LENGTH,
  PBKDF2_WORKERS_MAX_ITERATIONS,
} from '@mobile-shop/shared';

const HASH_PREFIX = 'pbkdf2';
const HASH_ALGO = 'SHA-256';

/** Generate a random salt (base64). */
export function generateSalt(bytes = PBKDF2_SALT_LENGTH): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64Encode(arr);
}

/** Hash a password/PIN with PBKDF2-SHA256. Returns the full `pbkdf2$...$...$...` string. */
export async function hashSecret(secret: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  if (iterations > PBKDF2_WORKERS_MAX_ITERATIONS) {
    // Never silently lower — that would change the derived bits and produce a
    // hash that no other runtime (e.g. the Python seed script) could reproduce.
    throw new Error(
      `PBKDF2 iterations ${iterations} exceed the Cloudflare Workers hard cap of ${PBKDF2_WORKERS_MAX_ITERATIONS}.`,
    );
  }
  const salt = generateSalt();
  const hash = await deriveKey(secret, salt, iterations);
  return `${HASH_PREFIX}$${iterations}$${salt}$${hash}`;
}

/** Verify a secret against a stored hash. Constant-time comparison. */
export async function verifySecret(secret: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== HASH_PREFIX) return false;

  const iterations = parseInt(parts[1]!, 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;

  // Defensive guard: if a stored hash requests more iterations than the
  // Workers runtime allows, `crypto.subtle.deriveBits` would throw
  // `NotSupportedError`. Treat it as a failed verification so the caller
  // returns a clean 401 "invalid credentials" instead of a 500.
  // The fix is to rotate the user's password / re-hash on the next write.
  if (iterations > PBKDF2_WORKERS_MAX_ITERATIONS) {
    return false;
  }

  const salt = parts[2]!;
  const expectedHash = parts[3]!;

  const actualHash = await deriveKey(secret, salt, iterations);
  return constantTimeEqual(actualHash, expectedHash);
}

/** Internal: derive a base64 hash from secret + salt using PBKDF2. */
async function deriveKey(secret: string, saltB64: string, iterations: number): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const salt = base64Decode(saltB64);
  // Cast to BufferSource — TS lib mismatch on Uint8Array.buffer (ArrayBufferLike vs ArrayBuffer).
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: HASH_ALGO,
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH * 8,
  );

  return base64Encode(new Uint8Array(bits));
}

/** Base64 helpers (work in both Workers and browsers). */
function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Constant-time string comparison to prevent timing attacks. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
