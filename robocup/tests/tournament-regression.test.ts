import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTournament,
  recordMatchResult,
  undoMatchResult,
  completeRound,
  startNewRound,
  reshuffleCurrentRound,
  isMatchTerminal,
  getCurrentActiveRobots,
  checkTournamentComplete,
  startGroupStageRound,
  advanceFromGroupStage,
  advanceFromSemifinals,
} from '../src/lib/tournament-engine';
import { Robot, Tournament, Match } from '../src/lib/types';
import { saveTournament, loadTournament } from '../src/lib/tournament-repository';
import {
  determineGroupSizes,
  partitionRobotsIntoGroups,
  generateGroupStageSchedule,
  calculateGroupStandings,
  calculateMultiGroupStandings,
  getGroupAdvancers,
} from '../src/lib/group-stage-engine';

function createRobots(count: number): Robot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `robot-${String(i + 1).padStart(2, '0')}`,
    name: `Robot-${String(i + 1).padStart(2, '0')}`,
    club: `Club-${(i % 5) + 1}`,
    institution: `Inst-${(i % 3) + 1}`,
    status: 'active',
    eliminatedRound: null,
    wins: 0,
  }));
}

describe('RoboCup Tournament Engine Regression Suite', () => {

  describe('22 Robots Mandatory Scenarios', () => {
    it('Scenario 1: 22 robots normal qualification and complete tournament run', () => {
      const robots = createRobots(22);
      let t = initializeTournament(robots, '22-Robot Tournament', 20);

      // Invariant: Round 1 has 11 matches, 0 byes, 22 active robots
      assert.equal(t.rounds.length, 1);
      assert.equal(t.rounds[0].matches.length, 11);
      assert.equal(t.rounds[0].matches.filter(m => m.isBye).length, 0);
      assert.equal(getCurrentActiveRobots(t).length, 22);

      // Execute Qualification matches
      for (const match of t.rounds[0].matches) {
        t = recordMatchResult(t, t.rounds[0].id, match.id, match.robot1.id);
      }

      // Check all matches terminal
      assert.equal(t.rounds[0].matches.every(isMatchTerminal), true);
      t = completeRound(t, t.rounds[0].id);
      assert.equal(t.rounds[0].status, 'completed');

      // Exactly 11 robots qualify for Round 2
      const activeAfterQual = getCurrentActiveRobots(t);
      assert.equal(activeAfterQual.length, 11);

      // Advance to Round 2
      t = startNewRound(t, 20);
      assert.equal(t.currentRound, 2);
      assert.equal(t.rounds.length, 2);
      // 11 robots -> 5 matches + 1 bye = 6 matches total
      assert.equal(t.rounds[1].matches.length, 6);
      assert.equal(t.rounds[1].matches.filter(m => m.isBye).length, 1);
      assert.equal(t.rounds[1].completedMatches, 1); // bye is pre-recorded

      // Play through remaining rounds to champion
      while (t.status !== 'completed' && t.rounds.length < 10) {
        const round = t.rounds[t.rounds.length - 1];
        for (const m of round.matches) {
          if (!m.isBye && !isMatchTerminal(m)) {
            t = recordMatchResult(t, round.id, m.id, m.robot1.id);
          }
        }
        t = completeRound(t, round.id);
        const active = getCurrentActiveRobots(t);
        if (active.length <= 1) {
          t = checkTournamentComplete(t);
          break;
        }
        if (active.length === 5) {
          t = startGroupStageRound(t, '2-to-final');
          const grp = t.rounds[t.rounds.length - 1];
          for (const m of grp.matches) {
            t = recordMatchResult(t, grp.id, m.id, m.robot1.id);
          }
          t = completeRound(t, grp.id);
          t = advanceFromGroupStage(t);
        } else {
          t = startNewRound(t, 20);
        }
      }

      assert.equal(t.status, 'completed');
      assert.ok(t.winner);
      assert.equal(getCurrentActiveRobots(t).length, 1);
    });

    it('Scenario 2: 22 robots with blocked/locked matches in qualification', () => {
      const robots = createRobots(22);
      let t = initializeTournament(robots, '22-Robot Blocked Test', 20);
      const r1 = t.rounds[0];

      // Record 10 matches normally
      for (let i = 0; i < 10; i++) {
        t = recordMatchResult(t, r1.id, r1.matches[i].id, r1.matches[i].robot1.id);
      }

      // 11th match is recorded then locked (past undo deadline / manual lock)
      t = recordMatchResult(t, r1.id, r1.matches[10].id, r1.matches[10].robot1.id);
      t.rounds[0].matches[10].status = 'locked';

      // All matches must be recognized as terminal
      const allDone = t.rounds[0].matches.every(isMatchTerminal);
      assert.equal(allDone, true, 'All matches including locked match must be recognized as terminal');

      t = completeRound(t, r1.id);
      assert.equal(t.rounds[0].status, 'completed');

      // Qualification must produce exactly 11 qualified robots
      const qualified = getCurrentActiveRobots(t);
      assert.equal(qualified.length, 11);

      // Must advance cleanly to Round 2
      t = startNewRound(t, 20);
      assert.equal(t.currentRound, 2);
      assert.equal(t.rounds.length, 2);
    });

    it('Scenario 3: 22 robots with final qualification match blocked/locked first', () => {
      const robots = createRobots(22);
      let t = initializeTournament(robots, '22-Robot Final Match Locked First', 20);
      const r1 = t.rounds[0];

      // Record match 11 first and lock it
      t = recordMatchResult(t, r1.id, r1.matches[10].id, r1.matches[10].robot1.id);
      t.rounds[0].matches[10].status = 'locked';

      // Then complete matches 0..9
      for (let i = 0; i < 10; i++) {
        t = recordMatchResult(t, r1.id, r1.matches[i].id, r1.matches[i].robot1.id);
      }

      // Round must complete cleanly
      assert.equal(t.rounds[0].matches.every(isMatchTerminal), true);
      t = completeRound(t, r1.id);
      assert.equal(t.rounds[0].status, 'completed');
      assert.equal(getCurrentActiveRobots(t).length, 11);

      t = startNewRound(t, 20);
      assert.equal(t.currentRound, 2);
    });

    it('Scenario 4: 22 robots with batchSize = 10 (batching boundary)', () => {
      const robots = createRobots(22);
      // Batch size 10 splits 11 matches into Batch 1 (10 matches) + Batch 2 (1 match)
      let t = initializeTournament(robots, '22-Robot Batch 10 Test', 10);
      assert.equal(t.rounds[0].batches.length, 2);
      assert.equal(t.rounds[0].batches[0].matches.length, 10);
      assert.equal(t.rounds[0].batches[1].matches.length, 1);

      const r1 = t.rounds[0];
      // Complete first 10 matches (Batch 1)
      for (let i = 0; i < 10; i++) {
        t = recordMatchResult(t, r1.id, r1.matches[i].id, r1.matches[i].robot1.id);
      }

      // Batch 1 must be marked completed and activeBatchIndex advanced to 1
      assert.equal(t.rounds[0].batches[0].status, 'completed');
      assert.equal(t.rounds[0].activeBatchIndex, 1);

      // Complete 11th match (Batch 2)
      t = recordMatchResult(t, r1.id, r1.matches[10].id, r1.matches[10].robot1.id);
      assert.equal(t.rounds[0].batches[1].status, 'completed');

      t = completeRound(t, r1.id);
      assert.equal(t.rounds[0].status, 'completed');

      // Next round advances with batchSize 10
      t = startNewRound(t, 10);
      assert.equal(t.currentRound, 2);
    });

    it('Scenario 5: 22 robots with matches completed in non-sequential order', () => {
      const robots = createRobots(22);
      let t = initializeTournament(robots, '22-Robot Shuffled Order', 20);
      const r1 = t.rounds[0];

      // Arbitrary order: e.g. 5, 2, 9, 0, 10, 1, 8, 3, 7, 4, 6
      const order = [5, 2, 9, 0, 10, 1, 8, 3, 7, 4, 6];
      for (const idx of order) {
        t = recordMatchResult(t, r1.id, r1.matches[idx].id, r1.matches[idx].robot1.id);
      }

      assert.equal(t.rounds[0].matches.every(isMatchTerminal), true);
      t = completeRound(t, r1.id);
      assert.equal(t.rounds[0].status, 'completed');
      assert.equal(getCurrentActiveRobots(t).length, 11);
      t = startNewRound(t, 20);
      assert.equal(t.currentRound, 2);
    });

    it('Scenario 6: 22 robots idempotency test (replaying winner selection)', () => {
      const robots = createRobots(22);
      let t = initializeTournament(robots, '22-Robot Idempotency', 20);
      const r1 = t.rounds[0];
      const m0 = r1.matches[0];

      t = recordMatchResult(t, r1.id, m0.id, m0.robot1.id);
      const robot1WinsAfterFirst = t.robots.find(r => r.id === m0.robot1.id)?.wins;
      assert.equal(robot1WinsAfterFirst, 1);

      // Call recordMatchResult again with same winner
      t = recordMatchResult(t, r1.id, m0.id, m0.robot1.id);
      const robot1WinsAfterSecond = t.robots.find(r => r.id === m0.robot1.id)?.wins;
      assert.equal(robot1WinsAfterSecond, 1, 'Idempotent: duplicate winner record must not increment wins twice');
    });

    it('Scenario 7: 22 robots persistence and refresh during qualification', async () => {
      const robots = createRobots(22);
      let t = initializeTournament(robots, '22-Robot Persistence Test', 20);
      await saveTournament(t);

      // Play 5 matches
      for (let i = 0; i < 5; i++) {
        t = recordMatchResult(t, t.rounds[0].id, t.rounds[0].matches[i].id, t.rounds[0].matches[i].robot1.id);
      }
      await saveTournament(t);

      // Simulate browser refresh by loading from disk
      const loaded = await loadTournament(t.id);
      assert.equal(loaded.rounds[0].completedMatches, 5);
      assert.equal(loaded.rounds[0].matches[0].status, 'recorded');
      assert.equal(loaded.rounds[0].matches[5].status, 'pending');

      // Finish remaining matches from loaded state
      let resumed = loaded;
      for (let i = 5; i < 11; i++) {
        resumed = recordMatchResult(resumed, resumed.rounds[0].id, resumed.rounds[0].matches[i].id, resumed.rounds[0].matches[i].robot1.id);
      }
      resumed = completeRound(resumed, resumed.rounds[0].id);
      assert.equal(resumed.rounds[0].status, 'completed');
      await saveTournament(resumed);

      // Advance to next round
      resumed = startNewRound(resumed, 20);
      assert.equal(resumed.currentRound, 2);
      await saveTournament(resumed);

      // Verify reloaded state matches Round 2
      const finalReload = await loadTournament(t.id);
      assert.equal(finalReload.currentRound, 2);
      assert.equal(finalReload.rounds.length, 2);
    });
  });

  describe('Boundary Robot Counts Verification', () => {
    const boundaryCounts = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 17, 18, 20, 21, 22, 23, 24, 32];

    for (const count of boundaryCounts) {
      it(`Lifecycle test for ${count} robots from registration to champion`, () => {
        const robots = createRobots(count);
        let t = initializeTournament(robots, `Test-${count}-Robots`, 20);
        let safetyCounter = 0;

        while (t.status !== 'completed' && safetyCounter < 15) {
          safetyCounter++;
          const round = t.rounds[t.rounds.length - 1];

          // Play all pending matches in round
          const roundToPlay = t.rounds[t.rounds.length - 1];
          for (const m of roundToPlay.matches) {
            if (!m.isBye && !isMatchTerminal(m)) {
              t = recordMatchResult(t, roundToPlay.id, m.id, m.robot1.id);
            }
          }

          const currentR = t.rounds[t.rounds.length - 1];
          assert.equal(currentR.matches.every(isMatchTerminal), true);
          t = completeRound(t, currentR.id);
          assert.equal(t.rounds[t.rounds.length - 1].status, 'completed');

          const active = getCurrentActiveRobots(t);
          if (active.length <= 1) {
            t = checkTournamentComplete(t);
            break;
          }

          if (active.length >= 5 && active.length <= 9) {
            t = startGroupStageRound(t, '2-to-final');
            const grp = t.rounds[t.rounds.length - 1];
            for (const m of grp.matches) {
              t = recordMatchResult(t, grp.id, m.id, m.robot1.id);
            }
            t = completeRound(t, grp.id);
            t = advanceFromGroupStage(t);
          } else {
            t = startNewRound(t, 20);
          }
        }

        assert.equal(t.status, 'completed', `Tournament with ${count} robots must reach completed status`);
        assert.ok(t.winner, `Tournament with ${count} robots must have a champion`);
        assert.equal(getCurrentActiveRobots(t).length, 1);
      });
    }
  });

  describe('Tournament Invariants Verification', () => {
    it('Invariant: Cannot advance to next round if previous round has pending matches', () => {
      const robots = createRobots(22);
      const t = initializeTournament(robots, 'Guard Test', 20);
      // Round 1 matches are all pending
      assert.throws(() => {
        startNewRound(t, 20);
      }, /unfinished matches/);
    });

    it('Invariant: Undoing a match reverts round completion status', () => {
      const robots = createRobots(4);
      let t = initializeTournament(robots, 'Undo Test', 20);
      const r1 = t.rounds[0];

      // Complete both matches
      t = recordMatchResult(t, r1.id, r1.matches[0].id, r1.matches[0].robot1.id);
      t = recordMatchResult(t, r1.id, r1.matches[1].id, r1.matches[1].robot1.id);
      t = completeRound(t, r1.id);
      assert.equal(t.rounds[0].status, 'completed');

      // Undo match 1
      t = undoMatchResult(t, r1.id, r1.matches[0].id);
      assert.equal(t.rounds[0].status, 'in_progress', 'Round status must revert to in_progress after match undo');
      assert.equal(t.rounds[0].endTime, null);
    });

    it('Invariant: Reshuffle current round preserves round number and active field', () => {
      const robots = createRobots(22);
      let t = initializeTournament(robots, 'Reshuffle Test', 20);
      const originalPairings = t.rounds[0].matches.map(m => `${m.robot1.id} vs ${m.robot2?.id}`);

      t = reshuffleCurrentRound(t, 20);
      assert.equal(t.currentRound, 1, 'Current round number must not change on reshuffle');
      assert.equal(t.rounds.length, 1, 'Must not create a new round on reshuffle');
      assert.equal(t.rounds[0].matches.length, 11);
    });

    it('Invariant: Concurrent rapid saves do not corrupt or collide on tournament files', async () => {
      const robots = createRobots(22);
      let t = initializeTournament(robots, 'Concurrent Save Test', 20);
      await saveTournament(t);

      // Simulate 11 concurrent saves in parallel
      const savePromises = t.rounds[0].matches.map(async (m) => {
        // Each creates an updated tournament and saves
        const snapshot = recordMatchResult(t, t.rounds[0].id, m.id, m.robot1.id);
        return saveTournament(snapshot);
      });

      await Promise.all(savePromises);

      // Verify file can be read without JSON corruption
      const loaded = await loadTournament(t.id);
      assert.ok(loaded);
      assert.equal(loaded.id, t.id);
      assert.equal(loaded.rounds[0].matches.length, 11);
    });
  });

  describe('Generalized Group-Stage Engine & Multi-Group Suite', () => {
    it('testFiveRobotsSingleGroup: 5 robots in 1 group of 5, 10 matches, no 2+3 split', () => {
      testFiveRobotsSingleGroup();
    });

    it('testSixRobotsTwoGroups: 6 robots partitioned into 2 groups of 3+3 with interleaved scheduling', () => {
      testSixRobotsTwoGroups();
    });

    it('testSevenRobotsBalancedGroups: 7 robots partitioned into 2 groups of 3+4 with interleaved scheduling', () => {
      testSevenRobotsBalancedGroups();
    });

    it('testEightRobotsTwoGroups: 8 robots partitioned into 2 groups of 4+4 with interleaved scheduling', () => {
      testEightRobotsTwoGroups();
    });

    it('testNineRobotsThreeGroups: 9 robots partitioned into 3 groups of 3+3+3 with interleaved scheduling', () => {
      testNineRobotsThreeGroups();
    });

    it('testRoundRobinPairings: all groups play full round-robin N*(N-1)/2 pairings', () => {
      testRoundRobinPairings();
    });

    it('testNoDuplicatePairings: zero duplicate pairings across all groups and robot counts', () => {
      testNoDuplicatePairings();
    });

    it('testAllGroupsComplete: all groups must be terminal and independent standings computed', () => {
      testAllGroupsComplete();
    });

    it('testQualificationTransition: correct qualifiers advance under 2-to-final and 4-to-final schemas', () => {
      testQualificationTransition();
    });

    it('testBlockedMatchDoesNotDeadlockTournament: locked matches do not hang or block round advance', () => {
      testBlockedMatchDoesNotDeadlockTournament();
    });

    it('testTournamentReachesNextRound: full lifecycle from group stage through playoffs to champion', () => {
      testTournamentReachesNextRound();
    });
  });
});

