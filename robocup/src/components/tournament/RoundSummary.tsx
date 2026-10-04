'use client'

import React from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { Round } from '@/lib/types'

export interface RoundSummaryProps {
  round: Round
  robotsRemaining: number
  onStartNextRound: () => void
  isFinal: boolean
  nextStageLabel?: string
}

export function RoundSummary({
  round,
  robotsRemaining,
  onStartNextRound,
  isFinal,
  nextStageLabel,
}: RoundSummaryProps) {
  const eliminatedCount = round.matches.filter((m) => !m.isBye && m.loser).length

  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto w-full">
      {/* Stage Summary Panel */}
      <Card padding="md" className="border-border bg-bg-surface flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3.5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              Stage Conclusion
            </span>
            <h2 className="text-xl font-bold font-mono text-text-primary mt-0.5">
              {round.stage === 'group_stage'
                ? 'Group Stage Concluded'
                : round.stage === 'semifinals'
                ? 'Semifinals Concluded'
                : round.stage === 'final'
                ? 'Championship Final Concluded'
                : `Round ${round.roundNumber} Concluded`}
            </h2>
          </div>

          <Button size="md" variant="primary" onClick={onStartNextRound} className="font-mono text-xs">
            {isFinal
              ? 'View Champion & Final Standings →'
              : nextStageLabel
              ? `${nextStageLabel} →`
              : `Proceed to Round ${round.roundNumber + 1} →`}
          </Button>
        </div>

        {/* Telemetry numbers */}
        <div className="grid grid-cols-3 gap-4 font-mono text-center">
          <div className="bg-bg-card p-3 rounded border border-border">
            <span className="text-2xl font-bold text-text-primary tabular-nums">
              {round.matches.length}
            </span>
            <span className="text-[10px] text-text-muted uppercase block mt-0.5">
              Matches Completed
            </span>
          </div>

          <div className="bg-bg-card p-3 rounded border border-border">
            <span className="text-2xl font-bold text-danger tabular-nums">
              {round.stage === 'group_stage' ? 0 : eliminatedCount}
            </span>
            <span className="text-[10px] text-text-muted uppercase block mt-0.5">
              Eliminated
            </span>
          </div>

          <div className="bg-bg-card p-3 rounded border border-border">
            <span className="text-2xl font-bold text-accent-gold tabular-nums">
              {robotsRemaining}
            </span>
            <span className="text-[10px] text-text-muted uppercase block mt-0.5">
              Advancing Field
            </span>
          </div>
        </div>
      </Card>

      {/* Match Results Table */}
      <div className="flex flex-col gap-2.5">
        <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-text-secondary">
          Official Duel Records
        </h3>

        <div className="bg-bg-surface border border-border rounded overflow-hidden">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-bg-card border-b border-border text-[10px] uppercase text-text-muted">
              <tr>
                <th className="py-2.5 px-3 w-16">Match</th>
                <th className="py-2.5 px-3">Combatant 1</th>
                <th className="py-2.5 px-2 text-center w-10">VS</th>
                <th className="py-2.5 px-3">Combatant 2</th>
                <th className="py-2.5 px-3 text-right">Confirmed Winner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-text-secondary">
              {round.matches.map((m) => {
                const r1Won = m.winner?.id === m.robot1.id
                const r2Won = m.robot2 && m.winner?.id === m.robot2.id

                return (
                  <tr key={m.id} className="hover:bg-bg-card transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-text-muted">
                      #{String(m.matchNumber).padStart(2, '0')}
                    </td>

                    <td className={`py-2.5 px-3 ${r1Won ? 'font-bold text-accent-gold' : 'text-text-primary'}`}>
                      <span>{m.robot1.name}</span>
                      <span className="text-[10px] text-text-muted block font-normal">{m.robot1.club}</span>
                    </td>

                    <td className="py-2.5 px-2 text-center text-[10px] text-text-muted/60 select-none">
                      VS
                    </td>

                    <td className="py-2.5 px-3">
                      {m.robot2 ? (
                        <div className={r2Won ? 'font-bold text-accent-gold' : 'text-text-primary'}>
                          <span>{m.robot2.name}</span>
                          <span className="text-[10px] text-text-muted block font-normal">{m.robot2.club}</span>
                        </div>
                      ) : (
                        <span className="text-text-muted opacity-50 italic">BYE</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      {m.isBye ? (
                        <Badge variant="gold">Auto-Advanced</Badge>
                      ) : m.winner ? (
                        <span className="text-accent-gold font-bold">{m.winner.name}</span>
                      ) : (
                        <span className="text-text-muted">Pending</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
