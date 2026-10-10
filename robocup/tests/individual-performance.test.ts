import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  initializeTournament,
  recordMatchResult,
  completeRound,
  startNewRound,
  getCurrentActiveRobots,
  isMatchTerminal,
} from '../src/lib/tournament-engine'
import {
  startIndividualPerformanceMode,
  recordRobotPerformance,
  calculateFinalRankings,
} from '../src/lib/individual-performance-engine'
import type { Robot, IndividualPerformance } from '../src/lib/types'

function createTestRobots(count: number): Robot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `robot-${String(i + 1).padStart(3, '0')}`,
    name: `Robot-${String(i + 1).padStart(3, '0')}`,
    club: `Robotics Club ${Math.floor(i / 10) + 1}`,
    institution: 'ENSI',
    status: 'active' as const,
    eliminatedRound: null,
    wins: 0,
  }))
}

describe('90-Robot Elimination & Individual Performance Mode Suite', () => {
  it('90 robots eliminates down through 5 rounds to exactly 3 robots without triggering group stage', () => {
    const robots = createTestRobots(90)
    let t = initializeTournament(robots, 'RoboCup 90-Robot Championship', 20)

    assert.equal(t.totalRobots, 90)
    assert.equal(t.rounds.length, 1)
    assert.equal(t.currentStage, 'elimination')

    // Track robot counts through each round
    const expectedCounts = [
      { round: 1, initial: 90, expectedWinners: 45 },
      { round: 2, initial: 45, expectedWinners: 23 }, // 22 matches + 1 bye
      { round: 3, initial: 23, expectedWinners: 12 }, // 11 matches + 1 bye
      { round: 4, initial: 12, expectedWinners: 6 },  // 6 matches
      { round: 5, initial: 6, expectedWinners: 3 },   // 3 matches
    ]

    for (const step of expectedCounts) {
      const currentR = t.rounds[t.rounds.length - 1]
      assert.equal(t.currentRound, step.round)
      assert.equal(currentR.stage, 'elimination')

      const activeBefore = getCurrentActiveRobots(t)
      assert.equal(activeBefore.length, step.initial)

      // Complete all matches by picking robot1 as winner
      for (const m of currentR.matches) {
        if (!m.isBye && !isMatchTerminal(m)) {
          t = recordMatchResult(t, currentR.id, m.id, m.robot1.id)
        }
      }

      t = completeRound(t, currentR.id)
      assert.equal(t.rounds[t.rounds.length - 1].status, 'completed')

      const activeAfter = getCurrentActiveRobots(t)
      assert.equal(activeAfter.length, step.expectedWinners)

      // If we haven't reached 3 robots yet, advance to next 1v1 round
      if (activeAfter.length > 3) {
        t = startNewRound(t, 20)
      }
    }

    // After Round 5 (6 -> 3), exactly 3 active robots remain
    const finalists = getCurrentActiveRobots(t)
    assert.equal(finalists.length, 3, 'Exactly 3 robots must remain after 6 -> 3 round')

    // At 3 robots: switch to Individual Performance Mode
    t = startIndividualPerformanceMode(t)
    assert.equal(t.currentStage, 'individual_performance')
    assert.equal(t.status, 'in_progress')
    assert.deepEqual(t.performances, [])

    // Judge enters scores:
    // Robot-A: 45.3s, 120 points
    // Robot-B: 42.1s, 135 points (Highest points -> 1st)
    // Robot-C: 48.7s, 115 points (Lowest points -> 3rd)
    t = recordRobotPerformance(t, finalists[0].id, 45.3, 120)
    assert.equal(t.performances?.length, 1)
    assert.equal(t.status, 'in_progress')

    t = recordRobotPerformance(t, finalists[1].id, 42.1, 135)
    assert.equal(t.performances?.length, 2)
    assert.equal(t.status, 'in_progress')

    t = recordRobotPerformance(t, finalists[2].id, 48.7, 115)
    assert.equal(t.performances?.length, 3)

    // All 3 recorded -> Tournament finishes and produces final podium
    assert.equal(t.status, 'completed')
    assert.ok(t.performanceResults)
    assert.equal(t.performanceResults.length, 3)

    const [first, second, third] = t.performanceResults

    // 1st Place: Robot-B (135 pts, 42.1s)
    assert.equal(first.robot.id, finalists[1].id)
    assert.equal(first.ranking, 1)
    assert.equal(first.medal, 'gold')
    assert.equal(first.points, 135)
    assert.equal(first.time, 42.1)

    // 2nd Place: Robot-A (120 pts, 45.3s)
    assert.equal(second.robot.id, finalists[0].id)
    assert.equal(second.ranking, 2)
    assert.equal(second.medal, 'silver')
    assert.equal(second.points, 120)
    assert.equal(second.time, 45.3)

    // 3rd Place: Robot-C (115 pts, 48.7s)
    assert.equal(third.robot.id, finalists[2].id)
    assert.equal(third.ranking, 3)
    assert.equal(third.medal, 'bronze')
    assert.equal(third.points, 115)
    assert.equal(third.time, 48.7)

    // Overall champion matches 1st place
    assert.equal(t.winner?.id, finalists[1].id)
  })

  it('Tiebreaker logic: When points are equal, faster time wins', () => {
    const robots = createTestRobots(3)
    let t = initializeTournament(robots, 'Tiebreaker Test', 20)
    t = startIndividualPerformanceMode(t)

    // Robot 1: 100 points, 50.2 seconds
    // Robot 2: 100 points, 41.5 seconds (Same points, but FASTER time -> wins tiebreaker!)
    // Robot 3: 80 points, 35.0 seconds (Fastest time, but lower points -> 3rd)
    t = recordRobotPerformance(t, robots[0].id, 50.2, 100)
    t = recordRobotPerformance(t, robots[1].id, 41.5, 100)
    t = recordRobotPerformance(t, robots[2].id, 35.0, 80)

    assert.equal(t.status, 'completed')
    assert.ok(t.performanceResults)

    const results = t.performanceResults
    assert.equal(results[0].robot.id, robots[1].id, 'Robot 2 wins tiebreaker due to faster time')
    assert.equal(results[0].medal, 'gold')

    assert.equal(results[1].robot.id, robots[0].id, 'Robot 1 takes 2nd place')
    assert.equal(results[1].medal, 'silver')

    assert.equal(results[2].robot.id, robots[2].id, 'Robot 3 takes 3rd place due to lower points')
    assert.equal(results[2].medal, 'bronze')

    assert.equal(t.winner?.id, robots[1].id)
  })

  it('Validation guards: startIndividualPerformanceMode throws if not exactly 3 active robots', () => {
    const robots = createTestRobots(4)
    const t = initializeTournament(robots, 'Guard Test', 20)

    assert.throws(() => {
      startIndividualPerformanceMode(t)
    }, /requires exactly 3 active robots/)
  })
})