export function testFiveRobotsSingleGroup() {
  const robots = createRobots(5);
  const groups = partitionRobotsIntoGroups(robots);
  assert.equal(groups.length, 1, '5 robots must be exactly 1 group, NOT split into 2+3');
  assert.equal(groups[0].robots.length, 5);
  assert.equal(groups[0].name, 'Group A');

  const matches = generateGroupStageSchedule(robots, 1);
  assert.equal(matches.length, 10, '5 robots must produce exactly 10 round-robin matches');

  // Verify each robot plays 4 times
  const playCounts: Record<string, number> = {};
  robots.forEach(r => (playCounts[r.id] = 0));
  for (const m of matches) {
    assert.ok(m.robot2, 'Group match must have robot2');
    playCounts[m.robot1.id]++;
    playCounts[m.robot2!.id]++;
  }
  for (const r of robots) {
    assert.equal(playCounts[r.id], 4, `Robot ${r.id} must play exactly 4 matches in 5-robot group`);
  }
}

export function testSixRobotsTwoGroups() {
  const robots = createRobots(6);
  const groups = partitionRobotsIntoGroups(robots);
  assert.equal(groups.length, 2, '6 robots must produce 2 groups');
  assert.equal(groups[0].robots.length, 3, 'Group A must have 3 robots');
  assert.equal(groups[1].robots.length, 3, 'Group B must have 3 robots');

  const matches = generateGroupStageSchedule(robots, 1);
  assert.equal(matches.length, 6, '6 robots must produce 6 matches (3 in A, 3 in B)');

  // Verify interleaving across groups: matches from Group A and B interleave by sub-round
  const subRounds = Array.from(new Set(matches.map(m => m.subRound)));
  assert.equal(subRounds.length, 3, '3 robots per group have 3 sub-rounds');
  for (const sr of subRounds) {
    const inSubRound = matches.filter(m => m.subRound === sr);
    const groupsInSr = new Set(inSubRound.map(m => m.groupName));
    assert.ok(
      groupsInSr.has('Group A') && groupsInSr.has('Group B'),
      `Sub-round ${sr} must contain matches from both Group A and Group B`
    );
  }
}

