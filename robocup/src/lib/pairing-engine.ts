import { Robot, Match } from './types';
import { generateId, formatTimestamp } from './utils';

export function fisherYatesShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    let j: number;
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      const array = new Uint32Array(1);
      globalThis.crypto.getRandomValues(array);
      j = array[0] % (i + 1);
    } else {
      j = Math.floor(Math.random() * (i + 1));
    }
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateRandomPairing(robots: Robot[], roundNumber: number): Match[] {
  const shuffled = fisherYatesShuffle(robots);
  const matches: Match[] = [];
  let matchNumber = 1;
  const paired = new Set<string>();

  for (let i = 0; i < shuffled.length; i++) {
    const r1 = shuffled[i];
    if (paired.has(r1.id)) continue;

    let bestOpponent: Robot | null = null;
    let bestPriority = -1;

    for (let j = i + 1; j < shuffled.length; j++) {
      const r2 = shuffled[j];
      if (paired.has(r2.id)) continue;

      let priority = 1; // Fallback: same club/institution
      if (r1.club !== r2.club) {
        if (r1.institution !== r2.institution) {
          priority = 3; // Priority 3: different club AND different institution
        } else {
          priority = 2; // Priority 2: different club (institution matches)
        }
      }

      if (priority > bestPriority) {
        bestPriority = priority;
        bestOpponent = r2;
      }
      
      if (bestPriority === 3) break;
    }

    if (bestOpponent) {
      paired.add(r1.id);
      paired.add(bestOpponent.id);
      matches.push(createMatch(r1, bestOpponent, roundNumber, matchNumber++));
    } else {
      paired.add(r1.id);
      matches.push(createByeMatch(r1, roundNumber, matchNumber++));
    }
  }

  return matches;
}

export function createMatch(robot1: Robot, robot2: Robot, roundNumber: number, matchNumber: number): Match {
  return {
    id: generateId(),
    roundNumber,
    matchNumber,
    robot1,
    robot2,
    winner: null,
    loser: null,
    timestamp: formatTimestamp(),
    undoDeadline: null,
    status: 'pending',
    isBye: false,
  };
}

export function createByeMatch(robot: Robot, roundNumber: number, matchNumber: number): Match {
  return {
    id: generateId(),
    roundNumber,
    matchNumber,
    robot1: robot,
    robot2: null,
    winner: robot,
    loser: null,
    timestamp: formatTimestamp(),
    undoDeadline: null,
    status: 'recorded',
    isBye: true,
  };
}
