'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { TournamentBracketView } from '@/components/tournament/TournamentBracketView'
import { GroupStandingsTable } from '@/components/tournament/GroupStandingsTable'
import { calculateGroupStandings } from '@/lib/group-stage-engine'
import type { Tournament, TournamentSummary, Round, Match } from '@/lib/types'
import {
  Search,
  Download,
  FileSpreadsheet,
  Trash2,
  Calendar,
  Layers,
  ArrowLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'

type DetailTab = 'overview' | 'rounds' | 'bracket' | 'matches' | 'roster'

export default function HistoryPage() {
  const [summaries, setSummaries] = useState<TournamentSummary[]>([])
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed'>('all')
  const [error, setError] = useState<string | null>(null)

  // Selected tournament state for detailed inspection
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)
  const [detailedTournament, setDetailedTournament] = useState<Tournament | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('bracket')
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<number | 'all'>('all')

  // Deletion modal state
  const [tournamentToDelete, setTournamentToDelete] = useState<TournamentSummary | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Load summary list
  const loadSummaries = async () => {
    setIsLoadingList(true)
    setError(null)
    try {
      const res = await fetch('/api/tournament')
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setSummaries(json.data)
      } else {
        setError(json.error || 'Failed to load tournament archives.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Storage communication error.'
      setError(msg)
    } finally {
      setIsLoadingList(false)
    }
  }

  useEffect(() => {
    loadSummaries()
  }, [])

  // Load full tournament detail when selected
  const handleSelectTournament = async (id: string) => {
    setSelectedTournamentId(id)
    setIsLoadingDetail(true)
    setDetailTab('bracket')
    setSelectedRoundFilter('all')

    try {
      const res = await fetch(`/api/tournament/${id}`)
      const json = await res.json()
      if (json.success && json.data) {
        setDetailedTournament(json.data)
      } else {
        alert(json.error || 'Failed to load tournament records.')
      }
    } catch {
      alert('Failed to fetch full tournament structure.')
    } finally {
      setIsLoadingDetail(false)
    }
  }

  // Filter summaries
  const filteredSummaries = useMemo(() => {
    return summaries.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const nameMatch = t.name.toLowerCase().includes(q)
        const winnerMatch =
          t.winner?.name.toLowerCase().includes(q) ||
          t.winner?.club.toLowerCase().includes(q) ||
          t.winner?.institution?.toLowerCase().includes(q)
        if (!nameMatch && !winnerMatch) return false
      }
      return true
    })
  }, [summaries, statusFilter, searchQuery])

  // Group tournaments by Year (e.g. 2026, 2025)
  const groupedByYear = useMemo(() => {
    const map = new Map<string, TournamentSummary[]>()
    for (const t of filteredSummaries) {
      const year = t.startTime ? new Date(t.startTime).getFullYear().toString() : 'Undated'
      if (!map.has(year)) {
        map.set(year, [])
      }
      map.get(year)!.push(t)
    }
    // Sort years descending
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [filteredSummaries])

  // Export JSON
  const handleExportJson = (t: Tournament) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(t, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `${t.name.replace(/\s+/g, '_')}_archive.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  // Export CSV
  const handleExportCsv = (t: Tournament) => {
    const rows: string[] = []
    rows.push(`Tournament,${t.name}`)
    rows.push(`Status,${t.status}`)
    rows.push(`Total Robots,${t.totalRobots}`)
    if (t.winner) rows.push(`Champion,${t.winner.name},Club,${t.winner.club}`)
    rows.push('')
    rows.push('--- ROSTER ---')
    rows.push('Name,Club,Institution,Status,Wins')
    for (const r of t.robots || []) {
      rows.push(`"${r.name}","${r.club}","${r.institution || ''}","${r.status}",${r.wins}`)
    }
    rows.push('')
    rows.push('--- MATCHES ---')
    rows.push('Round,Stage,Match,Combatant 1,Combatant 2,Winner,Status')
    for (const round of t.rounds || []) {
      for (const m of round.matches || []) {
        const r1 = m.robot1 ? `"${m.robot1.name}"` : 'BYE'
        const r2 = m.robot2 ? `"${m.robot2.name}"` : 'BYE'
        const w = m.winner ? `"${m.winner.name}"` : 'Pending'
        rows.push(`${round.roundNumber},${round.stage || 'elimination'},${m.matchNumber},${r1},${r2},${w},${m.status}`)
      }
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', csvContent)
    downloadAnchor.setAttribute('download', `${t.name.replace(/\s+/g, '_')}_results.csv`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  // Confirm delete
  const confirmDelete = async () => {
    if (!tournamentToDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/tournament/${tournamentToDelete.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        setSummaries((prev) => prev.filter((t) => t.id !== tournamentToDelete.id))
        if (selectedTournamentId === tournamentToDelete.id) {
          setSelectedTournamentId(null)
          setDetailedTournament(null)
        }
        setTournamentToDelete(null)
      } else {
        alert(json.error || 'Failed to delete tournament record.')
      }
    } catch {
      alert('Delete request failed.')
    } finally {
      setIsDeleting(false)
    }
  }

  // -------------------------------------------------------------
  // VIEW 1: DEDICATED TOURNAMENT DETAIL INSPECTION
  // -------------------------------------------------------------
  if (selectedTournamentId && detailedTournament) {
    const t = detailedTournament
    const champion = t.winner
    const activeRobots = t.robots.filter((r) => r.status === 'active')
    const totalMatchesCount = t.rounds.reduce((acc, r) => acc + r.matches.length, 0)
    const completedMatchesCount = t.rounds.reduce((acc, r) => acc + r.completedMatches, 0)

    // Calculate indicative duration
    let durationMinutes: number | null = null
    if (t.startTime && t.endTime) {
      const ms = new Date(t.endTime).getTime() - new Date(t.startTime).getTime()
      durationMinutes = Math.max(1, Math.round(ms / 60000))
    }

    // Matches filtered by selected round
    const visibleRounds = selectedRoundFilter === 'all'
      ? t.rounds
      : t.rounds.filter((r) => r.roundNumber === selectedRoundFilter)

    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* Back breadcrumb and action bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <button
            onClick={() => {
              setSelectedTournamentId(null)
              setDetailedTournament(null)
            }}
            className="inline-flex items-center gap-2 text-xs font-mono text-text-secondary hover:text-text-primary transition-colors cursor-pointer w-fit"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Tournament Archives</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/tournament/${t.id}`}>
              <Button size="sm" variant={t.status === 'completed' ? 'secondary' : 'primary'} className="font-mono text-xs">
                {t.status === 'completed' ? 'Open in Arena' : 'Resume Live Control ⚡'}
              </Button>
            </Link>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleExportJson(t)}
              className="font-mono text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleExportCsv(t)}
              className="font-mono text-xs gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              CSV
            </Button>
          </div>
        </div>

        {/* Tournament Identity Header */}
        <div className="bg-bg-surface border border-border rounded p-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded overflow-hidden border border-border-strong bg-black shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/are-logo.jpg"
                alt="Association Robotique ENSI"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold font-mono text-text-primary tracking-tight">
                  {t.name}
                </h1>
                <Badge variant={t.status === 'completed' ? 'green' : 'gold'}>
                  {t.status === 'completed' ? 'Completed' : 'In Progress'}
                </Badge>
              </div>
              <p className="text-xs text-text-muted font-mono">
                Session Started: {new Date(t.startTime).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {t.endTime && ` · Concluded in ${durationMinutes} min`}
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-6 font-mono text-xs border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-6">
            <div>
              <span className="text-text-muted uppercase text-[10px] block">Combatants</span>
              <span className="text-base font-bold text-text-primary tabular-nums">{t.totalRobots}</span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div>
              <span className="text-text-muted uppercase text-[10px] block">Rounds</span>
              <span className="text-base font-bold text-text-primary tabular-nums">{t.rounds.length}</span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div>
              <span className="text-text-muted uppercase text-[10px] block">Matches</span>
              <span className="text-base font-bold text-text-primary tabular-nums">{completedMatchesCount} / {totalMatchesCount}</span>
            </div>
            <div className="w-px h-6 bg-border" />
            <Link
              href={`/tournament/${t.id}/projector`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-accent-gold/40 text-accent-gold bg-accent-gold/10 hover:bg-accent-gold/20 font-mono text-xs font-bold transition-colors ml-auto md:ml-2"
              title="Open Projector View for this historical tournament"
            >
              <span>Projector View ↗</span>
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-border font-mono text-xs">
          {[
            { id: 'bracket', label: 'Competition Bracket & Tree' },
            { id: 'overview', label: 'Tournament Overview' },
            { id: 'rounds', label: 'Rounds Breakdown' },
            { id: 'matches', label: `Results & Matches (${totalMatchesCount})` },
            { id: 'roster', label: `Combatant Roster (${t.robots.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setDetailTab(tab.id as DetailTab)}
              className={`px-4 py-2 border-b-2 font-medium transition-colors cursor-pointer ${
                detailTab === tab.id
                  ? 'border-accent-gold text-accent-gold font-bold bg-bg-surface'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {detailTab === 'overview' && (
          <div className="flex flex-col gap-6">
            {/* Champion Box if Concluded */}
            {champion && (
              <div className="bg-bg-surface border border-accent-gold/40 rounded p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-accent-gold font-bold">
                    Official Champion
                  </span>
                  <h3 className="text-2xl font-bold font-mono text-text-primary mt-0.5">
                    {champion.name}
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {champion.club} {champion.institution && `· ${champion.institution}`}
                  </p>
                </div>
                <div className="font-mono text-right sm:text-right">
                  <span className="text-2xl font-bold text-accent-gold tabular-nums">{champion.wins}</span>
                  <span className="text-[10px] text-text-muted uppercase block">Total Victories</span>
                </div>
              </div>
            )}

            {/* Rounds Progression List */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-text-muted">
                Competition Stages & Participant Progression
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {t.rounds.map((r) => {
                  let stageTitle = `Round ${r.roundNumber}`
                  if (r.stage === 'group_stage') stageTitle = 'Group Stage (Round-Robin)'
                  else if (r.stage === 'semifinals') stageTitle = 'Semifinals'
                  else if (r.stage === 'final') stageTitle = 'Championship Final'
                  else if (r.roundNumber === 1) stageTitle = 'Qualification Stage'

                  return (
                    <Card
                      key={r.id}
                      padding="sm"
                      hoverable
                      onClick={() => {
                        setSelectedRoundFilter(r.roundNumber)
                        setDetailTab('rounds')
                      }}
                      className="cursor-pointer border-border bg-bg-surface"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={r.status === 'completed' ? 'green' : 'gold'}>
                          {r.status === 'completed' ? 'Completed' : 'In Progress'}
                        </Badge>
                        <span className="text-[10px] font-mono text-text-muted">
                          {r.matches.length} Matches
                        </span>
                      </div>
                      <h4 className="font-mono font-bold text-sm text-text-primary truncate">
                        {stageTitle}
                      </h4>
                      <p className="text-[11px] text-text-muted font-mono mt-1">
                        {r.completedMatches} matches confirmed
                      </p>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ROUNDS BREAKDOWN */}
        {detailTab === 'rounds' && (
          <div className="flex flex-col gap-5">
            {/* Round Filter Buttons */}
            <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
              <button
                onClick={() => setSelectedRoundFilter('all')}
                className={`px-3 py-1 rounded border transition-colors cursor-pointer ${
                  selectedRoundFilter === 'all'
                    ? 'border-accent-gold bg-accent-gold/10 text-accent-gold font-bold'
                    : 'border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                All Rounds ({t.rounds.length})
              </button>

              {t.rounds.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoundFilter(r.roundNumber)}
                  className={`px-3 py-1 rounded border transition-colors cursor-pointer ${
                    selectedRoundFilter === r.roundNumber
                      ? 'border-accent-gold bg-accent-gold/10 text-accent-gold font-bold'
                      : 'border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Round {r.roundNumber} ({r.stage || 'elimination'})
                </button>
              ))}
            </div>

            {/* Display each selected round */}
            {visibleRounds.map((r) => {
              const isGroup = r.stage === 'group_stage'
              const groupStandings = isGroup ? calculateGroupStandings(r.matches, t.robots) : []

              return (
                <div key={r.id} className="flex flex-col gap-3 border border-border bg-bg-surface p-4 rounded">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div>
                      <h3 className="font-mono font-bold text-sm text-text-primary">
                        Round {r.roundNumber}: {r.stage === 'group_stage' ? '5-Robot Round-Robin' : r.stage === 'semifinals' ? 'Semifinals' : r.stage === 'final' ? 'Championship Final' : 'Elimination Stage'}
                      </h3>
                      <p className="text-[11px] font-mono text-text-muted mt-0.5">
                        {r.matches.length} Total Matches · {r.completedMatches} Completed
                      </p>
                    </div>
                    <Badge variant={r.status === 'completed' ? 'green' : 'gold'}>
                      {r.status === 'completed' ? 'Confirmed' : 'Pending'}
                    </Badge>
                  </div>

                  {/* Matches Grid for this round */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                    {r.matches.map((m) => {
                      const r1Won = m.winner?.id === m.robot1.id
                      const r2Won = m.robot2 && m.winner?.id === m.robot2.id

                      return (
                        <div key={m.id} className="p-3 bg-bg-card border border-border rounded font-mono text-xs">
                          <div className="flex justify-between items-center text-[10px] text-text-muted border-b border-border/50 pb-1 mb-2">
                            <span>Match {String(m.matchNumber).padStart(2, '0')}</span>
                            <span>{m.isBye ? 'BYE' : m.status}</span>
                          </div>

                          <div className={`py-1 px-1.5 rounded ${r1Won ? 'font-bold text-accent-gold bg-accent-gold/10' : 'text-text-primary'}`}>
                            <span className="truncate block">{m.robot1.name}</span>
                            <span className="text-[10px] text-text-muted block font-normal">{m.robot1.club}</span>
                          </div>

                          <div className="text-[9px] text-text-muted/60 text-center py-0.5">VS</div>

                          {m.robot2 ? (
                            <div className={`py-1 px-1.5 rounded ${r2Won ? 'font-bold text-accent-gold bg-accent-gold/10' : 'text-text-primary'}`}>
                              <span className="truncate block">{m.robot2.name}</span>
                              <span className="text-[10px] text-text-muted block font-normal">{m.robot2.club}</span>
                            </div>
                          ) : (
                            <div className="text-text-muted opacity-40 italic py-1 px-1.5">BYE</div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* If Group Stage, show standings underneath */}
                  {isGroup && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <GroupStandingsTable
                        standings={groupStandings}
                        format={t.config?.finalFormat || '2-to-final'}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* TAB 3: STAGE BRACKET & TREE */}
        {detailTab === 'bracket' && (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-mono text-text-muted">
              Complete Visual Tree from Qualification to Champion
            </span>
            <TournamentBracketView tournament={t} />
          </div>
        )}

        {/* TAB 4: ALL MATCHES LOG */}
        {detailTab === 'matches' && (
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-bg-card border-b border-border text-[10px] uppercase text-text-muted">
                <tr>
                  <th className="py-2.5 px-3">Round</th>
                  <th className="py-2.5 px-3">Match #</th>
                  <th className="py-2.5 px-3">Combatant 1</th>
                  <th className="py-2.5 px-2 text-center">VS</th>
                  <th className="py-2.5 px-3">Combatant 2</th>
                  <th className="py-2.5 px-3 text-right">Confirmed Victor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-text-secondary">
                {t.rounds.flatMap((r) =>
                  r.matches.map((m) => {
                    const r1Won = m.winner?.id === m.robot1.id
                    const r2Won = m.robot2 && m.winner?.id === m.robot2.id

                    return (
                      <tr key={m.id} className="hover:bg-bg-card transition-colors">
                        <td className="py-2 px-3 font-semibold text-text-muted">
                          R{r.roundNumber} ({r.stage || 'elim'})
                        </td>
                        <td className="py-2 px-3">
                          #{String(m.matchNumber).padStart(2, '0')}
                        </td>
                        <td className={`py-2 px-3 ${r1Won ? 'font-bold text-accent-gold' : 'text-text-primary'}`}>
                          {m.robot1.name} ({m.robot1.club})
                        </td>
                        <td className="py-2 px-2 text-center text-[10px] text-text-muted/60 select-none">
                          VS
                        </td>
                        <td className={`py-2 px-3 ${r2Won ? 'font-bold text-accent-gold' : 'text-text-primary'}`}>
                          {m.robot2 ? `${m.robot2.name} (${m.robot2.club})` : 'BYE'}
                        </td>
                        <td className="py-2 px-3 text-right">
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
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 5: ROSTER */}
        {detailTab === 'roster' && (
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-bg-card border-b border-border text-[10px] uppercase text-text-muted">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Robot Name</th>
                  <th className="py-2.5 px-3">Club</th>
                  <th className="py-2.5 px-3">Institution</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Victories</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-text-secondary">
                {t.robots.map((r, i) => (
                  <tr key={r.id} className="hover:bg-bg-card transition-colors">
                    <td className="py-2 px-3 text-text-muted">{i + 1}</td>
                    <td className="py-2 px-3 font-bold text-text-primary">{r.name}</td>
                    <td className="py-2 px-3">{r.club}</td>
                    <td className="py-2 px-3 text-text-muted">{r.institution || '—'}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant={r.status === 'active' ? 'green' : 'gray'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-accent-gold tabular-nums">
                      {r.wins}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------
  // VIEW 2: GROUPED SEASON ARCHIVE DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary tracking-tight">
            Tournament Archive Ledger
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Association Robotique ENSI · Historical Competition Records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadSummaries}
            className="font-mono text-xs gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync
          </Button>
          <Link href="/">
            <Button size="sm" variant="primary" className="font-mono text-xs">
              + New Tournament
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-bg-surface p-3 rounded border border-border">
        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tournament, champion, club..."
            className="w-full bg-bg-card border border-border rounded pl-8 pr-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-border-strong font-mono"
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 w-full sm:w-auto font-mono text-xs">
          {(['all', 'in_progress', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1 rounded border transition-colors cursor-pointer ${
                statusFilter === tab
                  ? 'border-accent-gold bg-accent-gold/10 text-accent-gold font-bold'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab === 'all' && `All (${summaries.length})`}
              {tab === 'in_progress' && `In Progress (${summaries.filter((s) => s.status === 'in_progress').length})`}
              {tab === 'completed' && `Completed (${summaries.filter((s) => s.status === 'completed').length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded text-xs font-mono">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoadingList && (
        <div className="py-20 text-center font-mono text-xs text-text-muted">
          Accessing local tournament ledger...
        </div>
      )}

      {/* Empty State */}
      {!isLoadingList && filteredSummaries.length === 0 && (
        <Card padding="lg" className="text-center py-16 flex flex-col items-center gap-3">
          <h3 className="text-sm font-bold font-mono text-text-primary">No Archive Records</h3>
          <p className="text-xs text-text-muted font-sans max-w-sm">
            No competitions found matching your search parameters.
          </p>
          <Link href="/">
            <Button size="sm" variant="primary" className="font-mono text-xs mt-2">
              Setup Competition
            </Button>
          </Link>
        </Card>
      )}

      {/* Grouped by Season / Year */}
      {!isLoadingList && groupedByYear.length > 0 && (
        <div className="flex flex-col gap-8">
          {groupedByYear.map(([year, yearTournaments]) => (
            <div key={year} className="flex flex-col gap-3">
              {/* Year Heading & Rule */}
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-sm text-text-primary tracking-wider">
                  SEASON {year}
                </span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] font-mono text-text-muted">
                  {yearTournaments.length} {yearTournaments.length === 1 ? 'Tournament' : 'Tournaments'}
                </span>
              </div>

              {/* Tournament Rows */}
              <div className="bg-bg-surface border border-border rounded divide-y divide-border overflow-hidden">
                {yearTournaments.map((t) => {
                  const isCompleted = t.status === 'completed'
                  const formattedDate = t.updatedAt
                    ? new Date(t.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Recently'

                  return (
                    <div
                      key={t.id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-bg-card transition-colors"
                    >
                      {/* Left: Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={isCompleted ? 'green' : 'gold'}>
                            {isCompleted ? 'Completed' : 'In Progress'}
                          </Badge>
                          <span className="text-xs font-mono text-text-muted">
                            {formattedDate}
                          </span>
                        </div>

                        <h3 className="text-base font-bold font-mono text-text-primary tracking-tight truncate">
                          {t.name}
                        </h3>

                        <div className="flex items-center gap-4 text-xs font-mono text-text-secondary mt-1">
                          <span>{t.totalRobots} Combatants</span>
                          <span>·</span>
                          <span>Round {t.currentRound || 1}</span>
                          {t.winner && (
                            <>
                              <span>·</span>
                              <span className="text-accent-gold font-semibold">
                                Champion: {t.winner.name} ({t.winner.club})
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSelectTournament(t.id)}
                          className="font-mono text-xs gap-1"
                        >
                          <span>Inspect Structure</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>

                        <button
                          onClick={() => setTournamentToDelete(t)}
                          className="p-1.5 rounded hover:bg-danger/10 text-text-muted hover:text-danger transition-colors cursor-pointer"
                          title="Delete tournament record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deletion Confirmation Modal */}
      <Modal
        isOpen={Boolean(tournamentToDelete)}
        onClose={() => !isDeleting && setTournamentToDelete(null)}
        title="Delete Archive Record"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-text-secondary leading-relaxed font-sans">
            Confirm permanent deletion of{' '}
            <strong className="text-text-primary font-mono">{tournamentToDelete?.name}</strong>.
            This action purges the JSON structure and match records from local disk.
          </p>

          <div className="flex justify-end gap-2.5 mt-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isDeleting}
              onClick={() => setTournamentToDelete(null)}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isDeleting}
              onClick={confirmDelete}
              className="font-mono text-xs"
            >
              {isDeleting ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