export function testSevenRobotsBalancedGroups() {
  const robots = createRobots(7);
  const groups = partitionRobotsIntoGroups(robots);
  assert.equal(groups.length, 2, '7 robots must produce 2 groups');
  assert.deepEqual(groups.map(g => g.robots.length), [3, 4], '7 robots must be partitioned into 3 + 4');

  const matches = generateGroupStageSchedule(robots, 1);
  assert.equal(matches.length, 9, '7 robots must produce 9 matches (3 in A, 6 in B)');

  // Interleaved: Group A matches are not all completed before Group B starts
  const firstB = matches.findIndex(m => m.groupName === 'Group B');
  const lastA = matches.map(m => m.groupName).lastIndexOf('Group A');
  assert.ok(firstB < lastA, 'Group A must never finish before Group B starts');
}

export function testEightRobotsTwoGroups() {
  const robots = createRobots(8);
  const groups = partitionRobotsIntoGroups(robots);
  assert.equal(groups.length, 2, '8 robots must produce 2 groups');
  assert.deepEqual(groups.map(g => g.robots.length), [4, 4], '8 robots must be partitioned into 4 + 4');

  const matches = generateGroupStageSchedule(robots, 1);
  assert.equal(matches.length, 12, '8 robots must produce 12 matches (6 in A, 6 in B)');

  const subRounds = Array.from(new Set(matches.map(m => m.subRound)));
  assert.equal(subRounds.length, 3);
  for (const sr of subRounds) {
    const inSubRound = matches.filter(m => m.subRound === sr);
    assert.ok(inSubRound.some(m => m.groupName === 'Group A'));
    assert.ok(inSubRound.some(m => m.groupName === 'Group B'));
  }
}

