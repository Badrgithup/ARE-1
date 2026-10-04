'use client'

import React, { useState } from 'react'
import type { Tournament, Round } from '@/lib/types'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { TournamentBracketTree } from './TournamentBracketTree'
import { GroupStandingsTable } from './GroupStandingsTable'
import { calculateGroupStandings } from '@/lib/group-stage-engine'
import { GitBranch, Columns3 } from 'lucide-react'

export interface TournamentBracketViewProps {
  tournament: Tournament
  onSelectMatch?: (matchId: string) => void
  isProjector?: boolean
  className?: string
}

function getStageName(round: Round): string {
  if (round.stage === 'group_stage') return 'Group Stage (Round-Robin)'
  if (round.stage === 'semifinals') return 'Semifinals'
  if (round.stage === 'final') return 'Championship Final'
  if (round.roundNumber === 1) return 'Qualification / Round 1'
  return `Round ${round.roundNumber}`
}

export function TournamentBracketView({
  tournament,
  onSelectMatch,
  isProjector = false,
  className,
}: TournamentBracketViewProps) {
  const [displayMode, setDisplayMode] = useState<'tree' | 'columns'>('tree')
  const activeRobots = tournament.robots.filter((r) => r.status === 'active')

  return (
    <div className="w-full flex flex-col gap-4">
      {/* View Switcher Header (Hidden in Projector Mode) */}
      {!isProjector && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-bg-surface p-3 rounded border border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">
              Tournament Structure
            </span>
            <span className="text-text-muted text-xs font-mono">·</span>
            <span className="text-xs font-mono text-text-muted">
              {displayMode === 'tree' ? 'Visual Competition Tree' : 'Stage Column Log'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-bg-card p-1 rounded border border-border">
            <button
              onClick={() => setDisplayMode('tree')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                displayMode === 'tree'
                  ? 'bg-accent-gold text-[#0B0D12] font-bold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Bracket Tree
            </button>
            <button
              onClick={() => setDisplayMode('columns')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                displayMode === 'columns'
                  ? 'bg-accent-gold text-[#0B0D12] font-bold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Column Log
            </button>
          </div>
        </div>
      )}

      {/* 1. VISUAL COMPETITION TREE (DEFAULT) */}
      {displayMode === 'tree' && (
        <TournamentBracketTree
          tournament={tournament}
          onSelectMatch={onSelectMatch}
          isProjector={isProjector}
          className={className}
        />
      )}

      {/* 2. STAGE COLUMN LOG (ALTERNATIVE INSPECTION) */}
      {displayMode === 'columns' && (
        <div className="w-full overflow-x-auto pb-4">
          <div className="flex gap-6 min-w-max items-start">
            {tournament.rounds.map((round) => {
              const isGroup = round.stage === 'group_stage'
              const isCurrent =
                round.roundNumber === tournament.currentRound && tournament.status !== 'completed'

              return (
                <div key={round.id} className="w-72 sm:w-80 flex flex-col gap-3 shrink-0">
                  {/* Stage Column Header */}
                  <div
                    className={`p-2.5 rounded border text-left flex items-center justify-between ${
                      isCurrent
                        ? 'bg-bg-card border-accent-gold/40'
                        : round.status === 'completed'
                        ? 'bg-bg-surface border-border'
                        : 'bg-bg-surface/50 border-border/50 opacity-60'
                    }`}
                  >
                    <div>
                      <h3 className="text-xs font-bold font-mono text-text-primary tracking-tight">
                        {getStageName(round)}
                      </h3>
                      <p className="text-[10px] text-text-muted font-mono">
                        {round.completedMatches} / {round.totalMatches} Matches Recorded
                      </p>
                    </div>
                    <Badge variant={round.status === 'completed' ? 'green' : isCurrent ? 'gold' : 'gray'}>
                      {round.status === 'completed' ? 'Done' : isCurrent ? 'Active' : 'Pending'}
                    </Badge>
                  </div>

                  {/* Match Cards in this Round */}
                  <div className="flex flex-col gap-2.5">
                    {round.matches.map((match) => {
                      const isRecorded = match.status === 'recorded' || match.status === 'locked'
                      const r1Won = match.winner?.id === match.robot1?.id
                      const r2Won = match.robot2 && match.winner?.id === match.robot2.id

                      return (
                        <div
                          key={match.id}
                          onClick={() => onSelectMatch && onSelectMatch(match.id)}
                          className={`p-3 rounded border text-xs font-mono transition-colors ${
                            onSelectMatch ? 'cursor-pointer hover:border-border-strong' : ''
                          } ${
                            isRecorded ? 'bg-bg-card border-border' : 'bg-bg-surface border-border/70'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-text-muted border-b border-border/50 pb-1.5 mb-2">
                            <span className="font-semibold text-text-secondary">
                              {match.groupName ? `${match.groupName} · ` : ''}Match{' '}
                              {String(match.matchNumber).padStart(2, '0')}
                            </span>
                            <span>
                              {match.isBye
                                ? 'Auto-Advancement (BYE)'
                                : isRecorded
                                ? 'Result Confirmed'
                                : 'Pending Match'}
                            </span>
                          </div>

                          {/* Combatant 1 */}
                          <div
                            className={`flex items-center justify-between py-1 px-1.5 rounded ${
                              r1Won
                                ? 'bg-accent-gold/10 text-accent-gold font-bold'
                                : isRecorded
                                ? 'text-text-muted opacity-60'
                                : 'text-text-primary'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-3 text-center text-[10px]">
                                {r1Won ? '▶' : ' '}
                              </span>
                              <span className="truncate">{match.robot1.name}</span>
                            </div>
                            <span className="text-[10px] text-text-muted truncate ml-2 font-normal">
                              {match.robot1.club}
                            </span>
                          </div>

                          <div className="text-[9px] text-text-muted/60 text-center py-0.5 select-none font-mono">
                            VS
                          </div>

                          {/* Combatant 2 */}
                          {match.robot2 ? (
                            <div
                              className={`flex items-center justify-between py-1 px-1.5 rounded ${
                                r2Won
                                  ? 'bg-accent-gold/10 text-accent-gold font-bold'
                                  : isRecorded
                                  ? 'text-text-muted opacity-60'
                                  : 'text-text-primary'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-3 text-center text-[10px]">
                                  {r2Won ? '▶' : ' '}
                                </span>
                                <span className="truncate">{match.robot2.name}</span>
                              </div>
                              <span className="text-[10px] text-text-muted truncate ml-2 font-normal">
                                {match.robot2.club}
                              </span>
                            </div>
                          ) : (
                            <div className="py-1 px-1.5 rounded text-text-muted opacity-40 italic">
                              No Opponent (BYE)
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* If Round is Group Stage, also show the standings */}
                  {isGroup && (
                    <div className="mt-2">
                      <GroupStandingsTable
                        standings={calculateGroupStandings(round.matches, activeRobots)}
                        format={tournament.config?.finalFormat || '2-to-final'}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Champion Column if Tournament Completed */}
            {tournament.status === 'completed' && tournament.winner && (
              <div className="w-72 sm:w-80 flex flex-col gap-3 shrink-0">
                <div className="p-2.5 rounded border border-accent-gold/40 bg-accent-gold/10 text-left flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold font-mono text-accent-gold tracking-tight">
                      Tournament Champion
                    </h3>
                    <p className="text-[10px] text-text-muted font-mono">Official Victor</p>
                  </div>
                  <Badge variant="gold">Champion</Badge>
                </div>

                <div className="p-4 rounded border border-accent-gold/40 bg-bg-card flex flex-col gap-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-accent-gold">
                      First Place
                    </span>
                    <h4 className="text-xl font-bold font-mono text-text-primary mt-0.5">
                      {tournament.winner.name}
                    </h4>
                    <p className="text-xs text-text-secondary font-sans mt-0.5">
                      {tournament.winner.club}
                    </p>
                    {tournament.winner.institution && (
                      <p className="text-[11px] text-text-muted font-mono mt-0.5">
                        {tournament.winner.institution}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-border pt-2.5 flex items-center justify-between text-xs font-mono text-text-muted">
                    <span>Matches Won:</span>
                    <span className="font-bold text-accent-gold">{tournament.winner.wins}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
