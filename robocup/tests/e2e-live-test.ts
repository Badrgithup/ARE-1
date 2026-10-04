import assert from 'node:assert/strict';

interface Robot {
  id: string;
  name: string;
  club: string;
  institution: string | null;
  status: 'active' | 'eliminated';
  eliminatedRound: number | null;
  wins: number;
}

interface Match {
  id: string;
  roundNumber: number;
  matchNumber: number;
  robot1: Robot;
  robot2: Robot | null;
  winner: Robot | null;
  loser: Robot | null;
  status: 'pending' | 'recorded' | 'locked';
  isBye: boolean;
}

interface Round {
  id: string;
  roundNumber: number;
  status: 'pending' | 'in_progress' | 'completed';
  matches: Match[];
  totalMatches: number;
  completedMatches: number;
}

interface Tournament {
  id: string;
  name: string;
  currentRound: number;
  rounds: Round[];
  robots: Robot[];
  status: 'not_started' | 'in_progress' | 'completed';
  winner: Robot | null;
}

const BASE_URL = 'http://localhost:3000';

function generateRobots(count: number): Robot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bot-${String(i + 1).padStart(2, '0')}`,
    name: `Robot-${String(i + 1).padStart(2, '0')}`,
    club: `ARE-Club-${(i % 4) + 1}`,
    institution: `ENSI-${(i % 2) + 1}`,
    status: 'active',
    eliminatedRound: null,
    wins: 0,
  }));
}

async function apiCreateTournament(name: string, robots: Robot[]): Promise<Tournament> {
  const res = await fetch(`${BASE_URL}/api/tournament`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, robots, batchSize: 20 }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function apiGetTournament(id: string): Promise<Tournament> {
  const res = await fetch(`${BASE_URL}/api/tournament/${id}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function apiPutTournament(t: Tournament): Promise<Tournament> {
  const res = await fetch(`${BASE_URL}/api/tournament/${t.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(t),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function apiRecordMatch(tournamentId: string, matchId: string, winnerId: string): Promise<Tournament> {
  const res = await fetch(`${BASE_URL}/api/tournament/${tournamentId}/match/${matchId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winnerId }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function apiStartNextRound(tournamentId: string, batchSize: number = 20): Promise<Tournament> {
  const res = await fetch(`${BASE_URL}/api/tournament/${tournamentId}/round`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchSize }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

function getPathMetrics(t: Tournament, label: string) {
  const r = t.rounds[t.rounds.length - 1];
  const numMatches = r.matches.length;
  const completedMatches = r.matches.filter(m => m.status === 'recorded').length;
  const blockedMatches = r.matches.filter(m => m.status === 'locked').length;
  const pendingMatches = r.matches.filter(m => m.status === 'pending').length;
  const qualifiedRobots = t.robots.filter(bot => bot.status === 'active').length;
  const nextRoundStatus = r.status === 'completed' ? 'READY_TO_ADVANCE' : 'WAITING_FOR_MATCHES';

  return {
    label,
    currentRound: `Round ${r.roundNumber} (Qualification)`,
    numberMatches: numMatches,
    completedMatches,
    blockedMatches,
    pendingMatches,
    qualifiedRobots,
    tournamentStatus: t.status,
    nextRoundStatus,
  };
}

async function runLiveE2ETests() {
  console.log('====================================================');
  console.log('LIVE E2E TOURNAMENT ENGINE EXECUTION AGAINST SERVER');
  console.log('====================================================\n');

  const results: any[] = [];

  // PATH A: Complete all qualification matches normally
  {
    const robots = generateRobots(22);
    let t = await apiCreateTournament('Path A: Normal Completion', robots);
    const r1 = t.rounds[0];
    for (const m of r1.matches) {
      t = await apiRecordMatch(t.id, m.id, m.robot1.id);
    }
    const metrics = getPathMetrics(t, 'PATH A: Normal Qualification Completion');
    results.push(metrics);

    // Advance to next round
    t = await apiStartNextRound(t.id, 20);
    assert.equal(t.currentRound, 2);
    assert.equal(t.rounds.length, 2);
    assert.equal(t.rounds[1].matches.length, 6); // 11 robots: 5 matches + 1 bye
  }

  // PATH B: Block some matches (locked matches)
  {
    const robots = generateRobots(22);
    let t = await apiCreateTournament('Path B: Block Some Matches', robots);
    const r1 = t.rounds[0];
    for (let i = 0; i < 9; i++) {
      t = await apiRecordMatch(t.id, r1.matches[i].id, r1.matches[i].robot1.id);
    }
    // Block matches 9 and 10 (status: locked)
    t = await apiRecordMatch(t.id, r1.matches[9].id, r1.matches[9].robot1.id);
    t = await apiRecordMatch(t.id, r1.matches[10].id, r1.matches[10].robot1.id);
    t.rounds[0].matches[9].status = 'locked';
    t.rounds[0].matches[10].status = 'locked';
    t = await apiPutTournament(t);

    const metrics = getPathMetrics(t, 'PATH B: Block Some Matches');
    results.push(metrics);

    // Verify round is completed and ready to advance
    assert.equal(t.rounds[0].status, 'completed');
    t = await apiStartNextRound(t.id, 20);
    assert.equal(t.currentRound, 2);
  }

  // PATH C: Block the last match in the qualification round
  {
    const robots = generateRobots(22);
    let t = await apiCreateTournament('Path C: Block Last Match', robots);
    const r1 = t.rounds[0];
    for (let i = 0; i < 10; i++) {
      t = await apiRecordMatch(t.id, r1.matches[i].id, r1.matches[i].robot1.id);
    }
    // Block the last match
    t = await apiRecordMatch(t.id, r1.matches[10].id, r1.matches[10].robot1.id);
    t.rounds[0].matches[10].status = 'locked';
    t = await apiPutTournament(t);

    const metrics = getPathMetrics(t, 'PATH C: Block Last Match in Qualification');
    results.push(metrics);

    assert.equal(t.rounds[0].status, 'completed');
    t = await apiStartNextRound(t.id, 20);
    assert.equal(t.currentRound, 2);
  }

  // PATH D: Complete most matches, then block one
  {
    const robots = generateRobots(22);
    let t = await apiCreateTournament('Path D: Complete Most Then Block', robots);
    const r1 = t.rounds[0];
    // Complete matches 0..7
    for (let i = 0; i < 8; i++) {
      t = await apiRecordMatch(t.id, r1.matches[i].id, r1.matches[i].robot1.id);
    }
    // Block match 8
    t = await apiRecordMatch(t.id, r1.matches[8].id, r1.matches[8].robot1.id);
    t.rounds[0].matches[8].status = 'locked';
    t = await apiPutTournament(t);

    // Complete remaining matches 9..10
    for (let i = 9; i < 11; i++) {
      t = await apiRecordMatch(t.id, r1.matches[i].id, r1.matches[i].robot1.id);
    }

    const metrics = getPathMetrics(t, 'PATH D: Complete Most, Block One, Finish Rest');
    results.push(metrics);

    assert.equal(t.rounds[0].status, 'completed');
    t = await apiStartNextRound(t.id, 20);
    assert.equal(t.currentRound, 2);
  }

  // PATH E: Complete/block matches in a different order
  {
    const robots = generateRobots(22);
    let t = await apiCreateTournament('Path E: Non-sequential Order', robots);
    const r1 = t.rounds[0];
    const order = [7, 2, 10, 0, 4, 9, 1, 8, 3, 6, 5];
    for (const idx of order) {
      t = await apiRecordMatch(t.id, r1.matches[idx].id, r1.matches[idx].robot1.id);
    }

    const metrics = getPathMetrics(t, 'PATH E: Out-of-Order Execution');
    results.push(metrics);

    assert.equal(t.rounds[0].status, 'completed');
    t = await apiStartNextRound(t.id, 20);
    assert.equal(t.currentRound, 2);
  }

  // PATH F: Refresh page between matches
  {
    const robots = generateRobots(22);
    let t = await apiCreateTournament('Path F: Refresh Between Matches', robots);
    const r1 = t.rounds[0];

    // Complete 3 matches
    for (let i = 0; i < 3; i++) {
      t = await apiRecordMatch(t.id, r1.matches[i].id, r1.matches[i].robot1.id);
    }
    // Simulate refresh (re-fetch from server API)
    t = await apiGetTournament(t.id);
    assert.equal(t.rounds[0].completedMatches, 3);

    // Complete 4 more matches
    for (let i = 3; i < 7; i++) {
      t = await apiRecordMatch(t.id, r1.matches[i].id, r1.matches[i].robot1.id);
    }
    // Simulate second refresh
    t = await apiGetTournament(t.id);
    assert.equal(t.rounds[0].completedMatches, 7);

    // Complete remaining matches
    for (let i = 7; i < 11; i++) {
      t = await apiRecordMatch(t.id, r1.matches[i].id, r1.matches[i].robot1.id);
    }
    // Simulate third refresh
    t = await apiGetTournament(t.id);

    const metrics = getPathMetrics(t, 'PATH F: Refreshed Page 3x During Qualification');
    results.push(metrics);

    assert.equal(t.rounds[0].status, 'completed');
    t = await apiStartNextRound(t.id, 20);
    assert.equal(t.currentRound, 2);
  }

  // PATH G: Full tournament lifecycle from 22 robots to champion & archive verification
  {
    const robots = generateRobots(22);
    let t = await apiCreateTournament('Path G: Complete Tournament to Champion', robots);

    while (t.status !== 'completed' && t.rounds.length < 10) {
      const activeBots = t.robots.filter(r => r.status === 'active');
      if (activeBots.length <= 1) {
        break;
      }

      const r = t.rounds[t.rounds.length - 1];
      for (const m of r.matches) {
        if (!m.isBye && m.status === 'pending') {
          t = await apiRecordMatch(t.id, m.id, m.robot1.id);
        }
      }

      // Check if tournament finished
      const remaining = t.robots.filter(r => r.status === 'active');
      if (remaining.length <= 1) {
        break;
      }

      t = await apiStartNextRound(t.id, 20);
    }

    t = await apiGetTournament(t.id);
    const metrics = getPathMetrics(t, 'PATH G: Full Tournament Concluded to Champion');
    results.push(metrics);

    assert.equal(t.status, 'completed');
    assert.ok(t.winner);
    assert.equal(t.robots.filter(r => r.status === 'active').length, 1);
  }

  console.log(JSON.stringify(results, null, 2));
  console.log('\n✓ ALL LIVE E2E PATHS PASSED WITH 100% SUCCESS!');
}

runLiveE2ETests().catch((err) => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
