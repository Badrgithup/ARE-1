'use client'

import React from 'react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { BatchSelector } from '../ui/BatchSelector'
import type { Round } from '@/lib/types'

export interface PairingsOverviewProps {
  round: Round
  onStartRound: () => void
  onReRandomize: () => void
  batchSize: number
  onBatchSizeChange: (size: number) => void
}

export function PairingsOverview({
  round,
  onStartRound,
  onReRandomize,
  batchSize,
  onBatchSizeChange,
}: PairingsOverviewProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Control bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-bg-surface p-3.5 rounded border border-border">
        <div>
          <h2 className="text-sm font-bold font-mono text-text-primary uppercase tracking-wide">
            {round.stage === 'group_stage'
              ? 'Group Stage Schedule'
              : round.stage === 'semifinals'
              ? 'Semifinal Pairings'
              : round.stage === 'final'
              ? 'Championship Match'
              : `Round ${round.roundNumber} Seed Pairings`}
          </h2>
          <p className="text-xs text-text-muted font-mono mt-0.5">
            {round.matches.length} Scheduled Duels
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <BatchSelector value={batchSize} onChange={onBatchSizeChange} />
          {round.stage !== 'group_stage' && round.stage !== 'semifinals' && round.stage !== 'final' && !round.matches.some(m => !m.isBye && m.status !== 'pending') && (
            <Button variant="secondary" size="sm" onClick={onReRandomize} className="font-mono text-xs">
              Reshuffle Seeds
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onStartRound} className="font-mono text-xs">
            {round.status === 'completed' || round.matches.every(m => m.status !== 'pending')
              ? 'View Round Summary →'
              : 'Begin Judging Duels →'}
          </Button>
        </div>
      </div>

      {/* Match Seed Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {round.matches.map((match) => (
          <Card key={match.id} padding="sm" className="flex flex-col border border-border bg-bg-card">
            <div className="flex justify-between items-center mb-2 text-[10px] font-mono text-text-muted border-b border-border/50 pb-1">
              <span>{match.groupName ? `${match.groupName} · ` : ''}Match {String(match.matchNumber).padStart(2, '0')}</span>
              {match.status !== 'pending' && (
                <Badge variant={match.status === 'recorded' ? 'green' : 'gray'}>
                  {match.status}
                </Badge>
              )}
            </div>

            {match.isBye || !match.robot2 ? (
              <div className="flex flex-col items-center justify-center py-3 bg-bg-surface rounded border border-border/50 text-center font-mono">
                <span className="font-bold text-xs text-text-primary">{match.robot1.name}</span>
                <span className="text-[11px] text-text-secondary">{match.robot1.club}</span>
                <span className="text-[10px] text-accent-gold mt-1.5 uppercase tracking-wider">
                  BYE (Auto-Advance)
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 font-mono text-xs">
                <div
                  className={`flex-1 p-2 rounded ${
                    match.winner?.id === match.robot1.id
                      ? 'bg-accent-gold/15 text-accent-gold font-bold'
                      : 'bg-bg-surface text-text-primary'
                  }`}
                >
                  <span className="truncate block" title={match.robot1.name}>
                    {match.robot1.name}
                  </span>
                  <span className="text-[10px] text-text-muted truncate block font-normal">
                    {match.robot1.club}
                  </span>
                </div>

                <div className="text-text-muted font-bold text-[10px] px-1 select-none">
                  VS
                </div>

                <div
                  className={`flex-1 p-2 rounded text-right ${
                    match.winner?.id === match.robot2.id
                      ? 'bg-accent-gold/15 text-accent-gold font-bold'
                      : 'bg-bg-surface text-text-primary'
                  }`}
                >
                  <span className="truncate block" title={match.robot2.name}>
                    {match.robot2.name}
                  </span>
                  <span className="text-[10px] text-text-muted truncate block font-normal">
                    {match.robot2.club}
                  </span>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
