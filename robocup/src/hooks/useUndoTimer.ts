'use client'

import { useState, useEffect } from 'react'
import { UNDO_WINDOW_MS } from '@/lib/constants'

export function useUndoTimer(deadline: string | null) {
  const [remainingMs, setRemainingMs] = useState(0)

  useEffect(() => {
    if (!deadline) {
      setRemainingMs(0)
      return
    }

    const targetTime = new Date(deadline).getTime()

    const updateTimer = () => {
      const now = Date.now()
      const diff = targetTime - now
      setRemainingMs(Math.max(0, diff))
    }

    updateTimer()
    const interval = setInterval(updateTimer, 100)

    return () => clearInterval(interval)
  }, [deadline])

  return {
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    isExpired: remainingMs <= 0 && deadline !== null,
    progress: deadline ? Math.max(0, Math.min(1, remainingMs / UNDO_WINDOW_MS)) : 0,
  }
}
