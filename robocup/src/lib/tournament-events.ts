import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import type { Tournament } from './types'

/**
 * Server-side real-time bus.
 *
 * The server is the single source of truth. Every successful write goes through
 * `saveTournament()` which calls `publishTournament()`. Connected clients
 * (Admin PC, Projector PC) receive the new state through the SSE endpoint
 * `/api/events`.
 *
 * A globalThis singleton is used because Next.js may bundle route handlers
 * separately while still running them in the same Node process.
 */

export type ArenaEvent =
  | { type: 'tournament'; tournament: Tournament }
  | { type: 'deleted'; id: string }
  | { type: 'active'; id: string | null }

declare global {
  // eslint-disable-next-line no-var
  var __robocup_event_bus: EventEmitter | undefined
  // eslint-disable-next-line no-var
  var __robocup_active_id: string | null | undefined
}

const bus: EventEmitter = globalThis.__robocup_event_bus ?? new EventEmitter()
bus.setMaxListeners(200)
globalThis.__robocup_event_bus = bus

const ACTIVE_FILE = () => path.join(process.cwd(), 'data', 'active-tournament.json')

export function subscribeArenaEvents(listener: (event: ArenaEvent) => void): () => void {
  bus.on('arena', listener)
  return () => {
    bus.off('arena', listener)
  }
}

function emit(event: ArenaEvent) {
  bus.emit('arena', event)
}

export function publishTournament(tournament: Tournament) {
  emit({ type: 'tournament', tournament })
}

export function publishDeleted(id: string) {
  if (getActiveTournamentId() === id) {
    setActiveTournamentId(null)
  }
  emit({ type: 'deleted', id })
}

/**
 * The "active" tournament is the one the Projector at /projector follows.
 * Definition: the tournament most recently created, mutated, or opened in the Admin view.
 */
export function getActiveTournamentId(): string | null {
  if (globalThis.__robocup_active_id !== undefined) {
    return globalThis.__robocup_active_id
  }
  try {
    const raw = fs.readFileSync(ACTIVE_FILE(), 'utf-8')
    const parsed = JSON.parse(raw) as { id: string | null }
    globalThis.__robocup_active_id = parsed.id ?? null
  } catch {
    globalThis.__robocup_active_id = null
  }
  return globalThis.__robocup_active_id ?? null
}

export function setActiveTournamentId(id: string | null) {
  if (globalThis.__robocup_active_id === id) return
  globalThis.__robocup_active_id = id
  try {
    fs.mkdirSync(path.dirname(ACTIVE_FILE()), { recursive: true })
    fs.writeFileSync(ACTIVE_FILE(), JSON.stringify({ id }), 'utf-8')
  } catch {
    // Non-fatal: active pointer stays in memory
  }
  emit({ type: 'active', id })
}
