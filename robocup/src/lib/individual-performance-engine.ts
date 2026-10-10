import { Tournament, Robot, IndividualPerformance, PerformanceRanking } from './types'
import { generateId, formatTimestamp } from './utils'
import { getCurrentActiveRobots } from './tournament-engine'

/**
 * Start Individual Performance Mode when 3 robots remain in elimination.
 * Sets currentStage to 'individual_performance' and initializes performance recording state.
 */
export function startIndividualPerformanceMode(tournament: Tournament): Tournament {
  const activeRobots = getCurrentActiveRobots(tournament)

  if (activeRobots.length !== 3) {
    throw new Error(`Individual performance mode requires exactly 3 active robots, found ${activeRobots.length}`)
  }

  return {
    ...tournament,
    currentStage: 'individual_performance',
    performances: [],
    performanceResults: undefined,
  }
}

/**
 * Record an individual robot's skills/time performance.
 * Judge enters: time (in seconds, e.g. 45.3) and points (integer score, e.g. 120).
 * Once all 3 active robots have their performance recorded, automatically calculates final podium rankings
 * and completes the tournament.
 */
export function recordRobotPerformance(
  tournament: Tournament,
  robotId: string,
  time: number,
  points: number
): Tournament {
  const activeRobots = getCurrentActiveRobots(tournament)
  const robot = activeRobots.find((r) => r.id === robotId)

  if (!robot) {
    throw new Error(`Robot ${robotId} is not an active participant in individual performance mode`)
  }

  // Remove previous entry for this robot if editing/updating
  const otherPerformances = (tournament.performances || []).filter((p) => p.robotId !== robotId)

  const performance: IndividualPerformance = {
    id: generateId(),
    robotId,
    time: Math.round(Number(time) * 100) / 100, // round to 2 decimals
    points: Math.round(Number(points)),
    timestamp: formatTimestamp(),
  }

  const updatedPerformances = [...otherPerformances, performance]

  // Check if all 3 active robots have performed
  if (updatedPerformances.length === activeRobots.length) {
    const rankings = calculateFinalRankings(tournament, updatedPerformances)
    const winner = rankings[0]?.robot || null

    return {
      ...tournament,
      performances: updatedPerformances,
      performanceResults: rankings,
      winner,
      status: 'completed',
      currentStage: 'completed',
      endTime: formatTimestamp(),
    }
  }

  return {
    ...tournament,
    performances: updatedPerformances,
  }
}

/**
 * Calculate final rankings based on individual performances.
 * Primary ranking: Points (highest wins: descending)
 * Tiebreaker: Time (fastest wins: ascending)
 * Fallback: Alphabetical by robot name
 */
export function calculateFinalRankings(
  tournament: Tournament,
  performances: IndividualPerformance[]
): PerformanceRanking[] {
  const robotMap = new Map(tournament.robots.map((r) => [r.id, r]))

  const rankedData = performances
    .map((perf) => {
      const robot = robotMap.get(perf.robotId)
      if (!robot) {
        throw new Error(`Performance recorded for non-existent robot: ${perf.robotId}`)
      }
      return {
        robot,
        time: perf.time,
        points: perf.points,
      }
    })
    .sort((a, b) => {
      // Primary: Points (higher wins)
      if (b.points !== a.points) {
        return b.points - a.points
      }
      // Tiebreaker: Time (lower/faster wins)
      if (a.time !== b.time) {
        return a.time - b.time
      }
      // Stable fallback: Robot name
      return a.robot.name.localeCompare(b.robot.name)
    })

  const medals: ('gold' | 'silver' | 'bronze')[] = ['gold', 'silver', 'bronze']

  return rankedData.map((item, index) => ({
    ranking: index + 1,
    robot: item.robot,
    time: item.time,
    points: item.points,
    medal: medals[index] || 'bronze',
  }))
}

/**
 * Helper to get the list of active robots that have not yet performed.
 */
export function getRemainingPerformanceRobots(tournament: Tournament): Robot[] {
  const activeRobots = getCurrentActiveRobots(tournament)
  const recordedIds = new Set((tournament.performances || []).map((p) => p.robotId))
  return activeRobots.filter((r) => !recordedIds.has(r.id))
}
