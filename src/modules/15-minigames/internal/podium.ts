/**
 * Who stands where on the podium, and how they take it.
 *
 * Every game already knows its own order - most points, first home, last one
 * standing - and says so when it finishes, as a list of `Standing`s. This turns
 * that into the podium: a rank for everybody and the face they pull about it.
 *
 * **Ties share a place, and the places after them are skipped.** Two players
 * level at the top are both first, and whoever is next is *third*, not second:
 * nobody beat them but those two, and two people did. It is the ranking every
 * sports table uses, and it is derived here from the places a game hands over
 * rather than trusted from them, so a game that numbered its ties 1, 1, 2 still
 * comes out 1, 1, 3.
 *
 * **If everybody ties, everybody loses.** A round nobody won is not a round
 * everybody won, so the whole field goes on its face and the podium stands
 * empty. It takes two to tie: a lone player is not level with anybody.
 *
 * Pure, so every one of those rules is tested with a list of numbers.
 */

/** One player's result, as a game hands it over when its round ends. */
export interface Standing {
  /** Who. The same id the lobby knows them by. */
  id: string
  /**
   * Where they came, 1 being best. Ties share a number. Only the order is
   * used - see the note at the top of this file.
   */
  place: number
  /** What to call them. Falls back to the id. */
  name?: string
  /** The colour they were in the game, so you can find yourself. */
  colour?: string
}

/**
 * How a player takes where they came.
 *
 * `joy` is jumping for it, `happy` is pleased, `straight` is a straight face
 * and `flop` is flat on it.
 */
export type Pose = 'joy' | 'happy' | 'straight' | 'flop'

export interface Placed extends Standing {
  /** Competition rank: 1, 1, 3. */
  rank: number
  pose: Pose
  /** Which step they stand on - 1, 2 or 3 - or `null` for the sand in front. */
  step: 1 | 2 | 3 | null
}

export interface PodiumResult {
  /** Everybody, best first. */
  placed: Placed[]
  /** Two or more players, all level: nobody gets a step. */
  allTied: boolean
}

/** The face that goes with a rank, when the round had a winner. */
export function poseFor(rank: number): Pose {
  if (rank === 1) return 'joy'
  if (rank === 2) return 'happy'
  if (rank === 3) return 'straight'
  return 'flop'
}

/** Ranks a finished round and hands everybody their pose. */
export function rankStandings(standings: readonly Standing[]): PodiumResult {
  const order = [...standings].sort((a, b) => a.place - b.place)
  const allTied = order.length >= 2 && order.every((s) => s.place === order[0].place)
  const placed = order.map((s): Placed => {
    const rank = 1 + order.filter((other) => other.place < s.place).length
    const pose = allTied ? 'flop' : poseFor(rank)
    const step = pose === 'flop' ? null : (rank as 1 | 2 | 3)
    return { ...s, rank, pose, step }
  })
  return { placed, allTied }
}
