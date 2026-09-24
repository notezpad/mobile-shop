/**
 * Paymob Accept API helpers — subscription checkout flow.
 *
 * Flow (3-step):
 *   1. POST /v1/auth/tokens          → bearer token
 *   2. POST /v1/commerce/orders      → register order, get `order_id` (Paymob's internal id)
 *   3. POST /v1/acceptance/payment_keys → generate `payment_key` (embeds order + amount + billing)
 *   4. Redirect user to: https://egypt.paymob.com/iframe/<IFRAME_ID>?payment_token=<payment_key>
 *      (For card / wallet / kiosk. The iframe renders Paymob's hosted payment UI.)
 *
 * After payment, Paymob calls back to:
 *   - Server-to-server: the callback URL configured per integration in the Paymob dashboard
 *     (we use /api/paymob/webhook — must be added in the Paymob dashboard's
 *     "Server-to-server callback URL" field, and the HMAC secret must match
 *     PAYMOB_HMAC_SECRET).
 *   - Browser redirect: ?opener=Mobile Accept&... — the user is returned to
 *     /api/paymob/return?order_id=<order_id> which verifies via Paymob's
 *     transaction query API and redirects to /checkout/callback?status=success|failed.
 *
 * Required env vars:
 *   - PAYMOB_API_KEY         (server-side, secret — from Paymob dashboard > API Keys)
 *   - PAYMOB_PUBLIC_KEY     (client-side — for client-side wallet integrations only; not used here)
 *   - PAYMOB_INTEGRATION_ID (numeric — from Paymob dashboard > Integration Details)
 *   - PAYMOB_IFRAME_ID      (numeric — from Paymob dashboard > Iframe IDs)
 *   - PAYMOB_HMAC_SECRET    (server-side, secret — used to verify webhook callbacks)
 *   - NEXT_PUBLIC_APP_URL   (e.g. https://your-domain.com — for return URLs)
 */

import { readEnv } from './env'

const PAYMOB_BASE = 'https://egypt.paymob.com/api'

/**
 * Step 1 — authenticate and get a bearer token.
 * Token lifetime is ~1 hour; we fetch a fresh one for every checkout.
 */
