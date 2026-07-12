/**
 * JWT issuance & verification using `jose` (CF Workers compatible).
 *
 * Two token types:
 *  - Access token (15 min TTL) — short-lived, sent in Authorization header.
 *  - Refresh token (7 days TTL) — long-lived, sent in httpOnly cookie (server-side).
 *
 * Both are HS256 signed with env.JWT_SECRET.
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@mobile-shop/shared';
import type { RoleKey } from '@mobile-shop/shared';

const ISSUER = 'mobile-shop-erp';
const AUDIENCE = 'mobile-shop-erp-clients';

const ALG = 'HS256';

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  username: string;
  roleId: string;
  roleKey: RoleKey;
  branchId: string | null;
  tenantId: string | null;
  permissions: string[];
  type: 'access';
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  tokenId: string;
  type: 'refresh';
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Issue a short-lived access token containing the user's session info. */
export async function signAccessToken(
  payload: Omit<AccessTokenPayload, 'type' | 'iat' | 'exp' | 'iss' | 'aud'>,
  jwtSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    ...payload,
    type: 'access',
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(getSecretKey(jwtSecret));

  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/** Issue a long-lived refresh token. Only identifies the user — no permissions. */
export async function signRefreshToken(
  userId: string,
  tokenId: string,
  jwtSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    sub: userId,
    tokenId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(now + REFRESH_TOKEN_TTL_SECONDS)
    .sign(getSecretKey(jwtSecret));

  return { token, expiresIn: REFRESH_TOKEN_TTL_SECONDS };
}

/** Verify an access token. Throws if invalid/expired. */
export async function verifyAccessToken(
  token: string,
  jwtSecret: string,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(jwtSecret), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (payload.type !== 'access') {
    throw new Error('Expected access token');
  }
  return payload as AccessTokenPayload;
}

/** Verify a refresh token. Throws if invalid/expired. */
export async function verifyRefreshToken(
  token: string,
  jwtSecret: string,
): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(jwtSecret), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (payload.type !== 'refresh') {
    throw new Error('Expected refresh token');
  }
  return payload as RefreshTokenPayload;
}
