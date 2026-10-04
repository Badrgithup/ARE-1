import { Robot, Tournament, Round, TournamentStats, TournamentConfig, Match } from './types';
import { generateId, formatTimestamp } from './utils';
import { generateRandomPairing } from './pairing-engine';
import { createBatches } from './batch-engine';
import { UNDO_WINDOW_MS, DEFAULT_BATCH_SIZE } from './constants';
import {
  generateGroupStageSchedule,
  calculateGroupStandings,
  calculateMultiGroupStandings,
  getGroupAdvancers,
} from './group-stage-engine';

export function isMatchTerminal(match: Match): boolean {
  return match.status === 'recorded' || match.status === 'locked';
}

export function initializeTournament(
  robots: Robot[],
  name: string,
  batchSize: number = DEFAULT_BATCH_SIZE,
  config?: TournamentConfig
): Tournament {
  const normalizedRobots: Robot[] = robots.map((r) => ({
    ...r,
    status: (r.status as string) === 'eliminated' ? 'eliminated' : 'active',
    wins: r.wins ?? 0,
    eliminatedRound: r.eliminatedRound ?? null,
    institution: r.institution ?? null,
  }));

  const shouldStartGroupStage =
    config?.groupStageEnabled === true ||
    (normalizedRobots.length >= 5 && normalizedRobots.length <= 9 && config !== undefined && config.groupStageEnabled !== false);

  if (shouldStartGroupStage) {
    const roundNumber = 1;
    const format = config?.finalFormat || '2-to-final';
    const groupMatches = generateGroupStageSchedule(normalizedRobots, roundNumber);
    const batches = createBatches(groupMatches, batchSize);

    const initialRound: Round = {
      id: generateId(),
      roundNumber,
      startTime: formatTimestamp(),
      endTime: null,
      totalMatches: groupMatches.length,
      completedMatches: 0,
      matches: groupMatches,
      batches,
      activeBatchIndex: 0,
      status: 'in_progress',
      stage: 'group_stage',
    };

    return {
      id: generateId(),
      name,
      startTime: formatTimestamp(),
      endTime: null,
      totalRobots: normalizedRobots.length,
      currentRound: 1,
      rounds: [initialRound],
      robots: normalizedRobots,
      winner: null,
      status: 'in_progress',
      currentStage: 'group_stage',
      config: config
        ? {
            ...config,
            finalFormat: config.finalFormat || format,
            groupStageEnabled: true,
          }
        : {
            finalFormat: format,
            timestamp: formatTimestamp(),
            configuredAt: formatTimestamp(),
            groupStageEnabled: true,
          },
    };
  }

  const roundNumber = 1;
  const pairings = generateRandomPairing(normalizedRobots, roundNumber);
  const batches = createBatches(pairings, batchSize);

  const initialRound: Round = {
    id: generateId(),
    roundNumber,
    startTime: formatTimestamp(),
    endTime: null,
    totalMatches: pairings.length,
    completedMatches: pairings.filter(isMatchTerminal).length, // Byes are pre-recorded
    matches: pairings,
    batches,
    activeBatchIndex: 0,
    status: 'in_progress',
    stage: 'elimination',
  };

  return {
    id: generateId(),
    name,
    startTime: formatTimestamp(),
    endTime: null,
    totalRobots: normalizedRobots.length,
    currentRound: 1,
    rounds: [initialRound],
    robots: normalizedRobots,
    winner: null,
    status: 'in_progress',
    currentStage: 'elimination',
    config,
  };
}

export function startNewRound(tournament: Tournament, batchSize: number = DEFAULT_BATCH_SIZE): Tournament {
  const lastRound = tournament.rounds[tournament.rounds.length - 1];
  if (lastRound && lastRound.matches.some(m => !isMatchTerminal(m))) {
    throw new Error(`Cannot start new round: Round ${lastRound.roundNumber} has unfinished matches.`);
  }

  const activeRobots = getCurrentActiveRobots(tournament);
  if (activeRobots.length <= 1) {
    return checkTournamentComplete(tournament);
  }

  const roundNumber = tournament.currentRound + 1;
  const pairings = generateRandomPairing(activeRobots, roundNumber);
  const batches = createBatches(pairings, batchSize);

  const newRound: Round = {
    id: generateId(),
    roundNumber,
    startTime: formatTimestamp(),
    endTime: null,
    totalMatches: pairings.length,
    completedMatches: pairings.filter(isMatchTerminal).length,
    matches: pairings,
    batches,
    activeBatchIndex: 0,
    status: 'in_progress',
    stage: 'elimination',
  };

  return {
    ...tournament,
    currentRound: roundNumber,
    currentStage: 'elimination',
    rounds: [...tournament.rounds, newRound],
  };
}

