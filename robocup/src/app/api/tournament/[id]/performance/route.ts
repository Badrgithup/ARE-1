import { NextRequest, NextResponse } from 'next/server'
import { mutateTournament } from '@/lib/tournament-repository'
import { recordRobotPerformance } from '@/lib/individual-performance-engine'
import { broadcastTournamentUpdate } from '@/lib/tournament-sync'

/**
 * Record judge input for an individual robot performance.
 * Body: { robotId: string, time: number, points: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { robotId, time, points } = body as {
      robotId?: string
      time?: number | string
      points?: number | string
    }

    if (!robotId || time === undefined || points === undefined) {
      return NextResponse.json(
        { success: false, error: 'robotId, time, and points are required' },
        { status: 400 }
      )
    }

    const numTime = parseFloat(String(time))
    const numPoints = parseInt(String(points), 10)

    if (isNaN(numTime) || isNaN(numPoints) || numTime < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid time or points values' },
        { status: 400 }
      )
    }

    const saved = await mutateTournament(id, (tournament) => {
      return recordRobotPerformance(tournament, robotId, numTime, numPoints)
    })

    // Broadcast change to remote clients (including projector)
    broadcastTournamentUpdate(saved)

    return NextResponse.json({ success: true, data: saved })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = error instanceof Error && error.name === 'TournamentNotFoundError' ? 404 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
