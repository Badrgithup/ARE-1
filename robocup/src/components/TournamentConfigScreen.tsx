'use client'

import React, { useState } from 'react'
import clsx from 'clsx'
import { ArrowLeft, Clock, Award } from 'lucide-react'
import { Button } from './ui/Button'
import type { TournamentConfig } from '@/lib/types'
import { determineGroupSizes } from '@/lib/group-stage-engine'

export interface TournamentConfigScreenProps {
  robotCount: number
  onConfigSelected: (config: TournamentConfig) => void
  onCancel: () => void
}

export function TournamentConfigScreen({
  robotCount,
  onConfigSelected,
  onCancel,
}: TournamentConfigScreenProps) {
  const [selectedFormat, setSelectedFormat] = useState<'2-to-final' | '4-to-final' | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleContinue = () => {
    if (!selectedFormat) return
    setIsProcessing(true)
    onConfigSelected({
      finalFormat: selectedFormat,
      timestamp: new Date().toISOString(),
    })
  }

  const groupSizes = determineGroupSizes(robotCount)
  const isSingleGroup = groupSizes.length === 1
  const groupCount = groupSizes.length

  // Match count estimation: sum of n*(n-1)/2 for each group
  const totalGroupMatches = groupSizes.reduce((sum, s) => sum + (s * (s - 1)) / 2, 0)

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center py-6 px-4">
      {/* Header */}
      <div className="text-center mb-6">
        <span className="text-xs font-mono uppercase tracking-wider text-accent-gold font-semibold">
          Stage 2: {isSingleGroup ? `${robotCount}-Robot Group Configuration` : `${robotCount}-Robot Multi-Group Configuration`}
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono text-text-primary mt-1 tracking-tight">
          Select Final Progression Format
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {robotCount} combatants remain ({isSingleGroup ? '1 group of 5' : `${groupCount} groups: ${groupSizes.join(' + ')}`}). Choose the tournament advancement schema from the round-robin stage.
        </p>
      </div>

      {/* Format Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-8 font-mono">
        {/* Card 1: 2-TO-FINAL */}
        <div
          onClick={() => setSelectedFormat('2-to-final')}
          className={clsx(
            'group cursor-pointer rounded p-5 flex flex-col justify-between transition-colors border',
            selectedFormat === '2-to-final'
              ? 'border-accent-gold bg-bg-card'
              : 'border-border bg-bg-surface hover:border-border-strong'
          )}
        >
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={clsx(
                    'w-4 h-4 rounded-full border flex items-center justify-center',
                    selectedFormat === '2-to-final'
                      ? 'border-accent-gold bg-accent-gold/20'
                      : 'border-border'
                  )}
                >
                  {selectedFormat === '2-to-final' && (
                    <div className="w-2 h-2 rounded-full bg-accent-gold" />
                  )}
                </div>
                <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">
                  Top 2 to Championship Final
                </h2>
              </div>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-bg-surface text-text-muted border border-border shrink-0">
                Direct
              </span>
            </div>

            <p className="text-xs text-text-secondary mb-4 font-sans">
              {isSingleGroup
                ? 'Direct championship clash between the 1st and 2nd ranked group finishers.'
                : groupCount === 2
                ? 'Direct championship clash between the winners of Group A and Group B.'
                : 'Direct championship clash between the top 2 ranked group winners.'}
            </p>

            <ul className="space-y-1.5 text-xs text-text-secondary mb-4">
              <li>
                • Group Stage: {totalGroupMatches} matches ({isSingleGroup ? `all ${robotCount} robots play each other` : `${groupCount} groups (${groupSizes.join(' + ')}), interleaved`})
              </li>
              <li>
                • {isSingleGroup ? 'Top 2 ranked combatants advance directly' : 'Group winners advance directly'}
              </li>
              <li>• Final: 1 championship match</li>
              <li>• Total remaining matches: {totalGroupMatches + 1}</li>
            </ul>
          </div>

          <div className="pt-3 border-t border-border flex items-center gap-2 text-[11px] text-accent-gold">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Faster completion (~{Math.round(totalGroupMatches * 1.5)} min)</span>
          </div>
        </div>

        {/* Card 2: 4-TO-FINAL */}
        <div
          onClick={() => setSelectedFormat('4-to-final')}
          className={clsx(
            'group cursor-pointer rounded p-5 flex flex-col justify-between transition-colors border',
            selectedFormat === '4-to-final'
              ? 'border-accent-gold bg-bg-card'
              : 'border-border bg-bg-surface hover:border-border-strong'
          )}
        >
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={clsx(
                    'w-4 h-4 rounded-full border flex items-center justify-center',
                    selectedFormat === '4-to-final'
                      ? 'border-accent-gold bg-accent-gold/20'
                      : 'border-border'
                  )}
                >
                  {selectedFormat === '4-to-final' && (
                    <div className="w-2 h-2 rounded-full bg-accent-gold" />
                  )}
                </div>
                <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">
                  Top 4 to Semifinals & Final
                </h2>
              </div>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-bg-surface text-text-muted border border-border shrink-0">
                Brackets
              </span>
            </div>

            <p className="text-xs text-text-secondary mb-4 font-sans">
              {isSingleGroup
                ? 'Top 4 ranked finishers enter knockout semifinals (1v4 and 2v3) followed by the grand final.'
                : groupCount === 2
                ? 'Top 2 finishers from each group enter knockout semifinals (A1 vs B2, B1 vs A2) followed by the grand final.'
                : 'Group winners plus the best runner-up enter knockout semifinals (1v4 and 2v3) followed by the grand final.'}
            </p>

            <ul className="space-y-1.5 text-xs text-text-secondary mb-4">
              <li>• Group Stage: {totalGroupMatches} matches (round-robin)</li>
              <li>• {isSingleGroup ? 'Top 4 ranked combatants advance' : 'Top 4 qualifiers advance to semifinals'}</li>
              <li>• Semifinals: 2 knockout matches</li>
              <li>• Final: 1 championship match</li>
              <li>• Total remaining matches: {totalGroupMatches + 3}</li>
            </ul>
          </div>

          <div className="pt-3 border-t border-border flex items-center gap-2 text-[11px] text-accent-cyan">
            <Award className="w-3.5 h-3.5 shrink-0" />
            <span>Full playoff bracket structure</span>
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-between gap-4 w-full pt-4 border-t border-border">
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={isProcessing}
          className="font-mono text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Cancel
        </Button>

        <Button
          size="sm"
          variant="primary"
          disabled={!selectedFormat || isProcessing}
          onClick={handleContinue}
          className="font-mono text-xs uppercase tracking-wider"
        >
          {isProcessing ? 'Configuring Stage...' : 'Confirm Schema & Launch Group Stage →'}
        </Button>
      </div>
    </div>
  )
}
