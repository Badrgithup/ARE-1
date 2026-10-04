'use client'

import React from 'react'
import Link from 'next/link'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import type { Tournament } from '@/lib/types'

export interface ChampionScreenProps {
  tournament: Tournament
  onNewTournament?: () => void
}

export function ChampionScreen({ tournament, onNewTournament }: ChampionScreenProps) {
  const champion = tournament.winner
  if (!champion) return null

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
    <Card padding="md" className="border-accent-gold/40 bg-bg-surface w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Champion Details with Real ARE Branding */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded overflow-hidden border border-accent-gold/40 bg-black shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/are-logo.jpg"
              alt="Association Robotique ENSI"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-accent-gold font-semibold">
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
            + Start New Tournament
          </Button>

          <Link href="/history">
            <Button size="sm" variant="secondary" className="font-mono text-xs">
              Archives
            </Button>
          </Link>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportJson}
            className="font-mono text-xs"
          >
            JSON
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportCsv}
            className="font-mono text-xs"
          >
            CSV
          </Button>
        </div>
      </div>
    </Card>
  )
}