export function testNineRobotsThreeGroups() {
  const robots = createRobots(9);
  const groups = partitionRobotsIntoGroups(robots);
  assert.equal(groups.length, 3, '9 robots must produce 3 groups');
  assert.deepEqual(groups.map(g => g.robots.length), [3, 3, 3], '9 robots must be partitioned into 3 + 3 + 3');

  const matches = generateGroupStageSchedule(robots, 1);
  assert.equal(matches.length, 9, '9 robots must produce 9 matches (3 in A, 3 in B, 3 in C)');

  const subRounds = Array.from(new Set(matches.map(m => m.subRound)));
  for (const sr of subRounds) {
    const inSubRound = matches.filter(m => m.subRound === sr);
    const gNames = new Set(inSubRound.map(m => m.groupName));
    assert.ok(
      gNames.has('Group A') && gNames.has('Group B') && gNames.has('Group C'),
      `Sub-round ${sr} must contain matches from all 3 groups`
    );
  }
}

export function testRoundRobinPairings() {
  for (const count of [3, 4, 5]) {
    const robots = createRobots(count);
    const matches = generateGroupStageSchedule(robots, 1);
    const expectedMatches = (count * (count - 1)) / 2;
    assert.equal(matches.length, expectedMatches);

    const pairSet = new Set<string>();
    for (const m of matches) {
      assert.ok(m.robot2);
      const key = [m.robot1.id, m.robot2.id].sort().join(' vs ');
      pairSet.add(key);
    }
    assert.equal(pairSet.size, expectedMatches, `All ${expectedMatches} pairings must be present`);
  }
}

