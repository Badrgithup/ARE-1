'use client'

import React from 'react'
import type { Tournament } from '@/lib/types'

export interface StageTimelineProps {
  tournament: Tournament
  onSelectRound?: (roundNumber: number) => void
  activeRoundNumber?: number
}

interface StageStep {
  roundNumber?: number
  label: string
  sublabel: string
  status: 'completed' | 'active' | 'upcoming'
}

export function StageTimeline({
  tournament,
  onSelectRound,
  activeRoundNumber,
}: StageTimelineProps) {
  // Build stage steps from actual tournament data
  const steps: StageStep[] = tournament.rounds.map((round) => {
    let label = `Round ${round.roundNumber}`
    if (round.stage === 'group_stage') label = 'Group Stage'
    else if (round.stage === 'semifinals') label = 'Semifinals'
    else if (round.stage === 'final') label = 'Final'
    else if (round.roundNumber === 1) label = 'Qualification'

    const sublabel = `${round.matches.length} ${round.matches.length === 1 ? 'match' : 'matches'}`
    const isCompleted = round.status === 'completed'
    const isActive = round.roundNumber === tournament.currentRound && tournament.status !== 'completed'

    return {
      roundNumber: round.roundNumber,
      label,
      sublabel,
      status: isCompleted ? 'completed' : isActive ? 'active' : 'upcoming',
    }
  })

  // If completed, add Champion step
  if (tournament.status === 'completed' && tournament.winner) {
    steps.push({
      label: 'Champion',
      sublabel: tournament.winner.name,
      status: 'completed',
    })
  }

  return (
    <div className="w-full bg-bg-surface border border-border rounded-lg p-3 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-max">
        {steps.map((step, idx) => {
          const isSelected = activeRoundNumber === step.roundNumber
          return (
            <React.Fragment key={step.label + idx}>
              <div
                onClick={() => step.roundNumber && onSelectRound && onSelectRound(step.roundNumber)}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded border transition-colors ${
                  step.roundNumber && onSelectRound ? 'cursor-pointer' : ''
                } ${
                  isSelected
                    ? 'border-accent-cyan bg-accent-cyan/10 text-text-primary'
                    : step.status === 'completed'
                    ? 'border-border bg-bg-card text-text-secondary hover:border-border-strong'
                    : step.status === 'active'
                    ? 'border-accent-gold/40 bg-accent-gold/5 text-accent-gold'
                    : 'border-border/50 text-text-muted opacity-60'
                }`}
              >
                {/* Step indicator */}
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                    step.status === 'completed'
                      ? 'bg-success/20 text-success'
                      : step.status === 'active'
                      ? 'bg-accent-gold text-[#0B0D12]'
                      : 'bg-bg-card text-text-muted border border-border'
                  }`}
                >
                  {step.status === 'completed' ? '✓' : idx + 1}
                </span>

                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold font-mono leading-tight">{step.label}</span>
                  <span className="text-[10px] text-text-muted font-mono leading-none">{step.sublabel}</span>
                </div>
              </div>

              {/* Arrow connector */}
              {idx < steps.length - 1 && (
                <span className="text-border-strong text-xs font-mono select-none">→</span>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
