'use client'

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { Button } from '../ui/Button'
import { CountdownTimer } from '../ui/CountdownTimer'

export interface UndoButtonProps {
  deadline: string | null
  onUndo: () => void
}

export function UndoButton({ deadline, onUndo }: UndoButtonProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!deadline) {
      setIsVisible(false)
      return
    }

    const targetTime = new Date(deadline).getTime()
    const now = Date.now()
    const diffSeconds = Math.max(0, Math.floor((targetTime - now) / 1000))

    if (diffSeconds > 0) {
      setDuration(diffSeconds)
      setIsVisible(true)
    } else {
      setIsVisible(false)
    }
  }, [deadline])

  const handleComplete = () => {
    setIsVisible(false)
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-bg-card border border-border shadow-2xl p-4 rounded-xl flex items-center gap-4"
        >
          <div className="flex flex-col">
            <span className="text-sm font-bold text-text-primary">Match Recorded</span>
            <span className="text-xs text-text-muted">Undo available for a limited time</span>
          </div>
          
          <div className="w-px h-8 bg-border mx-2" />
          
          <Button variant="danger" onClick={onUndo} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Undo
          </Button>
          
          <CountdownTimer 
            key={deadline} // Force re-mount when deadline changes
            duration={duration} 
            size={40} 
            onComplete={handleComplete} 
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
