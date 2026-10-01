import { describe, expect, test } from 'bun:test'
import { sortByRecent } from './recent'

describe('sortByRecent', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  test('recent first (most recent first), rest keep server order', () => {
    expect(sortByRecent(items, [3, 1]).map((x) => x.id)).toEqual([3, 1, 2, 4])
  })
  test('ignores ids not on the page; empty recent = unchanged', () => {
    expect(sortByRecent(items, [99, 4]).map((x) => x.id)).toEqual([4, 1, 2, 3])
    expect(sortByRecent(items, [])).toBe(items)
  })
})
