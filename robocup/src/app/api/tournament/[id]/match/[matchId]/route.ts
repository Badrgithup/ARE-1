import { NextRequest, NextResponse } from 'next/server'
import { mutateTournament, loadTournament } from '@/lib/tournament-repository'
import { recordMatchResult, undoMatchResult, completeRound, isMatchTerminal } from '@/lib/tournament-engine'
import type { Tournament } from '@/lib/types'

/**
 * Find the round that contains a given match.
 * Returns the round ID, or null if not found.
 */
function findRoundIdForMatch(tournament: Tournament, matchId: string): string | null {
  for (const round of tournament.rounds) {
    if (round.matches.some((m) => m.id === matchId)) {
      return round.id
    }
  }
  return null
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  const status = error instanceof Error && error.name === 'TournamentNotFoundError' ? 404 : message.includes('not found') ? 404 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

/**
 * Admin command: record the winner of a match.
 * The server applies the tournament engine, auto-completes the round when every match is terminal,
 * persists, and broadcasts the new authoritative state to every connected client.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id, matchId } = await params
    const body = await request.json()
    const { winnerId } = body

    if (!winnerId) {
      return NextResponse.json({ success: false, error: 'winnerId is required' }, { status: 400 })
    }

    // Validate before taking the lock so we can return a clear 404
    const existing = await loadTournament(id)
    if (!findRoundIdForMatch(existing, matchId)) {
      return NextResponse.json({ success: false, error: 'Match not found in any round' }, { status: 404 })
    }

    const saved = await mutateTournament(id, (tournament) => {
      const roundId = findRoundIdForMatch(tournament, matchId)
      if (!roundId) throw new Error('Match not found in any round')

      let updated = recordMatchResult(tournament, roundId, matchId, winnerId)
      const round = updated.rounds.find((r) => r.id === roundId)
      if (round && round.matches.every(isMatchTerminal)) {
        updated = completeRound(updated, roundId)
      }
      return updated
    })

    return NextResponse.json({ success: true, data: saved })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export const POST = PUT

/**
 * Admin command: undo a recorded match result (within the undo window).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id, matchId } = await params
    const existing = await loadTournament(id)
    if (!findRoundIdForMatch(existing, matchId)) {
      return NextResponse.json({ success: false, error: 'Match not found in any round' }, { status: 404 })
    }

    const saved = await mutateTournament(id, (tournament) => {
      const roundId = findRoundIdForMatch(tournament, matchId)
      if (!roundId) throw new Error('Match not found in any round')
      return undoMatchResult(tournament, roundId, matchId)
    })

    return NextResponse.json({ success: true, data: saved })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
