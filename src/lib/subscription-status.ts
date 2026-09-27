/**
 * 🛡️ 2026-09-27 — Root fix for "unpaid Paymob checkout granted 30 free days".
 *
 * Bug: /api/paymob/checkout created a subscription row with
 * status='pending' AND endDate = now + 30 (or +365) days BEFORE the user
 * paid anything. Every place that resolved "the tenant's current
 * subscription" used `findFirst({ where: { tenantId }, orderBy: { endDate:
 * 'desc' } })` with NO status filter — so that unpaid pending row became
 * the newest/longest subscription and instantly granted a full paid period.
 *
 * Fix: a subscription row only counts towards access / display when its
 * status is one of these. 'pending' (payment started, never confirmed),
 * 'failed' and 'cancelled' NEVER grant time.
 */
export const COUNTABLE_SUB_STATUSES = ['active', 'expired'] as const

/** Statuses that actually grant access while endDate is in the future. */
export const GRANTING_SUB_STATUSES = ['active'] as const

/** Prisma `where` fragment for "subscriptions that count". */
export const countableSubWhere = { status: { in: [...COUNTABLE_SUB_STATUSES] } }
