'use client'

import { useState, useEffect } from 'react'
import type { Tournament, Robot, TournamentConfig } from '@/lib/types'
import {
  recordMatchResult,
  undoMatchResult,
  completeRound,
  startNewRound,
  reshuffleCurrentRound,
  isMatchTerminal,
  startGroupStageRound,
  advanceFromGroupStage,
  advanceFromSemifinals,
} from '@/lib/tournament-engine'
import {
  broadcastTournamentUpdate,
  broadcastActiveTournament,
  getStoredTournament,
  subscribeTournamentSync,
} from '@/lib/tournament-sync'

export function useTournament(tournamentId: string | null) {
  const [tournament, setTournament] = useState<Tournament | null>(() => {
    if (tournamentId) {
      return getStoredTournament(tournamentId)
    }
    return null
  })
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(!tournament)
  const [error, setError] = useState<string | null>(null)
  const [lastRecordedMatchId, setLastRecordedMatchId] = useState<string | null>(null)

  const loadTournament = async () => {
    if (!tournamentId) return
    if (!tournament) setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/tournament/${tournamentId}`)
      const json = await response.json()
      if (json.success) {
        setTournament(json.data)
        broadcastTournamentUpdate(json.data)
      } else {
        setError(json.error || 'Failed to load tournament')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const createTournament = async (
    name: string,
    robots: Robot[],
    batchSize?: number,
    config?: TournamentConfig
  ) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, robots, batchSize, config }),
      })
      const json = await response.json()
      if (json.success) {
        setTournament(json.data)
        broadcastActiveTournament(json.data.id, json.data)
        return json.data.id
      } else {
        throw new Error(json.error || 'Failed to create tournament')
      }
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const selectWinner = async (matchId: string, winnerId: string) => {
    if (!tournamentId || !tournament) return

    const round = tournament.rounds[tournament.rounds.length - 1]
    if (!round) return

    // 1. Synchronous Instant Optimistic Update (0ms latency for Admin UI)
    let updatedTournament = recordMatchResult(tournament, round.id, matchId, winnerId)
    const currentRoundMatches = updatedTournament.rounds.find((r) => r.id === round.id)?.matches || []
    
    // Check if all matches in round are terminal ('recorded' or 'locked')
    if (currentRoundMatches.every((m) => isMatchTerminal(m))) {
      updatedTournament = completeRound(updatedTournament, round.id)
    }

    // Apply immediately to state and broadcast to all windows/tabs
    setTournament(updatedTournament)
    setLastRecordedMatchId(matchId)
    setCurrentMatchIndex((prev) => prev + 1)
    broadcastTournamentUpdate(updatedTournament)

    // 2. Authoritative Server Mutation (serial queue + atomic save + SSE broadcast)
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/match/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId, roundId: round.id }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setTournament(json.data)
        broadcastTournamentUpdate(json.data)
      }
    } catch (err) {
      console.error('Failed to sync match result with server:', err)
    }
  }

  const undoMatch = async (matchId: string) => {
    if (!tournamentId || !tournament) return

    const round = tournament.rounds[tournament.rounds.length - 1]
    if (!round) return

    // 1. Synchronous Instant Optimistic Undo
    const updatedTournament = undoMatchResult(tournament, round.id, matchId)
    setTournament(updatedTournament)
    setLastRecordedMatchId(null)
    setCurrentMatchIndex((prev) => Math.max(0, prev - 1))
    broadcastTournamentUpdate(updatedTournament)

    // 2. Authoritative Server Undo
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/match/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo', roundId: round.id }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setTournament(json.data)
        broadcastTournamentUpdate(json.data)
      }
    } catch (err) {
      console.error('Failed to sync undo with server:', err)
    }
  }

  const startNextRound = async (batchSize?: number) => {
    if (!tournamentId || !tournament) return
    setIsLoading(true)
    try {
      // Advance using authoritative server round route
      const res = await fetch(`/api/tournament/${tournamentId}/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_next_round', batchSize }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setTournament(json.data)
        setCurrentMatchIndex(0)
        broadcastTournamentUpdate(json.data)
      } else {
        throw new Error(json.error || 'Failed to start next round')
      }
    } catch (err: any) {
      setError(err.message)
      await loadTournament()
    } finally {
      setIsLoading(false)
    }
  }

  const startGroupStage = async (format: '2-to-final' | '4-to-final') => {
    if (!tournamentId || !tournament) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_group_stage', format }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setTournament(json.data)
        setCurrentMatchIndex(0)
        broadcastTournamentUpdate(json.data)
      } else {
        throw new Error(json.error || 'Failed to start group stage')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const advanceFromGroup = async () => {
    if (!tournamentId || !tournament) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance_from_group' }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setTournament(json.data)
        setCurrentMatchIndex(0)
        broadcastTournamentUpdate(json.data)
      } else {
        throw new Error(json.error || 'Failed to advance from group stage')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const advanceFromSemis = async () => {
    if (!tournamentId || !tournament) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance_from_semis' }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setTournament(json.data)
        setCurrentMatchIndex(0)
        broadcastTournamentUpdate(json.data)
      } else {
        throw new Error(json.error || 'Failed to advance from semifinals')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const startIndividualPerformance = async () => {
    if (!tournamentId || !tournament) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_individual_performance' }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setTournament(json.data)
        broadcastTournamentUpdate(json.data)
      } else {
        throw new Error(json.error || 'Failed to start individual performance mode')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const recordPerformance = async (robotId: string, time: number, points: number) => {
    if (!tournamentId || !tournament) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/performance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ robotId, time, points }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setTournament(json.data)
        broadcastTournamentUpdate(json.data)
      } else {
        throw new Error(json.error || 'Failed to record performance')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const reRandomize = async (batchSize?: number) => {
    if (!tournamentId || !tournament) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reshuffle', batchSize }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setTournament(json.data)
        setCurrentMatchIndex(0)
        broadcastTournamentUpdate(json.data)
      } else {
        throw new Error(json.error || 'Failed to reshuffle round')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const currentRound = tournament?.rounds[tournament.rounds.length - 1] ?? null
  // Reference match directly from the round's matches array
  const currentMatch = currentRound?.matches[currentMatchIndex] ?? null
  // Derive active batch from current match
  const currentBatch = currentRound?.batches.find(b => b.matches.some(m => m.id === currentMatch?.id)) ?? currentRound?.batches[currentRound?.activeBatchIndex ?? 0] ?? null
  const isChampionDetermined = tournament?.status === 'completed'

  // Subscribe to real-time updates across browser tabs and windows
  useEffect(() => {
    if (!tournamentId) return

    const unsubscribe = subscribeTournamentSync(tournamentId, (syncedTournament) => {
      setTournament((prev) => {
        // Only update if there is actual difference in version/round/matches
        if (!prev) return syncedTournament
        if (
          prev.rounds.length !== syncedTournament.rounds.length ||
          prev.status !== syncedTournament.status ||
          prev.winner?.id !== syncedTournament.winner?.id ||
          JSON.stringify(prev) !== JSON.stringify(syncedTournament)
        ) {
          return syncedTournament
        }
        return prev
      })
    })

    return () => {
      unsubscribe()
    }
  }, [tournamentId])

  // Automatically track active pending match index when round advances or matches complete
  useEffect(() => {
    if (!currentRound) return
    const firstPendingIdx = currentRound.matches.findIndex((m) => !m.isBye && m.status === 'pending')
    if (firstPendingIdx !== -1 && currentMatch?.status !== 'pending') {
      setCurrentMatchIndex(firstPendingIdx)
    }
  }, [currentRound?.completedMatches, currentRound?.id, currentMatch?.status])

  useEffect(() => {
    if (tournamentId) loadTournament()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  return {
    tournament, currentRound, currentBatch, currentMatch, currentMatchIndex,
    isLoading, error, lastRecordedMatchId, isChampionDetermined,
    createTournament, loadTournament, selectWinner, undoMatch,
    startNextRound, startGroupStage, advanceFromGroup, advanceFromSemis,
    startIndividualPerformance, recordPerformance,
    reRandomize, setCurrentMatchIndex,
  }
}