export function reshuffleCurrentRound(tournament: Tournament, batchSize: number = DEFAULT_BATCH_SIZE): Tournament {
  const currentRound = tournament.rounds[tournament.rounds.length - 1];
  if (!currentRound) return tournament;

  if (currentRound.matches.some(m => !m.isBye && isMatchTerminal(m))) {
    throw new Error('Cannot reshuffle: matches have already been recorded in this round.');
  }

  const activeRobots = getCurrentActiveRobots(tournament);
  const newPairings = generateRandomPairing(activeRobots, currentRound.roundNumber);
  const newBatches = createBatches(newPairings, batchSize);

  const updatedRound: Round = {
    ...currentRound,
    totalMatches: newPairings.length,
    completedMatches: newPairings.filter(isMatchTerminal).length,
    matches: newPairings,
    batches: newBatches,
    activeBatchIndex: 0,
  };

  return {
    ...tournament,
    rounds: tournament.rounds.map(r => r.id === currentRound.id ? updatedRound : r),
  };
}

export function recordMatchResult(tournament: Tournament, roundId: string, matchId: string, winnerId: string): Tournament {
  const targetRound = tournament.rounds.find(r => r.id === roundId);
  if (!targetRound) return tournament;

  const targetMatch = targetRound.matches.find(m => m.id === matchId);
  if (!targetMatch) return tournament;

  // Idempotency: if already recorded with same winner, return unchanged
  if (targetMatch.winner?.id === winnerId && isMatchTerminal(targetMatch)) {
    return tournament;
  }

  const undoDeadline = new Date(Date.now() + UNDO_WINDOW_MS).toISOString();
  const isGroupStage = targetRound.stage === 'group_stage';

  const newWinner = targetMatch.robot1.id === winnerId ? targetMatch.robot1 : (targetMatch.robot2?.id === winnerId ? targetMatch.robot2 : null);
  if (!newWinner) return tournament;
  const newLoser = targetMatch.robot1.id === winnerId ? targetMatch.robot2 : targetMatch.robot1;

  const prevWinnerId = targetMatch.winner?.id;
  const prevLoserId = targetMatch.loser?.id;

  const updatedMatches = targetRound.matches.map(match => {
    if (match.id !== matchId) return match;
    return {
      ...match,
      winner: newWinner,
      loser: newLoser,
      status: 'recorded' as const,
      undoDeadline,
    };
  });

  const updatedBatches = targetRound.batches.map(batch => {
    const bMatches = batch.matches.map(m => updatedMatches.find(um => um.id === m.id) || m);
    const isBatchComplete = bMatches.every(isMatchTerminal);
    const isBatchActive = bMatches.some(m => isMatchTerminal(m));
    return {
      ...batch,
      matches: bMatches,
      status: isBatchComplete ? ('completed' as const) : (isBatchActive ? ('in_progress' as const) : ('pending' as const)),
    };
  });

  const firstIncompleteBatchIdx = updatedBatches.findIndex(b => b.status !== 'completed');
  const activeBatchIndex = firstIncompleteBatchIdx !== -1 ? firstIncompleteBatchIdx : Math.max(0, updatedBatches.length - 1);

  const updatedRounds = tournament.rounds.map(round => {
    if (round.id !== roundId) return round;
    return {
      ...round,
      matches: updatedMatches,
      batches: updatedBatches,
      activeBatchIndex,
      completedMatches: updatedMatches.filter(isMatchTerminal).length,
    };
  });

  const updatedRobots = tournament.robots.map(robot => {
    let r = { ...robot };
    if (prevWinnerId && r.id === prevWinnerId && prevWinnerId !== winnerId) {
      r.wins = Math.max(0, r.wins - 1);
    }
    if (!isGroupStage && prevLoserId && r.id === prevLoserId && prevLoserId !== newLoser?.id) {
      r.status = 'active';
      r.eliminatedRound = null;
    }
    if (r.id === winnerId && prevWinnerId !== winnerId) {
      r.wins = r.wins + 1;
    }
    if (!isGroupStage && newLoser && r.id === newLoser.id && prevLoserId !== newLoser.id) {
      r.status = 'eliminated';
      r.eliminatedRound = tournament.currentRound;
    }
    return r;
  });

  return {
    ...tournament,
    rounds: updatedRounds,
    robots: updatedRobots,
  };
}

