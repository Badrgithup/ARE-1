'use client'

import React, { useState } from 'react'
import { FileUploader } from '../ui/FileUploader'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import type { Robot } from '@/lib/types'

export interface CSVUploaderProps {
  onTournamentCreate: (name: string, robots: Robot[]) => void
}

export function CSVUploader({ onTournamentCreate }: CSVUploaderProps) {
  const [tournamentName, setTournamentName] = useState('RoboCup 2026 Finals')
  const [robots, setRobots] = useState<Robot[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text()
      const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line)
      if (lines.length < 2) throw new Error('CSV must contain column headers and at least two robot records.')

      const headers = lines[0].toLowerCase().split(',')
      const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('robot'))
      const clubIdx = headers.findIndex((h) => h.includes('club') || h.includes('team'))
      const instIdx = headers.findIndex((h) => h.includes('institution') || h.includes('school') || h.includes('univ'))

      if (nameIdx === -1 || clubIdx === -1) {
        throw new Error("CSV must include columns for 'Name' and 'Club'.")
      }

      const parsedRobots: Robot[] = lines.slice(1).map((line, i) => {
        const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
        return {
          id: `robot-${Date.now()}-${i}`,
          name: cols[nameIdx] || `Robot-${String(i + 1).padStart(2, '0')}`,
          club: cols[clubIdx] || 'Independent',
          institution: instIdx !== -1 && cols[instIdx] ? cols[instIdx] : null,
          status: 'active',
          eliminatedRound: null,
          wins: 0,
        }
      })

      if (parsedRobots.length < 2) {
        throw new Error('At least two valid combatants are required to generate pairings.')
      }

      setRobots(parsedRobots)
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse CSV file.'
      setError(msg)
      setRobots([])
    }
  }

  const handleLoadSample = () => {
    const sampleRobots: Robot[] = [
      { id: 'bot-1', name: 'PIPE-GUARD-17', club: 'Alpha Club', institution: 'University of Tunis', status: 'active', eliminatedRound: null, wins: 0 },
      { id: 'bot-2', name: 'BioBot-2024', club: 'Beta Team', institution: 'INSAT', status: 'active', eliminatedRound: null, wins: 0 },
      { id: 'bot-3', name: 'RoboX-2024', club: 'Beta Team', institution: 'INSAT', status: 'active', eliminatedRound: null, wins: 0 },
      { id: 'bot-4', name: 'HydroBot-3', club: 'Gamma Squad', institution: 'ENIT', status: 'active', eliminatedRound: null, wins: 0 },
      { id: 'bot-5', name: 'NanoBot-5', club: 'Alpha Club', institution: 'University of Tunis', status: 'active', eliminatedRound: null, wins: 0 },
      { id: 'bot-6', name: 'SolarDroid-1', club: 'Delta Force', institution: 'ENSIT', status: 'active', eliminatedRound: null, wins: 0 },
      { id: 'bot-7', name: 'ThunderBot-9', club: 'Epsilon Group', institution: 'ISI', status: 'active', eliminatedRound: null, wins: 0 },
      { id: 'bot-8', name: 'IronClaw-2', club: 'Gamma Squad', institution: 'ENIT', status: 'active', eliminatedRound: null, wins: 0 },
    ]
    setRobots(sampleRobots)
    setError(null)
  }

  const clubsCount = new Set(robots.map((r) => r.club)).size
  const instCount = new Set(robots.filter((r) => r.institution).map((r) => r.institution)).size

  return (
    <Card className="w-full flex flex-col gap-5">
      {/* Tournament Identity */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tournament-name" className="text-xs font-medium text-text-secondary uppercase tracking-wider font-mono">
          Tournament Official Name
        </label>
        <input
          id="tournament-name"
          type="text"
          value={tournamentName}
          onChange={(e) => setTournamentName(e.target.value)}
          placeholder="e.g. RoboCup 2026 Finals"
          className="bg-bg-card border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-border-strong font-sans"
        />
      </div>

      {/* CSV Roster Section */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider font-mono">
            Combatant Roster (CSV)
          </label>
          <button
            type="button"
            onClick={handleLoadSample}
            className="text-xs text-accent-gold hover:underline font-mono cursor-pointer"
          >
            Load Sample Field (8 Robots)
          </button>
        </div>
        <FileUploader onChange={handleFileUpload} />
        {error && <p className="text-danger text-xs mt-1 font-mono">{error}</p>}
      </div>

      {/* Roster Confirmation Matrix */}
      {robots.length > 0 && (
        <div className="bg-bg-card border border-border rounded p-3.5 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3 text-center border-b border-border pb-2.5">
            <div>
              <p className="text-xl font-mono font-bold text-accent-gold tabular-nums">{robots.length}</p>
              <p className="text-[11px] text-text-muted font-mono uppercase">Combatants</p>
            </div>
            <div>
              <p className="text-xl font-mono font-bold text-text-primary tabular-nums">{clubsCount}</p>
              <p className="text-[11px] text-text-muted font-mono uppercase">Teams / Clubs</p>
            </div>
            <div>
              <p className="text-xl font-mono font-bold text-text-primary tabular-nums">{instCount}</p>
              <p className="text-[11px] text-text-muted font-mono uppercase">Institutions</p>
            </div>
          </div>

          {/* Roster Preview */}
          <div className="max-h-36 overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-[10px] text-text-muted uppercase border-b border-border/50 sticky top-0 bg-bg-card">
                <tr>
                  <th className="py-1">Robot</th>
                  <th className="py-1">Club</th>
                  <th className="py-1">Institution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 text-text-secondary">
                {robots.slice(0, 6).map((r) => (
                  <tr key={r.id}>
                    <td className="py-1 font-semibold text-text-primary">{r.name}</td>
                    <td className="py-1">{r.club}</td>
                    <td className="py-1 text-text-muted">{r.institution || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {robots.length > 6 && (
              <p className="text-[10px] text-text-muted font-mono text-center pt-1.5">
                +{robots.length - 6} additional combatants cataloged
              </p>
            )}
          </div>
        </div>
      )}

      {/* Submission CTA */}
      <div>
        <Button
          size="md"
          variant="primary"
          disabled={!tournamentName.trim() || robots.length < 2}
          onClick={() => onTournamentCreate(tournamentName, robots)}
          className="w-full"
        >
          Initialize Tournament & Generate Brackets
        </Button>
        {robots.length === 0 && (
          <p className="text-[11px] text-center text-text-muted mt-2 font-mono">
            Roster file must define combatant Name and Club headers.
          </p>
        )}
      </div>
    </Card>
  )
}
