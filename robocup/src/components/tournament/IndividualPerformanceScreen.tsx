'use client'

import React, { useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { ClockIcon, StarIcon, CheckIcon, RobotIcon, MedalIcon } from '../icons'
import type { Robot, IndividualPerformance, Tournament } from '@/lib/types'

export interface IndividualPerformanceScreenProps {
  tournament: Tournament
  onRecordPerformance: (robotId: string, time: number, points: number) => Promise<void>
  onViewPodium?: () => void
}

export function IndividualPerformanceScreen({
  tournament,
  onRecordPerformance,
  onViewPodium,
}: IndividualPerformanceScreenProps) {
  const activeRobots = tournament.robots.filter((r) => r.status === 'active')
  const completedPerformances = tournament.performances || []

  // Next robot to perform is the first active robot without a performance record
  const unperformedRobots = activeRobots.filter(
    (r) => !completedPerformances.some((p) => p.robotId === r.id)
  )

  const [selectedRobotId, setSelectedRobotId] = useState<string>(
    unperformedRobots[0]?.id || activeRobots[0]?.id || ''
  )
  const [timeInput, setTimeInput] = useState<string>('')
  const [pointsInput, setPointsInput] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)

  const currentRobot =
    activeRobots.find((r) => r.id === selectedRobotId) || unperformedRobots[0] || null

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentRobot) return

    const timeNum = parseFloat(timeInput)
    const pointsNum = parseInt(pointsInput, 10)

    if (isNaN(timeNum) || timeNum < 0) {
      setFormError('Please enter a valid time in seconds (e.g. 45.3)')
      return
    }

    if (isNaN(pointsNum) || pointsNum < 0) {
      setFormError('Please enter a valid points score (e.g. 120)')
      return
    }

    setFormError(null)
    setIsSubmitting(true)
    try {
      await onRecordPerformance(currentRobot.id, timeNum, pointsNum)
      setTimeInput('')
      setPointsInput('')

      // Auto-select the next unperformed robot
      const nextRemaining = activeRobots.filter(
        (r) => r.id !== currentRobot.id && !completedPerformances.some((p) => p.robotId === r.id)
      )
      if (nextRemaining.length > 0) {
        setSelectedRobotId(nextRemaining[0].id)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record performance'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const allRecorded = completedPerformances.length >= activeRobots.length && activeRobots.length > 0

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Stage Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-accent-gold font-semibold">
              Final Stage · Top 3 Combatants
            </span>
            <Badge variant="gold">Performance Trial</Badge>
          </div>
          <h1 className="text-2xl font-bold font-mono text-text-primary tracking-tight mt-1">
            Individual Performance Judging
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Solo skills runs. Primary ranking by points scored; time is the official tiebreaker.
          </p>
        </div>

        {allRecorded && onViewPodium && (
          <Button variant="primary" size="md" onClick={onViewPodium} className="font-mono text-xs">
            <TrophySmallIcon className="mr-1.5" />
            View Final Podium & Champion
          </Button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="bg-bg-surface border border-border p-4 rounded flex flex-col gap-2">
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-text-secondary">
            Evaluation Progress:{' '}
            <strong className="text-text-primary">
              {completedPerformances.length} of {activeRobots.length}
            </strong>{' '}
            trials recorded
          </span>
          <span className="text-accent-gold font-semibold">
            {Math.round((completedPerformances.length / Math.max(1, activeRobots.length)) * 100)}%
          </span>
        </div>
        <div className="w-full h-2 bg-bg-card rounded overflow-hidden border border-border/50">
          <div
            className="h-full bg-accent-gold transition-all duration-300"
            style={{
              width: `${(completedPerformances.length / Math.max(1, activeRobots.length)) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Judge Input Form */}
        <div className="md:col-span-7 flex flex-col gap-4">
          <Card padding="md" className="border-border bg-bg-surface">
            {!allRecorded && currentRobot ? (
              <form onSubmit={handleRecord} className="flex flex-col gap-5">
                <div className="border-b border-border pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                      Active Arena Trial
                    </span>
                    <Badge variant="blue">Trial In Progress</Badge>
                  </div>
                  <h2 className="text-xl font-bold font-mono text-text-primary mt-1">
                    {currentRobot.name}
                  </h2>
                  <p className="text-xs font-mono text-text-secondary">
                    {currentRobot.club}
                    {currentRobot.institution && ` · ${currentRobot.institution}`}
                  </p>
                </div>

                {/* Robot Selector dropdown if judge needs to change order */}
                {unperformedRobots.length > 1 && (
                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-text-muted mb-1.5">
                      Select Running Combatant
                    </label>
                    <select
                      value={selectedRobotId}
                      onChange={(e) => setSelectedRobotId(e.target.value)}
                      className="w-full bg-bg-card border border-border rounded px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-gold"
                    >
                      {unperformedRobots.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.club})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Score inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-mono text-text-secondary mb-1.5">
                      <StarIcon size={14} className="text-accent-gold" />
                      <span>Points Score (Integer)</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="e.g. 120"
                      value={pointsInput}
                      onChange={(e) => setPointsInput(e.target.value)}
                      autoFocus
                      required
                      className="w-full bg-bg-card border border-border rounded px-3.5 py-2.5 text-base font-mono text-text-primary focus:outline-none focus:border-accent-gold tabular-nums"
                    />
                    <span className="text-[10px] font-mono text-text-muted block mt-1">
                      Primary ranking metric (highest wins)
                    </span>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-mono text-text-secondary mb-1.5">
                      <ClockIcon size={14} className="text-accent-cyan" />
                      <span>Time Elapsed (Seconds)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 45.3"
                      value={timeInput}
                      onChange={(e) => setTimeInput(e.target.value)}
                      required
                      className="w-full bg-bg-card border border-border rounded px-3.5 py-2.5 text-base font-mono text-text-primary focus:outline-none focus:border-accent-gold tabular-nums"
                    />
                    <span className="text-[10px] font-mono text-text-muted block mt-1">
                      Official tiebreaker (lowest/fastest wins)
                    </span>
                  </div>
                </div>

                {formError && (
                  <div className="bg-danger/10 border border-danger/30 text-danger p-2.5 rounded text-xs font-mono">
                    {formError}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting || !timeInput || !pointsInput}
                  className="w-full font-mono text-xs justify-center"
                >
                  <CheckIcon size={16} className="mr-1.5" />
                  {isSubmitting ? 'Recording Judge Entry...' : 'Confirm & Record Performance'}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-accent-gold/10 border border-accent-gold/40 flex items-center justify-center text-accent-gold">
                  <CheckIcon size={24} />
                </div>
                <h3 className="text-base font-bold font-mono text-text-primary">
                  All Combatant Trials Recorded
                </h3>
                <p className="text-xs text-text-secondary max-w-sm">
                  Official scores and times for all 3 finalists have been verified and finalized.
                </p>
                {onViewPodium && (
                  <Button variant="primary" size="md" onClick={onViewPodium} className="font-mono text-xs mt-2">
                    Show Official Champion Podium →
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Verified Results Table */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-text-secondary">
              Recorded Standings
            </h3>
            <span className="text-[10px] font-mono text-text-muted">
              {completedPerformances.length} Completed
            </span>
          </div>

          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            {completedPerformances.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-text-muted">
                No performances submitted yet. Run combatants in the arena and record scores above.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {tournament.performanceResults ? (
                  // Show calculated final rankings if all recorded
                  tournament.performanceResults.map((res) => (
                    <div
                      key={res.robot.id}
                      className="p-3.5 flex items-center justify-between hover:bg-bg-card transition-colors gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded flex items-center justify-center font-mono font-bold text-xs ${
                            res.medal === 'gold'
                              ? 'bg-accent-gold/20 text-accent-gold border border-accent-gold/40'
                              : res.medal === 'silver'
                              ? 'bg-slate-300/20 text-slate-200 border border-slate-400/40'
                              : 'bg-amber-800/20 text-amber-500 border border-amber-700/40'
                          }`}
                        >
                          #{res.ranking}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold font-mono text-text-primary">
                            {res.robot.name}
                          </h4>
                          <span className="text-[10px] font-mono text-text-muted block">
                            {res.robot.club}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono text-xs">
                        <span className="font-bold text-accent-gold tabular-nums block">
                          {res.points} pts
                        </span>
                        <span className="text-[10px] text-text-muted tabular-nums">
                          {res.time.toFixed(1)}s
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  // Show recorded so far
                  completedPerformances.map((perf, idx) => {
                    const robot = activeRobots.find((r) => r.id === perf.robotId)
                    return (
                      <div
                        key={perf.id}
                        className="p-3.5 flex items-center justify-between hover:bg-bg-card transition-colors gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-text-muted">#{idx + 1}</span>
                          <div>
                            <h4 className="text-xs font-bold font-mono text-text-primary">
                              {robot?.name || 'Unknown Combatant'}
                            </h4>
                            <span className="text-[10px] font-mono text-text-muted block">
                              {robot?.club}
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono text-xs">
                          <span className="font-bold text-accent-gold tabular-nums block">
                            {perf.points} pts
                          </span>
                          <span className="text-[10px] text-text-muted tabular-nums">
                            {perf.time.toFixed(1)}s
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TrophySmallIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" />
      <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
      <path d="M6 3h12v7a6 6 0 0 1-12 0V3z" />
      <path d="M12 16v4" />
      <path d="M8 20h8" />
    </svg>
  )
}
