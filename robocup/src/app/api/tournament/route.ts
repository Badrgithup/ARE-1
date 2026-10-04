import { NextRequest, NextResponse } from 'next/server'
import { initializeTournament } from '@/lib/tournament-engine'
import { saveTournament, listTournaments } from '@/lib/tournament-repository'
import { setActiveTournamentId } from '@/lib/tournament-events'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, robots, batchSize, config } = body

    if (!name || !robots || !Array.isArray(robots) || robots.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Invalid payload: At least 2 robots and a name are required.' },
        { status: 400 }
      )
    }

    const effectiveConfig =
      config ||
      (robots.length >= 5 && robots.length <= 9
        ? {
            groupStageEnabled: true,
            finalFormat: '2-to-final',
            timestamp: new Date().toISOString(),
          }
        : undefined)

    const tournament = initializeTournament(robots, name, batchSize, effectiveConfig)
    const saved = await saveTournament(tournament)
    setActiveTournamentId(saved.id)

    return NextResponse.json({ success: true, data: saved }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || undefined
    const search = searchParams.get('search') || undefined

    const tournaments = await listTournaments({ status, search })
    return NextResponse.json({ success: true, data: tournaments })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
