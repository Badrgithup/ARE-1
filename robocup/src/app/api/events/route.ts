import { NextRequest } from 'next/server'
import {
  subscribeArenaEvents,
  getActiveTournamentId,
  ArenaEvent,
} from '@/lib/tournament-events'
import { loadTournament } from '@/lib/tournament-repository'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filterId = searchParams.get('id')

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false

      const send = (data: object) => {
        if (isClosed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          cleanup()
        }
      }

      const sendComment = (comment: string) => {
        if (isClosed) return
        try {
          controller.enqueue(encoder.encode(`: ${comment}\n\n`))
        } catch {
          cleanup()
        }
      }

      // 1. Send initial state on connection
      try {
        const targetId = filterId || getActiveTournamentId()
        if (targetId) {
          try {
            const current = await loadTournament(targetId)
            if (current) {
              send({ type: 'tournament', tournament: current })
            }
          } catch {
            // Not found or corrupted, continue
          }
        }
        send({ type: 'active', id: getActiveTournamentId() })
      } catch (err) {
        console.error('Error sending initial SSE tournament state:', err)
      }

      // 2. Subscribe to server event bus
      const unsubscribe = subscribeArenaEvents((event: ArenaEvent) => {
        if (isClosed) return
        if (event.type === 'tournament') {
          if (!filterId || event.tournament.id === filterId) {
            send(event)
          }
        } else if (event.type === 'active') {
          send(event)
          if (!filterId && event.id) {
            loadTournament(event.id)
              .then((newlyActive) => {
                if (newlyActive) {
                  send({ type: 'tournament', tournament: newlyActive })
                }
              })
              .catch(() => {})
          }
        } else if (event.type === 'deleted') {
          send(event)
        }
      })

      // 3. Heartbeat every 15s to keep connection alive
      const heartbeatInterval = setInterval(() => {
        sendComment('heartbeat')
      }, 15000)

      const cleanup = () => {
        if (isClosed) return
        isClosed = true
        clearInterval(heartbeatInterval)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Ignore close errors
        }
      }

      request.signal.addEventListener('abort', () => {
        cleanup()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
