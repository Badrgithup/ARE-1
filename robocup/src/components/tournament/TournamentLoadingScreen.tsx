'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../ui/Card'

export interface TournamentLoadingScreenProps {
  tournamentName: string
  robotCount: number
  onComplete?: () => void
}

interface Stage {
  label: string
  detail: string
}

const STAGES: Stage[] = [
  { label: 'Roster Verification', detail: 'Parsing combatant records and team schemas' },
  { label: 'Affiliation Indexing', detail: 'Cataloging clubs, institutions, and brackets' },
  { label: 'Bracket Matrix Computation', detail: 'Generating randomized match seed sequences' },
  { label: 'Local Arena Allocation', detail: 'Initializing in-memory session and atomic storage' },
  { label: 'Session Ready', detail: 'Launching competition dashboard' },
]

export function TournamentLoadingScreen({
  tournamentName,
  robotCount,
  onComplete,
}: TournamentLoadingScreenProps) {
  const [currentStageIndex, setCurrentStageIndex] = useState(0)
  const [progress, setProgress] = useState(15)

  useEffect(() => {
    const totalDuration = 1800
    const intervalTime = 50
    const step = 100 / (totalDuration / intervalTime)

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + step
        if (next >= 100) {
          clearInterval(timer)
          return 100
        }
        return next
      })
    }, intervalTime)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (progress < 25) setCurrentStageIndex(0)
    else if (progress < 50) setCurrentStageIndex(1)
    else if (progress < 75) setCurrentStageIndex(2)
    else if (progress < 95) setCurrentStageIndex(3)
    else setCurrentStageIndex(4)

    if (progress >= 100 && onComplete) {
      const timeout = setTimeout(() => {
        onComplete()
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [progress, onComplete])

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0D12]/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card
        padding="lg"
        className="max-w-md w-full border-border-strong shadow-2xl flex flex-col items-center text-center bg-bg-surface"
      >
        {/* Technical Spinner */}
        <div className="w-10 h-10 border-2 border-border-strong border-t-accent-gold rounded-full animate-spin mb-4" />

        {/* Tournament Identifier */}
        <div className="mb-5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
            Initializing Session
          </span>
          <h2 className="text-lg font-bold text-text-primary tracking-tight truncate max-w-sm mt-0.5">
            {tournamentName}
          </h2>
          <p className="text-xs text-text-secondary font-mono mt-0.5">
            {robotCount} Verified Combatants
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full mb-5">
          <div className="flex justify-between items-center text-xs font-mono mb-1.5">
            <span className="text-text-secondary">{STAGES[currentStageIndex].label}</span>
            <span className="text-accent-gold font-bold tabular-nums">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-1.5 bg-bg-card rounded-full overflow-hidden border border-border">
            <motion.div
              className="h-full bg-accent-gold rounded-full"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
        </div>

        {/* Steps Matrix */}
        <div className="w-full bg-bg-card border border-border rounded p-3 text-left flex flex-col gap-2">
          {STAGES.map((stage, idx) => {
            const isDone = idx < currentStageIndex
            const isCurrent = idx === currentStageIndex

            return (
              <div
                key={stage.label}
                className={`flex items-center gap-2.5 text-xs font-mono transition-opacity ${
                  isCurrent
                    ? 'text-text-primary font-semibold'
                    : isDone
                    ? 'text-text-muted opacity-80'
                    : 'text-text-muted/40'
                }`}
              >
                <span className="w-4 text-center">
                  {isDone ? (
                    <span className="text-success font-bold">✓</span>
                  ) : isCurrent ? (
                    <span className="text-accent-gold">›</span>
                  ) : (
                    <span>·</span>
                  )}
                </span>
                <span className="truncate flex-1">{stage.label}</span>
                {isCurrent && (
                  <span className="text-[10px] text-accent-gold uppercase tracking-wider animate-pulse">
                    Active
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
