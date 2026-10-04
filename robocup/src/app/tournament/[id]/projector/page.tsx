'use client'

import React, { use } from 'react'
import { useTournament } from '@/hooks/useTournament'
import { ProjectorDisplay } from '@/components/tournament/ProjectorDisplay'

export default function TournamentProjectorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { tournament, isLoading, error, loadTournament } = useTournament(id)

  return (
    <ProjectorDisplay
      tournament={tournament}
      isLoading={isLoading}
      error={error}
      onRefresh={loadTournament}
    />
  )
}
