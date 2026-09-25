/**
 * Paymob Unified Checkout (Intention API) helpers.
 *
 * Flow (single step):
 *   1. POST /v1/intention/  → client_secret
 *   2. Redirect to: https://accept.paymob.com/unifiedcheckout/?publicKey=<PUBLIC_KEY>&clientSecret=<client_secret>
 *
 * Required env vars:
 *   - PAYMOB_SECRET_KEY      (from Paymob dashboard → Settings → API Keys)
 *   - PAYMOB_PUBLIC_KEY      (from Paymob dashboard → Settings → API Keys)
 *   - PAYMOB_INTEGRATION_ID  (card — from Paymob dashboard → Integration Details)
 *   - PAYMOB_INTEGRATION_ID_WALLET  (optional — mobile wallets)
 *   - PAYMOB_INTEGRATION_ID_KIOSK   (optional — Fawry/kiosk)
 *   - PAYMOB_HMAC_SECRET     (for webhook verification)
 */

import { readEnv } from './env'

const PAYMOB_BASE = 'https://accept.paymob.com'

// ─── Helpers ────────────────────────────────────────────────────────

/** Normalize Egyptian phone to international format Paymob expects.
 *  e.g. "01012345678" → "201012345678" */
function normalizeEgyptPhone(phone: string): string {
  let p = phone.replace(/[\s\-+]/g, '')
  if (p.startsWith('002')) p = p.slice(3)
  else if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith('01')) p = '2' + p
  return p
}

// ─── Intention API ────────────────────────────────────────────────

export interface PaymobIntentionResult {
  clientSecret: string
  intentionId: string
  checkoutUrl: string
}

/**
 * Create a Paymob payment intention (single API call).
 * Returns the clientSecret + the full Unified Checkout redirect URL.
 */
export async function createPaymobIntention(params: {
  merchantOrderId: string
  amountCents: number
  planLabel: string
  customer: { name: string; phone: string; email: string }
}): Promise<PaymobIntentionResult> {
  const secretKey = readEnv('PAYMOB_SECRET_KEY')
  const publicKey = readEnv('PAYMOB_PUBLIC_KEY')
  const integrationId = readEnv('PAYMOB_INTEGRATION_ID')
  const integrationIdWallet = readEnv('PAYMOB_INTEGRATION_ID_WALLET')
  const integrationIdKiosk = readEnv('PAYMOB_INTEGRATION_ID_KIOSK')

  if (!secretKey) throw new Error('PAYMOB_SECRET_KEY غير مضبوط')
  if (!publicKey) throw new Error('PAYMOB_PUBLIC_KEY غير مضبوط')
  if (!integrationId) throw new Error('PAYMOB_INTEGRATION_ID غير مضبوط')

  const integrationIds = [
    integrationId,
    integrationIdWallet,
    integrationIdKiosk,
  ].filter((id): id is string => Boolean(id)).map(Number)

  const firstName = params.customer.name.split(' ')[0] || params.customer.name
  const lastName = params.customer.name.split(' ').slice(1).join(' ') || params.customer.name

  const body = {
    amount: params.amountCents,
    currency: 'EGP',
    payment_methods: integrationIds,
    items: [
      {
        name: params.planLabel,
        amount: params.amountCents,
        description: params.planLabel,
        quantity: 1,
      },
    ],
    billing_data: {
      apartment: 'NA',
      email: params.customer.email,
      floor: 'NA',
      first_name: firstName,
      street: 'NA',
      building: 'NA',
      phone_number: normalizeEgyptPhone(params.customer.phone),
      shipping_method: 'NA',
      postal_code: 'NA',
      city: 'NA',
      country: 'EG',
      last_name: lastName,
      state: 'NA',
    },
    customer: {
      first_name: firstName,
      last_name: lastName,
      email: params.customer.email,
      extras: { merchant_order_id: params.merchantOrderId },
    },
    special_reference: params.merchantOrderId,
    extras: { merchant_order_id: params.merchantOrderId },
  }

  const res = await fetch(`${PAYMOB_BASE}/v1/intention/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${secretKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Paymob intention failed (${res.status}): ${text}`)
  }

  const data = await res.json() as any
  if (!data?.client_secret) {
    throw new Error('Paymob: missing client_secret in response')
  }

  const clientSecret = data.client_secret as string
  const intentionId = data.id != null ? String(data.id) : params.merchantOrderId
  const checkoutUrl = `${PAYMOB_BASE}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(clientSecret)}`

  return { clientSecret, intentionId, checkoutUrl }
}

// ─── HMAC verification (webhook) ────────────────────────────────────

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
    'raw', keyData, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
  const computedHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return computedHex.toLowerCase() === hmac.toLowerCase()
}

/** Convert EGP amount (e.g. 299.00) to integer cents (e.g. 29900). */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}
