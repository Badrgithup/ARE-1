import fs from 'fs/promises'
import path from 'path'
import { Tournament, TournamentSummary, TournamentNotFoundError } from './types'
import { DATA_DIR } from './constants'
import { formatTimestamp, generateId } from './utils'
import { publishTournament, publishDeleted, setActiveTournamentId } from './tournament-events'

// Global singleton cache across Next.js HMR reloads
declare global {
  // eslint-disable-next-line no-var
  var __robocup_tournament_cache: Map<string, Tournament> | undefined
  // eslint-disable-next-line no-var
  var __robocup_index_cache: TournamentSummary[] | undefined
}

const memoryCache: Map<string, Tournament> = globalThis.__robocup_tournament_cache ?? new Map()
globalThis.__robocup_tournament_cache = memoryCache

let indexCache: TournamentSummary[] | null = globalThis.__robocup_index_cache ?? null

// Mutex queue to serialize writes per tournament
const writeQueues = new Map<string, Promise<void>>()

const getDir = () => path.join(process.cwd(), DATA_DIR)
const getIndexFilePath = () => path.join(process.cwd(), 'data', 'tournaments-index.json')

/**
 * Extract summary metadata from a full Tournament object
 */
export function extractSummary(t: Tournament): TournamentSummary {
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    totalRobots: t.totalRobots,
    currentRound: t.currentRound,
    currentStage: t.currentStage,
    winner: t.winner,
    startTime: t.startTime,
    endTime: t.endTime,
    updatedAt: formatTimestamp(),
    config: t.config,
  }
}

/**
 * Load or initialize the tournaments metadata index
 */
async function loadIndex(): Promise<TournamentSummary[]> {
  if (indexCache !== null) {
    return indexCache
  }

  const indexPath = getIndexFilePath()
  const dir = getDir()
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.mkdir(dir, { recursive: true })

  try {
    const raw = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(raw) as TournamentSummary[]
    indexCache = parsed
    globalThis.__robocup_index_cache = indexCache
    return indexCache
  } catch {
    // If index file doesn't exist or is corrupted, rebuild it from disk
    const rebuiltIndex = await rebuildIndexFromDisk()
    indexCache = rebuiltIndex
    globalThis.__robocup_index_cache = indexCache
    await persistIndex(indexCache)
    return indexCache
  }
}

/**
 * Safely persist index to disk using atomic write
 */
async function persistIndex(summaries: TournamentSummary[]): Promise<void> {
  const indexPath = getIndexFilePath()
  const tmpPath = `${indexPath}.${Date.now()}.tmp`
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(tmpPath, JSON.stringify(summaries, null, 2), 'utf-8')
  try {
    await fs.rename(tmpPath, indexPath)
  } catch {
    // On Windows, if rename fails when target exists, copy and unlink
    await fs.copyFile(tmpPath, indexPath)
    await fs.unlink(tmpPath).catch(() => {})
  }
}

/**
 * Rebuild index from all JSON files in the data directory
 */
async function rebuildIndexFromDisk(): Promise<TournamentSummary[]> {
  const dir = getDir()
  try {
    const files = await fs.readdir(dir)
    const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
    const list: TournamentSummary[] = []

    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(dir, file), 'utf-8')
        const t = JSON.parse(raw) as Tournament
        if (t.id && t.name) {
          list.push(extractSummary(t))
        }
      } catch {
        // Skip unreadable files
      }
    }

    list.sort((a, b) => new Date(b.updatedAt || b.startTime).getTime() - new Date(a.updatedAt || a.startTime).getTime())
    return list
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return []
    }
    throw err
  }
}

/**
 * Save tournament with in-memory write-through cache and safe atomic disk write.
 *
 * Stamps a monotonic `revision` and publishes the authoritative state to every
 * connected client (Admin + Projector, any device on the LAN).
 * Returns the stamped tournament that was persisted.
 */
export async function saveTournament(tournament: Tournament): Promise<Tournament> {
  const previousOp = writeQueues.get(tournament.id) || Promise.resolve()
  let resolveCurrent: () => void = () => {}
  const currentOp = new Promise<void>((res) => {
    resolveCurrent = res
  })
  writeQueues.set(tournament.id, currentOp)

  try {
    await previousOp

    const previousRevision = memoryCache.get(tournament.id)?.revision ?? 0
    const stamped: Tournament = {
      ...tournament,
      revision: Math.max(previousRevision, tournament.revision ?? 0) + 1,
      updatedAt: formatTimestamp(),
    }

    // 1. Instant update in memory cache (0ms lookup for current session)
    memoryCache.set(stamped.id, stamped)

    // 2. Atomic write to disk with collision-proof tmp file
    const dir = getDir()
    await fs.mkdir(dir, { recursive: true })
    const filepath = path.join(dir, `${stamped.id}.json`)
    const tmpFile = `${filepath}.${Date.now()}-${generateId()}.tmp`

    await fs.writeFile(tmpFile, JSON.stringify(stamped, null, 2), 'utf-8')
    try {
      await fs.rename(tmpFile, filepath)
    } catch {
      await fs.copyFile(tmpFile, filepath)
      await fs.unlink(tmpFile).catch(() => {})
    }

    // 3. Update index cache and persist
    const index = await loadIndex()
    const summary = extractSummary(stamped)
    const existingIdx = index.findIndex((s) => s.id === stamped.id)

    if (existingIdx !== -1) {
      index[existingIdx] = summary
    } else {
      index.unshift(summary)
    }

    indexCache = index
    globalThis.__robocup_index_cache = indexCache
    await persistIndex(index)

    // 4. Push authoritative state to all connected clients
    publishTournament(stamped)
    return stamped
  } finally {
    resolveCurrent()
    if (writeQueues.get(tournament.id) === currentOp) {
      writeQueues.delete(tournament.id)
    }
  }
}

