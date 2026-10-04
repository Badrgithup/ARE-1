import { NextRequest, NextResponse } from 'next/server'
import { loadTournament, mutateTournament, deleteTournament } from '@/lib/tournament-repository'
import type { Tournament } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const tournament = await loadTournament(id)
    return NextResponse.json({ success: true, data: tournament })
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TournamentNotFoundError') {
      return NextResponse.json({ success: false, error: 'Tournament not found' }, { status: 404 })
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * Full snapshot replacement (legacy / recovery path).
 * The Admin UI no longer uses this — it sends commands instead.
 * Guarded by optimistic concurrency: a snapshot built from an older revision is rejected (409)
 * so a stale tab can never overwrite newer authoritative state.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const incoming = (await request.json()) as Tournament

    if (incoming.id !== id) {
      return NextResponse.json({ success: false, error: 'ID mismatch' }, { status: 400 })
    }

    let conflict = false
    const saved = await mutateTournament(id, (current) => {
      if (typeof incoming.revision === 'number' && (current.revision ?? 0) > incoming.revision) {
        conflict = true
        return current
      }
      return incoming
    })

    if (conflict) {
      return NextResponse.json(
        { success: false, error: 'Stale snapshot rejected: tournament has a newer revision', data: saved },
        { status: 409 }
      )
    }
    return NextResponse.json({ success: true, data: saved })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await deleteTournament(id)
    return NextResponse.json({ success: true, message: `Tournament ${id} deleted successfully` })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
