import { Robot, Match, GroupStanding } from './types'
import { generateId, formatTimestamp } from './utils'

export interface GroupPartition {
  name: string
  robots: Robot[]
}

export interface GroupStandingsGroup {
  groupName: string
  standings: GroupStanding[]
}

/**
 * Determine balanced group sizes based on required tournament rules:
 * - 5 robots: 1 group of 5
 * - 6 robots: 2 groups (3 + 3)
 * - 7 robots: 2 groups (3 + 4)
 * - 8 robots: 2 groups (4 + 4)
 * - 9 robots: 3 groups (3 + 3 + 3)
 */
export function determineGroupSizes(count: number): number[] {
  if (count <= 5) return [count]
  if (count === 6) return [3, 3]
  if (count === 7) return [3, 4]
  if (count === 8) return [4, 4]
  if (count === 9) return [3, 3, 3]

  // Fallback for counts > 9: balanced distribution targeting group size of 3-4
  const numGroups = Math.max(2, Math.round(count / 4))
  const base = Math.floor(count / numGroups)
  const rem = count % numGroups
  const sizes = Array(numGroups).fill(base)
  for (let i = 0; i < rem; i++) {
    sizes[sizes.length - 1 - i] += 1
  }
  return sizes
}

/**
 * Partition robots into sequential named groups (Group A, Group B, Group C).
 */
export function partitionRobotsIntoGroups(robots: Robot[]): GroupPartition[] {
  const sizes = determineGroupSizes(robots.length)
  const groups: GroupPartition[] = []
  let offset = 0

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i]
    const groupName = sizes.length === 1 ? 'Group A' : `Group ${String.fromCharCode(65 + i)}`
    groups.push({
      name: groupName,
      robots: robots.slice(offset, offset + size),
    })
    offset += size
  }

  return groups
}

interface RawSubRoundMatch {
  subRound: number
  groupName: string
  robot1: Robot
  robot2: Robot
}

/**
 * Generate standard Berger/polygon round-robin pairings for a single group.
 * Handles even or odd size (odd sizes use a dummy bye which is omitted from matches).
 */
export function generateSingleGroupSchedule(
  robots: Robot[],
  groupName: string
): RawSubRoundMatch[] {
  const n = robots.length
  if (n < 2) return []

  const isOdd = n % 2 !== 0
  const pool: (Robot | null)[] = isOdd ? [...robots, null] : [...robots]
  const numRounds = pool.length - 1
  const half = pool.length / 2

  const matches: RawSubRoundMatch[] = []

  for (let r = 0; r < numRounds; r++) {
    const subRound = r + 1
    for (let i = 0; i < half; i++) {
      const r1 = pool[i]
      const r2 = pool[pool.length - 1 - i]

      if (r1 !== null && r2 !== null) {
        matches.push({
          subRound,
          groupName,
          robot1: r1,
          robot2: r2,
        })
      }
    }

    // Rotate pool elements [1 ... end] clockwise around fixed pool[0]
    const last = pool.pop()!
    pool.splice(1, 0, last)
  }

  return matches
}

/**
 * Generate the group stage schedule for given robots.
 * When multiple groups exist, matches are interleaved across groups by sub-round
 * so that Group A and Group B progress simultaneously and Group A never finishes before Group B starts.
 */
export function generateGroupStageSchedule(
  robots: Robot[],
  roundNumber: number
): Match[] {
  const groups = partitionRobotsIntoGroups(robots)

  // Generate schedule for each group
  const groupSchedules = groups.map((g) => ({
    group: g,
    matches: generateSingleGroupSchedule(g.robots, g.name),
  }))

  const maxSubRounds = Math.max(
    0,
    ...groupSchedules.map((g) =>
      g.matches.length > 0 ? Math.max(...g.matches.map((m) => m.subRound)) : 0
    )
  )

  const interleavedMatches: Match[] = []
  let matchNumber = 1

  // Interleave by sub-round across all groups
  for (let r = 1; r <= maxSubRounds; r++) {
    for (const g of groupSchedules) {
      const matchesInSubRound = g.matches.filter((m) => m.subRound === r)
      for (const m of matchesInSubRound) {
        interleavedMatches.push({
          id: `group-match-${roundNumber}-${matchNumber}-${generateId()}`,
          roundNumber,
          matchNumber: matchNumber++,
          robot1: m.robot1,
          robot2: m.robot2,
          winner: null,
          loser: null,
          timestamp: formatTimestamp(),
          undoDeadline: null,
          status: 'pending',
          isBye: false,
          stage: 'group_stage',
          groupName: m.groupName,
          subRound: r,
        })
      }
    }
  }

  return interleavedMatches
}

/**
 * Compute standings for a specific set of robots from matches.
 * Standard scoring: 3 points for a win, 0 for a loss.
 * Handles both recorded and locked match terminal states.
 */
export function calculateGroupStandings(
  matches: Match[],
  robots: Robot[]
): GroupStanding[] {
  const standingsMap = new Map<string, GroupStanding>()

  robots.forEach((robot) => {
    standingsMap.set(robot.id, {
      robot,
      points: 0,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    })
  })

  matches.forEach((match) => {
    const isTerminal = match.status === 'recorded' || match.status === 'locked'
    if (isTerminal && match.winner) {
      const winnerStanding = standingsMap.get(match.winner.id)
      if (winnerStanding) {
        winnerStanding.wins += 1
        winnerStanding.points += 3
        winnerStanding.matchesPlayed += 1
      }

      const loser = match.loser || (match.robot1.id === match.winner.id ? match.robot2 : match.robot1)
      if (loser) {
        const loserStanding = standingsMap.get(loser.id)
        if (loserStanding) {
          loserStanding.losses += 1
          loserStanding.matchesPlayed += 1
        }
      }
    }
  })

  const sorted = Array.from(standingsMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.wins !== a.wins) return b.wins - a.wins
    // Alphabetical tiebreaker
    return a.robot.name.localeCompare(b.robot.name)
  })

  // Assign 1-indexed rank
  return sorted.map((standing, index) => ({
    ...standing,
    rank: index + 1,
  }))
}

