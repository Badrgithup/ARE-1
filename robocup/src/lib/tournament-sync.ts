import type { Tournament } from './types'

export const SYNC_CHANNEL_NAME = 'robocup_arena_sync'
export const ACTIVE_TOURNAMENT_KEY = 'robocup_active_tournament_id'
export const TOURNAMENT_STORAGE_PREFIX = 'robocup_tournament_'

export type TournamentSyncMessage =
  | {
      type: 'TOURNAMENT_UPDATED'
      id: string
      tournament: Tournament
      timestamp: number
    }
  | {
      type: 'ACTIVE_TOURNAMENT_CHANGED'
      id: string
      tournament?: Tournament
      timestamp: number
    }

/**
 * Broadcast an updated tournament snapshot to all open tabs/windows
 * and persist to localStorage for cross-tab storage events.
 */
export function broadcastTournamentUpdate(tournament: Tournament): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(`${TOURNAMENT_STORAGE_PREFIX}${tournament.id}`, JSON.stringify(tournament))
    localStorage.setItem(ACTIVE_TOURNAMENT_KEY, tournament.id)
    localStorage.setItem('robocup_last_sync_ts', String(Date.now()))
  } catch (err) {
    console.warn('Failed to write to localStorage for tournament sync:', err)
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME)
      channel.postMessage({
        type: 'TOURNAMENT_UPDATED',
        id: tournament.id,
        tournament,
        timestamp: Date.now(),
      } satisfies TournamentSyncMessage)
      channel.close()
    } catch (err) {
      console.warn('Failed to postMessage via BroadcastChannel:', err)
    }
  }
}

/**
 * Broadcast that a new active tournament was created or selected.
 */
export function broadcastActiveTournament(id: string, tournament?: Tournament): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(ACTIVE_TOURNAMENT_KEY, id)
    if (tournament) {
      localStorage.setItem(`${TOURNAMENT_STORAGE_PREFIX}${id}`, JSON.stringify(tournament))
    }
    localStorage.setItem('robocup_last_sync_ts', String(Date.now()))
  } catch (err) {
    console.warn('Failed to write active tournament to localStorage:', err)
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME)
      channel.postMessage({
        type: 'ACTIVE_TOURNAMENT_CHANGED',
        id,
        tournament,
        timestamp: Date.now(),
      } satisfies TournamentSyncMessage)
      channel.close()
    } catch (err) {
      console.warn('Failed to postMessage via BroadcastChannel:', err)
    }
  }
}

/**
 * Get active tournament ID from localStorage if available.
 */
export function getActiveTournamentId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(ACTIVE_TOURNAMENT_KEY)
  } catch {
    return null
  }
}

/**
 * Get cached tournament from localStorage.
 */
