import type { Tournament, Round, Match, Robot, GroupStanding } from './types'
import { calculateMultiGroupStandings, determineGroupSizes, getGroupAdvancers } from './group-stage-engine'

export interface TreeParticipant {
  id: string
  name: string
  club: string
  institution: string | null
  seedOrRank?: string
  isWinner: boolean
  isLoser: boolean
}

export interface TreeMatchSlot {
  participant: TreeParticipant | null
  sourcePortId?: string
  placeholderText?: string
}

export interface TreeMatchNode {
  id: string
  matchNumber: number
  roundNumber: number
  stageName: string
  isBye: boolean
  isLive: boolean
  status: 'pending' | 'recorded' | 'locked'
  topSlot: TreeMatchSlot
  bottomSlot: TreeMatchSlot
  winner: TreeParticipant | null
  loser: TreeParticipant | null
  nextMatchId?: string
  nextMatchSlot?: 'top' | 'bottom'
  sourceMatchTopId?: string
  sourceMatchBottomId?: string
  x: number
  y: number
  width: number
  height: number
  inputTopPort: { x: number; y: number }
  inputBottomPort: { x: number; y: number }
  outputPort: { x: number; y: number }
  inputTopPortId: string
  inputBottomPortId: string
  outputPortId: string
}

export interface TreeGroupMatchItem {
  id: string
  matchNumber: number
  robot1Name: string
  robot2Name: string
  winnerId: string | null
  winnerName: string | null
  status: 'pending' | 'recorded' | 'locked'
  isLive: boolean
}

export interface TreeGroupQualifier {
  robot: Robot
  rank: number
  points: number
  wins: number
  losses: number
  matchesPlayed: number
  isAdvancing: boolean
  groupName: string
  portId: string
  portX: number
  portY: number
}

export interface TreeGroupNode {
  id: string
  name: string
  robotCount: number
  standings: TreeGroupQualifier[]
  groupMatches: TreeGroupMatchItem[]
  x: number
  y: number
  width: number
  height: number
}

export interface TreeQualifierNode {
  id: string
  robot: Robot
  rank: number
  groupName: string
  seedLabel: string
  points: number
  wins: number
  losses: number
  nextMatchId?: string
  nextMatchSlot?: 'top' | 'bottom'
  x: number
  y: number
  width: number
  height: number
  inputPort: { x: number; y: number }
  outputPort: { x: number; y: number }
  inputPortId: string
  outputPortId: string
}

export interface TreeStageColumn {
  id: string
  title: string
  phaseNumber: number
  stageType: 'group_stage' | 'qualifiers' | 'elimination' | 'semifinals' | 'final'
  roundNumber: number
  status: 'completed' | 'in_progress' | 'pending'
  isCurrent: boolean
  x: number
  width: number
  groups?: TreeGroupNode[]
  qualifiers?: TreeQualifierNode[]
  matches?: TreeMatchNode[]
}

export interface TreeConnector {
  id: string
  fromPortId: string
  toPortId: string
  startX: number
  startY: number
  endX: number
  endY: number
  isAdvancing: boolean
  isLive: boolean
  robotName?: string
}

export interface TournamentTreeData {
  canvasWidth: number
  canvasHeight: number
  stages: TreeStageColumn[]
  connectors: TreeConnector[]
  champion: {
    robot: Robot
    wins: number
    x: number
    y: number
    width: number
    height: number
    inputPort: { x: number; y: number }
    inputPortId: string
  } | null
}

function mapParticipant(
  robot: Robot | null,
  match: Match,
  isTop: boolean
): TreeParticipant | null {
  if (!robot) return null
  const isRecorded = match.status === 'recorded' || match.status === 'locked'
  const isWinner = isRecorded && match.winner?.id === robot.id
  const isLoser = isRecorded && match.loser?.id === robot.id

  return {
    id: robot.id,
    name: robot.name,
    club: robot.club,
    institution: robot.institution,
    isWinner,
    isLoser,
  }
}

const MATCH_WIDTH = 280
const MATCH_HEIGHT = 106
const GROUP_WIDTH = 350
const QUALIFIERS_WIDTH = 220
const CHAMPION_WIDTH = 280
const STAGE_GAP = 60
const HEADER_OFFSET = 75
const MIN_MATCH_GAP = 28

