'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Maximize2,
  Minimize2,
  GitBranch,
  Swords,
  Trophy,
  ShieldCheck,
  Check,
  ShieldAlert,
  Flame,
  Clock,
  Sparkles,
  Camera,
} from 'lucide-react'
import clsx from 'clsx'
import type { Tournament, Match, Robot, PerformanceRanking } from '@/lib/types'
import { TournamentBracketTree } from './TournamentBracketTree'
import { calculateMultiGroupStandings, getGroupAdvancers } from '@/lib/group-stage-engine'
import { ProjectorCameraWidget } from './ProjectorCameraWidget'

export interface ProjectorDisplayProps {
  tournament: Tournament | null
  isLoading?: boolean
  error?: string | null
  isLiveSync?: boolean
  onRefresh?: () => void
}

export type ProjectorPhase =
  | 'group_stage'
  | 'qualifiers'
  | 'knockout'
  | 'semifinals'
  | 'final'
  | 'individual_performance'
  | 'champion'

type DisplayMode = 'phase' | 'tree' | 'duel' | 'champion'

/**
 * Detect the authoritative current phase of the tournament.
 */
function detectCurrentPhase(tournament: Tournament): ProjectorPhase {
  if (tournament.status === 'completed' && tournament.winner) {
    return 'champion'
  }

  if (tournament.currentStage === 'individual_performance') {
    return 'individual_performance'
  }

  const currentRound = tournament.rounds[tournament.rounds.length - 1]
  if (!currentRound) return 'group_stage'

  if (currentRound.stage === 'group_stage') {
    if (currentRound.status === 'completed') {
      return 'qualifiers'
    }
    return 'group_stage'
  }

  if (currentRound.stage === 'final') {
    if (currentRound.status === 'completed' && tournament.winner) {
      return 'champion'
    }
    return 'final'
  }

  if (currentRound.stage === 'semifinals') {
    return 'semifinals'
  }

  if (currentRound.stage === 'elimination') {
    if (currentRound.matches.length === 1) return 'final'
    if (currentRound.matches.length === 2) return 'semifinals'
    return 'knockout'
  }

  if (currentRound.matches.length === 1) return 'final'
  if (currentRound.matches.length === 2) return 'semifinals'
  return 'knockout'
}

