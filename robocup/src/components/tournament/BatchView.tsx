'use client'

import React from 'react'
import clsx from 'clsx'
import { Card } from '../ui/Card'
import { ProgressBar } from '../ui/ProgressBar'
import { Lock, Play, CheckCircle2 } from 'lucide-react'
import type { Batch } from '@/lib/types'

export interface BatchViewProps {
  batches: Batch[]
  activeBatchIndex: number
  onBatchSelect?: (index: number) => void
}

export function BatchView({ batches, activeBatchIndex, onBatchSelect }: BatchViewProps) {
  return (
    <div className="flex flex-col gap-3">
      {batches.map((batch, index) => {
        const isActive = index === activeBatchIndex
        const isCompleted = batch.status === 'completed'
        const isPending = batch.status === 'pending'
        
        const completedMatches = batch.matches.filter(m => m.status === 'locked' || m.status === 'recorded').length
        const totalMatches = batch.matches.length
        const progress = (completedMatches / totalMatches) * 100

        return (
          <Card 
            key={batch.id} 
            padding="sm"
            className={clsx(
              "transition-all duration-300",
              isActive ? "border-accent-gold shadow-[0_0_15px_rgba(242,185,0,0.1)]" : "opacity-80"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  isCompleted ? "bg-success/20 text-success" : 
                  isActive ? "bg-accent-gold text-bg-primary" : 
                  "bg-bg-surface text-text-muted"
                )}>
                  {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : 
                   isActive ? <Play className="w-4 h-4 ml-0.5" /> : 
                   <span className="text-sm font-bold">{batch.batchNumber}</span>}
                </div>
                <div>
                  <h4 className={clsx(
                    "font-bold",
                    isActive ? "text-text-primary" : "text-text-secondary"
                  )}>
                    Batch {batch.batchNumber}
                  </h4>
                  <p className="text-xs text-text-muted">
                    {completedMatches} of {totalMatches} matches
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 w-1/3">
                <ProgressBar 
                  progress={progress} 
                  showPercentage={false} 
                  className="flex-1 hidden sm:block" 
                />
                {!isCompleted && !isActive && (
                  <Lock className="w-4 h-4 text-text-muted shrink-0" />
                )}
              </div>
            </div>
            
            {isActive && (
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {batch.matches.map(match => (
                  <div 
                    key={match.id} 
                    className={clsx(
                      "text-xs p-2 rounded border",
                      match.status === 'locked' ? "bg-success/10 border-success/30 text-success" :
                      match.status === 'recorded' ? "bg-accent-blue/10 border-accent-blue/30 text-accent-blue" :
                      "bg-bg-surface border-border text-text-secondary"
                    )}
                  >
                    Match {match.matchNumber}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
