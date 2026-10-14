import { describe, expect, it } from 'vitest'
import { levelForXp, totalXpForLevel } from '../src/lib/progression'

describe('level progression', () => {
  it('uses the documented cumulative XP thresholds', () => {
    expect([1, 2, 3, 4].map(totalXpForLevel)).toEqual([0, 100, 500, 1400])
  })

  it('calculates the level and progress between thresholds', () => {
    expect(levelForXp(0)).toEqual({ level: 1, currentLevelXp: 0, nextLevelXp: 100, progress: 0 })
    expect(levelForXp(300)).toEqual({ level: 2, currentLevelXp: 100, nextLevelXp: 500, progress: 50 })
    expect(levelForXp(500).level).toBe(3)
  })

  it('rejects invalid values', () => {
    expect(() => totalXpForLevel(0)).toThrow(RangeError)
    expect(() => levelForXp(-1)).toThrow(RangeError)
  })
})
