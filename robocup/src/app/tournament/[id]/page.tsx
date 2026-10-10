'use client'

import React, { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useTournament } from '@/hooks/useTournament'
import { useConfetti } from '@/hooks/useConfetti'
import { getTournamentStats } from '@/lib/tournament-engine'
import { calculateGroupStandings, calculateMultiGroupStandings } from '@/lib/group-stage-engine'
import { PairingsOverview } from '@/components/tournament/PairingsOverview'
import { MatchDisplay } from '@/components/tournament/MatchDisplay'
import { UndoButton } from '@/components/tournament/UndoButton'
import { RoundSummary } from '@/components/tournament/RoundSummary'
import { TournamentStats } from '@/components/tournament/TournamentStats'
import { ChampionScreen } from '@/components/tournament/ChampionScreen'
import { TournamentConfigScreen } from '@/components/TournamentConfigScreen'
import { GroupStandingsTable } from '@/components/tournament/GroupStandingsTable'
import { StageTimeline } from '@/components/tournament/StageTimeline'
import { TournamentBracketView } from '@/components/tournament/TournamentBracketView'
import { ArenaPresentationModal } from '@/components/tournament/ArenaPresentationModal'
import { IndividualPerformanceScreen } from '@/components/tournament/IndividualPerformanceScreen'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DEFAULT_BATCH_SIZE } from '@/lib/constants'
import Link from 'next/link'
import { Tv, ExternalLink } from 'lucide-react'
import { broadcastActiveTournament } from '@/lib/tournament-sync'
import type { TournamentConfig } from '@/lib/types'

type TournamentView = 'pairings' | 'match' | 'roundSummary' | 'groupConfig' | 'individualPerformance' | 'champion' | 'bracket' | 'stats'

