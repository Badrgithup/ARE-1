'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, GitBranch, Swords, Trophy, Maximize2, Minimize2 } from 'lucide-react'
import type { Tournament, Match } from '@/lib/types'
import { TournamentBracketTree } from './TournamentBracketTree'

export interface ArenaPresentationModalProps {
  isOpen: boolean
  onClose: () => void
  tournament: Tournament
  currentMatch: Match | null
  currentMatchIndex: number
  totalMatches: number
  onSelectWinner?: (matchId: string, robotId: string) => void
}

type ProjectorMode = 'tree' | 'duel' | 'champion'

export function ArenaPresentationModal({
  isOpen,
  onClose,
  tournament,
  currentMatch,
  currentMatchIndex,
  totalMatches,
}: ArenaPresentationModalProps) {
  const currentRound = tournament.rounds[tournament.rounds.length - 1]
  const champion = tournament.winner

  // Default to 'tree' (Bracket Tree) or 'champion' if completed
  const [slideMode, setSlideMode] = useState<ProjectorMode>(
    champion ? 'champion' : 'tree'
  )
  const [isFullscreen, setIsFullscreen] = useState(false)

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
      console.warn('Fullscreen request failed:', err)
    }
  }

  useEffect(() => {
    if (champion) {
      setSlideMode('champion')
    }
  }, [champion])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      } else if (e.key === 't' || e.key === 'T') {
        setSlideMode('tree')
      } else if (e.key === 'd' || e.key === 'D') {
        if (currentMatch) setSlideMode('duel')
      } else if (e.key === 'c' || e.key === 'C') {
        if (champion) setSlideMode('champion')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, currentMatch, champion])

  if (!isOpen) return null

  const stageLabel =
    currentRound?.stage === 'group_stage'
      ? 'Group Stage'
      : currentRound?.stage === 'semifinals'
      ? 'Semifinals'
      : currentRound?.stage === 'final'
      ? 'Championship Final'
      : `Round ${currentRound?.roundNumber || 1}`

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0D12] text-[#F1F3F9] flex flex-col h-[100dvh] w-screen overflow-hidden select-none font-sans">
      {/* Top Arena Projector Header Bar */}
      <div className="h-16 px-6 sm:px-10 flex items-center justify-between border-b border-border bg-[#0B0D12] shrink-0">
        {/* Left: Official Arena Branding */}
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded overflow-hidden border border-border-strong bg-black shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/are-logo.jpg"
              alt="Association Robotique ENSI"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-accent-gold font-mono font-bold">
                ROBOCUP ARENA
              </span>
              <span className="text-text-muted text-xs">·</span>
              <span className="text-xs font-mono text-accent-cyan font-semibold">
                {stageLabel}
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-bold font-mono text-text-primary tracking-tight">
              {tournament.name}
            </h1>
          </div>
        </div>

        {/* Center: Live Match Announcement / Status Ticker */}
        {currentMatch && slideMode === 'tree' && !champion && (
          <div className="hidden md:flex items-center gap-2.5 px-3 py-1 rounded bg-bg-surface border border-accent-cyan/30 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-accent-cyan animate-ping" />
            <span className="text-text-muted">LIVE DUEL:</span>
            <span className="font-bold text-accent-gold">{currentMatch.robot1.name}</span>
            <span className="text-text-muted">VS</span>
            <span className="font-bold text-accent-cyan">
              {currentMatch.robot2?.name || 'BYE'}
            </span>
            <span className="text-[10px] text-text-muted">
              (Match {currentMatch.matchNumber})
            </span>
          </div>
        )}

        {/* Right: Presentation View Switcher & Exit */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 bg-bg-card p-1 rounded border border-border">
            <button
              onClick={() => setSlideMode('tree')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                slideMode === 'tree'
                  ? 'bg-accent-gold text-[#0B0D12] font-bold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Competition Tree</span>
            </button>

            {currentMatch && (
              <button
                onClick={() => setSlideMode('duel')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                  slideMode === 'duel'
                    ? 'bg-accent-gold text-[#0B0D12] font-bold shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Swords className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Duel Spotlight</span>
              </button>
            )}

            {champion && (
              <button
                onClick={() => setSlideMode('champion')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                  slideMode === 'champion'
                    ? 'bg-accent-gold text-[#0B0D12] font-bold shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Champion</span>
              </button>
            )}
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-bg-card hover:bg-bg-card-hover border border-border text-text-primary text-xs font-mono font-medium transition-colors cursor-pointer"
            title="Toggle Fullscreen [F]"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-accent-gold" />
                <span className="hidden sm:inline">Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-accent-gold" />
                <span className="hidden sm:inline">Fullscreen</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded bg-bg-card hover:bg-bg-card-hover border border-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            title="Exit Projector Mode [ESC]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Screen Projection Content */}
      <div className="flex-1 flex flex-col justify-center items-center relative overflow-hidden p-4 sm:p-6">
        {/* VIEW 1: COMPETITION BRACKET TREE (DEFAULT) */}
        {slideMode === 'tree' && (
          <div className="w-full h-full flex flex-col justify-center">
            <TournamentBracketTree
              tournament={tournament}
              isProjector={true}
              className="h-full border-none bg-transparent"
            />
          </div>
        )}

        {/* VIEW 2: ARENA DUEL SPOTLIGHT */}
        {slideMode === 'duel' && currentMatch && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-5xl flex flex-col items-center justify-center"
          >
            {/* Duel Header */}
            <div className="mb-8 text-center">
              <span className="px-4 py-1.5 rounded bg-bg-surface border border-accent-cyan/40 text-accent-cyan text-xs font-mono font-bold uppercase tracking-widest inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-cyan animate-ping" />
                {stageLabel} · Match {currentMatch.matchNumber} of {totalMatches}
              </span>
            </div>

            {/* Combatant Arena Duel Cards (Display only, no admin controls) */}
            <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-8 items-center">
              {/* Combatant 1 */}
              <div
                className={`flex flex-col items-center text-center p-8 sm:p-10 rounded-xl border transition-all ${
                  currentMatch.winner?.id === currentMatch.robot1.id
                    ? 'bg-bg-surface border-accent-gold shadow-lg shadow-amber-500/10'
                    : 'bg-bg-surface/90 border-border'
                }`}
              >
                <span className="text-[11px] font-mono uppercase tracking-widest text-text-muted mb-2">
                  Corner Red · Combatant A
                </span>
                <h3 className="text-4xl sm:text-6xl font-bold font-mono tracking-tight text-white mb-2">
                  {currentMatch.robot1.name}
                </h3>
                <p className="text-lg text-text-secondary font-medium font-sans">
                  {currentMatch.robot1.club}
                </p>
                {currentMatch.robot1.institution && (
                  <p className="text-xs text-text-muted mt-1 font-mono">
                    {currentMatch.robot1.institution}
                  </p>
                )}
                {currentMatch.winner?.id === currentMatch.robot1.id && (
                  <span className="mt-5 px-4 py-1 rounded bg-accent-gold text-[#0B0D12] text-xs font-mono font-bold uppercase tracking-wider">
                    Victor Confirmed ✓
                  </span>
                )}
              </div>

              {/* VS Emblem */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-bg-card border border-border flex items-center justify-center font-mono font-bold text-lg text-accent-gold shadow-md">
                  VS
                </div>
              </div>

              {/* Combatant 2 */}
              {currentMatch.robot2 ? (
                <div
                  className={`flex flex-col items-center text-center p-8 sm:p-10 rounded-xl border transition-all ${
                    currentMatch.winner?.id === currentMatch.robot2.id
                      ? 'bg-bg-surface border-accent-gold shadow-lg shadow-amber-500/10'
                      : 'bg-bg-surface/90 border-border'
                  }`}
                >
                  <span className="text-[11px] font-mono uppercase tracking-widest text-text-muted mb-2">
                    Corner Blue · Combatant B
                  </span>
                  <h3 className="text-4xl sm:text-6xl font-bold font-mono tracking-tight text-white mb-2">
                    {currentMatch.robot2.name}
                  </h3>
                  <p className="text-lg text-text-secondary font-medium font-sans">
                    {currentMatch.robot2.club}
                  </p>
                  {currentMatch.robot2.institution && (
                    <p className="text-xs text-text-muted mt-1 font-mono">
                      {currentMatch.robot2.institution}
                    </p>
                  )}
                  {currentMatch.winner?.id === currentMatch.robot2.id && (
                    <span className="mt-5 px-4 py-1 rounded bg-accent-gold text-[#0B0D12] text-xs font-mono font-bold uppercase tracking-wider">
                      Victor Confirmed ✓
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-10 rounded-xl bg-bg-surface border border-border/40 opacity-40 text-center font-mono">
                  <span className="text-4xl font-bold text-text-muted">BYE</span>
                  <p className="text-xs text-text-muted mt-2">Automatic Advancement</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* VIEW 3: CHAMPION CEREMONY */}
        {slideMode === 'champion' && champion && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center justify-center text-center max-w-4xl"
          >
            <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-accent-gold mb-6 bg-black shadow-xl shadow-amber-500/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/are-logo.jpg"
                alt="Association Robotique ENSI"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-accent-gold font-mono font-bold mb-2">
              Official Tournament Champion
            </span>
            <h1 className="text-5xl sm:text-7xl font-bold font-mono tracking-tight text-white mb-3">
              {champion.name}
            </h1>
            <p className="text-2xl text-text-secondary font-medium mb-8 font-sans">
              {champion.club} {champion.institution && `· ${champion.institution}`}
            </p>
            <div className="inline-flex items-center gap-8 px-8 py-3.5 rounded border border-border bg-bg-surface font-mono">
              <div>
                <span className="text-3xl font-bold text-accent-gold tabular-nums">{champion.wins}</span>
                <span className="text-[10px] text-text-muted uppercase tracking-wider block">Victories</span>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <span className="text-3xl font-bold text-white tabular-nums">{tournament.totalRobots}</span>
                <span className="text-[10px] text-text-muted uppercase tracking-wider block">Field Size</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Projector Audience Footer */}
      <div className="h-9 px-8 flex items-center justify-between border-t border-border bg-[#0B0D12] text-[11px] font-mono text-text-muted shrink-0">
        <div>RoboCup Arena · Official Competition Display System</div>
        <div className="flex items-center gap-4">
          <span>[T] Competition Tree</span>
          {currentMatch && <span>· [D] Duel Spotlight</span>}
          {champion && <span>· [C] Champion</span>}
          <span>· [ESC] Exit</span>
        </div>
      </div>
    </div>
  )
}