export function undoMatchResult(tournament: Tournament, roundId: string, matchId: string): Tournament {
  let loserId: string | null = null;
  let winnerId: string | null = null;

  const targetRound = tournament.rounds.find(r => r.id === roundId);
  if (!targetRound) return tournament;
  const isGroupStage = targetRound.stage === 'group_stage';

  const updatedRounds = tournament.rounds.map(round => {
    if (round.id !== roundId) return round;

    const updatedMatches = round.matches.map(match => {
      if (match.id !== matchId) return match;
      if (match.isBye) return match;
      if (!match.undoDeadline || new Date(match.undoDeadline).getTime() < Date.now()) {
        return match;
      }

      loserId = match.loser?.id || null;
      winnerId = match.winner?.id || null;

      return {
        ...match,
        winner: null,
        loser: null,
        status: 'pending' as const,
        undoDeadline: null,
      };
    });

    const updatedBatches = round.batches.map(batch => {
      const bMatches = batch.matches.map(m => updatedMatches.find(um => um.id === m.id) || m);
      const isBatchComplete = bMatches.every(isMatchTerminal);
      return {
        ...batch,
        matches: bMatches,
        status: isBatchComplete ? ('completed' as const) : ('in_progress' as const),
      };
    });

    const firstIncompleteBatchIdx = updatedBatches.findIndex(b => b.status !== 'completed');
    const activeBatchIndex = firstIncompleteBatchIdx !== -1 ? firstIncompleteBatchIdx : 0;

    return {
      ...round,
      status: 'in_progress' as const,
      endTime: null,
      matches: updatedMatches,
      batches: updatedBatches,
      activeBatchIndex,
      completedMatches: updatedMatches.filter(isMatchTerminal).length,
    };
  });

  if (!winnerId && !loserId) {
    return tournament;
  }

  const updatedRobots = tournament.robots.map(robot => {
    if (robot.id === winnerId) {
      return { ...robot, wins: Math.max(0, robot.wins - 1) };
    }
    if (!isGroupStage && robot.id === loserId) {
      return { ...robot, status: 'active' as const, eliminatedRound: null };
    }
    return robot;
  });

  return {
    ...tournament,
    status: 'in_progress' as const,
    winner: null,
    rounds: updatedRounds,
    robots: updatedRobots,
  };
}

export function completeRound(tournament: Tournament, roundId: string): Tournament {
  const updatedRounds = tournament.rounds.map(round => {
    if (round.id !== roundId) return round;
    
    if (round.matches.some(m => !isMatchTerminal(m))) {
      return round;
    }

    return {
      ...round,
      status: 'completed' as const,
      endTime: formatTimestamp(),
      completedMatches: round.matches.length,
    };
  });

  const updatedTournament = {
    ...tournament,
    rounds: updatedRounds,
  };

  return checkTournamentComplete(updatedTournament);
}

export function getCurrentActiveRobots(tournament: Tournament): Robot[] {
  return tournament.robots.filter(r => r.status === 'active' || (r.status as string) !== 'eliminated');
}

