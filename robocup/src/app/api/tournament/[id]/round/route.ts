import { NextRequest, NextResponse } from 'next/server'
import { mutateTournament } from '@/lib/tournament-repository'
import {
  startNewRound,
  startGroupStageRound,
  advanceFromGroupStage,
  advanceFromSemifinals,
  completeRound,
  reshuffleCurrentRound,
} from '@/lib/tournament-engine'

/**
 * Admin command endpoint for round/stage transitions.
 *
 * body.action:
 *  - 'start_next_round' (default) { batchSize? }
 *  - 'start_group_stage'          { format: '2-to-final' | '4-to-final' }
 *  - 'advance_from_group'
 *  - 'advance_from_semis'
 *  - 'complete_round'
 *  - 'reshuffle'                  { batchSize? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { batchSize, action, format } = body as {
      batchSize?: number
      action?: string
      format?: '2-to-final' | '4-to-final'
    }

    const saved = await mutateTournament(id, (tournament) => {
      switch (action) {
        case 'start_group_stage':
          return startGroupStageRound(tournament, format || '2-to-final')
        case 'advance_from_group':
          return advanceFromGroupStage(tournament)
        case 'advance_from_semis':
          return advanceFromSemifinals(tournament)
        case 'complete_round': {
          const currentRound = tournament.rounds[tournament.rounds.length - 1]
          return currentRound ? completeRound(tournament, currentRound.id) : tournament
        }
        case 'reshuffle':
          return reshuffleCurrentRound(tournament, batchSize)
        case 'start_next_round':
        case undefined:
          return startNewRound(tournament, batchSize)
        default:
          throw new Error(`Unknown round action: ${action}`)
      }
    })

    return NextResponse.json({ success: true, data: saved })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = error instanceof Error && error.name === 'TournamentNotFoundError' ? 404 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
