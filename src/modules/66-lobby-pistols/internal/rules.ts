/** Pure aiming and scoring rules for the lobby's non-lethal pistols. */

export const LOBBY_PISTOL = {
  range: 28,
  targetRadius: 0.72,
  cooldownSeconds: 0.42,
  knockdownSeconds: 1.65,
  rememberedShots: 160,
} as const

export interface Point3 {
  x: number
  y: number
  z: number
}

export interface LobbyTarget extends Point3 {
  id: string
}

export interface LobbyScore {
  kills: number
  deaths: number
}

/**
 * Picks the closest body under the centre of the player's aim. Bodies are
 * treated as a compact cylinder around chest height, which gives a generous
 * but deliberate lobby-friendly hit target without a physics dependency.
 */
export function aimedLobbyTarget(origin: Point3, direction: Point3, targets: readonly LobbyTarget[]): string | null {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (length === 0) return null
  const dx = direction.x / length
  const dy = direction.y / length
  const dz = direction.z / length
  let picked: { id: string; along: number } | null = null

  for (const target of targets) {
    const tx = target.x - origin.x
    const ty = target.y + 0.92 - origin.y
    const tz = target.z - origin.z
    const along = tx * dx + ty * dy + tz * dz
    if (along < 0 || along > LOBBY_PISTOL.range) continue
    const missX = tx - dx * along
    const missY = ty - dy * along
    const missZ = tz - dz * along
    if (missX * missX + missY * missY + missZ * missZ > LOBBY_PISTOL.targetRadius ** 2) continue
    if (!picked || along < picked.along) picked = { id: target.id, along }
  }
  return picked?.id ?? null
}

/** Updates one lobby scoreboard entry after a non-lethal knockdown. */
export function scoreLobbyHit(scores: Readonly<Record<string, LobbyScore>>, shooterId: string, targetId: string): Record<string, LobbyScore> {
  if (!shooterId || !targetId || shooterId === targetId) return { ...scores }
  const shooter = scores[shooterId] ?? { kills: 0, deaths: 0 }
  const target = scores[targetId] ?? { kills: 0, deaths: 0 }
  return {
    ...scores,
    [shooterId]: { ...shooter, kills: shooter.kills + 1 },
    [targetId]: { ...target, deaths: target.deaths + 1 },
  }
}