export function getTournamentStats(tournament: Tournament): TournamentStats {
  const activeRobots = getCurrentActiveRobots(tournament);
  const eliminatedRobots = tournament.robots.filter(r => r.status === 'eliminated');
  
  const currentRound = tournament.rounds.find(r => r.roundNumber === tournament.currentRound);
  let matchesCompleted = 0;
  let matchesRemaining = 0;
  
  if (currentRound) {
    matchesCompleted = currentRound.completedMatches;
    matchesRemaining = currentRound.totalMatches - currentRound.completedMatches;
  }

  const winnersPerClub: Record<string, number> = {};
  const winnersPerInstitution: Record<string, number> = {};

  activeRobots.forEach(r => {
    winnersPerClub[r.club] = (winnersPerClub[r.club] || 0) + 1;
    if (r.institution) {
      winnersPerInstitution[r.institution] = (winnersPerInstitution[r.institution] || 0) + 1;
    }
  });

  return {
    totalRobots: tournament.totalRobots,
    currentRound: tournament.currentRound,
    robotsRemaining: activeRobots.length,
    robotsEliminated: eliminatedRobots.length,
    matchesCompleted,
    matchesRemaining,
    winnersPerClub,
    winnersPerInstitution,
  };
}

export function checkTournamentComplete(tournament: Tournament): Tournament {
  const activeRobots = getCurrentActiveRobots(tournament);
  
  if (activeRobots.length === 1) {
    return {
      ...tournament,
      winner: activeRobots[0],
      status: 'completed' as const,
      endTime: formatTimestamp(),
    };
  }
  
  if (activeRobots.length === 0) {
    return {
      ...tournament,
      status: 'completed' as const,
      endTime: formatTimestamp(),
    };
  }
  
  return tournament;
}

/**
 * Start the 10-match round-robin group stage for the 5 remaining robots.
 */
export function startGroupStageRound(
  tournament: Tournament,
  format: '2-to-final' | '4-to-final'
): Tournament {
  const activeRobots = getCurrentActiveRobots(tournament);

  // If tournament was just initialized and Round 1 has no played matches (only byes or pending):
  // Set Round 1 as the group stage rather than leaving an unplayed dummy round
  const isInitialUnplayed =
    tournament.rounds.length === 1 &&
    tournament.rounds[0].matches.every((m) => m.isBye || m.status === 'pending');

  const roundNumber = isInitialUnplayed ? 1 : tournament.currentRound + 1;
  const groupMatches = generateGroupStageSchedule(activeRobots, roundNumber);
  const batches = createBatches(groupMatches, DEFAULT_BATCH_SIZE);

  const groupRound: Round = {
    id: isInitialUnplayed ? tournament.rounds[0].id : generateId(),
    roundNumber,
    startTime: formatTimestamp(),
    endTime: null,
    totalMatches: groupMatches.length,
    completedMatches: 0,
    matches: groupMatches,
    batches,
    activeBatchIndex: 0,
    status: 'in_progress',
    stage: 'group_stage',
  };

  return {
    ...tournament,
    currentRound: roundNumber,
    currentStage: 'group_stage',
    config: {
      finalFormat: format,
      timestamp: formatTimestamp(),
      configuredAt: formatTimestamp(),
    },
    rounds: isInitialUnplayed ? [groupRound] : [...tournament.rounds, groupRound],
  };
}

/**
 * When all 10 group stage matches are completed, advance robots based on format.
 * - '2-to-final': Top 2 advance to Final match.
 * - '4-to-final': Top 4 advance to Semifinals (1v4, 2v3).
 */
