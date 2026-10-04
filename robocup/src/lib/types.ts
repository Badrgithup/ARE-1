/** Core data models for the RoboCup Tournament system */

export interface Robot {
  id: string
  name: string
  club: string
  institution: string | null
  status: 'active' | 'eliminated'
  eliminatedRound: number | null
  wins: number
}

export interface Match {
  id: string
  roundNumber: number
  matchNumber: number
  robot1: Robot
  robot2: Robot | null
  winner: Robot | null
  loser: Robot | null
  timestamp: string
  undoDeadline: string | null
  status: 'pending' | 'recorded' | 'locked'
  isBye: boolean
  stage?: 'elimination' | 'group_stage' | 'semifinals' | 'final'
  groupName?: string
  subRound?: number
}

export interface Batch {
  id: string
  batchNumber: number
  matches: Match[]
  status: 'pending' | 'in_progress' | 'completed'
}

export interface Round {
  id: string
  roundNumber: number
  startTime: string
  endTime: string | null
  totalMatches: number
  completedMatches: number
  matches: Match[]
  batches: Batch[]
  activeBatchIndex: number
  status: 'pending' | 'in_progress' | 'completed'
  stage?: 'elimination' | 'group_stage' | 'semifinals' | 'final'
}

export interface TournamentConfig {
  finalFormat: '2-to-final' | '4-to-final'
  timestamp: string
  configuredAt?: string
  groupStageEnabled?: boolean
}

export interface GroupStanding {
  robot: Robot
  points: number
  wins: number
  losses: number
  matchesPlayed: number
  rank?: number
  groupName?: string
}

export interface Tournament {
  id: string
  name: string
  startTime: string
  endTime: string | null
  totalRobots: number
  currentRound: number
  rounds: Round[]
  robots: Robot[]
  winner: Robot | null
  status: 'not_started' | 'in_progress' | 'completed'
  currentStage?: 'elimination' | 'group_config' | 'group_stage' | 'semifinals' | 'final' | 'completed'
  config?: TournamentConfig
  /** Monotonic server revision. Incremented on every authoritative save. Clients ignore older revisions. */
  revision?: number
  /** Server timestamp of the last authoritative save */
  updatedAt?: string
}

export interface TournamentSummary {
  id: string
  name: string
  status: 'not_started' | 'in_progress' | 'completed'
  totalRobots: number
  currentRound: number
  currentStage?: 'elimination' | 'group_config' | 'group_stage' | 'semifinals' | 'final' | 'completed'
  winner: Robot | null
  startTime: string
  endTime: string | null
  updatedAt: string
  config?: TournamentConfig
}

export interface TournamentStats {
  totalRobots: number
  currentRound: number
  robotsRemaining: number
  robotsEliminated: number
  matchesCompleted: number
  matchesRemaining: number
  winnersPerClub: Record<string, number>
  winnersPerInstitution: Record<string, number>
}

/** Custom error types */
export class CSVHeaderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CSVHeaderError'
  }
}

export class CSVParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CSVParseError'
  }
}

export class EmptyFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmptyFileError'
  }
}

export class TournamentNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TournamentNotFoundError'
  }
}