export function testNoDuplicatePairings() {
  for (const count of [5, 6, 7, 8, 9]) {
    const robots = createRobots(count);
    const matches = generateGroupStageSchedule(robots, 1);
    const pairSet = new Set<string>();

    for (const m of matches) {
      assert.ok(m.robot2);
      assert.notEqual(m.robot1.id, m.robot2.id, 'Robot cannot play against itself');
      const key = [m.robot1.id, m.robot2.id].sort().join(' vs ');
      assert.equal(pairSet.has(key), false, `Duplicate pairing found in schedule for ${count} robots: ${key}`);
      pairSet.add(key);
    }
  }
}

export function testAllGroupsComplete() {
  for (const count of [6, 7, 8, 9]) {
    const robots = createRobots(count);
    let t = initializeTournament(robots, `AllGroupsComplete-${count}`, 20);
    t = startGroupStageRound(t, '2-to-final');
    const grpRound = t.rounds[t.rounds.length - 1];

    // Incomplete initially
    assert.equal(grpRound.matches.some(m => !isMatchTerminal(m)), true);
    t = completeRound(t, grpRound.id);
    assert.notEqual(
      t.rounds[t.rounds.length - 1].status,
      'completed',
      'Round cannot complete while matches are pending'
    );

    // Complete all matches across all groups
    for (const m of grpRound.matches) {
      t = recordMatchResult(t, grpRound.id, m.id, m.robot1.id);
    }

    t = completeRound(t, grpRound.id);
    assert.equal(
      t.rounds[t.rounds.length - 1].status,
      'completed',
      'Round must complete when all groups are done'
    );

    // Verify independent standings per group
    const multi = calculateMultiGroupStandings(
      t.rounds[t.rounds.length - 1].matches,
      getCurrentActiveRobots(t)
    );
    const sizes = determineGroupSizes(count);
    assert.equal(multi.length, sizes.length);
    multi.forEach((g, idx) => {
      assert.equal(g.standings.length, sizes[idx]);
      assert.equal(g.standings[0].rank, 1);
    });
  }
}