export function getStoredTournament(id: string): Tournament | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${TOURNAMENT_STORAGE_PREFIX}${id}`)
    if (!raw) return null
    return JSON.parse(raw) as Tournament
  } catch {
    return null
  }
}

/**
 * Subscribes to real-time tournament updates via:
 * 1. Server-Sent Events (SSE) from /api/events for instant LAN/cross-PC updates
 * 2. BroadcastChannel for instant (<1ms) same-browser cross-tab updates
 * 3. window storage events
 * 4. Fallback server polling when EventSource is disconnected
 */
export function subscribeTournamentSync(
  targetTournamentId: string | null,
  onUpdate: (tournament: Tournament) => void,
  onActiveChange?: (newActiveId: string, tournament?: Tournament) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  let isCleanedUp = false
  let currentKnownRevision = 0

  // Helper to handle and apply new tournament data if it's not stale
  const handleIncomingTournament = (incoming: Tournament) => {
    if (isCleanedUp) return
    if (targetTournamentId && incoming.id !== targetTournamentId) return

    const incomingRev = incoming.revision ?? 0
    if (incomingRev < currentKnownRevision && currentKnownRevision > 0) {
      // Ignore stale snapshot
      return
    }

    currentKnownRevision = Math.max(currentKnownRevision, incomingRev)

    try {
      localStorage.setItem(`${TOURNAMENT_STORAGE_PREFIX}${incoming.id}`, JSON.stringify(incoming))
      localStorage.setItem(ACTIVE_TOURNAMENT_KEY, incoming.id)
    } catch {
      // Storage quota or private browsing
    }

    onUpdate(incoming)
  }

  // 1. Same-device cross-tab BroadcastChannel
  let channel: BroadcastChannel | null = null
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL_NAME)
      channel.onmessage = (event: MessageEvent<TournamentSyncMessage>) => {
        const data = event.data
        if (!data || !data.type) return

        if (data.type === 'TOURNAMENT_UPDATED') {
          handleIncomingTournament(data.tournament)
        } else if (data.type === 'ACTIVE_TOURNAMENT_CHANGED') {
          if (onActiveChange) {
            onActiveChange(data.id, data.tournament)
          }
        }
      }
    } catch (err) {
      console.warn('Could not initialize BroadcastChannel:', err)
    }
  }

  // 2. Cross-tab storage event listener
  const handleStorage = (e: StorageEvent) => {
    if (!e.key) return

    if (e.key === ACTIVE_TOURNAMENT_KEY && e.newValue) {
      if (onActiveChange) {
        onActiveChange(e.newValue)
      }
    }

    const currentTargetId = targetTournamentId || getActiveTournamentId()
    if (currentTargetId && e.key === `${TOURNAMENT_STORAGE_PREFIX}${currentTargetId}` && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue) as Tournament
        handleIncomingTournament(parsed)
      } catch {
        // ignore parse error
      }
    }
  }
  window.addEventListener('storage', handleStorage)

  // 3. Server-Sent Events (SSE) for Real-Time LAN & Cross-PC Synchronization
  let eventSource: EventSource | null = null
  let sseConnected = false

  const initSSE = () => {
    if (typeof EventSource === 'undefined') return

    try {
      const sseUrl = targetTournamentId
        ? `/api/events?id=${encodeURIComponent(targetTournamentId)}`
        : '/api/events'

      eventSource = new EventSource(sseUrl)

      eventSource.onopen = () => {
        sseConnected = true
      }

      eventSource.onmessage = (event) => {
        if (!event.data) return
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'tournament' && payload.tournament) {
            handleIncomingTournament(payload.tournament)
          } else if (payload.type === 'active' && payload.id) {
            if (onActiveChange) {
              onActiveChange(payload.id)
            }
          }
        } catch (err) {
          console.warn('Failed to parse SSE payload:', err)
        }
      }

      eventSource.onerror = () => {
        sseConnected = false
        // Browser automatically attempts reconnect with exponential backoff
      }
    } catch (err) {
      console.warn('SSE failed to initialize:', err)
      sseConnected = false
    }
  }

  initSSE()

  // 4. Polling Fallback (runs every 1500ms when SSE is down, or every 4000ms as a safety check)
  const pollInterval = setInterval(async () => {
    if (isCleanedUp) return

    // If SSE is connected, keep poll interval relaxed as a safety net
    const currentId = targetTournamentId || getActiveTournamentId()
    if (!currentId) return

    try {
      const res = await fetch(`/api/tournament/${currentId}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      if (json.success && json.data) {
        const remote = json.data as Tournament
        const remoteRev = remote.revision ?? 0
        if (remoteRev > currentKnownRevision || !currentKnownRevision) {
          handleIncomingTournament(remote)
        }
      }
    } catch {
      // Network hiccup
    }
  }, 2000)

  return () => {
    isCleanedUp = true
    if (channel) {
      channel.close()
    }
    if (eventSource) {
      eventSource.close()
    }
    window.removeEventListener('storage', handleStorage)
    clearInterval(pollInterval)
  }
}
