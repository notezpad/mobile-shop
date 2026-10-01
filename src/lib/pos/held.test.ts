import { describe, expect, test } from 'bun:test'
import { HELD_TTL_MS, MAX_HELD, pruneHeld, type HeldTicket } from './held'

const mk = (id: string, at: number): HeldTicket => ({ id, at, label: id, ticket: {} as any })

describe('pruneHeld', () => {
  const now = 10_000_000_000
  test('drops tickets older than 24h and sorts newest first', () => {
    const r = pruneHeld([mk('old', now - HELD_TTL_MS - 1), mk('a', now - 1000), mk('b', now - 10)], now)
    expect(r.map((x) => x.id)).toEqual(['b', 'a'])
  })
  test('caps the list', () => {
    const many = Array.from({ length: MAX_HELD + 5 }, (_, i) => mk(String(i), now - i))
    expect(pruneHeld(many, now)).toHaveLength(MAX_HELD)
  })
})
