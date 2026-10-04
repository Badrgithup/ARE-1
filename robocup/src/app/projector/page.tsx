'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTournament } from '@/hooks/useTournament'
import { ProjectorDisplay } from '@/components/tournament/ProjectorDisplay'
import { getActiveTournamentId, subscribeTournamentSync } from '@/lib/tournament-sync'

function GlobalProjectorContent() {
  const searchParams = useSearchParams()
  const queryId = searchParams.get('id')

  const [activeId, setActiveId] = useState<string | null>(() => {
    return queryId || getActiveTournamentId()
  })

  // Listen for active tournament switches from other tabs
  useEffect(() => {
    if (queryId) {
      setActiveId(queryId)
      return
    }

    // Try finding latest tournament if none stored
    if (!activeId) {
      const stored = getActiveTournamentId()
      if (stored) {
        setActiveId(stored)
      } else {
        fetch('/api/tournament')
          .then((res) => res.json())
          .then((json) => {
            if (json.success && Array.isArray(json.data) && json.data.length > 0) {
              const latest = json.data[0]
              setActiveId(latest.id)
            }
          })
          .catch(() => {})
      }
    }

    const unsubscribe = subscribeTournamentSync(
      null,
      (updated) => {
        if (!queryId && (!activeId || activeId === updated.id)) {
          setActiveId(updated.id)
        }
      },
      (newActiveId) => {
        if (!queryId) {
          setActiveId(newActiveId)
        }
      }
    )

    return () => {
      unsubscribe()
    }
  }, [queryId, activeId])

  const { tournament, isLoading, error, loadTournament } = useTournament(activeId)

  return (
    <ProjectorDisplay
      tournament={tournament}
      isLoading={isLoading && Boolean(activeId)}
      error={error}
      onRefresh={loadTournament}
    />
  )
}

export default function GlobalProjectorPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-[#0B0D12] text-accent-gold flex items-center justify-center font-mono">
          Initializing Arena Projector Feed...
        </div>
      }
    >
      <GlobalProjectorContent />
    </Suspense>
  )
}
