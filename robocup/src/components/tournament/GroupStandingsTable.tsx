'use client'

import React from 'react'
import clsx from 'clsx'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import type { GroupStanding } from '@/lib/types'

export interface GroupStandingsTableProps {
  standings?: GroupStanding[]
  multiStandings?: { groupName: string; standings: GroupStanding[] }[]
  format: '2-to-final' | '4-to-final'
  className?: string
}

export function GroupStandingsTable({
  standings,
  multiStandings,
  format,
  className,
}: GroupStandingsTableProps) {
  // Normalize into group blocks
  let groupBlocks: { groupName: string; standings: GroupStanding[] }[] = []

  if (multiStandings && multiStandings.length > 0) {
    groupBlocks = multiStandings
  } else if (standings && standings.length > 0) {
    const groupNames = Array.from(
      new Set(standings.map((s) => s.groupName).filter((g): g is string => Boolean(g)))
    )
    if (groupNames.length <= 1) {
      groupBlocks = [{ groupName: groupNames[0] || 'Group A', standings }]
    } else {
      groupBlocks = groupNames.map((gName) => ({
        groupName: gName,
        standings: standings.filter((s) => s.groupName === gName),
      }))
    }
  }

  const isMultiGroup = groupBlocks.length > 1
  const totalRobots = groupBlocks.reduce((acc, g) => acc + g.standings.length, 0)

  // Advancing threshold per group
  const getAdvancingCountForGroup = () => {
    if (!isMultiGroup) {
      return format === '2-to-final' ? 2 : 4
    }
    if (groupBlocks.length === 2) {
      return format === '2-to-final' ? 1 : 2
    }
    // 3 groups
    return 1
  }

  const advancingCount = getAdvancingCountForGroup()

  return (
    <div className={clsx('flex flex-col gap-4 w-full', className)}>
      {groupBlocks.map((groupBlock) => {
        const title = isMultiGroup
          ? `${groupBlock.groupName} Standings (${groupBlock.standings.length} Combatants)`
          : `${totalRobots}-Robot Round-Robin Standings`

        const subtitle = !isMultiGroup
          ? format === '2-to-final'
            ? 'Format: Top 2 advance directly to Championship Final'
            : 'Format: Top 4 advance to Semifinals (1v4, 2v3)'
          : format === '2-to-final'
          ? 'Format: Group winner advances to Championship Final'
          : 'Format: Top 2 advance to Semifinals'

        return (
          <Card
            key={groupBlock.groupName}
            padding="none"
            className="w-full overflow-hidden border-border bg-bg-surface"
          >
            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 sm:p-4 border-b border-border bg-bg-card">
              <div>
                <h3 className="text-xs sm:text-sm font-bold font-mono text-text-primary uppercase tracking-wide">
                  {title}
                </h3>
                <p className="text-[11px] text-text-muted font-mono mt-0.5">{subtitle}</p>
              </div>

              <Badge variant={format === '2-to-final' ? 'gold' : 'blue'}>
                {format === '2-to-final' ? 'Top 2 Advancement' : 'Top 4 Advancement'}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg-surface text-[10px] uppercase text-text-muted">
                    <th className="py-2.5 px-3 w-12 text-center">Rank</th>
                    <th className="py-2.5 px-3">Combatant</th>
                    <th className="py-2.5 px-3">Club / Affiliation</th>
                    <th className="py-2.5 px-3 text-center w-14">MP</th>
                    <th className="py-2.5 px-3 text-center w-14">W</th>
                    <th className="py-2.5 px-3 text-center w-14">L</th>
                    <th className="py-2.5 px-3 text-center w-16 text-accent-gold font-bold">PTS</th>
                    <th className="py-2.5 px-3 text-right">Cutoff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-text-secondary">
                  {groupBlock.standings.map((s, index) => {
                    const rank = index + 1
                    const isAdvancing = rank <= advancingCount

                    return (
                      <tr
                        key={s.robot.id}
                        className={clsx(
                          'transition-colors',
                          isAdvancing ? 'bg-accent-gold/[0.04]' : 'hover:bg-bg-card'
                        )}
                      >
                        {/* Rank */}
                        <td className="py-2.5 px-3 text-center font-bold">
                          <span
                            className={clsx(
                              'inline-flex items-center justify-center w-5 h-5 rounded text-[10px]',
                              rank === 1
                                ? 'bg-accent-gold text-[#0B0D12] font-black'
                                : isAdvancing
                                ? 'bg-accent-gold/20 text-accent-gold font-bold'
                                : 'bg-bg-card text-text-muted'
                            )}
                          >
                            {rank}
                          </span>
                        </td>

                        {/* Robot */}
                        <td className="py-2.5 px-3 font-bold text-text-primary">
                          {s.robot.name}
                        </td>

                        {/* Club */}
                        <td className="py-2.5 px-3 text-text-muted truncate max-w-[180px]">
                          {s.robot.club}
                          {s.robot.institution && ` (${s.robot.institution})`}
                        </td>

                        {/* Match Stats */}
                        <td className="py-2.5 px-3 text-center tabular-nums">{s.matchesPlayed}</td>
                        <td className="py-2.5 px-3 text-center tabular-nums text-success font-bold">
                          {s.wins}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums text-danger">
                          {s.losses}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums font-black text-accent-gold text-sm">
                          {s.points}
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3 text-right">
                          {isAdvancing ? (
                            <span className="text-[10px] text-accent-gold font-bold uppercase tracking-wider">
                              Qualifying
                            </span>
                          ) : (
                            <span className="text-[10px] text-text-muted opacity-50">
                              Elimination Cut
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