// Per-tournament mutation lock: guarantees load -> modify -> save is atomic
const mutationLocks = new Map<string, Promise<unknown>>()

/**
 * Apply a server-side command to a tournament atomically.
 * Concurrent commands for the same tournament are executed strictly one after another,
 * so two near-simultaneous match results can never overwrite each other.
 * The mutated tournament also becomes the "active" tournament followed by /projector.
 */
export async function mutateTournament(
  id: string,
  mutate: (current: Tournament) => Tournament | Promise<Tournament>
): Promise<Tournament> {
  const previous = mutationLocks.get(id) ?? Promise.resolve()
  const run = previous
    .catch(() => {})
    .then(async () => {
      const current = await loadTournament(id)
      const next = await mutate(current)
      const saved = await saveTournament(next)
      setActiveTournamentId(saved.id)
      return saved
    })
  mutationLocks.set(id, run)
  try {
    return await run
  } finally {
    if (mutationLocks.get(id) === run) {
      mutationLocks.delete(id)
    }
  }
}

/**
 * Load tournament (memory cache first, fallback to disk)
 */
export async function loadTournament(id: string): Promise<Tournament> {
  // Check memory cache
  const cached = memoryCache.get(id)
  if (cached) {
    return cached
  }

  // Fallback to disk
  const filepath = path.join(getDir(), `${id}.json`)
  try {
    const raw = await fs.readFile(filepath, 'utf-8')
    const tournament = JSON.parse(raw) as Tournament
    memoryCache.set(id, tournament)
    return tournament
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new TournamentNotFoundError(`Tournament with id ${id} not found`)
    }
    throw err
  }
}

export const getTournamentById = loadTournament

/**
 * Fast indexed listing with in-memory filtering (O(1) memory lookup)
 */
export async function listTournaments(filter?: {
  status?: string
  search?: string
}): Promise<TournamentSummary[]> {
  const index = await loadIndex()

  return index.filter((item) => {
    if (filter?.status && filter.status !== 'all') {
      if (item.status !== filter.status) return false
    }
    if (filter?.search && filter.search.trim()) {
      const q = filter.search.toLowerCase().trim()
      const nameMatch = item.name.toLowerCase().includes(q)
      const winnerMatch = item.winner?.name.toLowerCase().includes(q) || item.winner?.club.toLowerCase().includes(q)
      if (!nameMatch && !winnerMatch) return false
    }
    return true
  })
}

/**
 * Delete tournament from disk, memory cache, and metadata index
 */
export async function deleteTournament(id: string): Promise<void> {
  // 1. Remove from memory cache
  memoryCache.delete(id)

  // 2. Remove file from disk
  const filepath = path.join(getDir(), `${id}.json`)
  try {
    await fs.unlink(filepath)
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err
    }
  }

  // 3. Update index
  const index = await loadIndex()
  const updated = index.filter((item) => item.id !== id)
  indexCache = updated
  globalThis.__robocup_index_cache = indexCache
  await persistIndex(updated)
  publishDeleted(id)
}

/**
 * Generate CSV export text for a tournament
 */
export function exportTournamentToCsv(tournament: Tournament): string {
  const lines: string[] = []
  lines.push(`Tournament: ${tournament.name}`)
  lines.push(`Status: ${tournament.status}`)
  lines.push(`Start Time: ${tournament.startTime}`)
  lines.push(`End Time: ${tournament.endTime || 'In Progress'}`)
  lines.push(`Total Robots: ${tournament.totalRobots}`)
  if (tournament.winner) {
    lines.push(`Champion: ${tournament.winner.name} (${tournament.winner.club})`)
  }
  lines.push('')
  lines.push('--- ROSTER ---')
  lines.push('ID,Name,Club,Institution,Status,Wins')
  for (const r of tournament.robots) {
    lines.push(`"${r.id}","${r.name}","${r.club}","${r.institution || ''}","${r.status}",${r.wins}`)
  }
  lines.push('')
  lines.push('--- MATCHES ---')
  lines.push('Round,Stage,Match,Robot 1,Robot 2,Winner,Status')
  for (const round of tournament.rounds) {
    for (const m of round.matches) {
      const r1 = m.robot1 ? `"${m.robot1.name} (${m.robot1.club})"` : 'BYE'
      const r2 = m.robot2 ? `"${m.robot2.name} (${m.robot2.club})"` : 'BYE'
      const w = m.winner ? `"${m.winner.name}"` : 'Pending'
      lines.push(`${round.roundNumber},${round.stage || 'elimination'},${m.matchNumber},${r1},${r2},${w},${m.status}`)
    }
  }
  return lines.join('\n')
}

/**
 * Diagnostics information for self-debugging and health inspection
 */
export async function getLocalDiagnostics() {
  const start = performance.now()
  const dir = getDir()
  const indexPath = getIndexFilePath()

  let diskAccessible = false
  let indexSize = 0
  let fileCount = 0

  try {
    await fs.mkdir(dir, { recursive: true })
    const files = await fs.readdir(dir)
    fileCount = files.filter((f) => f.endsWith('.json')).length
    diskAccessible = true
  } catch {
    diskAccessible = false
  }

  const index = await loadIndex()
  indexSize = index.length

  const latencyMs = Number((performance.now() - start).toFixed(2))

  return {
    status: diskAccessible ? 'healthy' : 'degraded',
    memoryCacheCount: memoryCache.size,
    indexCount: indexSize,
    diskFileCount: fileCount,
    diskAccessible,
    storagePath: dir,
    indexPath,
    latencyMs,
    timestamp: formatTimestamp(),
  }
}
