'use client'

import React, { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'

export interface ConfettiProps {
  trigger: boolean
  onComplete?: () => void
}

export function Confetti({ trigger, onComplete }: ConfettiProps) {
  const [hasFired, setHasFired] = useState(false)

  useEffect(() => {
    if (trigger && !hasFired) {
      setHasFired(true)
      
      const duration = 3000
      const end = Date.now() + duration

      const colors = ['#F2B900', '#C49600', '#FFFFFF', '#F5F5F5']

      ;(function frame() {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: colors
        })
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: colors
        })

        if (Date.now() < end) {
          requestAnimationFrame(frame)
        } else if (onComplete) {
          onComplete()
        }
      })()
    }
  }, [trigger, hasFired, onComplete])

  // Reset state if trigger becomes false
  useEffect(() => {
    if (!trigger) {
      setHasFired(false)
    }
  }, [trigger])

  return null
}
