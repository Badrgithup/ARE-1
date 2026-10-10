'use client'

import React from 'react'
import Link from 'next/link'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { TrophyIcon, MedalIcon, ClockIcon, StarIcon, DownloadIcon, PlusIcon, HistoryIcon } from '../icons'
import type { Tournament } from '@/lib/types'

export interface ChampionScreenProps {
  tournament: Tournament
  onNewTournament?: () => void
}

export function ChampionScreen({ tournament, onNewTournament }: ChampionScreenProps) {
  const champion = tournament.winner
  if (!champion) return null

  const performanceResults = tournament.performanceResults || null

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(tournament, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `${tournament.name.replace(/\s+/g, '_')}_champion.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  const handleExportCsv = () => {
    const rows: string[] = []
    rows.push(`Tournament,${tournament.name}`)
    rows.push(`Champion,${champion?.name || 'N/A'},Club,${champion?.club || 'N/A'}`)
    rows.push(`Total Robots,${tournament.totalRobots}`)
    rows.push('')

    if (performanceResults && performanceResults.length > 0) {
      rows.push('--- INDIVIDUAL PERFORMANCE FINAL PODIUM ---')
      rows.push('Rank,Combatant,Club,Points,Time(s),Medal')
      for (const res of performanceResults) {
        rows.push(`${res.ranking},"${res.robot.name}","${res.robot.club}",${res.points},${res.time},${res.medal}`)
      }
      rows.push('')
    }

    rows.push('--- FINAL STANDINGS & ROSTER ---')
    rows.push('Name,Club,Institution,Status,Wins')
    for (const r of tournament.robots || []) {
      rows.push(`"${r.name}","${r.club}","${r.institution || ''}","${r.status}",${r.wins}`)
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', csvContent)
    downloadAnchor.setAttribute('download', `${tournament.name.replace(/\s+/g, '_')}_standings.csv`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  const handleNewTournament = () => {
    if (onNewTournament) {
      onNewTournament()
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      {/* Primary Champion Banner */}
      <Card padding="md" className="border-accent-gold/40 bg-bg-surface w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Champion Details with Real ARE Branding */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded overflow-hidden border border-accent-gold/40 bg-black shrink-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/are-logo.jpg"
                alt="Association Robotique ENSI"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              <TrophyIcon size={28} className="text-accent-gold" />
            </div>

            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-accent-gold font-semibold flex items-center gap-1.5">
                <TrophyIcon size={12} className="text-accent-gold" />
                Tournament Champion Decided
              </span>
              <h2 className="text-2xl font-bold font-mono text-text-primary tracking-tight truncate mt-0.5">
                {champion.name}
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {champion.club} {champion.institution && `· ${champion.institution}`}
              </p>
            </div>
          </div>

          {/* Compact Competition Metrics */}
          <div className="flex items-center gap-6 border-y md:border-y-0 md:border-x border-border py-3 md:py-0 md:px-6">
            <div>
              <span className="text-xl font-bold font-mono text-accent-gold tabular-nums">
                {champion.wins}
              </span>
              <span className="text-[10px] font-mono text-text-muted uppercase block">
                Victories
              </span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div>
              <span className="text-xl font-bold font-mono text-text-primary tabular-nums">
                {tournament.totalRobots}
              </span>
              <span className="text-[10px] font-mono text-text-muted uppercase block">
                Combatants
              </span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div>
              <span className="text-xl font-bold font-mono text-text-primary tabular-nums">
                {tournament.rounds.length}
              </span>
              <span className="text-[10px] font-mono text-text-muted uppercase block">
                Rounds Run
              </span>
            </div>
          </div>

          {/* Operational Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={handleNewTournament}
              className="font-mono text-xs"
            >
              <PlusIcon size={14} className="mr-1" />
              New Tournament
            </Button>

            <Link href="/history">
              <Button size="sm" variant="secondary" className="font-mono text-xs">
                <HistoryIcon size={14} className="mr-1" />
                Archives
              </Button>
            </Link>

            <Button
              size="sm"
              variant="secondary"
              onClick={handleExportJson}
              className="font-mono text-xs"
            >
              <DownloadIcon size={14} className="mr-1" />
              JSON
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={handleExportCsv}
              className="font-mono text-xs"
            >
              <DownloadIcon size={14} className="mr-1" />
              CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Official 3-Combatant Podium (When Individual Performance Mode concluded) */}
      {performanceResults && performanceResults.length >= 3 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div>
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-text-primary">
                Official Final Podium
              </h3>
              <p className="text-[11px] font-mono text-text-muted">
                Ranked by individual performance points with time trial tiebreaker
              </p>
            </div>
            <Badge variant="gold">Trial Results</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            {performanceResults.map((res) => {
              const isGold = res.medal === 'gold'
              const isSilver = res.medal === 'silver'
              const isBronze = res.medal === 'bronze'

              return (
                <div
                  key={res.robot.id}
                  className={`p-5 rounded border flex flex-col justify-between transition-all ${
                    isGold
                      ? 'bg-bg-card border-accent-gold/60 shadow-lg shadow-accent-gold/5 order-1 md:order-2 md:-translate-y-2'
                      : isSilver
                      ? 'bg-bg-surface border-slate-600/60 order-2 md:order-1'
                      : 'bg-bg-surface border-amber-900/60 order-3 md:order-3'
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider">
                        <MedalIcon
                          size={18}
                          color={isGold ? '#F2B900' : isSilver ? '#CBD5E1' : '#CD7F32'}
                        />
                        <span
                          className={
                            isGold
                              ? 'text-accent-gold'
                              : isSilver
                              ? 'text-slate-300'
                              : 'text-amber-500'
                          }
                        >
                          {isGold ? '1st Place' : isSilver ? '2nd Place' : '3rd Place'}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-text-muted">
                        #{res.ranking}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold font-mono text-text-primary tracking-tight">
                        {res.robot.name}
                      </h4>
                      <p className="text-xs font-mono text-text-secondary mt-0.5">
                        {res.robot.club}
                        {res.robot.institution && ` · ${res.robot.institution}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-border grid grid-cols-2 gap-2 font-mono text-center">
                    <div className="bg-bg-primary/60 p-2 rounded border border-border/40">
                      <span className="text-[10px] text-text-muted uppercase block">Score</span>
                      <span className="text-base font-bold text-accent-gold tabular-nums">
                        {res.points} pts
                      </span>
                    </div>

                    <div className="bg-bg-primary/60 p-2 rounded border border-border/40">
                      <span className="text-[10px] text-text-muted uppercase block">Time</span>
                      <span className="text-base font-bold text-text-primary tabular-nums">
                        {res.time.toFixed(1)}s
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