export function testQualificationTransition() {
  // 5 robots: 2-to-final
  {
    const robots = createRobots(5);
    let t = initializeTournament(robots, '5-2toFinal', 20);
    t = startGroupStageRound(t, '2-to-final');
    const grp = t.rounds[t.rounds.length - 1];
    for (const m of grp.matches) {
      t = recordMatchResult(t, grp.id, m.id, m.robot1.id);
    }
    t = completeRound(t, grp.id);
    t = advanceFromGroupStage(t);
    assert.equal(t.currentStage, 'final');
    assert.equal(t.rounds[t.rounds.length - 1].matches.length, 1);
  }

  // 5 robots: 4-to-final
  {
    const robots = createRobots(5);
    let t = initializeTournament(robots, '5-4toFinal', 20);
    t = startGroupStageRound(t, '4-to-final');
    const grp = t.rounds[t.rounds.length - 1];
    for (const m of grp.matches) {
      t = recordMatchResult(t, grp.id, m.id, m.robot1.id);
    }
    t = completeRound(t, grp.id);
    t = advanceFromGroupStage(t);
    assert.equal(t.currentStage, 'semifinals');
    assert.equal(t.rounds[t.rounds.length - 1].matches.length, 2);
  }

  // 6 robots: 2-to-final (A1 vs B1)
  {
    const robots = createRobots(6);
    let t = initializeTournament(robots, '6-2toFinal', 20);
    t = startGroupStageRound(t, '2-to-final');
    const grp = t.rounds[t.rounds.length - 1];
    for (const m of grp.matches) {
      t = recordMatchResult(t, grp.id, m.id, m.robot1.id);
    }
    t = completeRound(t, grp.id);
    t = advanceFromGroupStage(t);
    assert.equal(t.currentStage, 'final');
    assert.equal(t.rounds[t.rounds.length - 1].matches.length, 1);
  }

  // 6 robots: 4-to-final (Top 2 from A and Top 2 from B to Semifinals)
  {
    const robots = createRobots(6);
    let t = initializeTournament(robots, '6-4toFinal', 20);
    t = startGroupStageRound(t, '4-to-final');
    const grp = t.rounds[t.rounds.length - 1];
    for (const m of grp.matches) {
      t = recordMatchResult(t, grp.id, m.id, m.robot1.id);
    }
    t = completeRound(t, grp.id);
    t = advanceFromGroupStage(t);
    assert.equal(t.currentStage, 'semifinals');
    assert.equal(t.rounds[t.rounds.length - 1].matches.length, 2);
  }
}