/**
 * Calculate independent standings for each group.
 */
export function calculateMultiGroupStandings(
  matches: Match[],
  robots: Robot[]
): GroupStandingsGroup[] {
  const groups = partitionRobotsIntoGroups(robots)

  return groups.map((g) => {
    const groupRobotIds = new Set(g.robots.map((r) => r.id))
    const groupMatches = matches.filter(
      (m) =>
        m.groupName === g.name ||
        (!m.groupName && groupRobotIds.has(m.robot1.id) && m.robot2 && groupRobotIds.has(m.robot2.id))
    )

    const standings = calculateGroupStandings(groupMatches, g.robots).map((s) => ({
      ...s,
      groupName: g.name,
    }))

    return {
      groupName: g.name,
      standings,
    }
  })
}

/**
 * Get robots advancing to the finals/semifinals stage based on format and grouping.
 * - '2-to-final':
 *   - 1 group (5 robots): Top 2 advance directly to Championship Final
 *   - 2 groups (6, 7, 8 robots): Winner of Group A and Winner of Group B advance (A1 vs B1)
 *   - 3 groups (9 robots): Top 2 across group winners advance
 * - '4-to-final':
 *   - 1 group (5 robots): Top 4 advance to Semifinals (1v4, 2v3)
 *   - 2 groups (6, 7, 8 robots): Top 2 from Group A and Top 2 from Group B advance to Semifinals (A1 vs B2, B1 vs A2)
 *   - 3 groups (9 robots): 3 group winners + best runner-up advance to Semifinals (1v4, 2v3)
 */
export function getGroupAdvancers(
  standingsInput: GroupStanding[] | GroupStandingsGroup[],
  format: '2-to-final' | '4-to-final'
): Robot[] {
  if (standingsInput.length === 0) return []

  let groups: GroupStandingsGroup[] = []

  // Detect input type: GroupStandingsGroup[] or GroupStanding[]
  if ('groupName' in standingsInput[0] && 'standings' in standingsInput[0]) {
    groups = standingsInput as GroupStandingsGroup[]
  } else {
    const flatStandings = standingsInput as GroupStanding[]
    const groupNames = Array.from(
      new Set(flatStandings.map((s) => s.groupName).filter((g): g is string => Boolean(g)))
    )

    if (groupNames.length <= 1) {
      groups = [{ groupName: groupNames[0] || 'Group A', standings: flatStandings }]
    } else {
      groups = groupNames.map((gName) => ({
        groupName: gName,
        standings: flatStandings.filter((s) => s.groupName === gName),
      }))
    }
  }

  // Case 1: Single Group (e.g. 5 robots)
  if (groups.length === 1) {
    const standings = groups[0].standings
    const count = format === '2-to-final' ? 2 : 4
    return standings.slice(0, count).map((s) => s.robot)
  }

  // Case 2: 2 Groups (e.g. 6, 7, 8 robots)
  if (groups.length === 2) {
    const [grpA, grpB] = groups
    if (format === '2-to-final') {
      // Group winners advance to Final (A1 vs B1)
      const a1 = grpA.standings[0]?.robot
      const b1 = grpB.standings[0]?.robot
      return [a1, b1].filter((r): r is Robot => Boolean(r))
    } else {
      // 4-to-final: Top 2 from each group advance to Semifinals (A1 vs B2, B1 vs A2)
      // Ordered as [A1, B1, A2, B2] so advancers[0] vs advancers[3] is A1 vs B2,
      // and advancers[1] vs advancers[2] is B1 vs A2.
      const a1 = grpA.standings[0]?.robot
      const a2 = grpA.standings[1]?.robot
      const b1 = grpB.standings[0]?.robot
      const b2 = grpB.standings[1]?.robot
      return [a1, b1, a2, b2].filter((r): r is Robot => Boolean(r))
    }
  }

  // Case 3: 3 Groups (e.g. 9 robots: 3 + 3 + 3)
  if (groups.length === 3) {
    // Rank group winners against each other
    const winners = groups
      .map((g) => g.standings[0])
      .filter((s): s is GroupStanding => Boolean(s))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points
        if (b.wins !== a.wins) return b.wins - a.wins
        return a.robot.name.localeCompare(b.robot.name)
      })

    if (format === '2-to-final') {
      return winners.slice(0, 2).map((w) => w.robot)
    } else {
      // 3 group winners + best 2nd place runner-up among the groups
      const runnersUp = groups
        .map((g) => g.standings[1])
        .filter((s): s is GroupStanding => Boolean(s))
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points
          if (b.wins !== a.wins) return b.wins - a.wins
          return a.robot.name.localeCompare(b.robot.name)
        })

      const advancers = winners.slice(0, 3).map((w) => w.robot)
      if (runnersUp[0]) {
        advancers.push(runnersUp[0].robot)
      }
      return advancers.slice(0, 4)
    }
  }

  // Fallback for > 3 groups
  const allStandings = groups.flatMap((g) => g.standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.wins !== a.wins) return b.wins - a.wins
    return a.robot.name.localeCompare(b.robot.name)
  })
  const count = format === '2-to-final' ? 2 : 4
  return allStandings.slice(0, count).map((s) => s.robot)
}