/**
 * Builds the visual deterministic tournament bracket tree from tournament state.
 * Implements:
 * 1. Complete tournament history: all rounds (Group Stage, Round 1, Round 2, Semis, Final) remain visible.
 * 2. Winner propagation: winners are visibly marked and traced into next-round slots with highlighted connectors.
 * 3. Group Stage visual architecture: Group Cards (Standings Table + Group Matches results) -> Qualifiers -> Knockout -> Final.
 * 4. Deterministic geometric vertical centering: Parent.y = (Child1.y + Child2.y) / 2.
 */
export function buildTournamentTree(tournament: Tournament): TournamentTreeData {
  const format = tournament.config?.finalFormat || '2-to-final'
  const totalRobots = tournament.totalRobots
  const currentRoundNum = tournament.currentRound

  // 1. Collect all real stages from tournament.rounds
  interface RawStageInfo {
    id: string
    title: string
    stageType: 'group_stage' | 'elimination' | 'semifinals' | 'final'
    roundNumber: number
    status: 'completed' | 'in_progress' | 'pending'
    isCurrent: boolean
    roundRef?: Round
  }

  const rawStages: RawStageInfo[] = []

  tournament.rounds.forEach((round) => {
    const isCurrent = round.roundNumber === currentRoundNum && tournament.status !== 'completed'
    const stageType = round.stage || 'elimination'

    let title = `Round ${round.roundNumber}`
    if (stageType === 'group_stage') {
      title = 'Group Stage'
    } else if (stageType === 'semifinals') {
      title = 'Semifinals'
    } else if (stageType === 'final') {
      title = 'Championship Final'
    } else if (round.roundNumber === 1 && totalRobots > 9) {
      title = 'Qualification / Round 1'
    } else if (round.matches.length === 4) {
      title = 'Quarter-finals'
    }

    rawStages.push({
      id: round.id,
      title,
      stageType,
      roundNumber: round.roundNumber,
      status: round.status,
      isCurrent,
      roundRef: round,
    })
  })

  // 2. Anticipate future stages if tournament is not yet completed
  if (tournament.status !== 'completed') {
    const lastRaw = rawStages[rawStages.length - 1]
    if (lastRaw) {
      if (lastRaw.stageType === 'group_stage') {
        if (format === '4-to-final' && !rawStages.some((s) => s.stageType === 'semifinals')) {
          rawStages.push({
            id: 'anticipated-semifinals',
            title: 'Semifinals',
            stageType: 'semifinals',
            roundNumber: lastRaw.roundNumber + 1,
            status: 'pending',
            isCurrent: false,
          })
          rawStages.push({
            id: 'anticipated-final',
            title: 'Championship Final',
            stageType: 'final',
            roundNumber: lastRaw.roundNumber + 2,
            status: 'pending',
            isCurrent: false,
          })
        } else if (!rawStages.some((s) => s.stageType === 'final')) {
          rawStages.push({
            id: 'anticipated-final',
            title: 'Championship Final',
            stageType: 'final',
            roundNumber: lastRaw.roundNumber + 1,
            status: 'pending',
            isCurrent: false,
          })
        }
      } else if (lastRaw.stageType === 'semifinals' && !rawStages.some((s) => s.stageType === 'final')) {
        rawStages.push({
          id: 'anticipated-final',
          title: 'Championship Final',
          stageType: 'final',
          roundNumber: lastRaw.roundNumber + 1,
          status: 'pending',
          isCurrent: false,
        })
      } else if (lastRaw.stageType === 'elimination' && lastRaw.roundRef) {
        // e.g. Qualification (11 matches) -> Anticipate Round 2 (6 matches)
        const matchCount = lastRaw.roundRef.matches.length
        if (matchCount > 2 && !rawStages.some((s) => s.roundNumber === lastRaw.roundNumber + 1)) {
          const nextMatchCount = Math.ceil(matchCount / 2)
          let nextTitle = `Round ${lastRaw.roundNumber + 1}`
          let nextStageType: 'elimination' | 'semifinals' | 'final' = 'elimination'
          if (nextMatchCount === 2) {
            nextTitle = 'Semifinals'
            nextStageType = 'semifinals'
          } else if (nextMatchCount === 1) {
            nextTitle = 'Championship Final'
            nextStageType = 'final'
          }

          rawStages.push({
            id: `anticipated-round-${lastRaw.roundNumber + 1}`,
            title: nextTitle,
            stageType: nextStageType,
            roundNumber: lastRaw.roundNumber + 1,
            status: 'pending',
            isCurrent: false,
          })

          if (nextStageType === 'semifinals' && !rawStages.some((s) => s.stageType === 'final')) {
            rawStages.push({
              id: 'anticipated-final',
              title: 'Championship Final',
              stageType: 'final',
              roundNumber: lastRaw.roundNumber + 2,
              status: 'pending',
              isCurrent: false,
            })
          }
        }
      }
    }
  }

  // 3. Assemble visual phases:
  // If there is a Group Stage, we insert a dedicated Phase 2: QUALIFIERS column
  let currentX = 24
  let maxCanvasHeight = 540
  const stages: TreeStageColumn[] = []
  const connectors: TreeConnector[] = []
  let phaseCounter = 1

  // Maps to find source nodes by robot ID:
  // robotId -> { portId, portX, portY, name }
  const qualifierSourceMap = new Map<string, { portId: string; portX: number; portY: number; name: string }>()
  // robotId -> { portId, portX, portY, name, matchId }
  const knockoutWinnerSourceMap = new Map<string, { portId: string; portX: number; portY: number; name: string; matchId: string }>()

  // Process raw stages sequentially
  for (let sIdx = 0; sIdx < rawStages.length; sIdx++) {
    const raw = rawStages[sIdx]

    // ─── CASE A: GROUP STAGE ───
    if (raw.stageType === 'group_stage') {
      const groupMatches = raw.roundRef?.matches || []
      const activeRobots = tournament.robots.filter((r) => r.status === 'active')
      const multi = calculateMultiGroupStandings(groupMatches, activeRobots.length > 0 ? activeRobots : tournament.robots)
      const groupCount = multi.length
      const width = GROUP_WIDTH
      const x = currentX
      currentX += width + STAGE_GAP

      const groups: TreeGroupNode[] = []
      let currentY = HEADER_OFFSET + 20

      // Compute how many advance per group
      let advancingPerGroup = 2
      if (groupCount === 1) {
        advancingPerGroup = format === '2-to-final' ? 2 : 4
      } else if (groupCount === 2) {
        advancingPerGroup = format === '2-to-final' ? 1 : 2
      } else {
        advancingPerGroup = 1
      }

      const allQualifiersForColumn: TreeQualifierNode[] = []

      multi.forEach((g, gIdx) => {
        const groupName = g.groupName || `Group ${String.fromCharCode(65 + gIdx)}`
        const matchesInGroup = groupMatches.filter((m) => m.groupName === groupName)

        // Height based on standings rows + matches rows
        const standingsHeight = g.standings.length * 36 + 48
        const matchesHeight = Math.min(180, matchesInGroup.length * 28 + 36)
        const groupHeight = standingsHeight + matchesHeight + 16
        const groupCenterY = currentY + groupHeight / 2

        const qualifiers: TreeGroupQualifier[] = g.standings.map((s, idx) => {
          const rank = s.rank || idx + 1
          const isAdvancing = rank <= advancingPerGroup
          const portId = `group-${groupName.replace(/\s+/g, '_')}-rank-${rank}-out`
          const rowCenterY = currentY + 44 + idx * 36 + 18
          const portX = x + width
          const portY = rowCenterY

          if (isAdvancing) {
            qualifierSourceMap.set(s.robot.id, {
              portId,
              portX,
              portY,
              name: s.robot.name,
            })
          }

          return {
            robot: s.robot,
            rank,
            points: s.points,
            wins: s.wins,
            losses: s.losses,
            matchesPlayed: s.matchesPlayed,
            isAdvancing,
            groupName,
            portId,
            portX,
            portY,
          }
        })

        const mappedMatches: TreeGroupMatchItem[] = matchesInGroup.map((m) => {
          const isLive = Boolean(raw.isCurrent && m.status === 'pending')
          return {
            id: m.id,
            matchNumber: m.matchNumber,
            robot1Name: m.robot1.name,
            robot2Name: m.robot2 ? m.robot2.name : 'BYE',
            winnerId: m.winner ? m.winner.id : null,
            winnerName: m.winner ? m.winner.name : null,
            status: m.status,
            isLive,
          }
        })

        groups.push({
          id: `group-node-${gIdx}`,
          name: groupName,
          robotCount: g.standings.length,
          standings: qualifiers,
          groupMatches: mappedMatches,
          x,
          y: groupCenterY,
          width,
          height: groupHeight,
        })

        currentY += groupHeight + 28
      })

      maxCanvasHeight = Math.max(maxCanvasHeight, currentY + 40)

      stages.push({
        id: raw.id,
        title: groupCount === 1 ? 'Group Stage (Single Group)' : `Group Stage (${groupCount} Groups)`,
        phaseNumber: phaseCounter++,
        stageType: 'group_stage',
        roundNumber: raw.roundNumber,
        status: raw.status,
        isCurrent: raw.isCurrent,
        x,
        width,
        groups,
      })

      // ─── INSERT PHASE 2: QUALIFIED COMBATANTS COLUMN ───
      const qualX = currentX
      const qualWidth = QUALIFIERS_WIDTH
      currentX += qualWidth + STAGE_GAP

      const multiStandings = calculateMultiGroupStandings(groupMatches, activeRobots.length > 0 ? activeRobots : tournament.robots)
      const advancers = getGroupAdvancers(multiStandings, format)

      let qualCurrentY = HEADER_OFFSET + 30
      const qualifierNodes: TreeQualifierNode[] = advancers.map((robot, qIdx) => {
        const sourceInfo = qualifierSourceMap.get(robot.id)
        const nodeHeight = 68
        const nodeCenterY = qualCurrentY + nodeHeight / 2
        const inputPortId = `qualifier-${robot.id}-in`
        const outputPortId = `qualifier-${robot.id}-out`

        // Find group standing data
        let groupName = 'Group A'
        let rank = 1
        let points = 0
        let wins = 0
        let losses = 0

        for (const g of multiStandings) {
          const st = g.standings.find((s) => s.robot.id === robot.id)
          if (st) {
            groupName = g.groupName || 'Group A'
            rank = st.rank || 1
            points = st.points
            wins = st.wins
            losses = st.losses
            break
          }
        }

        const seedLabel = `${groupName.replace('Group ', '')}${rank}`

        // Connect Group Standings row -> Qualifier Node input
        if (sourceInfo) {
          connectors.push({
            id: `conn-standings-qualifier-${robot.id}`,
            fromPortId: sourceInfo.portId,
            toPortId: inputPortId,
            startX: sourceInfo.portX,
            startY: sourceInfo.portY,
            endX: qualX,
            endY: nodeCenterY,
            isAdvancing: true,
            isLive: false,
            robotName: robot.name,
          })
        }

        // Register qualifier node output for downstream knockout stage
        knockoutWinnerSourceMap.set(robot.id, {
          portId: outputPortId,
          portX: qualX + qualWidth,
          portY: nodeCenterY,
          name: robot.name,
          matchId: `qualifier-${robot.id}`,
        })

        qualCurrentY += nodeHeight + 20

        return {
          id: `qualifier-node-${robot.id}`,
          robot,
          rank,
          groupName,
          seedLabel,
          points,
          wins,
          losses,
          x: qualX,
          y: nodeCenterY,
          width: qualWidth,
          height: nodeHeight,
          inputPort: { x: qualX, y: nodeCenterY },
          outputPort: { x: qualX + qualWidth, y: nodeCenterY },
          inputPortId,
          outputPortId,
        }
      })

      maxCanvasHeight = Math.max(maxCanvasHeight, qualCurrentY + 40)

      stages.push({
        id: 'phase-qualifiers',
        title: 'Qualified Combatants',
        phaseNumber: phaseCounter++,
        stageType: 'qualifiers',
        roundNumber: raw.roundNumber,
        status: raw.status === 'completed' ? 'completed' : 'in_progress',
        isCurrent: raw.isCurrent && raw.status === 'completed',
        x: qualX,
        width: qualWidth,
        qualifiers: qualifierNodes,
      })
    } else {
      // ─── CASE B: KNOCKOUT / ELIMINATION / SEMIFINALS / FINAL ───
      const width = MATCH_WIDTH
      const x = currentX
      currentX += width + STAGE_GAP

      const prevStage = stages[stages.length - 1] as TreeStageColumn | undefined
      const matches: TreeMatchNode[] = []

      // Determine match count
      let targetCount = raw.roundRef?.matches.length || 0
      if (targetCount === 0) {
        if (raw.stageType === 'final') targetCount = 1
        else if (raw.stageType === 'semifinals') targetCount = 2
        else targetCount = Math.max(1, Math.ceil(((prevStage?.matches?.length) || 2) / 2))
      }

      // Vertical centering: Parent.Y = (Child1.Y + Child2.Y) / 2
      let fallbackY = HEADER_OFFSET + 20

      for (let mIdx = 0; mIdx < targetCount; mIdx++) {
        const existingMatch = raw.roundRef?.matches[mIdx]
        const matchId = existingMatch?.id || `sim-${raw.id}-m${mIdx}`
        const matchNumber = existingMatch?.matchNumber || mIdx + 1

        let topParticipant = existingMatch ? mapParticipant(existingMatch.robot1, existingMatch, true) : null
        let bottomParticipant = existingMatch ? mapParticipant(existingMatch.robot2, existingMatch, false) : null
        let winner = existingMatch?.winner ? mapParticipant(existingMatch.winner, existingMatch, false) : null
        let loser = existingMatch?.loser ? mapParticipant(existingMatch.loser, existingMatch, false) : null

        let parentY = 0

        // 1. If feeding from Qualifiers stage (Group Stage -> Knockout)
        if (prevStage?.stageType === 'qualifiers' && prevStage.qualifiers) {
          const qs = prevStage.qualifiers
          if (raw.stageType === 'final') {
            const q1 = qs[0]
            const q2 = qs[1]
            parentY = q1 && q2 ? (q1.y + q2.y) / 2 : (q1 ? q1.y : fallbackY + MATCH_HEIGHT / 2)
            if (!topParticipant && q1) {
              topParticipant = { id: q1.robot.id, name: q1.robot.name, club: q1.robot.club, institution: q1.robot.institution, isWinner: false, isLoser: false }
            }
            if (!bottomParticipant && q2) {
              bottomParticipant = { id: q2.robot.id, name: q2.robot.name, club: q2.robot.club, institution: q2.robot.institution, isWinner: false, isLoser: false }
            }
          } else if (raw.stageType === 'semifinals') {
            if (mIdx === 0) {
              const q1 = qs[0]
              const q2 = qs[3] || qs[1]
              parentY = q1 && q2 ? (q1.y + q2.y) / 2 : fallbackY + MATCH_HEIGHT / 2
              if (!topParticipant && q1) {
                topParticipant = { id: q1.robot.id, name: q1.robot.name, club: q1.robot.club, institution: q1.robot.institution, isWinner: false, isLoser: false }
              }
              if (!bottomParticipant && q2) {
                bottomParticipant = { id: q2.robot.id, name: q2.robot.name, club: q2.robot.club, institution: q2.robot.institution, isWinner: false, isLoser: false }
              }
            } else {
              const q1 = qs[1]
              const q2 = qs[2] || qs[0]
              parentY = q1 && q2 ? (q1.y + q2.y) / 2 : fallbackY + MATCH_HEIGHT / 2
              if (!topParticipant && q1) {
                topParticipant = { id: q1.robot.id, name: q1.robot.name, club: q1.robot.club, institution: q1.robot.institution, isWinner: false, isLoser: false }
              }
              if (!bottomParticipant && q2) {
                bottomParticipant = { id: q2.robot.id, name: q2.robot.name, club: q2.robot.club, institution: q2.robot.institution, isWinner: false, isLoser: false }
              }
            }
          }
        } else if (prevStage?.matches) {
          // 2. Feeding from previous Knockout matches
          const child1 = prevStage.matches[mIdx * 2]
          const child2 = prevStage.matches[mIdx * 2 + 1]

          if (child1 && child2) {
            parentY = (child1.y + child2.y) / 2
          } else if (child1) {
            parentY = child1.y
          } else {
            parentY = fallbackY + MATCH_HEIGHT / 2
          }

          // WINNER PROPAGATION: If next round has not yet populated participants,
          // propagate completed winners from child matches immediately into slots!
          if (!topParticipant && child1?.winner) {
            topParticipant = {
              id: child1.winner.id,
              name: child1.winner.name,
              club: child1.winner.club,
              institution: child1.winner.institution,
              isWinner: false,
              isLoser: false,
            }
          }
          if (!bottomParticipant && child2?.winner) {
            bottomParticipant = {
              id: child2.winner.id,
              name: child2.winner.name,
              club: child2.winner.club,
              institution: child2.winner.institution,
              isWinner: false,
              isLoser: false,
            }
          }
        } else {
          parentY = fallbackY + MATCH_HEIGHT / 2
        }

        fallbackY += MATCH_HEIGHT + MIN_MATCH_GAP
        maxCanvasHeight = Math.max(maxCanvasHeight, parentY + MATCH_HEIGHT / 2 + 40)

        const inputTopPortId = `match-${matchId}-in-top`
        const inputBottomPortId = `match-${matchId}-in-bottom`
        const outputPortId = `match-${matchId}-out`
        const isLive = Boolean(raw.isCurrent && existingMatch && existingMatch.status === 'pending')

        // Register winner for downstream rounds
        if (winner) {
          knockoutWinnerSourceMap.set(winner.id, {
            portId: outputPortId,
            portX: x + width,
            portY: parentY,
            name: winner.name,
            matchId,
          })
        }

        matches.push({
          id: matchId,
          matchNumber,
          roundNumber: raw.roundNumber,
          stageName: raw.title,
          isBye: Boolean(existingMatch?.isBye),
          isLive,
          status: existingMatch?.status || 'pending',
          topSlot: {
            participant: topParticipant,
            placeholderText: !topParticipant ? `Winner M${mIdx * 2 + 1}` : undefined,
          },
          bottomSlot: {
            participant: bottomParticipant,
            placeholderText: existingMatch?.isBye
              ? 'Auto-Advance (BYE)'
              : !bottomParticipant
              ? `Winner M${mIdx * 2 + 2}`
              : undefined,
          },
          winner,
          loser,
          x,
          y: parentY,
          width,
          height: MATCH_HEIGHT,
          inputTopPort: { x, y: parentY - 20 },
          inputBottomPort: { x, y: parentY + 20 },
          outputPort: { x: x + width, y: parentY },
          inputTopPortId,
          inputBottomPortId,
          outputPortId,
        })
      }

      // Connect upstream stage to this knockout stage
      if (prevStage?.stageType === 'qualifiers' && prevStage.qualifiers) {
        // Connect each qualifier output port -> match input port
        matches.forEach((m) => {
          if (m.topSlot.participant) {
            const q = prevStage.qualifiers?.find((ql) => ql.robot.id === m.topSlot.participant?.id)
            if (q) {
              connectors.push({
                id: `conn-qualifier-${q.id}-${m.id}-top`,
                fromPortId: q.outputPortId,
                toPortId: m.inputTopPortId,
                startX: q.outputPort.x,
                startY: q.outputPort.y,
                endX: m.inputTopPort.x,
                endY: m.inputTopPort.y,
                isAdvancing: true,
                isLive: m.isLive,
                robotName: q.robot.name,
              })
            }
          }
          if (m.bottomSlot.participant) {
            const q = prevStage.qualifiers?.find((ql) => ql.robot.id === m.bottomSlot.participant?.id)
            if (q) {
              connectors.push({
                id: `conn-qualifier-${q.id}-${m.id}-bottom`,
                fromPortId: q.outputPortId,
                toPortId: m.inputBottomPortId,
                startX: q.outputPort.x,
                startY: q.outputPort.y,
                endX: m.inputBottomPort.x,
                endY: m.inputBottomPort.y,
                isAdvancing: true,
                isLive: m.isLive,
                robotName: q.robot.name,
              })
            }
          }
        })
      } else if (prevStage?.matches) {
        // Elimination -> Elimination: Connect based on authoritative winner robot ID
        matches.forEach((m, mIdx) => {
          // Top slot source
          let child1 = m.topSlot.participant
            ? prevStage.matches?.find((pm) => pm.winner?.id === m.topSlot.participant?.id)
            : null
          if (!child1) child1 = prevStage.matches ? prevStage.matches[mIdx * 2] : null

          // Bottom slot source
          let child2 = m.bottomSlot.participant
            ? prevStage.matches?.find((pm) => pm.winner?.id === m.bottomSlot.participant?.id)
            : null
          if (!child2) child2 = prevStage.matches ? prevStage.matches[mIdx * 2 + 1] : null

          if (child1) {
            const isAdvancing = Boolean(
              child1.winner &&
              (!m.topSlot.participant || m.topSlot.participant.id === child1.winner.id)
            )
            connectors.push({
              id: `conn-${child1.id}-${m.id}-top`,
              fromPortId: child1.outputPortId,
              toPortId: m.inputTopPortId,
              startX: child1.outputPort.x,
              startY: child1.outputPort.y,
              endX: m.inputTopPort.x,
              endY: m.inputTopPort.y,
              isAdvancing,
              isLive: m.isLive,
              robotName: child1.winner?.name,
            })
          }

          if (child2) {
            const isAdvancing = Boolean(
              child2.winner &&
              (!m.bottomSlot.participant || m.bottomSlot.participant.id === child2.winner.id)
            )
            connectors.push({
              id: `conn-${child2.id}-${m.id}-bottom`,
              fromPortId: child2.outputPortId,
              toPortId: m.inputBottomPortId,
              startX: child2.outputPort.x,
              startY: child2.outputPort.y,
              endX: m.inputBottomPort.x,
              endY: m.inputBottomPort.y,
              isAdvancing,
              isLive: m.isLive,
              robotName: child2.winner?.name,
            })
          }
        })
      }

      stages.push({
        id: raw.id,
        title: raw.title,
        phaseNumber: phaseCounter++,
        stageType: raw.stageType,
        roundNumber: raw.roundNumber,
        status: raw.status,
        isCurrent: raw.isCurrent,
        x,
        width,
        matches,
      })
    }
  }

  // 4. CHAMPION POD COLUMN
  let champion: TournamentTreeData['champion'] = null
  const finalStage = stages.find((s) => s.stageType === 'final')

  if (finalStage && finalStage.matches && finalStage.matches[0]) {
    const finalMatch = finalStage.matches[0]
    const champX = currentX
    currentX += CHAMPION_WIDTH + STAGE_GAP
    const champY = finalMatch.y
    const champWidth = CHAMPION_WIDTH
    const champHeight = 150
    const champPortId = 'champion-pod-in'

    maxCanvasHeight = Math.max(maxCanvasHeight, champY + champHeight / 2 + 40)

    if (finalMatch.winner) {
      const winnerRobot: Robot = tournament.winner ?? {
        id: finalMatch.winner.id,
        name: finalMatch.winner.name,
        club: finalMatch.winner.club,
        institution: finalMatch.winner.institution,
        status: 'active',
        eliminatedRound: null,
        wins: 1,
      }

      champion = {
        robot: winnerRobot,
        wins: tournament.winner ? tournament.winner.wins : 1,
        x: champX,
        y: champY,
        width: champWidth,
        height: champHeight,
        inputPort: { x: champX, y: champY },
        inputPortId: champPortId,
      }

      connectors.push({
        id: 'conn-final-champion',
        fromPortId: finalMatch.outputPortId,
        toPortId: champPortId,
        startX: finalMatch.outputPort.x,
        startY: finalMatch.outputPort.y,
        endX: champX,
        endY: champY,
        isAdvancing: true,
        isLive: false,
        robotName: finalMatch.winner.name,
      })
    } else {
      champion = {
        robot: {
          id: 'tbd',
          name: 'Tournament Champion',
          club: 'Awaiting Final Duel',
          institution: null,
          status: 'active',
          eliminatedRound: null,
          wins: 0,
        },
        wins: 0,
        x: champX,
        y: champY,
        width: champWidth,
        height: champHeight,
        inputPort: { x: champX, y: champY },
        inputPortId: champPortId,
      }

      connectors.push({
        id: 'conn-final-champion-pending',
        fromPortId: finalMatch.outputPortId,
        toPortId: champPortId,
        startX: finalMatch.outputPort.x,
        startY: finalMatch.outputPort.y,
        endX: champX,
        endY: champY,
        isAdvancing: false,
        isLive: finalMatch.isLive,
      })
    }
  }

  return {
    canvasWidth: Math.max(1100, currentX + 40),
    canvasHeight: Math.max(560, maxCanvasHeight + 60),
    stages,
    connectors,
    champion,
  }
}