export function testBlockedMatchDoesNotDeadlockTournament() {
  for (const count of [5, 6, 7, 8]) {
    const robots = createRobots(count);
    let t = initializeTournament(robots, `Blocked-${count}`, 20);
    t = startGroupStageRound(t, '2-to-final');
    const grp = t.rounds[t.rounds.length - 1];

    // Out of order: complete even indexed matches normally, lock odd indexed matches
    const indices = Array.from({ length: grp.matches.length }, (_, i) => i).reverse();
    for (const idx of indices) {
      const m = grp.matches[idx];
      t = recordMatchResult(t, grp.id, m.id, m.robot1.id);
      if (idx % 2 === 1) {
        // Manually lock to simulate locked referee / deadline expired
        const targetR = t.rounds.find(r => r.id === grp.id)!;
        targetR.matches.find(tm => tm.id === m.id)!.status = 'locked';
      }
    }

    assert.equal(t.rounds[t.rounds.length - 1].matches.every(isMatchTerminal), true);
    t = completeRound(t, grp.id);
    assert.equal(t.rounds[t.rounds.length - 1].status, 'completed');

    // Advance must succeed without deadlock
    t = advanceFromGroupStage(t);
    assert.equal(t.currentStage, 'final');
    assert.equal(t.rounds[t.rounds.length - 1].status, 'in_progress');
  }
}

export function testTournamentReachesNextRound() {
  // Test full end-to-end advancement for 5, 6, 7, 8, 9 robots
  const configs: { count: number; format: '2-to-final' | '4-to-final' }[] = [
    { count: 5, format: '2-to-final' },
    { count: 5, format: '4-to-final' },
    { count: 6, format: '2-to-final' },
    { count: 6, format: '4-to-final' },
    { count: 7, format: '4-to-final' },
    { count: 8, format: '4-to-final' },
    { count: 9, format: '4-to-final' },
  ];

  for (const { count, format } of configs) {
    const robots = createRobots(count);
    let t = initializeTournament(robots, `E2E-${count}-${format}`, 20);
    t = startGroupStageRound(t, format);

    // 1. Group Stage
    let round = t.rounds[t.rounds.length - 1];
    for (const m of round.matches) {
      t = recordMatchResult(t, round.id, m.id, m.robot1.id);
    }
    t = completeRound(t, round.id);
    t = advanceFromGroupStage(t);

    // 2. Semifinals (if 4-to-final)
    if (format === '4-to-final') {
      assert.equal(t.currentStage, 'semifinals');
      round = t.rounds[t.rounds.length - 1];
      assert.equal(round.matches.length, 2);
      for (const m of round.matches) {
        t = recordMatchResult(t, round.id, m.id, m.robot1.id);
      }
      t = completeRound(t, round.id);
      t = advanceFromSemifinals(t);
    }

    // 3. Final
    assert.equal(t.currentStage, 'final');
    round = t.rounds[t.rounds.length - 1];
    assert.equal(round.matches.length, 1);
    t = recordMatchResult(t, round.id, round.matches[0].id, round.matches[0].robot1.id);
    t = completeRound(t, round.id);

    // Concluded
    assert.equal(t.status, 'completed');
    assert.ok(t.winner);
    assert.equal(getCurrentActiveRobots(t).length, 1);
  }
}
