'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CSVUploader } from '@/components/tournament/CSVUploader'
import { TournamentLoadingScreen } from '@/components/tournament/TournamentLoadingScreen'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PlusIcon, HistoryIcon, TrophyIcon, RobotIcon } from '@/components/icons'
import { broadcastActiveTournament } from '@/lib/tournament-sync'
import type { Robot, TournamentSummary } from '@/lib/types'

export default function HomePage() {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [creationPayload, setCreationPayload] = useState<{
    name: string
    robotCount: number
    targetUrl: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recentTournaments, setRecentTournaments] = useState<TournamentSummary[]>([])
  const [isLoadingRecent, setIsLoadingRecent] = useState(true)

  useEffect(() => {
    async function loadRecent() {
      try {
        const res = await fetch('/api/tournament')
        const json = await res.json()
        if (json.success && Array.isArray(json.data)) {
          setRecentTournaments(json.data.slice(0, 5))
        }
      } catch {
        // Ignore background load error
      } finally {
        setIsLoadingRecent(false)
      }
    }
    loadRecent()
  }, [])

  const handleTournamentCreate = async (name: string, robots: Robot[]) => {
    setIsCreating(true)
    setError(null)
    setCreationPayload({
      name,
      robotCount: robots.length,
      targetUrl: null,
    })

    try {
      const response = await fetch('/api/tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          robots,
          config: {
            groupStageEnabled: robots.length >= 5 && robots.length <= 9,
            finalFormat: '2-to-final',
            timestamp: new Date().toISOString(),
          },
        }),
      })

      const json = await response.json()

      if (json.success && json.data?.id) {
        broadcastActiveTournament(json.data.id, json.data)
        setCreationPayload({
          name,
          robotCount: robots.length,
          targetUrl: `/tournament/${json.data.id}`,
        })
      } else {
        setIsCreating(false)
        setCreationPayload(null)
        setError(json.error || 'Failed to create tournament.')
      }
    } catch (err: unknown) {
      setIsCreating(false)
      setCreationPayload(null)
      const message = err instanceof Error ? err.message : 'Tournament initialization failed.'
      setError(message)
    }
  }

  const handleLoadingComplete = () => {
    if (creationPayload?.targetUrl) {
      router.push(creationPayload.targetUrl)
    } else {
      const checkInterval = setInterval(() => {
        if (creationPayload?.targetUrl) {
          clearInterval(checkInterval)
          router.push(creationPayload.targetUrl)
        }
      }, 200)
    }
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto">
      {/* Control Room Section Header */}
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Tournament Control Desk
        </h1>
        <p className="text-xs sm:text-sm text-text-secondary mt-1">
          Association Robotique ENSI · Official Single-Elimination & Group Stage Competition System
        </p>
      </div>

      {/* Main 2-Column Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Competition Setup (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-mono flex items-center gap-2">
              <PlusIcon size={16} className="text-accent-gold" />
              <span>New Tournament Setup</span>
            </h2>
            <span className="text-xs text-text-muted font-mono">Stage: Initialization</span>
          </div>

          <CSVUploader onTournamentCreate={handleTournamentCreate} />

          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded text-xs font-mono">
              {error}
            </div>
          )}
        </div>

        {/* Right Column: Existing Sessions & Archive Quick-Access (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-mono flex items-center gap-2">
              <HistoryIcon size={16} className="text-accent-gold" />
              <span>Recent Competitions</span>
            </h2>
            <Link
              href="/history"
              className="text-xs text-text-secondary hover:text-accent-gold font-mono transition-colors"
            >
              Full Archive →
            </Link>
          </div>

          <Card padding="none" className="overflow-hidden">
            {isLoadingRecent ? (
              <div className="p-6 text-center text-xs text-text-muted font-mono">
                Loading stored sessions...
              </div>
            ) : recentTournaments.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted font-mono">
                No previous tournaments recorded. Upload a roster to begin.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentTournaments.map((t) => {
                  const isCompleted = t.status === 'completed'
                  return (
                    <div
                      key={t.id}
                      className="p-3.5 flex items-center justify-between hover:bg-bg-card transition-colors gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={isCompleted ? 'green' : 'gold'}>
                            {isCompleted ? 'Completed' : 'In Progress'}
                          </Badge>
                          <span className="text-[11px] text-text-muted font-mono">
                            {t.totalRobots} Combatants
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-text-primary truncate">
                          {t.name}
                        </h4>
                        {t.winner && (
                          <p className="text-[11px] text-text-secondary font-mono truncate mt-0.5 flex items-center gap-1">
                            <TrophyIcon size={12} className="text-accent-gold shrink-0" />
                            <span>
                              Champion: <span className="text-accent-gold font-semibold">{t.winner.name}</span> ({t.winner.club})
                            </span>
                          </p>
                        )}
                      </div>

                      <Link href={`/tournament/${t.id}`} className="shrink-0">
                        <Button
                          size="sm"
                          variant={isCompleted ? 'secondary' : 'primary'}
                          className="font-mono text-xs"
                        >
                          {isCompleted ? 'Inspect' : 'Resume'}
                        </Button>
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Loading Overlay */}
      {isCreating && creationPayload && (
        <TournamentLoadingScreen
          tournamentName={creationPayload.name}
          robotCount={creationPayload.robotCount}
          onComplete={handleLoadingComplete}
        />
      )}
    </div>
  )
}