export function advanceFromGroupStage(tournament: Tournament): Tournament {
  const currentRound = tournament.rounds[tournament.rounds.length - 1];
  if (!currentRound || currentRound.stage !== 'group_stage') {
    return tournament;
  }

  const activeRobots = getCurrentActiveRobots(tournament);
  const multiStandings = calculateMultiGroupStandings(currentRound.matches, activeRobots);
  const format = tournament.config?.finalFormat || '2-to-final';
  const advancers = getGroupAdvancers(multiStandings, format);
  const advancerIds = new Set(advancers.map((r) => r.id));

  // Eliminate robots that did not make the advancement cut
  const updatedRobots = tournament.robots.map((robot) => {
    if (robot.status === 'active' && !advancerIds.has(robot.id)) {
      return {
        ...robot,
        status: 'eliminated' as const,
        eliminatedRound: tournament.currentRound,
      };
    }
    return robot;
  });

  const nextRoundNumber = tournament.currentRound + 1;

  if (format === '4-to-final') {
    // Top 4 advance to Semifinals: 1v4 and 2v3
    const semifinalMatches: Match[] = [
      {
        id: `semifinal-1-${generateId()}`,
        roundNumber: nextRoundNumber,
        matchNumber: 1,
        robot1: advancers[0], // 1st
        robot2: advancers[3], // 4th
        winner: null,
        loser: null,
        timestamp: formatTimestamp(),
        undoDeadline: null,
        status: 'pending',
        isBye: false,
        stage: 'semifinals',
      },
      {
        id: `semifinal-2-${generateId()}`,
        roundNumber: nextRoundNumber,
        matchNumber: 2,
        robot1: advancers[1], // 2nd
        robot2: advancers[2], // 3rd
        winner: null,
        loser: null,
        timestamp: formatTimestamp(),
        undoDeadline: null,
        status: 'pending',
        isBye: false,
        stage: 'semifinals',
      },
    ];

    const semiRound: Round = {
      id: generateId(),
      roundNumber: nextRoundNumber,
      startTime: formatTimestamp(),
      endTime: null,
      totalMatches: 2,
      completedMatches: 0,
      matches: semifinalMatches,
      batches: createBatches(semifinalMatches, DEFAULT_BATCH_SIZE),
      activeBatchIndex: 0,
      status: 'in_progress',
      stage: 'semifinals',
    };

    return {
      ...tournament,
      robots: updatedRobots,
      currentRound: nextRoundNumber,
      currentStage: 'semifinals',
      rounds: [...tournament.rounds, semiRound],
    };
  } else {
    // 2-to-final: Top 2 advance directly to Final match
    const finalMatch: Match = {
      id: `final-${generateId()}`,
      roundNumber: nextRoundNumber,
      matchNumber: 1,
      robot1: advancers[0], // 1st
      robot2: advancers[1], // 2nd
      winner: null,
      loser: null,
      timestamp: formatTimestamp(),
      undoDeadline: null,
      status: 'pending',
      isBye: false,
      stage: 'final',
    };

    const finalRound: Round = {
      id: generateId(),
      roundNumber: nextRoundNumber,
      startTime: formatTimestamp(),
      endTime: null,
      totalMatches: 1,
      completedMatches: 0,
      matches: [finalMatch],
      batches: createBatches([finalMatch], DEFAULT_BATCH_SIZE),
      activeBatchIndex: 0,
      status: 'in_progress',
      stage: 'final',
    };

    return {
      ...tournament,
      robots: updatedRobots,
      currentRound: nextRoundNumber,
      currentStage: 'final',
      rounds: [...tournament.rounds, finalRound],
    };
  }
}

/**
 * When Semifinals are complete, advance the two winners to the Final match.
 */
export function advanceFromSemifinals(tournament: Tournament): Tournament {
  const currentRound = tournament.rounds[tournament.rounds.length - 1];
  if (!currentRound || currentRound.stage !== 'semifinals') {
    return tournament;
  }

  const finalists = currentRound.matches
    .map((m) => m.winner)
    .filter((w): w is Robot => w !== null);

  if (finalists.length !== 2) {
    return tournament;
  }

  const nextRoundNumber = tournament.currentRound + 1;
  const finalMatch: Match = {
    id: `final-${generateId()}`,
    roundNumber: nextRoundNumber,
    matchNumber: 1,
    robot1: finalists[0],
    robot2: finalists[1],
    winner: null,
    loser: null,
    timestamp: formatTimestamp(),
    undoDeadline: null,
    status: 'pending',
    isBye: false,
    stage: 'final',
  };

  const finalRound: Round = {
    id: generateId(),
    roundNumber: nextRoundNumber,
    startTime: formatTimestamp(),
    endTime: null,
    totalMatches: 1,
    completedMatches: 0,
    matches: [finalMatch],
    batches: createBatches([finalMatch], DEFAULT_BATCH_SIZE),
    activeBatchIndex: 0,
    status: 'in_progress',
    stage: 'final',
  };

  return {
    ...tournament,
    currentRound: nextRoundNumber,
    currentStage: 'final',
    rounds: [...tournament.rounds, finalRound],
  };
}


