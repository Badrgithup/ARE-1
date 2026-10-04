import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  initializeTournament,
  recordMatchResult,
  completeRound,
  startGroupStageRound,
  advanceFromGroupStage,
  advanceFromSemifinals,
  startNewRound,
} from '../src/lib/tournament-engine'
import { buildTournamentTree } from '../src/lib/bracket-tree-builder'
import { Robot } from '../src/lib/types'

function createRobots(count: number): Robot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `robot-${String(i + 1).padStart(2, '0')}`,
    name: `Robot-${String(i + 1).padStart(2, '0')}`,
    club: `Club-${(i % 4) + 1}`,
    institution: `Inst-${(i % 2) + 1}`,
    status: 'active',
    eliminatedRound: null,
    wins: 0,
  }))
}

describe('Tournament Bracket Tree Builder & Structure Verification', () => {
  it('5 Robots: Builds 1 group of 5, 10 matches, leaderboard, and advancement to Final', () => {
    const robots = createRobots(5)
    let t = initializeTournament(robots, 'Tree-5-Robots', 20)
    t = startGroupStageRound(t, '2-to-final')

    // 1. Initial Group Stage
    let tree = buildTournamentTree(t)
    assert.equal(tree.stages.length, 3, 'Group Stage + Qualified Combatants + anticipated Final')
    const groupStage = tree.stages[0]
    assert.equal(groupStage.stageType, 'group_stage')
    assert.equal(groupStage.groups?.length, 1, '5 robots must be exactly 1 group in tree')
    assert.equal(groupStage.groups[0].name, 'Group A')
    assert.equal(groupStage.groups[0].robotCount, 5)
    assert.equal(groupStage.groups[0].standings.length, 5)
    assert.equal(groupStage.groups[0].standings[0].isAdvancing, true)
    assert.equal(groupStage.groups[0].standings[1].isAdvancing, true)
    assert.equal(groupStage.groups[0].standings[2].isAdvancing, false)

    // Complete all 10 group matches
    const grp = t.rounds[t.rounds.length - 1]
    for (const m of grp.matches) {
      t = recordMatchResult(t, grp.id, m.id, m.robot1.id)
    }
    t = completeRound(t, grp.id)
    t = advanceFromGroupStage(t)

    // 2. Final Stage
    tree = buildTournamentTree(t)
    assert.equal(t.currentStage, 'final')
    assert.equal(tree.stages.length, 3)
    assert.equal(tree.stages[2].stageType, 'final')
    assert.equal(tree.stages[2].matches?.length, 1)

    // Check connectors from Group A to Qualifiers, and Qualifiers to Final
    const groupToQualConns = tree.connectors.filter(
      (c) => c.fromPortId.includes('Group_A') && c.toPortId.includes('qualifier')
    )
    assert.equal(groupToQualConns.length, 2, '2 connectors from Group A to Qualifiers column')

    const qualToFinalConns = tree.connectors.filter(
      (c) => c.fromPortId.includes('qualifier') && c.toPortId.includes('match')
    )
    assert.equal(qualToFinalConns.length, 2, '2 connectors from Qualifiers to Final match')

    // Complete Final match
    const finalRound = t.rounds[t.rounds.length - 1]
    const finalMatch = finalRound.matches[0]
    t = recordMatchResult(t, finalRound.id, finalMatch.id, finalMatch.robot1.id)
    t = completeRound(t, finalRound.id)

    // 3. Concluded Tree with Champion
    tree = buildTournamentTree(t)
    assert.ok(tree.champion)
    assert.equal(tree.champion.robot.id, t.winner?.id)
    const finalToChampion = tree.connectors.find((c) => c.toPortId === 'champion-pod-in')
    assert.ok(finalToChampion, 'Connector must link final match to champion pod')
    assert.equal(finalToChampion.isAdvancing, true)
  })

  it('6 Robots: Builds 2 groups (3+3), Semifinals (4-to-final), Final, and Champion', () => {
    const robots = createRobots(6)
    let t = initializeTournament(robots, 'Tree-6-Robots', 20)
    t = startGroupStageRound(t, '4-to-final')

    let tree = buildTournamentTree(t)
    const groupStage = tree.stages[0]
    assert.equal(groupStage.groups?.length, 2, '6 robots must produce 2 groups')
    assert.equal(groupStage.groups[0].name, 'Group A')
    assert.equal(groupStage.groups[1].name, 'Group B')
    assert.equal(groupStage.groups[0].robotCount, 3)
    assert.equal(groupStage.groups[1].robotCount, 3)

    // Complete group matches
    const grp = t.rounds[t.rounds.length - 1]
    for (const m of grp.matches) {
      t = recordMatchResult(t, grp.id, m.id, m.robot1.id)
    }
    t = completeRound(t, grp.id)
    t = advanceFromGroupStage(t)

    // Check Semifinals stage in tree
    tree = buildTournamentTree(t)
    assert.equal(t.currentStage, 'semifinals')
    const semiStage = tree.stages.find((s) => s.stageType === 'semifinals')
    assert.ok(semiStage)
    assert.equal(semiStage.matches?.length, 2)

    // Check connectors from groups to Qualifiers, and Qualifiers to Semifinals (A1, A2, B1, B2)
    const standingsToQualConns = tree.connectors.filter(
      (c) => c.fromPortId.includes('Group_') && c.toPortId.includes('qualifier')
    )
    assert.equal(standingsToQualConns.length, 4, 'Must have 4 connectors from groups to Qualifiers')

    const qualToSemiConns = tree.connectors.filter(
      (c) => c.fromPortId.includes('qualifier') && c.toPortId.includes('match')
    )
    assert.equal(qualToSemiConns.length, 4, 'Must have 4 connectors from Qualifiers to Semifinals')

    // Complete Semifinals
    const semiRound = t.rounds[t.rounds.length - 1]
    for (const m of semiRound.matches) {
      t = recordMatchResult(t, semiRound.id, m.id, m.robot1.id)
    }
    t = completeRound(t, semiRound.id)
    t = advanceFromSemifinals(t)

    // Check Final stage in tree
    tree = buildTournamentTree(t)
    assert.equal(t.currentStage, 'final')
    const finalStage = tree.stages.find((s) => s.stageType === 'final')
    assert.ok(finalStage)
    assert.equal(finalStage.matches?.length, 1)

    // Check connectors from Semifinals to Final
    const semiToFinalConns = tree.connectors.filter(
      (c) => c.fromPortId.includes('match') && c.toPortId.includes(finalStage.matches![0].id)
    )
    assert.equal(semiToFinalConns.length, 2, '2 connectors from Semifinals to Final')
    assert.equal(semiToFinalConns.every((c) => c.isAdvancing), true)
  })

  it('7 Robots: Builds 2 groups of 3+4 and links to Semifinals', () => {
    const robots = createRobots(7)
    let t = initializeTournament(robots, 'Tree-7-Robots', 20)
    t = startGroupStageRound(t, '4-to-final')

    const tree = buildTournamentTree(t)
    const groupStage = tree.stages[0]
    assert.equal(groupStage.groups?.length, 2)
    assert.deepEqual(
      groupStage.groups?.map((g) => g.robotCount),
      [3, 4]
    )
  })

  it('8 Robots: Builds 2 groups of 4+4 and links to Semifinals', () => {
    const robots = createRobots(8)
    let t = initializeTournament(robots, 'Tree-8-Robots', 20)
    t = startGroupStageRound(t, '4-to-final')

    const tree = buildTournamentTree(t)
    const groupStage = tree.stages[0]
    assert.equal(groupStage.groups?.length, 2)
    assert.deepEqual(
      groupStage.groups?.map((g) => g.robotCount),
      [4, 4]
    )
  })

  it('9 Robots: Builds 3 groups of 3+3+3 and links to Semifinals', () => {
    const robots = createRobots(9)
    let t = initializeTournament(robots, 'Tree-9-Robots', 20)
    t = startGroupStageRound(t, '4-to-final')

    const tree = buildTournamentTree(t)
    const groupStage = tree.stages[0]
    assert.equal(groupStage.groups?.length, 3)
    assert.deepEqual(
      groupStage.groups?.map((g) => g.robotCount),
      [3, 3, 3]
    )
  })

  it('22 Robots: Qualification to Round 2 to Champion tree progression', () => {
    const robots = createRobots(22)
    let t = initializeTournament(robots, 'Tree-22-Robots', 20)

    // Qualification Round 1
    let tree = buildTournamentTree(t)
    assert.equal(tree.stages[0].stageType, 'elimination')
    assert.equal(tree.stages[0].title, 'Qualification / Round 1')
    assert.equal(tree.stages[0].matches?.length, 11)

    // Complete Qualification
    for (const m of t.rounds[0].matches) {
      t = recordMatchResult(t, t.rounds[0].id, m.id, m.robot1.id)
    }
    t = completeRound(t, t.rounds[0].id)
    t = startNewRound(t, 20)

    // Round 2
    tree = buildTournamentTree(t)
    assert.ok(tree.stages.length >= 2, 'Must have at least Round 1 and Round 2')
    assert.equal(tree.stages[1].matches?.length, 6)

    // Check connectors linking Round 1 winners to Round 2 matches
    const r1Matches = tree.stages[0].matches!
    const r2Matches = tree.stages[1].matches!
    const r1ToR2Conns = tree.connectors.filter((c) => {
      const isFromR1 = r1Matches.some((m) => c.fromPortId === m.outputPortId)
      const isToR2 = r2Matches.some((m) => c.toPortId === m.inputTopPortId || c.toPortId === m.inputBottomPortId)
      return isFromR1 && isToR2
    })
    assert.ok(r1ToR2Conns.length > 0, 'Connectors must link Round 1 to Round 2 matches')
    assert.equal(r1ToR2Conns.every((c) => c.isAdvancing), true)
  })

  it('Active/Live match is correctly identified and flagged with isLive', () => {
    const robots = createRobots(4)
    const t = initializeTournament(robots, 'Live-Test', 20)
    const tree = buildTournamentTree(t)

    const liveMatches = tree.stages[0].matches?.filter((m) => m.isLive)
    assert.ok(liveMatches && liveMatches.length > 0, 'Must have at least one active match in progress')
  })

  it('Deterministic Geometric Centering: Parent Y = (Child1 Y + Child2 Y) / 2', () => {
    const robots = createRobots(22)
    let t = initializeTournament(robots, 'Centering-Test', 20)
    for (const m of t.rounds[0].matches) {
      t = recordMatchResult(t, t.rounds[0].id, m.id, m.robot1.id)
    }
    t = completeRound(t, t.rounds[0].id)
    t = startNewRound(t, 20)

    const tree = buildTournamentTree(t)
    const r1Matches = tree.stages[0].matches!
    const r2Matches = tree.stages[1].matches!

    // Verify parent matches align with the midpoint of their child matches
    for (let i = 0; i < 5; i++) {
      const child1 = r1Matches[i * 2]
      const child2 = r1Matches[i * 2 + 1]
      const parent = r2Matches[i]

      const expectedY = (child1.y + child2.y) / 2
      assert.equal(parent.y, expectedY, `Parent match ${i} Y (${parent.y}) must equal midpoint of children (${expectedY})`)
    }

    // Verify connectors have valid geometric endpoints
    assert.ok(tree.connectors.length > 0)
    for (const conn of tree.connectors) {
      assert.ok(typeof conn.startX === 'number')
      assert.ok(typeof conn.startY === 'number')
      assert.ok(typeof conn.endX === 'number')
      assert.ok(typeof conn.endY === 'number')
      assert.ok(conn.endX > conn.startX, 'Tree connector must flow left-to-right (endX > startX)')
    }
  })
})
