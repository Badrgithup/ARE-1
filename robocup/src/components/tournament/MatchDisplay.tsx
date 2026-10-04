'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { Match, Robot } from '@/lib/types'

export interface MatchDisplayProps {
  match: Match
  matchIndex: number
  totalMatches: number
  onSelectWinner: (matchId: string, robotId: string) => void
}

export function MatchDisplay({
  match,
  matchIndex,
  totalMatches,
  onSelectWinner,
}: MatchDisplayProps) {
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null)

  const handleSelect = (robotId: string) => {
    if (selectedWinnerId) return
    setSelectedWinnerId(robotId)
    setTimeout(() => {
      onSelectWinner(match.id, robotId)
    }, 120)
  }

  React.useEffect(() => {
    setSelectedWinnerId(null)
  }, [match.id])

  if (match.isBye || !match.robot2) {
    return (
      <div className="w-full flex flex-col items-center max-w-xl mx-auto py-6">
        <div className="text-center mb-6">
          <Badge variant="gray" className="mb-2 font-mono">
            Match {String(match.matchNumber).padStart(2, '0')} · {matchIndex + 1} of {totalMatches}
          </Badge>
          <h2 className="text-xl font-bold font-mono text-text-primary">
            Auto-Advancement (BYE)
          </h2>
        </div>

        <Card padding="lg" className="w-full border-border text-center flex flex-col items-center">
          <span className="text-xs font-mono text-text-muted uppercase tracking-wider mb-1">
            Seeded Combatant
          </span>
          <h3 className="font-mono text-3xl font-bold text-text-primary mb-1">
            {match.robot1.name}
          </h3>
          <p className="text-text-secondary text-sm mb-1">{match.robot1.club}</p>
          {match.robot1.institution && (
            <p className="text-xs text-text-muted font-mono">{match.robot1.institution}</p>
          )}

          <Button
            size="md"
            variant="primary"
            className="mt-6 w-full font-mono text-xs"
            onClick={() => handleSelect(match.robot1.id)}
          >
            Confirm Advancement →
          </Button>
        </Card>
      </div>
    )
  }

  const renderRobotCard = (robot: Robot, isLeft: boolean) => {
    const isSelected = selectedWinnerId === robot.id
    const isLoser = selectedWinnerId && selectedWinnerId !== robot.id

    return (
      <div className="w-full relative">
        <Card
          padding="lg"
          className={clsx(
            'h-full flex flex-col justify-between transition-colors border',
            isSelected
              ? 'border-accent-gold bg-bg-surface'
              : isLoser
              ? 'opacity-40 border-border'
              : 'border-border hover:border-border-strong'
          )}
        >
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
              Combatant {isLeft ? 'A' : 'B'}
            </span>
            <h3 className="font-mono text-3xl sm:text-4xl font-bold text-text-primary mb-2 break-words max-w-full tracking-tight">
              {robot.name}
            </h3>
            <p className="text-base text-text-secondary font-medium">{robot.club}</p>
            {robot.institution && (
              <p className="text-xs text-text-muted font-mono mt-1">{robot.institution}</p>
            )}
          </div>

          <Button
            size="lg"
            variant={isSelected ? 'primary' : 'secondary'}
            className="w-full font-mono text-xs uppercase tracking-wider"
            disabled={selectedWinnerId !== null}
            onClick={() => handleSelect(robot.id)}
          >
            {isSelected ? 'Winner Confirmed' : `Select ${robot.name}`}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col max-w-5xl mx-auto">
      {/* Telemetry bar */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-6 font-mono text-xs">
        <div className="flex items-center gap-2">
          <Badge variant="blue">
            {match.groupName ? `${match.groupName} · ` : ''}Match {String(match.matchNumber).padStart(2, '0')}
          </Badge>
          <span className="text-text-muted">
            Round Progress: <span className="text-text-primary font-bold">{matchIndex + 1}</span> / {totalMatches}
          </span>
        </div>
        <span className="text-text-muted text-[11px]">
          Referee Decision Mode
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-6 relative">
        {renderRobotCard(match.robot1, true)}

        <div className="flex items-center justify-center py-2 shrink-0">
          <div className="w-10 h-10 rounded-full bg-bg-surface border border-border flex items-center justify-center font-mono font-bold text-xs text-text-muted">
            VS
          </div>
        </div>

        {renderRobotCard(match.robot2, false)}
      </div>
    </div>
  )
}
