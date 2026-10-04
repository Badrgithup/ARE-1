'use client'

import React, { useEffect, useState } from 'react'
import clsx from 'clsx'

export interface CountdownTimerProps {
  duration: number // in seconds
  onComplete?: () => void
  size?: number
}

export function CountdownTimer({ duration, onComplete, size = 48 }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration)
  
  useEffect(() => {
    if (timeLeft <= 0) {
      if (onComplete) onComplete()
      return
    }
    
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1)
    }, 1000)
    
    return () => clearInterval(timer)
  }, [timeLeft, onComplete])

  const radius = (size - 4) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDashoffset = circumference - (timeLeft / duration) * circumference
  const isDanger = timeLeft <= 5

  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="var(--color-border)"
          strokeWidth="4"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={isDanger ? "var(--color-danger)" : "var(--color-accent-gold)"}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <span 
        className={clsx(
          "absolute text-sm font-mono font-medium",
          isDanger ? "text-danger animate-pulse" : "text-text-primary"
        )}
      >
        {timeLeft}
      </span>
    </div>
  )
}
