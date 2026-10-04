'use client'

import React from 'react'
import clsx from 'clsx'

export interface ProgressBarProps {
  progress: number // 0 to 100
  label?: string
  showPercentage?: boolean
  className?: string
}

export function ProgressBar({ progress, label, showPercentage = true, className }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress))
  
  return (
    <div className={clsx("w-full", className)}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-end mb-2 text-sm">
          {label && <span className="text-text-secondary">{label}</span>}
          {showPercentage && <span className="font-mono text-text-primary">{Math.round(clampedProgress)}%</span>}
        </div>
      )}
      <div className="h-2 w-full bg-bg-surface rounded-full overflow-hidden border border-border">
        <div 
          className="h-full bg-accent-gold transition-all duration-500 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  )
}
