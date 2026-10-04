'use client'

import React from 'react'
import { Card } from '../ui/Card'
import type { TournamentStats as Stats } from '@/lib/types'

export interface TournamentStatsProps {
  stats: Stats
}

export function TournamentStats({ stats }: TournamentStatsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
        <Card padding="sm" className="bg-bg-surface border-border flex flex-col text-left">
          <span className="text-[10px] text-text-muted uppercase">Combatants</span>
          <span className="text-2xl font-bold text-text-primary tabular-nums mt-0.5">{stats.totalRobots}</span>
        </Card>
        <Card padding="sm" className="bg-bg-surface border-border flex flex-col text-left">
          <span className="text-[10px] text-text-muted uppercase">Active Field</span>
          <span className="text-2xl font-bold text-accent-gold tabular-nums mt-0.5">{stats.robotsRemaining}</span>
        </Card>
        <Card padding="sm" className="bg-bg-surface border-border flex flex-col text-left">
          <span className="text-[10px] text-text-muted uppercase">Eliminated</span>
          <span className="text-2xl font-bold text-danger tabular-nums mt-0.5">{stats.robotsEliminated}</span>
        </Card>
        <Card padding="sm" className="bg-bg-surface border-border flex flex-col text-left">
          <span className="text-[10px] text-text-muted uppercase">Duels Completed</span>
          <span className="text-2xl font-bold text-accent-cyan tabular-nums mt-0.5">{stats.matchesCompleted}</span>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 font-mono text-xs">
        <Card padding="md" className="bg-bg-surface border-border">
          <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 border-b border-border pb-2">
            Combatants by Club
          </h3>
          <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
            {Object.entries(stats.winnersPerClub)
              .sort(([, a], [, b]) => b - a)
              .map(([club, count]) => (
                <div key={club} className="flex justify-between items-center py-1 border-b border-border/30">
                  <span className="text-text-primary truncate pr-4">{club}</span>
                  <span className="font-bold text-accent-gold tabular-nums">{count}</span>
                </div>
              ))}
            {Object.keys(stats.winnersPerClub).length === 0 && (
              <span className="text-text-muted italic">No data recorded</span>
            )}
          </div>
        </Card>

        <Card padding="md" className="bg-bg-surface border-border">
          <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 border-b border-border pb-2">
            Combatants by Institution
          </h3>
          <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
            {Object.entries(stats.winnersPerInstitution)
              .sort(([, a], [, b]) => b - a)
              .map(([inst, count]) => (
                <div key={inst} className="flex justify-between items-center py-1 border-b border-border/30">
                  <span className="text-text-primary truncate pr-4">
                    {inst === 'null' || !inst ? 'Independent' : inst}
                  </span>
                  <span className="font-bold text-accent-gold tabular-nums">{count}</span>
                </div>
              ))}
            {Object.keys(stats.winnersPerInstitution).length === 0 && (
              <span className="text-text-muted italic">No data recorded</span>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
