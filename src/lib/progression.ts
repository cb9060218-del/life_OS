export function totalXpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('Level must be a positive integer')
  return 100 * ((level - 1) * level * (2 * level - 1)) / 6
}

export function levelForXp(totalXp: number): { level: number; currentLevelXp: number; nextLevelXp: number; progress: number } {
  if (!Number.isFinite(totalXp) || totalXp < 0) throw new RangeError('XP must be a non-negative number')
  let level = 1
  while (totalXp >= totalXpForLevel(level + 1)) level += 1
  const currentLevelXp = totalXpForLevel(level)
  const nextLevelXp = totalXpForLevel(level + 1)
  return { level, currentLevelXp, nextLevelXp, progress: Math.min(100, (totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp) * 100) }
}