export function ProjectorDisplay({
  tournament,
  isLoading = false,
  error = null,
  isLiveSync = true,
}: ProjectorDisplayProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('phase')
  const [selectedPhaseOverride, setSelectedPhaseOverride] = useState<ProjectorPhase | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraLayout, setCameraLayout] = useState<'split' | 'pip'>('split')
  const containerRef = useRef<HTMLDivElement>(null)

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.warn('Fullscreen request denied or not supported:', err)
    }
  }

  // Active round, match & champion
  const currentRound = tournament?.rounds[tournament.rounds.length - 1] ?? null
  const champion = tournament?.winner ?? null

  // Find currently active match (first pending non-bye match)
  const currentMatch = useMemo(() => {
    if (!currentRound) return null
    return (
      currentRound.matches.find((m) => !m.isBye && m.status === 'pending') ||
      currentRound.matches[0] ||
      null
    )
  }, [currentRound])

  // Current detected phase
  const autoPhase: ProjectorPhase = useMemo(() => {
    if (!tournament) return 'group_stage'
    return detectCurrentPhase(tournament)
  }, [tournament])

  // Active phase to display (either user-selected or auto-detected)
  const activePhase = selectedPhaseOverride || autoPhase

  // Automatically switch to champion when tournament concludes
  useEffect(() => {
    if (tournament?.status === 'completed' && champion) {
      setDisplayMode('phase')
      setSelectedPhaseOverride('champion')
    }
  }, [tournament?.status, champion])

  // When autoPhase advances, reset manual override to keep presentation synced
  useEffect(() => {
    setSelectedPhaseOverride(null)
  }, [autoPhase])

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      } else if (e.key === 'v' || e.key === 'V') {
        setShowCamera((prev) => !prev)
      } else if (e.key === 't' || e.key === 'T') {
        setDisplayMode((prev) => (prev === 'tree' ? 'phase' : 'tree'))
      } else if (e.key === 'd' || e.key === 'D') {
        if (currentMatch) setDisplayMode((prev) => (prev === 'duel' ? 'phase' : 'duel'))
      } else if (e.key === 'c' || e.key === 'C') {
        if (champion) {
          setDisplayMode('phase')
          setSelectedPhaseOverride('champion')
        }
      } else if (e.key === 'a' || e.key === 'A') {
        setDisplayMode('phase')
        setSelectedPhaseOverride(null)
      } else if (e.key === '1') {
        setDisplayMode('phase')
        setSelectedPhaseOverride('group_stage')
      } else if (e.key === '2') {
        setDisplayMode('phase')
        setSelectedPhaseOverride('qualifiers')
      } else if (e.key === '3') {
        setDisplayMode('phase')
        setSelectedPhaseOverride('knockout')
      } else if (e.key === '4') {
        setDisplayMode('phase')
        setSelectedPhaseOverride('semifinals')
      } else if (e.key === '5') {
        setDisplayMode('phase')
        setSelectedPhaseOverride('final')
      } else if (e.key === '6') {
        setDisplayMode('phase')
        setSelectedPhaseOverride('champion')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentMatch, champion])

  // Available phases that exist for this tournament
  const existingPhases = useMemo(() => {
    if (!tournament) return []
    const phases: { id: ProjectorPhase; label: string }[] = []

    const hasGroupStage =
      tournament.rounds.some((r) => r.stage === 'group_stage') ||
      tournament.config?.groupStageEnabled ||
      (tournament.totalRobots >= 5 && tournament.totalRobots <= 9)

    if (hasGroupStage) {
      phases.push({ id: 'group_stage', label: 'Groups' })
      phases.push({ id: 'qualifiers', label: 'Qualifiers' })
    }

    const hasKnockout =
      tournament.totalRobots > 4 &&
      (tournament.rounds.some((r) => r.stage === 'elimination' && r.matches.length > 2) ||
        tournament.totalRobots >= 10)

    if (hasKnockout) {
      phases.push({ id: 'knockout', label: 'Knockout' })
    }

    const hasSemis =
      tournament.config?.finalFormat === '4-to-final' ||
      tournament.rounds.some((r) => r.stage === 'semifinals') ||
      (tournament.totalRobots >= 4 && !tournament.config?.finalFormat?.startsWith('2'))

    if (hasSemis) {
      phases.push({ id: 'semifinals', label: 'Semifinals' })
    }

    if (
      tournament.currentStage === 'individual_performance' ||
      (tournament.performances && tournament.performances.length > 0)
    ) {
      phases.push({ id: 'individual_performance', label: 'Trials' })
    }

    phases.push({ id: 'final', label: 'Final' })

    if (tournament.status === 'completed' || tournament.winner) {
      phases.push({ id: 'champion', label: 'Champion' })
    }

    return phases
  }, [tournament])

  // Phase Title text for header
  const phaseTitle = useMemo(() => {
    switch (activePhase) {
      case 'group_stage':
        return 'GROUP STAGE · ROUND ROBIN'
      case 'qualifiers':
        return 'QUALIFIED COMBATANTS'
      case 'knockout':
        return currentRound?.roundNumber === 1 && (tournament?.totalRobots || 0) > 9
          ? 'QUALIFICATION / ROUND 1'
          : `KNOCKOUT ROUND ${currentRound?.roundNumber || 1}`
      case 'semifinals':
        return 'SEMIFINALS · FINAL FOUR'
      case 'final':
        return 'CHAMPIONSHIP FINAL'
      case 'individual_performance':
        return 'INDIVIDUAL PERFORMANCE TRIALS · TOP 3'
      case 'champion':
        return 'TOURNAMENT CHAMPION'
      default:
        return 'ROBOCUP ARENA'
    }
  }, [activePhase, currentRound, tournament])

  // Runner-up robot if tournament finished
  const runnerUp = useMemo(() => {
    if (!tournament || tournament.status !== 'completed' || !champion) return null
    const finalRound = tournament.rounds.find((r) => r.stage === 'final') || tournament.rounds[tournament.rounds.length - 1]
    if (!finalRound || finalRound.matches.length === 0) return null
    const finalMatch = finalRound.matches[0]
    if (finalMatch.loser) return finalMatch.loser
    if (finalMatch.robot1 && finalMatch.robot1.id !== champion.id) return finalMatch.robot1
    if (finalMatch.robot2 && finalMatch.robot2.id !== champion.id) return finalMatch.robot2
    return null
  }, [tournament, champion])

  // 1. LOADING SCREEN
  if (isLoading && !tournament) {
    return (
      <div className="fixed inset-0 bg-[#0B0D12] text-[#F1F3F9] flex flex-col items-center justify-center p-6 select-none font-mono">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-14 h-14 rounded border-2 border-accent-gold/40 border-t-accent-gold animate-spin" />
          <h2 className="text-lg font-bold text-accent-gold tracking-widest uppercase mt-2">
            Connecting to Arena Feed
          </h2>
          <p className="text-xs text-text-muted">
            Synchronizing live tournament state with arena match control desk...
          </p>
        </div>
      </div>
    )
  }

  // 2. ERROR SCREEN
  if (error || !tournament) {
    return (
      <div className="fixed inset-0 bg-[#0B0D12] text-[#F1F3F9] flex flex-col items-center justify-center p-6 select-none font-mono">
        <div className="flex flex-col items-center gap-4 text-center max-w-md bg-bg-surface border border-border p-8 rounded shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-accent-red" />
          <h2 className="text-lg font-bold text-text-primary">
            {error ? 'Arena Synchronization Error' : 'No Active Tournament Found'}
          </h2>
          <p className="text-xs text-text-muted">
            {error || 'There is currently no active tournament broadcast on this arena channel.'}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <Link
              href="/"
              className="px-4 py-2 bg-accent-gold text-[#0B0D12] text-xs font-bold rounded hover:brightness-110 transition-all"
            >
              Control Desk
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[#0B0D12] text-[#F1F3F9] flex flex-col h-[100dvh] w-screen overflow-hidden select-none font-sans"
    >
      {/* ─────────────────────────────────────────────────────────────
          PROJECTOR BROADCAST HEADER (CLEAN TV / ARENA VIEW)
          Zero admin navigation tabs. Pure competition identity.
         ───────────────────────────────────────────────────────────── */}
      <header className="h-14 sm:h-16 px-4 sm:px-8 flex items-center justify-between border-b border-border bg-[#0B0D12] shrink-0">
        {/* Left: ARE Identity & Tournament Name */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-9 h-9 rounded overflow-hidden border border-border-strong bg-black shrink-0 shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/are-logo.jpg"
              alt="Association Robotique ENSI"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate">
              <span className="text-xs uppercase tracking-widest text-accent-gold font-mono font-bold">
                ROBOCUP ARENA
              </span>
              <span className="text-text-muted text-xs">·</span>
              <span className="text-xs sm:text-sm font-mono font-bold text-text-primary tracking-wide truncate">
                {tournament.name}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] font-mono text-accent-cyan font-bold uppercase tracking-wider">
                {phaseTitle}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Phase Navigation Breadcrumb Pills */}
        <div className="hidden lg:flex items-center gap-1.5 bg-bg-surface/80 p-1 rounded-full border border-border/80 font-mono text-xs">
          {existingPhases.map((phase, idx) => {
            const isActive = activePhase === phase.id && displayMode === 'phase'
            const isCompleted =
              existingPhases.findIndex((p) => p.id === autoPhase) > idx ||
              tournament.status === 'completed'

            return (
              <button
                key={phase.id}
                onClick={() => {
                  setDisplayMode('phase')
                  setSelectedPhaseOverride(phase.id)
                }}
                className={clsx(
                  'px-3 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer',
                  isActive
                    ? 'bg-accent-gold text-[#0B0D12] shadow-sm'
                    : isCompleted
                    ? 'text-text-primary hover:bg-bg-card'
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />}
                {phase.label}
              </button>
            )
          })}
        </div>

        {/* Right: Mode Switchers, Sync & Fullscreen */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Live Sync Status */}
          {isLiveSync && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">LIVE SYNC</span>
            </span>
          )}

          {/* Mode Controls */}
          <div className="flex items-center gap-1 bg-bg-surface p-1 rounded border border-border font-mono text-xs">
            <button
              onClick={() => {
                setDisplayMode('phase')
                setSelectedPhaseOverride(null)
              }}
              className={clsx(
                'px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer',
                displayMode === 'phase'
                  ? 'bg-accent-gold text-[#0B0D12] font-bold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              )}
              title="Show Current Tournament Phase [A]"
            >
              Phase
            </button>

            <button
              onClick={() => setDisplayMode('tree')}
              className={clsx(
                'px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer',
                displayMode === 'tree'
                  ? 'bg-accent-gold text-[#0B0D12] font-bold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              )}
              title="View Competition Bracket Tree [T]"
            >
              <GitBranch className="w-3 h-3" />
              <span className="hidden md:inline">Tree</span>
            </button>

            {currentMatch && !champion && (
              <button
                onClick={() => setDisplayMode('duel')}
                className={clsx(
                  'px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer',
                  displayMode === 'duel'
                    ? 'bg-accent-gold text-[#0B0D12] font-bold shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                )}
                title="Live Duel Spotlight [D]"
              >
                <Swords className="w-3 h-3" />
                <span className="hidden md:inline">Duel</span>
              </button>
            )}

            {champion && (
              <button
                onClick={() => {
                  setDisplayMode('phase')
                  setSelectedPhaseOverride('champion')
                }}
                className={clsx(
                  'px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer',
                  activePhase === 'champion' && displayMode === 'phase'
                    ? 'bg-accent-gold text-[#0B0D12] font-bold shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                )}
                title="View Champion Victory [C]"
              >
                <Trophy className="w-3 h-3" />
                <span className="hidden md:inline">Winner</span>
              </button>
            )}
          </div>

          {/* Arena Camera Toggle */}
          <button
            onClick={() => setShowCamera((prev) => !prev)}
            className={clsx(
              'px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer border',
              showCamera
                ? 'bg-accent-gold text-[#0B0D12] font-bold border-accent-gold shadow-sm'
                : 'bg-bg-surface hover:bg-bg-card border-border text-text-secondary hover:text-text-primary'
            )}
            title="Toggle Live Arena Camera Feed [V]"
          >
            <Camera className="w-3.5 h-3.5 text-current" />
            <span className="hidden md:inline">Arena Cam</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 sm:px-3 sm:py-1.5 rounded bg-bg-surface hover:bg-bg-card border border-border text-text-primary text-xs font-mono font-medium transition-colors cursor-pointer"
            title="Toggle Fullscreen [F]"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-accent-gold" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-accent-gold" />
            )}
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          MAIN AUDIENCE PROJECTION STAGE (100% CONTAINED VIEWPORT)
          No infinite vertical canvas. Fits 1920x1080 and 1366x768 screens.
         ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 w-full h-[calc(100dvh-56px)] sm:h-[calc(100dvh-64px)] overflow-hidden flex flex-col p-2 sm:p-4 select-none relative">
        {/* Tournament Stage Container */}
        <div
          className={clsx(
            'w-full flex flex-col justify-center items-center transition-all duration-300 overflow-hidden',
            showCamera && cameraLayout === 'split' ? 'h-[58%] shrink-0' : 'h-full flex-1'
          )}
        >
          <AnimatePresence mode="wait">
            {displayMode === 'tree' ? (
              <motion.div
                key="mode-tree"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full flex flex-col justify-center overflow-auto rounded border border-border bg-[#0B0D12]"
              >
                <TournamentBracketTree tournament={tournament} isProjector={true} />
              </motion.div>
            ) : displayMode === 'duel' && currentMatch ? (
              <motion.div
                key="mode-duel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="w-full h-full flex items-center justify-center"
              >
                <LiveDuelSpotlight match={currentMatch} stageLabel={phaseTitle} />
              </motion.div>
            ) : (
              // Phase-based views
              <motion.div
                key={`phase-${activePhase}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
                className="w-full h-full flex items-center justify-center"
              >
                {activePhase === 'champion' && champion ? (
                  <ChampionPhasePresentation
                    champion={champion}
                    tournamentName={tournament.name}
                    runnerUp={runnerUp}
                    performanceResults={tournament.performanceResults}
                  />
                ) : activePhase === 'individual_performance' ? (
                  <IndividualPerformancePhasePresentation
                    tournament={tournament}
                  />
                ) : activePhase === 'final' ? (
                  <FinalPhasePresentation
                    tournament={tournament}
                    currentMatch={currentMatch}
                  />
                ) : activePhase === 'semifinals' ? (
                  <SemifinalsPhasePresentation
                    tournament={tournament}
                    currentRound={currentRound}
                    currentMatch={currentMatch}
                  />
                ) : activePhase === 'qualifiers' ? (
                  <QualifiersPhasePresentation tournament={tournament} />
                ) : activePhase === 'group_stage' ? (
                  <GroupStagePhasePresentation
                    tournament={tournament}
                    currentRound={currentRound}
                    currentMatch={currentMatch}
                  />
                ) : (
                  <KnockoutPhasePresentation
                    tournament={tournament}
                    currentRound={currentRound}
                    currentMatch={currentMatch}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Live Arena Camera Display (Split Dock or Floating PiP) */}
        {showCamera && (
          <div
            className={
              cameraLayout === 'split'
                ? 'w-full h-[40%] shrink-0 pt-2 animate-in fade-in slide-in-from-bottom-4 duration-300'
                : 'fixed bottom-6 right-6 z-50 w-80 sm:w-96 h-48 sm:h-56 shadow-2xl animate-in fade-in zoom-in-95 duration-200'
            }
          >
            <ProjectorCameraWidget
              layoutMode={cameraLayout}
              onToggleLayout={() => setCameraLayout((prev) => (prev === 'split' ? 'pip' : 'split'))}
              onClose={() => setShowCamera(false)}
            />
          </div>
        )}
      </main>
    </div>
  )
}

/* =========================================================================
   PHASE 1: GROUP STAGE PRESENTATION
   Shows ONLY group standings & round-robin schedule + live match spotlight.
   Fits 100% in viewport without any knockout tree clutter.
   ========================================================================= */
function GroupStagePhasePresentation({
  tournament,
  currentRound,
  currentMatch,
}: {
  tournament: Tournament
  currentRound: Tournament['rounds'][0] | null
  currentMatch: Match | null
}) {
  const groupRound = tournament.rounds.find((r) => r.stage === 'group_stage') || currentRound
  const matches = groupRound?.matches || []
  const groupsData = useMemo(() => {
    return calculateMultiGroupStandings(matches, tournament.robots)
  }, [matches, tournament.robots])

  return (
    <div className="w-full h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-center">
      {/* Left / Main Section: Group Standings Cards (7 cols on lg) */}
      <div className="lg:col-span-7 h-full max-h-full flex flex-col justify-center gap-3 overflow-hidden">
        <div className="flex items-center justify-between pb-1 border-b border-border/60 font-mono text-xs">
          <span className="text-text-muted uppercase font-bold tracking-wider">
            Group Leaderboards ({groupsData.length} {groupsData.length === 1 ? 'Group' : 'Groups'})
          </span>
          <span className="text-accent-gold font-semibold">
            {matches.filter((m) => m.status === 'recorded' || m.status === 'locked').length} of {matches.length} Matches Completed
          </span>
        </div>

        {/* Groups Grid */}
        <div
          className={clsx(
            'grid gap-3 overflow-y-auto max-h-[calc(100vh-140px)] pr-1',
            groupsData.length === 1 ? 'grid-cols-1' : groupsData.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'
          )}
        >
          {groupsData.map((g) => {
            const groupMatches = matches.filter(
              (m) =>
                g.standings.some((s) => s.robot.id === m.robot1?.id) &&
                g.standings.some((s) => s.robot.id === m.robot2?.id)
            )

            // Advancing threshold
            let advancingCount = 2
            if (groupsData.length === 1) {
              advancingCount = tournament.config?.finalFormat === '2-to-final' ? 2 : 4
            } else if (groupsData.length === 2) {
              advancingCount = tournament.config?.finalFormat === '2-to-final' ? 1 : 2
            } else if (groupsData.length === 3) {
              advancingCount = 1
            }

            return (
              <div
                key={g.groupName}
                className="bg-bg-surface border border-border/80 rounded flex flex-col overflow-hidden shadow-lg"
              >
                {/* Group Header */}
                <div className="px-3 py-2 bg-bg-card border-b border-border/60 flex items-center justify-between font-mono">
                  <h4 className="text-xs font-bold text-accent-gold uppercase tracking-wider">
                    {g.groupName}
                  </h4>
                  <span className="text-[10px] text-text-muted">
                    {g.standings.length} Combatants
                  </span>
                </div>

                {/* Standings Table */}
                <div className="p-2 flex flex-col gap-1 font-mono text-xs">
                  <div className="flex items-center justify-between px-2 text-[9px] text-text-muted uppercase font-bold">
                    <span>Rank & Combatant</span>
                    <span>W-L · Pts</span>
                  </div>

                  {g.standings.map((s, idx) => {
                    const rank = s.rank || idx + 1
                    const isAdvancing = rank <= advancingCount

                    return (
                      <div
                        key={s.robot.id}
                        className={clsx(
                          'flex items-center justify-between px-2 py-1.5 rounded transition-colors',
                          isAdvancing
                            ? 'bg-accent-gold/[0.12] border border-accent-gold/40 text-text-primary font-bold'
                            : 'bg-bg-card/40 border border-border/30 text-text-secondary opacity-75'
                        )}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <span
                            className={clsx(
                              'w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold shrink-0',
                              rank === 1
                                ? 'bg-accent-gold text-black'
                                : isAdvancing
                                ? 'bg-accent-gold/20 text-accent-gold'
                                : 'bg-bg-surface text-text-muted'
                            )}
                          >
                            {rank}
                          </span>
                          <span className="text-xs truncate" title={s.robot.name}>
                            {s.robot.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-xs">
                          <span className="text-text-muted text-[10px] tabular-nums">
                            {s.wins}W-{s.losses}L
                          </span>
                          <span className="font-bold text-accent-gold tabular-nums w-7 text-right">
                            {s.points}p
                          </span>
                          {isAdvancing ? (
                            <span className="text-[8px] uppercase font-black px-1 py-0.5 rounded bg-accent-gold text-black">
                              QUALIFY
                            </span>
                          ) : (
                            <span className="text-[8px] text-text-muted uppercase px-1 py-0.5">
                              CUT
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Recent Completed Matches inside this group */}
                {groupMatches.length > 0 && (
                  <div className="p-2 border-t border-border/50 bg-[#0B0D12]/40 font-mono text-[10px]">
                    <span className="text-[9px] uppercase font-bold text-text-muted block mb-1">
                      Group Results ({groupMatches.length})
                    </span>
                    <div className="flex flex-col gap-1 max-h-[85px] overflow-y-auto pr-1">
                      {groupMatches.slice(0, 5).map((m) => {
                        const isDone = m.status === 'recorded' || m.status === 'locked'
                        const isWinner1 = isDone && m.winner?.id === m.robot1?.id
                        const isWinner2 = isDone && m.winner?.id === m.robot2?.id

                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between px-1.5 py-0.5 rounded bg-bg-card/40 border border-border/30 text-[10px]"
                          >
                            <span className="text-[9px] text-text-muted">M{m.matchNumber}</span>
                            <div className="flex items-center gap-1 truncate px-1">
                              <span className={clsx(isWinner1 && 'text-accent-gold font-bold')}>
                                {m.robot1?.name || 'TBD'} {isWinner1 && '✓'}
                              </span>
                              <span className="text-text-muted text-[8px]">vs</span>
                              <span className={clsx(isWinner2 && 'text-accent-gold font-bold')}>
                                {m.robot2?.name || 'BYE'} {isWinner2 && '✓'}
                              </span>
                            </div>
                            <span
                              className={clsx(
                                'text-[8px] font-bold',
                                isDone ? 'text-emerald-400' : 'text-accent-cyan'
                              )}
                            >
                              {isDone ? 'FINAL' : 'LIVE'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Right Section: Prominent Current Match Spotlight (5 cols on lg) */}
      <div className="lg:col-span-5 h-full max-h-full flex flex-col justify-center">
        {currentMatch ? (
          <div className="bg-bg-surface border-2 border-accent-gold/40 rounded p-5 sm:p-6 flex flex-col gap-4 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-accent-gold" />

            <div className="flex items-center justify-between font-mono">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan text-xs font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-accent-cyan animate-ping" />
                ACTIVE ARENA MATCH #{currentMatch.matchNumber}
              </span>
              <span className="text-xs font-mono text-text-muted">Round-Robin</span>
            </div>

            {/* Duel Combatants */}
            <div className="grid grid-cols-2 gap-3 items-center py-2 relative">
              {/* Combatant 1 */}
              <div className="flex flex-col items-center text-center p-3 rounded bg-bg-card border border-border">
                <span className="text-[10px] font-mono text-accent-gold font-bold uppercase mb-1">
                  Red Corner
                </span>
                <div className="w-14 h-14 rounded-full bg-accent-gold/15 border border-accent-gold/40 flex items-center justify-center font-mono text-xl font-black text-accent-gold mb-2">
                  {currentMatch.robot1 ? currentMatch.robot1.name.slice(0, 3).toUpperCase() : 'TBD'}
                </div>
                <h4 className="text-sm sm:text-base font-bold font-mono text-text-primary truncate max-w-full">
                  {currentMatch.robot1 ? currentMatch.robot1.name : 'TBD'}
                </h4>
                <p className="text-[11px] font-mono text-text-muted truncate max-w-full">
                  {currentMatch.robot1?.club || 'Independent'}
                </p>
              </div>

              {/* VS Divider */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#0B0D12] border border-border-strong flex items-center justify-center font-mono font-black text-[10px] text-text-primary z-10 shadow-lg">
                VS
              </div>

              {/* Combatant 2 */}
              <div className="flex flex-col items-center text-center p-3 rounded bg-bg-card border border-border">
                <span className="text-[10px] font-mono text-accent-cyan font-bold uppercase mb-1">
                  Blue Corner
                </span>
                <div className="w-14 h-14 rounded-full bg-accent-cyan/15 border border-accent-cyan/40 flex items-center justify-center font-mono text-xl font-black text-accent-cyan mb-2">
                  {currentMatch.robot2 ? currentMatch.robot2.name.slice(0, 3).toUpperCase() : 'BYE'}
                </div>
                <h4 className="text-sm sm:text-base font-bold font-mono text-text-primary truncate max-w-full">
                  {currentMatch.robot2 ? currentMatch.robot2.name : 'BYE'}
                </h4>
                <p className="text-[11px] font-mono text-text-muted truncate max-w-full">
                  {currentMatch.robot2?.club || 'Auto-Advance'}
                </p>
              </div>
            </div>

            <div className="p-2 rounded bg-bg-card/60 border border-border/50 text-center font-mono text-xs text-text-muted">
              Live match in progress on arena battleground. Winner claims 3 points.
            </div>
          </div>
        ) : (
          <div className="bg-bg-surface border border-border rounded p-6 text-center font-mono text-text-muted">
            All group-stage matches completed! Ready for qualification advancement.
          </div>
        )}
      </div>
    </div>
  )
}

/* =========================================================================
   PHASE 2: QUALIFIED COMBATANTS PRESENTATION
   Celebrates the combatants who successfully qualified from the group stage.
   Shows their seeding tags (🟨 A1, 🟨 B1...) and the upcoming playoff duels.
   ========================================================================= */
function QualifiersPhasePresentation({ tournament }: { tournament: Tournament }) {
  const groupRound = tournament.rounds.find((r) => r.stage === 'group_stage') || tournament.rounds[0]
  const matches = groupRound?.matches || []
  const groupsData = calculateMultiGroupStandings(matches, tournament.robots)
  const format = tournament.config?.finalFormat || '2-to-final'
  const advancers = getGroupAdvancers(groupsData, format)

  return (
    <div className="w-full max-w-5xl flex flex-col items-center justify-center gap-6 my-auto text-center font-mono">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-gold/15 border border-accent-gold/40 text-accent-gold text-xs font-bold uppercase tracking-widest mb-3">
          <ShieldCheck className="w-4 h-4" />
          STAGE ADVANCEMENT COMPLETE
        </div>
        <h2 className="text-3xl sm:text-5xl font-black text-text-primary tracking-tight">
          QUALIFIED COMBATANTS
        </h2>
        <p className="text-sm sm:text-base text-text-muted mt-2">
          Group stage has concluded. The following combatants have earned advancement into the playoff bracket.
        </p>
      </div>

      {/* Grid of Qualifiers */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
        {advancers.map((robot, idx) => {
          if (!robot) return null
          // Find standing stats
          let groupName = 'Group A'
          let rank = 1
          let points = 0

          for (const g of groupsData) {
            const st = g.standings.find((s) => s.robot.id === robot.id)
            if (st) {
              groupName = g.groupName
              rank = st.rank || 1
              points = st.points
              break
            }
          }

          const seedLabel = `${groupName.replace('Group ', '')}${rank}`

          return (
            <div
              key={robot.id || `adv-${idx}`}
              className="bg-bg-surface border-2 border-accent-gold/50 rounded p-4 flex flex-col items-center gap-3 shadow-xl relative overflow-hidden group hover:border-accent-gold transition-colors"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-accent-gold" />

              <span className="px-2.5 py-0.5 rounded bg-accent-gold text-black font-black text-xs uppercase tracking-wider">
                Seed {seedLabel}
              </span>

              <div className="w-16 h-16 rounded-full bg-accent-gold/15 border border-accent-gold/40 flex items-center justify-center text-2xl font-black text-accent-gold">
                {robot.name ? robot.name.slice(0, 3).toUpperCase() : 'TBD'}
              </div>

              <div>
                <h4 className="text-lg font-bold text-text-primary truncate max-w-full">
                  {robot.name || 'TBD'}
                </h4>
                <p className="text-xs text-text-secondary mt-0.5">
                  {robot.club || 'Independent'}
                </p>
                <p className="text-[11px] text-accent-gold mt-1">
                  {groupName} · {rank === 1 ? '1st Place' : `${rank}nd Place`} ({points} pts)
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Upcoming Playoff Matchups Banner */}
      <div className="w-full max-w-2xl bg-bg-card border border-border p-4 rounded flex flex-col gap-2 mt-2">
        <span className="text-xs font-bold text-accent-cyan uppercase tracking-wider">
          Playoff Bracket Pairing
        </span>
        <div className="flex flex-wrap items-center justify-around gap-4 text-xs text-text-primary">
          {format === '2-to-final' ? (
            <div className="flex items-center gap-2">
              <span className="font-bold text-accent-gold">{advancers[0]?.name || 'Seed 1'}</span>
              <span className="text-text-muted">VS</span>
              <span className="font-bold text-accent-cyan">{advancers[1]?.name || 'Seed 2'}</span>
              <span className="text-text-muted text-[10px]">(Championship Final)</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-bold text-accent-gold">Semi 1:</span>
                <span>{advancers[0]?.name || 'A1'} vs {advancers[3]?.name || 'B2'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-accent-cyan">Semi 2:</span>
                <span>{advancers[1]?.name || 'B1'} vs {advancers[2]?.name || 'A2'}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   PHASE 3: KNOCKOUT / ROUND N PRESENTATION (TAILORED FOR LARGE ROUNDS LIKE 22 ROBOTS)
   Displays:
   - Left: Prominent Live Match Spotlight
   - Right: Clean 2 or 3-column compact match grid that fits in viewport
   - Completed match winners permanently visible with gold checkmark ✓
   ========================================================================= */
function KnockoutPhasePresentation({
  tournament,
  currentRound,
  currentMatch,
}: {
  tournament: Tournament
  currentRound: Tournament['rounds'][0] | null
  currentMatch: Match | null
}) {
  const matches = currentRound?.matches || []
  const completedCount = matches.filter((m) => m.status === 'recorded' || m.status === 'locked').length

  return (
    <div className="w-full h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-center">
      {/* Left Column: Prominent Current Match Spotlight (5 cols on lg) */}
      <div className="lg:col-span-5 h-full max-h-full flex flex-col justify-center gap-4">
        {currentMatch ? (
          <div className="bg-bg-surface border-2 border-accent-cyan/50 rounded p-5 sm:p-6 flex flex-col gap-4 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-accent-cyan" />

            <div className="flex items-center justify-between font-mono">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan text-xs font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-accent-cyan animate-ping" />
                ACTIVE ARENA MATCH #{currentMatch.matchNumber}
              </span>
              <span className="text-xs text-text-muted font-mono">
                Round {currentRound?.roundNumber || 1}
              </span>
            </div>

            {/* Duel Combatants */}
            <div className="grid grid-cols-2 gap-3 items-center py-2 relative">
              {/* Combatant 1 */}
              <div className="flex flex-col items-center text-center p-3 rounded bg-bg-card border border-border">
                <span className="text-[10px] font-mono text-accent-gold font-bold uppercase mb-1">
                  Red Corner
                </span>
                <div className="w-14 h-14 rounded-full bg-accent-gold/15 border border-accent-gold/40 flex items-center justify-center font-mono text-xl font-black text-accent-gold mb-2">
                  {currentMatch.robot1 ? currentMatch.robot1.name.slice(0, 3).toUpperCase() : 'TBD'}
                </div>
                <h4 className="text-sm sm:text-base font-bold font-mono text-text-primary truncate max-w-full">
                  {currentMatch.robot1 ? currentMatch.robot1.name : 'TBD'}
                </h4>
                <p className="text-[11px] font-mono text-text-muted truncate max-w-full">
                  {currentMatch.robot1?.club || 'Independent'}
                </p>
              </div>

              {/* VS Divider */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#0B0D12] border border-border-strong flex items-center justify-center font-mono font-black text-[10px] text-text-primary z-10 shadow-lg">
                VS
              </div>

              {/* Combatant 2 */}
              <div className="flex flex-col items-center text-center p-3 rounded bg-bg-card border border-border">
                <span className="text-[10px] font-mono text-accent-cyan font-bold uppercase mb-1">
                  Blue Corner
                </span>
                <div className="w-14 h-14 rounded-full bg-accent-cyan/15 border border-accent-cyan/40 flex items-center justify-center font-mono text-xl font-black text-accent-cyan mb-2">
                  {currentMatch.robot2 ? currentMatch.robot2.name.slice(0, 3).toUpperCase() : 'BYE'}
                </div>
                <h4 className="text-sm sm:text-base font-bold font-mono text-text-primary truncate max-w-full">
                  {currentMatch.robot2 ? currentMatch.robot2.name : 'BYE'}
                </h4>
                <p className="text-[11px] font-mono text-text-muted truncate max-w-full">
                  {currentMatch.robot2?.club || 'Auto-Advance'}
                </p>
              </div>
            </div>

            {/* Match Info & Elimination Rule */}
            <div className="p-3 rounded bg-bg-card/70 border border-border/60 flex items-center justify-between font-mono text-xs">
              <span className="text-text-muted">Elimination Bout</span>
              <span className="font-bold text-accent-gold">Winner Advances to Next Round</span>
            </div>
          </div>
        ) : (
          <div className="bg-bg-surface border border-border rounded p-6 text-center font-mono text-text-muted">
            All matches in Round {currentRound?.roundNumber || 1} completed!
          </div>
        )}

        {/* Round Progress Card */}
        <div className="bg-bg-surface border border-border rounded p-4 flex items-center justify-between font-mono text-xs shadow-md">
          <div>
            <span className="text-[10px] text-text-muted uppercase block">Round Status</span>
            <span className="font-bold text-text-primary">
              {completedCount} / {matches.length} Matches Concluded
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-text-muted uppercase block">Next Stage</span>
            <span className="font-bold text-accent-cyan">
              {Math.ceil(matches.length / 2)} Winners Advance
            </span>
          </div>
        </div>
      </div>

      {/* Right Column: Compact, Responsive Match Grid (7 cols on lg) */}
      <div className="lg:col-span-7 h-full max-h-full flex flex-col justify-center gap-2 overflow-hidden">
        <div className="flex items-center justify-between pb-1 border-b border-border/60 font-mono text-xs">
          <span className="text-text-muted uppercase font-bold tracking-wider">
            Round {currentRound?.roundNumber || 1} Match Pairings ({matches.length})
          </span>
          <span className="text-text-muted text-[11px]">
            Winners permanently preserved
          </span>
        </div>

        {/* 2 or 3-column compact match cards grid */}
        <div
          className={clsx(
            'grid gap-2 overflow-y-auto max-h-[calc(100vh-140px)] pr-1',
            matches.length > 8 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
          )}
        >
          {matches.map((m) => {
            const isDone = m.status === 'recorded' || m.status === 'locked'
            const isLive = m.id === currentMatch?.id && !isDone
            const isWinner1 = isDone && m.winner?.id === m.robot1?.id
            const isWinner2 = isDone && m.winner?.id === m.robot2?.id

            return (
              <div
                key={m.id}
                className={clsx(
                  'rounded border font-mono text-xs flex flex-col justify-between p-2 transition-all shadow-sm',
                  isLive
                    ? 'bg-bg-surface border-accent-cyan ring-1 ring-accent-cyan/50 shadow-cyan-500/10'
                    : isDone
                    ? 'bg-bg-surface/90 border-border'
                    : 'bg-bg-card/40 border-border/40 opacity-70'
                )}
              >
                {/* Match Header */}
                <div className="flex items-center justify-between text-[10px] pb-1 border-b border-border/40">
                  <span className="font-bold text-text-secondary">Match {String(m.matchNumber).padStart(2, '0')}</span>
                  {isLive ? (
                    <span className="text-accent-cyan font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-ping" />
                      LIVE
                    </span>
                  ) : isDone ? (
                    <span className="text-emerald-400 font-bold">FINAL</span>
                  ) : (
                    <span className="text-text-muted">SCHEDULED</span>
                  )}
                </div>

                {/* Combatants */}
                <div className="flex flex-col gap-1 py-1">
                  {/* Slot 1 */}
                  <div
                    className={clsx(
                      'flex items-center justify-between px-1.5 py-0.5 rounded text-[11px]',
                      isWinner1
                        ? 'bg-accent-gold/15 text-accent-gold font-bold border border-accent-gold/40'
                        : isDone && !isWinner1
                        ? 'text-text-muted opacity-50'
                        : 'text-text-primary'
                    )}
                  >
                    <span className="truncate max-w-[120px]">
                      {m.robot1 ? m.robot1.name : 'TBD'} {isWinner1 && '✓'}
                    </span>
                    {isWinner1 && <Check className="w-3.5 h-3.5 text-accent-gold stroke-[3] shrink-0" />}
                  </div>

                  {/* Slot 2 */}
                  <div
                    className={clsx(
                      'flex items-center justify-between px-1.5 py-0.5 rounded text-[11px]',
                      isWinner2
                        ? 'bg-accent-gold/15 text-accent-gold font-bold border border-accent-gold/40'
                        : isDone && !isWinner2
                        ? 'text-text-muted opacity-50'
                        : 'text-text-primary'
                    )}
                  >
                    <span className="truncate max-w-[120px]">
                      {m.robot2 ? m.robot2.name : <span className="italic text-text-muted">BYE</span>} {isWinner2 && '✓'}
                    </span>
                    {isWinner2 && <Check className="w-3.5 h-3.5 text-accent-gold stroke-[3] shrink-0" />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   PHASE 4: SEMIFINALS PRESENTATION
   Clean 2-match semifinal stage feeding directly into the Championship Final.
   ========================================================================= */
function SemifinalsPhasePresentation({
  tournament,
  currentRound,
  currentMatch,
}: {
  tournament: Tournament
  currentRound: Tournament['rounds'][0] | null
  currentMatch: Match | null
}) {
  const semiMatches = currentRound?.matches || []
  const m1 = semiMatches[0]
  const m2 = semiMatches[1]

  const m1Winner = m1?.winner
  const m2Winner = m2?.winner

  return (
    <div className="w-full max-w-6xl flex flex-col items-center justify-center gap-8 my-auto font-mono">
      {/* Title */}
      <div className="text-center">
        <span className="text-xs uppercase tracking-widest text-accent-cyan font-bold px-3 py-1 rounded bg-accent-cyan/15 border border-accent-cyan/40 inline-block mb-2">
          PHASE 4 · FINAL FOUR
        </span>
        <h2 className="text-3xl sm:text-5xl font-black text-text-primary tracking-tight">
          SEMIFINALS
        </h2>
      </div>

      {/* Bracket Tree Layout for Semis -> Final */}
      <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Left Column: 2 Semifinal Matches (7 cols) */}
        <div className="md:col-span-7 flex flex-col gap-6">
          {/* Semifinal 1 Card */}
          {m1 && <KnockoutDuelCard match={m1} isCurrent={currentMatch?.id === m1.id} title="Semifinal 1" />}

          {/* Semifinal 2 Card */}
          {m2 && <KnockoutDuelCard match={m2} isCurrent={currentMatch?.id === m2.id} title="Semifinal 2" />}
        </div>

        {/* Center Connectors & Final Anticipator (5 cols) */}
        <div className="md:col-span-5 flex flex-col items-center justify-center">
          <div className="w-full bg-bg-surface border-2 border-accent-gold/40 rounded p-6 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-accent-gold" />
            <span className="text-xs text-accent-gold font-bold uppercase tracking-widest mb-3">
              Championship Grand Final
            </span>

            <div className="w-full flex flex-col gap-2 my-2">
              <div className={clsx('p-3 rounded border text-sm font-bold flex items-center justify-between', m1Winner ? 'bg-accent-gold/15 border-accent-gold text-accent-gold' : 'bg-bg-card border-border text-text-muted')}>
                <span>{m1Winner ? m1Winner.name : 'Winner Semifinal 1'}</span>
                {m1Winner && <Check className="w-4 h-4 text-accent-gold" />}
              </div>

              <span className="text-xs text-text-muted">VS</span>

              <div className={clsx('p-3 rounded border text-sm font-bold flex items-center justify-between', m2Winner ? 'bg-accent-gold/15 border-accent-gold text-accent-gold' : 'bg-bg-card border-border text-text-muted')}>
                <span>{m2Winner ? m2Winner.name : 'Winner Semifinal 2'}</span>
                {m2Winner && <Check className="w-4 h-4 text-accent-gold" />}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-accent-gold">
              <Trophy className="w-4 h-4" />
              <span>Victor will be crowned Arena Champion</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   PHASE 5: FINAL PHASE PRESENTATION
   High-impact championship duel between the two grand finalists.
   ========================================================================= */
function FinalPhasePresentation({
  tournament,
  currentMatch,
}: {
  tournament: Tournament
  currentMatch: Match | null
}) {
  const finalRound = tournament.rounds.find((r) => r.stage === 'final') || tournament.rounds[tournament.rounds.length - 1]
  const finalMatch = finalRound?.matches[0] || currentMatch

  return (
    <div className="w-full max-w-5xl flex flex-col items-center justify-center gap-6 my-auto font-mono text-center">
      <div>
        <span className="text-xs uppercase tracking-widest text-accent-gold font-bold px-3 py-1 rounded bg-accent-gold/15 border border-accent-gold/40 inline-block mb-2">
          THE ULTIMATE CLASH
        </span>
        <h2 className="text-4xl sm:text-6xl font-black text-text-primary tracking-tight">
          CHAMPIONSHIP GRAND FINAL
        </h2>
        <p className="text-sm text-text-muted mt-2">
          Two elite combatants enter the arena. One will be crowned Tournament Champion.
        </p>
      </div>

      {finalMatch && (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 relative items-center mt-2">
          {/* Finalist 1 */}
          <div className="bg-bg-surface border-2 border-accent-gold/60 p-6 sm:p-8 rounded flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-accent-gold" />
            <span className="text-xs font-mono uppercase tracking-wider text-accent-gold font-bold mb-2">
              RED CORNER
            </span>
            <div className="w-20 h-20 rounded-full bg-accent-gold/15 border border-accent-gold/40 flex items-center justify-center font-mono text-3xl font-extrabold text-accent-gold mb-4">
              {finalMatch.robot1 ? finalMatch.robot1.name.slice(0, 3).toUpperCase() : 'TBD'}
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold font-mono text-text-primary mb-1">
              {finalMatch.robot1 ? finalMatch.robot1.name : 'Finalist 1'}
            </h3>
            <p className="text-sm font-mono text-text-secondary">
              {finalMatch.robot1?.club || 'Independent'}
            </p>
            {finalMatch.robot1 && (
              <div className="mt-4 px-3 py-1 bg-bg-card rounded border border-border font-mono text-xs text-text-muted">
                Tournament Wins: <span className="font-bold text-accent-gold">{finalMatch.robot1.wins}</span>
              </div>
            )}
          </div>

          {/* VS Badge */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-14 h-14 rounded-full bg-[#0B0D12] border-2 border-accent-gold items-center justify-center font-mono font-black text-sm text-accent-gold shadow-2xl">
            VS
          </div>

          {/* Finalist 2 */}
          <div className="bg-bg-surface border-2 border-accent-cyan/60 p-6 sm:p-8 rounded flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-accent-cyan" />
            <span className="text-xs font-mono uppercase tracking-wider text-accent-cyan font-bold mb-2">
              BLUE CORNER
            </span>
            <div className="w-20 h-20 rounded-full bg-accent-cyan/15 border border-accent-cyan/40 flex items-center justify-center font-mono text-3xl font-extrabold text-accent-cyan mb-4">
              {finalMatch.robot2 ? finalMatch.robot2.name.slice(0, 3).toUpperCase() : 'TBD'}
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold font-mono text-text-primary mb-1">
              {finalMatch.robot2 ? finalMatch.robot2.name : 'TBD'}
            </h3>
            <p className="text-sm font-mono text-text-secondary">
              {finalMatch.robot2?.club || 'Finalist 2'}
            </p>
            {finalMatch.robot2 && (
              <div className="mt-4 px-3 py-1 bg-bg-card rounded border border-border font-mono text-xs text-text-muted">
                Tournament Wins: <span className="font-bold text-accent-cyan">{finalMatch.robot2.wins}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================================================
   PHASE 6: CHAMPION PRESENTATION
   Celebrates the grand champion with full focus, trophy, and stats.
   ========================================================================= */
function ChampionPhasePresentation({
  champion,
  tournamentName,
  runnerUp,
  performanceResults,
}: {
  champion: Robot
  tournamentName: string
  runnerUp: Robot | null
  performanceResults?: PerformanceRanking[] | null
}) {
  return (
    <div className="w-full max-w-4xl flex flex-col items-center justify-center text-center gap-5 py-4 my-auto font-mono">
      {/* Trophy with pulsing radial aura */}
      <div className="relative">
        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-accent-gold/20 border-2 border-accent-gold flex items-center justify-center shadow-2xl animate-pulse">
          <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-accent-gold" />
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-accent-gold text-[#0B0D12] text-xs font-bold uppercase px-3 py-0.5 rounded-full shadow-md">
          VICTOR
        </div>
      </div>

      <div>
        <span className="text-xs uppercase tracking-widest text-accent-gold font-bold">
          OFFICIAL ARENA VICTOR CROWNED
        </span>
        <h1 className="text-3xl sm:text-6xl font-black text-text-primary tracking-tight mt-1">
          {champion.name}
        </h1>
        <p className="text-sm sm:text-lg text-text-secondary mt-1">
          {champion.club} {champion.institution && `· ${champion.institution}`}
        </p>
        <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mt-0.5">
          {tournamentName}
        </p>
      </div>

      {/* Official 3-Robot Podium if tournament concluded via performance mode */}
      {performanceResults && performanceResults.length >= 3 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-1">
          {performanceResults.map((res) => {
            const isGold = res.medal === 'gold'
            const isSilver = res.medal === 'silver'
            return (
              <div
                key={res.robot.id}
                className={`p-3.5 rounded border text-left flex flex-col justify-between transition-all ${
                  isGold
                    ? 'bg-accent-gold/10 border-accent-gold/60 order-1 sm:order-2 shadow-lg sm:-translate-y-1'
                    : isSilver
                    ? 'bg-bg-surface border-slate-600/60 order-2 sm:order-1'
                    : 'bg-bg-surface border-amber-900/60 order-3 sm:order-3'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-bold uppercase mb-1">
                    <span className={isGold ? 'text-accent-gold' : isSilver ? 'text-slate-300' : 'text-amber-500'}>
                      {isGold ? '1st Place' : isSilver ? '2nd Place' : '3rd Place'}
                    </span>
                    <span className="text-text-muted">#{res.ranking}</span>
                  </div>
                  <h4 className="text-sm font-bold text-text-primary truncate">{res.robot.name}</h4>
                  <p className="text-[10px] text-text-muted truncate">{res.robot.club}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-border/60 flex items-center justify-between text-xs font-bold">
                  <span className="text-accent-gold">{res.points} pts</span>
                  <span className="text-text-muted">{res.time.toFixed(1)}s</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Standard Stats Cards */
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 p-4 rounded bg-bg-surface border border-accent-gold/40 shadow-xl">
          <div className="text-center px-4">
            <span className="text-[10px] uppercase text-text-muted block">Tournament Wins</span>
            <span className="text-2xl font-black text-accent-gold">{champion.wins}</span>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div className="text-center px-4">
            <span className="text-[10px] uppercase text-text-muted block">Title Status</span>
            <span className="text-sm font-bold text-emerald-400">Undefeated Champion</span>
          </div>
          {runnerUp && (
            <>
              <div className="h-8 w-px bg-border hidden sm:block" />
              <div className="text-center px-4">
                <span className="text-[10px] uppercase text-text-muted block">Honorary Runner-Up</span>
                <span className="text-sm font-bold text-text-primary">{runnerUp.name}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* =========================================================================
   PHASE 7: INDIVIDUAL PERFORMANCE PRESENTATION (TOP 3 COMBATANTS)
   Full-screen projection of solo performance trials and live scores.
   ========================================================================= */
function IndividualPerformancePhasePresentation({
  tournament,
}: {
  tournament: Tournament
}) {
  const activeRobots = tournament.robots.filter((r) => r.status === 'active')
  const completedPerformances = tournament.performances || []
  const unperformedRobots = activeRobots.filter(
    (r) => !completedPerformances.some((p) => p.robotId === r.id)
  )
  const currentRobot = unperformedRobots[0] || null
  const rankings = tournament.performanceResults || null

  return (
    <div className="w-full max-w-6xl h-full flex flex-col justify-between p-2 sm:p-6 font-mono select-none">
      {/* Header telemetry */}
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div>
          <span className="text-xs uppercase tracking-widest text-accent-gold font-bold">
            STAGE 5 · SOLO PERFORMANCE TRIALS
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight">
            TOP 3 COMBATANTS SKILLS & TIME RUNS
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">Trials Complete:</span>
          <span className="text-sm font-bold text-accent-gold bg-accent-gold/10 border border-accent-gold/30 px-3 py-1 rounded">
            {completedPerformances.length} / {activeRobots.length}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 my-auto items-center py-4">
        {/* Left 6 cols: Active Trial Spotlight */}
        <div className="lg:col-span-6 flex flex-col justify-center gap-4">
          {currentRobot ? (
            <div className="bg-bg-surface/90 border-2 border-accent-gold rounded-xl p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-accent-gold text-[#0B0D12] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl">
                ACTIVE ON ARENA
              </div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">
                CURRENT COMBATANT ON TEST BENCH
              </div>
              <h3 className="text-3xl sm:text-4xl font-black text-text-primary mt-1 tracking-tight">
                {currentRobot.name}
              </h3>
              <p className="text-sm text-accent-gold font-semibold mt-1">
                {currentRobot.club} {currentRobot.institution && `· ${currentRobot.institution}`}
              </p>

              <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 gap-4 text-center">
                <div className="bg-bg-card p-3 rounded border border-border/60">
                  <span className="text-[10px] text-text-muted uppercase block">Primary Score</span>
                  <span className="text-sm text-text-secondary mt-1 block">Awaiting Judge</span>
                </div>
                <div className="bg-bg-card p-3 rounded border border-border/60">
                  <span className="text-[10px] text-text-muted uppercase block">Elapsed Time</span>
                  <span className="text-sm text-text-secondary mt-1 block">Awaiting Timer</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-bg-surface/90 border border-accent-gold/60 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-full bg-accent-gold/20 border border-accent-gold flex items-center justify-center text-accent-gold">
                <Check className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-text-primary">All Trials Completed</h3>
              <p className="text-xs text-text-secondary">
                Official times and scores confirmed. Calculating final podium placements.
              </p>
            </div>
          )}

          {/* Up Next Queue */}
          {unperformedRobots.length > 1 && (
            <div className="flex items-center gap-3 text-xs bg-bg-card/80 p-3 rounded border border-border">
              <span className="text-text-muted uppercase text-[10px] font-bold">On Deck:</span>
              <span className="text-text-primary font-bold">
                {unperformedRobots[1]?.name} ({unperformedRobots[1]?.club})
              </span>
            </div>
          )}
        </div>

        {/* Right 6 cols: Live Standings / Recorded Runs */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-text-secondary font-bold">
              OFFICIAL TRIAL LEADERBOARD
            </span>
            <span className="text-[10px] text-text-muted">Ranked by points (tiebreaker: time)</span>
          </div>

          <div className="bg-bg-surface/90 border border-border rounded-xl divide-y divide-border/60 overflow-hidden shadow-xl">
            {completedPerformances.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted">
                No performances submitted yet. Judging in progress...
              </div>
            ) : rankings ? (
              rankings.map((res) => (
                <div
                  key={res.robot.id}
                  className="p-4 flex items-center justify-between hover:bg-bg-card/80 transition-colors gap-4"
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                        res.medal === 'gold'
                          ? 'bg-accent-gold/20 text-accent-gold border border-accent-gold/50 shadow-md'
                          : res.medal === 'silver'
                          ? 'bg-slate-300/20 text-slate-200 border border-slate-400/50'
                          : 'bg-amber-800/20 text-amber-500 border border-amber-700/50'
                      }`}
                    >
                      #{res.ranking}
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-text-primary">{res.robot.name}</h4>
                      <p className="text-xs text-text-muted">{res.robot.club}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-lg font-black text-accent-gold tabular-nums block">
                      {res.points} pts
                    </span>
                    <span className="text-xs text-text-muted tabular-nums">
                      {res.time.toFixed(1)}s
                    </span>
                  </div>
                </div>
              ))
            ) : (
              completedPerformances.map((perf, idx) => {
                const r = activeRobots.find((bot) => bot.id === perf.robotId)
                return (
                  <div
                    key={perf.id}
                    className="p-4 flex items-center justify-between hover:bg-bg-card/80 transition-colors gap-4"
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="text-sm font-bold text-text-muted">#{idx + 1}</span>
                      <div>
                        <h4 className="text-base font-bold text-text-primary">
                          {r?.name || 'Combatant'}
                        </h4>
                        <p className="text-xs text-text-muted">{r?.club}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-accent-gold tabular-nums block">
                        {perf.points} pts
                      </span>
                      <span className="text-xs text-text-muted tabular-nums">
                        {perf.time.toFixed(1)}s
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   HELPER COMPONENT: KNOCKOUT DUEL CARD
   ========================================================================= */
function KnockoutDuelCard({
  match,
  isCurrent,
  title,
}: {
  match: Match
  isCurrent: boolean
  title: string
}) {
  const isDone = match.status === 'recorded' || match.status === 'locked'
  const isWinner1 = isDone && match.winner?.id === match.robot1?.id
  const isWinner2 = isDone && match.winner?.id === match.robot2?.id

  return (
    <div
      className={clsx(
        'rounded border font-mono p-4 flex flex-col gap-2 transition-all shadow-md',
        isCurrent
          ? 'bg-bg-surface border-accent-cyan ring-1 ring-accent-cyan/50 shadow-cyan-500/10'
          : isDone
          ? 'bg-bg-surface border-border'
          : 'bg-bg-card border-border/60'
      )}
    >
      <div className="flex items-center justify-between text-xs pb-1.5 border-b border-border/50">
        <span className="font-bold text-text-secondary">{title} · Match {match.matchNumber}</span>
        {isCurrent && !isDone ? (
          <span className="text-accent-cyan font-bold flex items-center gap-1 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-ping" />
            LIVE BOUT
          </span>
        ) : isDone ? (
          <span className="text-emerald-400 font-bold text-[11px]">FINAL</span>
        ) : (
          <span className="text-text-muted text-[11px]">SCHEDULED</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        {/* Slot 1 */}
        <div
          className={clsx(
            'flex items-center justify-between px-3 py-2 rounded text-xs',
            isWinner1
              ? 'bg-accent-gold/20 text-accent-gold font-bold border border-accent-gold/50'
              : isDone && !isWinner1
              ? 'text-text-muted opacity-55'
              : 'text-text-primary'
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-accent-gold">{isWinner1 && '▶'}</span>
            <span className="font-bold">{match.robot1 ? match.robot1.name : 'TBD'}</span>
            {match.robot1?.club && (
              <span className="text-[10px] text-text-muted">({match.robot1.club})</span>
            )}
          </div>
          {isWinner1 && <Check className="w-4 h-4 text-accent-gold stroke-[3]" />}
        </div>

        {/* Slot 2 */}
        <div
          className={clsx(
            'flex items-center justify-between px-3 py-2 rounded text-xs',
            isWinner2
              ? 'bg-accent-gold/20 text-accent-gold font-bold border border-accent-gold/50'
              : isDone && !isWinner2
              ? 'text-text-muted opacity-55'
              : 'text-text-primary'
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-accent-gold">{isWinner2 && '▶'}</span>
            <span className="font-bold">{match.robot2 ? match.robot2.name : 'BYE'}</span>
            {match.robot2?.club && (
              <span className="text-[10px] text-text-muted">({match.robot2.club})</span>
            )}
          </div>
          {isWinner2 && <Check className="w-4 h-4 text-accent-gold stroke-[3]" />}
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   HELPER COMPONENT: LIVE DUEL SPOTLIGHT
   ========================================================================= */
function LiveDuelSpotlight({
  match,
  stageLabel,
}: {
  match: Match
  stageLabel: string
}) {
  return (
    <div className="w-full max-w-5xl flex flex-col items-center justify-center gap-6 my-auto font-mono text-center">
      <div>
        <span className="text-xs uppercase tracking-widest text-accent-cyan font-bold px-3 py-1 rounded bg-accent-cyan/15 border border-accent-cyan/40 inline-block mb-2">
          ACTIVE BOUT · {stageLabel}
        </span>
        <h2 className="text-3xl sm:text-5xl font-black text-text-primary tracking-tight">
          HEAD-TO-HEAD DUEL
        </h2>
      </div>

      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 relative items-center">
        {/* Combatant 1 */}
        <div className="bg-bg-surface border-2 border-accent-gold/50 p-6 sm:p-8 rounded flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-accent-gold" />
          <span className="text-xs font-mono uppercase tracking-wider text-accent-gold font-bold mb-2">
            RED CORNER
          </span>
          <div className="w-20 h-20 rounded-full bg-accent-gold/15 border border-accent-gold/40 flex items-center justify-center font-mono text-3xl font-extrabold text-accent-gold mb-4">
            {match.robot1 ? match.robot1.name.slice(0, 3).toUpperCase() : 'TBD'}
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-text-primary mb-1">
            {match.robot1 ? match.robot1.name : 'TBD'}
          </h3>
          <p className="text-sm text-text-secondary">
            {match.robot1?.club || 'Independent'}
          </p>
        </div>

        {/* VS Badge */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-14 h-14 rounded-full bg-[#0B0D12] border-2 border-border-strong items-center justify-center font-mono font-black text-sm text-text-primary shadow-2xl">
          VS
        </div>

        {/* Combatant 2 */}
        <div className="bg-bg-surface border-2 border-accent-cyan/50 p-6 sm:p-8 rounded flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-accent-cyan" />
          <span className="text-xs font-mono uppercase tracking-wider text-accent-cyan font-bold mb-2">
            BLUE CORNER
          </span>
          <div className="w-20 h-20 rounded-full bg-accent-cyan/15 border border-accent-cyan/40 flex items-center justify-center font-mono text-3xl font-extrabold text-accent-cyan mb-4">
            {match.robot2 ? match.robot2.name.slice(0, 3).toUpperCase() : 'BYE'}
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-text-primary mb-1">
            {match.robot2 ? match.robot2.name : 'BYE / AUTO-ADVANCE'}
          </h3>
          <p className="text-sm text-text-secondary">
            {match.robot2?.club || 'Auto-Advance'}
          </p>
        </div>
      </div>
    </div>
  )
}