export default function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const {
    tournament,
    currentRound,
    currentMatch,
    currentMatchIndex,
    isLoading,
    error,
    lastRecordedMatchId,
    isChampionDetermined,
    selectWinner,
    undoMatch,
    startNextRound,
    startGroupStage,
    advanceFromGroup,
    advanceFromSemis,
    startIndividualPerformance,
    recordPerformance,
    reRandomize,
    setCurrentMatchIndex,
  } = useTournament(id)

  const { fireWinner, fireChampion } = useConfetti()

  const [view, setView] = useState<TournamentView>('pairings')
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE)
  const [isArenaModalOpen, setIsArenaModalOpen] = useState(false)

  // Switch to individual performance view when stage is active
  useEffect(() => {
    if (tournament?.currentStage === 'individual_performance') {
      setView('individualPerformance')
    }
  }, [tournament?.currentStage])

  // Switch to champion view when tournament completes
  useEffect(() => {
    if (isChampionDetermined) {
      setView('champion')
      fireChampion()
    }
  }, [isChampionDetermined, fireChampion])

  // Broadcast active tournament on mount/update so projector follows
  useEffect(() => {
    if (tournament) {
      broadcastActiveTournament(tournament.id, tournament)
    }
  }, [tournament])

  // Check if current round is complete to show round summary
  useEffect(() => {
    if (currentRound?.status === 'completed' && view === 'match' && !isChampionDetermined) {
      setView('roundSummary')
    }
  }, [currentRound?.status, view, isChampionDetermined])

  const handleSelectWinner = (matchId: string, robotId: string) => {
    selectWinner(matchId, robotId)
    fireWinner()
  }

  const handleUndo = async () => {
    if (lastRecordedMatchId) {
      await undoMatch(lastRecordedMatchId)
    }
  }

  const handleStartRound = () => {
    if (!currentRound) return
    const isAllDone = currentRound.matches.every((m) => m.status !== 'pending')
    if (isAllDone) {
      setView('roundSummary')
      return
    }
    const firstPendingIndex = currentRound.matches.findIndex((m) => m.status === 'pending')
    if (firstPendingIndex !== -1) {
      setCurrentMatchIndex(firstPendingIndex)
    }
    setView('match')
  }

  const activeRobots = tournament ? tournament.robots.filter((r) => r.status === 'active') : []

  const handleStartNextRound = async () => {
    if (isChampionDetermined || activeRobots.length <= 1) {
      setView('champion')
      fireChampion()
      return
    }

    if (currentRound?.stage === 'group_stage') {
      await advanceFromGroup()
      setView('pairings')
      return
    }

    if (currentRound?.stage === 'semifinals') {
      await advanceFromSemis()
      setView('pairings')
      return
    }

    // When exactly 3 combatants remain, advance to Individual Performance Mode
    if (activeRobots.length === 3) {
      await startIndividualPerformance()
      setView('individualPerformance')
      return
    }

    await startNextRound(batchSize)
    setView('pairings')
  }

  const handleConfigSelected = async (config: TournamentConfig) => {
    await startGroupStage(config.finalFormat)
    setView('pairings')
  }

  const handleReRandomize = async () => {
    await reRandomize(batchSize)
  }

  // Auto-advance past byes and recorded matches to always point to next pending match
  useEffect(() => {
    if (view !== 'match' || !currentRound) return

    const matches = currentRound.matches
    if (matches.length === 0) return

    if (matches.every((m) => m.status !== 'pending')) {
      const timer = setTimeout(() => {
        setView('roundSummary')
      }, 750)
      return () => clearTimeout(timer)
    }

    if (currentMatchIndex >= matches.length) {
      const timer = setTimeout(() => {
        setView('roundSummary')
      }, 750)
      return () => clearTimeout(timer)
    }

    const match = matches[currentMatchIndex]
    if (match && match.status !== 'pending') {
      const nextPending = matches.findIndex((m, idx) => idx > currentMatchIndex && m.status === 'pending')
      if (nextPending !== -1) {
        setCurrentMatchIndex(nextPending)
      } else {
        const anyPending = matches.findIndex((m) => m.status === 'pending')
        if (anyPending !== -1) {
          setCurrentMatchIndex(anyPending)
        } else {
          const timer = setTimeout(() => {
            setView('roundSummary')
          }, 750)
          return () => clearTimeout(timer)
        }
      }
    }
  }, [view, currentRound, currentMatchIndex, setCurrentMatchIndex])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-8 h-8 border-2 border-border-strong border-t-accent-gold rounded-full animate-spin" />
        <p className="text-xs font-mono text-text-muted">Loading tournament session...</p>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="flex flex-col items-center justify-center py-16 max-w-lg mx-auto text-center gap-4">
        <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded text-xs font-mono w-full">
          {error || 'Tournament not found'}
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push('/')} className="font-mono text-xs">
          Return to Setup
        </Button>
      </div>
    )
  }

  const stats = getTournamentStats(tournament)

  let nextStageLabel = ''
  if (isChampionDetermined || activeRobots.length <= 1) {
    nextStageLabel = 'View Champion'
  } else if (currentRound?.stage === 'group_stage') {
    nextStageLabel =
      tournament.config?.finalFormat === '4-to-final'
        ? 'Advance to Semifinals (Top 4)'
        : 'Advance to Championship Final (Top 2)'
  } else if (currentRound?.stage === 'semifinals') {
    nextStageLabel = 'Advance to Championship Final'
  } else if (activeRobots.length === 3) {
    nextStageLabel = 'Advance to Individual Performance Mode (Top 3)'
  }

  const isCurrentGroupStage = currentRound?.stage === 'group_stage'
  const multiStandings = isCurrentGroupStage
    ? calculateMultiGroupStandings(currentRound.matches, activeRobots)
    : []

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* 1. Control Room Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-bg-surface p-4 rounded border border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold font-mono text-text-primary tracking-tight">
              {tournament.name}
            </h1>
            <Badge variant={isChampionDetermined ? 'green' : 'gold'}>
              {isChampionDetermined
                ? 'Concluded'
                : tournament.currentStage === 'individual_performance'
                ? 'Performance Mode'
                : currentRound?.stage === 'group_stage'
                ? 'Group Stage'
                : currentRound?.stage === 'semifinals'
                ? 'Semifinals'
                : currentRound?.stage === 'final'
                ? 'Championship Final'
                : `Round ${tournament.currentRound}`}
            </Badge>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-text-muted">
            <span>
              Active Field: <strong className="text-text-secondary">{activeRobots.length}</strong> / {tournament.totalRobots}
            </span>
            <span>·</span>
            <span>
              Total Rounds: <strong className="text-text-secondary">{tournament.rounds.length}</strong>
            </span>
            {tournament.config?.finalFormat && (
              <>
                <span>·</span>
                <span className="text-accent-cyan">
                  {tournament.config.finalFormat === '2-to-final' ? 'Top 2 Direct' : 'Top 4 Semis'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {tournament.currentStage === 'individual_performance' ? (
            <Button
              variant={view === 'individualPerformance' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setView('individualPerformance')}
              className="font-mono text-xs"
            >
              Performance Judging
            </Button>
          ) : (
            <Button
              variant={view === 'pairings' || view === 'match' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setView('pairings')}
              className="font-mono text-xs"
            >
              Match Control
            </Button>
          )}

          <Button
            variant={view === 'bracket' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('bracket')}
            className="font-mono text-xs"
          >
            Bracket & Tree
          </Button>

          <Button
            variant={view === 'stats' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('stats')}
            className="font-mono text-xs"
          >
            Telemetry Stats
          </Button>

          <div className="flex items-center gap-1">
            <Link
              href={`/tournament/${id}/projector`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-accent-gold/50 text-accent-gold bg-accent-gold/10 hover:bg-accent-gold/20 font-mono text-xs font-bold transition-colors shadow-sm"
              title="Open standalone Projector View in a new tab or projector display"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Projector View ↗</span>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsArenaModalOpen(true)}
              className="font-mono text-xs text-text-muted hover:text-text-primary"
              title="Preview Projector overlay in this window"
            >
              Overlay
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Structured Competition Stage Progression Timeline */}
      <StageTimeline
        tournament={tournament}
        activeRoundNumber={currentRound?.roundNumber}
        onSelectRound={(rNum) => {
          setView('bracket')
        }}
      />

      {/* 3. Main Operational View Area */}

      {/* View: Individual Performance Judging */}
      {view === 'individualPerformance' && (
        <IndividualPerformanceScreen
          tournament={tournament}
          onRecordPerformance={async (robotId, time, points) => {
            await recordPerformance(robotId, time, points)
          }}
          onViewPodium={() => {
            setView('champion')
            fireChampion()
          }}
        />
      )}

      {/* View: Champion Concluded Dashboard */}
      {view === 'champion' && (
        <div className="flex flex-col gap-6">
          <ChampionScreen
            tournament={tournament}
            onNewTournament={() => {
              window.location.href = '/'
            }}
          />

          {/* Display entire bracket progression underneath champion */}
          <div className="border-t border-border pt-4">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-text-muted mb-4">
              Competition Bracket & Historical Tree
            </h3>
            <TournamentBracketView tournament={tournament} />
          </div>
        </div>
      )}

      {/* View: Full Bracket & Tree */}
      {view === 'bracket' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-2 font-mono text-xs text-text-muted">
            <span>Official Stage-by-Stage Bracket Progression</span>
            <span>Horizontal Pan Supported</span>
          </div>
          <TournamentBracketView tournament={tournament} />
        </div>
      )}

      {/* View: Telemetry Stats */}
      {view === 'stats' && <TournamentStats stats={stats} />}

      {/* View: 5-Robot Group Stage Configuration */}
      {view === 'groupConfig' && (
        <TournamentConfigScreen
          robotCount={activeRobots.length}
          onConfigSelected={handleConfigSelected}
          onCancel={() => setView('roundSummary')}
        />
      )}

      {/* View: Pairings & Match Selection */}
      {view === 'pairings' && currentRound && (
        <div className="flex flex-col gap-6">
          {isCurrentGroupStage && (
            <GroupStandingsTable
              multiStandings={multiStandings}
              format={tournament.config?.finalFormat || '2-to-final'}
            />
          )}

          <PairingsOverview
            round={currentRound}
            onStartRound={handleStartRound}
            onReRandomize={handleReRandomize}
            batchSize={batchSize}
            onBatchSizeChange={setBatchSize}
          />
        </div>
      )}

      {/* View: Active Duel Judging */}
      {view === 'match' && currentMatch && currentRound && (
        <div className="flex flex-col items-center gap-6">
          <MatchDisplay
            match={currentMatch}
            matchIndex={currentMatchIndex}
            totalMatches={currentRound.matches.filter((m) => !m.isBye).length}
            onSelectWinner={handleSelectWinner}
          />

          {/* Undo Action */}
          {lastRecordedMatchId && (
            <UndoButton
              deadline={
                currentRound.matches.find((m) => m.id === lastRecordedMatchId)?.undoDeadline ?? null
              }
              onUndo={handleUndo}
            />
          )}

          {/* Real-time Group Standings underneath duel judging during group stage */}
          {isCurrentGroupStage && (
            <div className="w-full max-w-4xl mt-4">
              <GroupStandingsTable
                multiStandings={multiStandings}
                format={tournament.config?.finalFormat || '2-to-final'}
              />
            </div>
          )}
        </div>
      )}

      {/* View: Round Summary */}
      {view === 'roundSummary' && currentRound && (
        <div className="flex flex-col gap-6">
          {isCurrentGroupStage && (
            <GroupStandingsTable
              multiStandings={calculateMultiGroupStandings(currentRound.matches, activeRobots)}
              format={tournament.config?.finalFormat || '2-to-final'}
            />
          )}

          <RoundSummary
            round={currentRound}
            robotsRemaining={activeRobots.length}
            onStartNextRound={handleStartNextRound}
            isFinal={isChampionDetermined}
            nextStageLabel={nextStageLabel}
          />
        </div>
      )}

      {/* Viewport-fitted Arena Projector Mode */}
      {isArenaModalOpen && (
        <ArenaPresentationModal
          isOpen={isArenaModalOpen}
          onClose={() => setIsArenaModalOpen(false)}
          tournament={tournament}
          currentMatch={currentMatch}
          currentMatchIndex={currentMatchIndex}
          totalMatches={currentRound ? currentRound.matches.filter((m) => !m.isBye).length : 0}
          onSelectWinner={handleSelectWinner}
        />
      )}
    </div>
  )
}