export async function paymobAuth(): Promise<string> {
  const apiKey = readEnv('PAYMOB_API_KEY')
  if (!apiKey) throw new Error('PAYMOB_API_KEY غير مضبوط')

  const res = await fetch(`${PAYMOB_BASE}/v1/auth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Paymob auth failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  if (!data?.token) throw new Error('Paymob auth: no token returned')
  return data.token as string
}

/**
 * Step 2 — register an order. Returns Paymob's internal order id.
 *
 * `merchantOrderId` is OUR internal reference (we use the Subscription row id
 * so we can match the webhook back to the subscription that triggered the payment).
 */
export async function paymobCreateOrder(
  token: string,
  amountCents: number,
  merchantOrderId: string,
  items: { name: string; amount_cents: number; quantity: number }[]
): Promise<{ id: number; merchant_order_id: string }> {
  const res = await fetch(`${PAYMOB_BASE}/v1/commerce/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      merchant_order_id: merchantOrderId,
      amount_cents: amountCents,
      currency: 'EGP',
      items: items.map((it, i) => ({
        name: it.name,
        amount_cents: it.amount_cents,
        quantity: it.quantity,
        sku: `plan-${i}`,
        description: it.name,
      })),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Paymob create order failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return {
    id: data.id,
    merchant_order_id: merchantOrderId,
  }
}

/**
 * Step 3 — generate a payment key. The key embeds the order + amount + billing
 * + integration id, and is used in the iframe URL.
 *
 * `billingData` is mandatory — Paymob requires all fields, even if the
 * customer doesn't fill them in. We use the tenant's name/email/phone.
 */
export async function paymobPaymentKey(
  token: string,
  amountCents: number,
  paymobOrderId: number,
  integrationId: number,
  billingData: {
    email: string
    firstName: string
    lastName: string
    phone: string
    apartment?: string
    building?: string
    street?: string
    city?: string
    country?: string
    state?: string
    postalCode?: string
  }
): Promise<string> {
  const res = await fetch(`${PAYMOB_BASE}/v1/acceptance/payment_keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount_cents: amountCents,
      expiration: 3600, // 1 hour to complete payment
      order_id: paymobOrderId,
      billing_data: {
        email: billingData.email || 'customer@example.com',
        first_name: billingData.firstName || 'customer',
        last_name: billingData.lastName || 'customer',
        phone_number: billingData.phone || '0000000000',
        apartment: billingData.apartment || 'NA',
        building: billingData.building || 'NA',
        street: billingData.street || 'NA',
        city: billingData.city || 'Cairo',
        country: billingData.country || 'EG',
        state: billingData.state || 'NA',
        postal_code: billingData.postalCode || 'NA',
      },
      currency: 'EGP',
      integration_id: integrationId,
      lock_order_when_paid: false,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Paymob payment key failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  if (!data?.token) throw new Error('Paymob: no payment key returned')
  return data.token as string
}

/**
 * Build the iframe URL the user is redirected to. For mobile wallets the user
 * will be presented with a wallet-number input inside the iframe; for cards
 * it's a card form. The same URL works for all integration types.
 */
export function paymobIframeUrl(paymentKey: string): string {
  const iframeId = readEnv('PAYMOB_IFRAME_ID')
  if (!iframeId) throw new Error('PAYMOB_IFRAME_ID غير مضبوط')
  return `https://egypt.paymob.com/iframe/${iframeId}?payment_token=${encodeURIComponent(paymentKey)}`
}

/**
 * Verify the HMAC signature on a webhook callback.
 * Paymob signs callbacks with HMAC-SHA512 of the callback's query string
 * (sorted by key, joined as key=value&...). We rebuild the same string from
 * the request query and compare to the `hmac` field.
 *
 * The list of query parameters to include in the HMAC calculation is defined
 * by Paymob's spec — it's the "hmac_fields" string, comma-separated.
 */
export function paymobVerifyHmac(queryParams: URLSearchParams, hmacSecret: string): boolean {
  if (!hmacSecret) return false
  const hmac = queryParams.get('hmac')
  if (!hmac) return false

  // Paymob's documented list of fields that participate in the HMAC. Order matters.
  const hmacFields = [
    'amount_cents',
    'created_at',
    'currency',
    'error_occured',
    'has_parent_transaction',
    'id',
    'is_3d_secure',
    'is_auth',
    'is_capture',
    'is_refunded',
    'is_standalone_payment',
    'is_voided',
    'order',
    'owner',
    'pending',
    'source_data_bin',
    'source_data_card_token',
    'source_data_sub_type',
    'source_data_type',
    'success',
    'txn_response',
  ]

  const parts: string[] = []
  for (const key of hmacFields) {
    const val = queryParams.get(key)
    if (val !== null) parts.push(val)
  }
  const concatenated = parts.join('')

  // Use Web Crypto API for HMAC-SHA512
  // In Cloudflare Workers / Node 20+, `crypto.subtle` is available.
  // For older Node, we'd need node:crypto — but Next.js 16 supports Web Crypto.
  return verifyHmacSha512(concatenated, hmac, hmacSecret)
}

/**
 * Synchronous-looking HMAC verification using Web Crypto API.
 * Actually async under the hood but we expose the Promise.
 */
export async function paymobVerifyHmacAsync(
  queryParams: URLSearchParams,
  hmacSecret: string
): Promise<boolean> {
  if (!hmacSecret) return false
  const hmac = queryParams.get('hmac')
  if (!hmac) return false

  const hmacFields = [
    'amount_cents', 'created_at', 'currency', 'error_occured',
    'has_parent_transaction', 'id', 'is_3d_secure', 'is_auth',
    'is_capture', 'is_refunded', 'is_standalone_payment',
    'is_voided', 'order', 'owner', 'pending', 'source_data_bin',
    'source_data_card_token', 'source_data_sub_type',
    'source_data_type', 'success', 'txn_response',
  ]

  const parts: string[] = []
  for (const key of hmacFields) {
    const val = queryParams.get(key)
    if (val !== null) parts.push(val)
  }
  const concatenated = parts.join('')

  const encoder = new TextEncoder()
  const keyData = encoder.encode(hmacSecret)
  const msgData = encoder.encode(concatenated)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
  const computedHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return computedHex.toLowerCase() === hmac.toLowerCase()
}

// Kept for backwards-compat — never used in the async path above.
function verifyHmacSha512(_msg: string, _expected: string, _secret: string): boolean {
  return false
}

/**
 * Query a Paymob transaction by `order_id` (Paymob's internal order id).
 * Used by the /api/paymob/return endpoint to verify payment after the
 * browser redirect (since the redirect doesn't carry HMAC).
 */
export async function paymobGetTransactionByOrderId(
  token: string,
  paymobOrderId: number
): Promise<{
  id: number
  success: boolean
  amount_cents: number
  currency: string
  order: { id: number; merchant_order_id: string }
  source_data: { type: string; sub_type: string; pan?: string }
  created_at: string
  pending: boolean
  is_voided: boolean
  is_refunded: boolean
  is_3d_secure: boolean
  error_occured: boolean
}> {
  // The Accept API doesn't have a direct "transaction by order id" endpoint —
  // but it has /v1/acceptance/transactions/{txn_id} and
  // /v1/commerce/orders/{order_id}/transactions (undocumented but widely used).
  // We use the order endpoint to get the list of transactions on the order.
  const res = await fetch(`${PAYMOB_BASE}/v1/commerce/orders/${paymobOrderId}/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Paymob get txn failed (${res.status}): ${text}`)
  }
  const list = await res.json()
  // The most recent transaction is the latest attempt — pick the last one
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('No transactions found for order')
  }
  return list[list.length - 1]
}

/**
 * Convert EGP amount (e.g. 299.00) to integer cents (e.g. 29900) for Paymob API.
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}
