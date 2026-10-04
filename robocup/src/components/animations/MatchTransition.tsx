'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface MatchTransitionProps {
  children: React.ReactNode
  matchKey: string
  className?: string
}

export function MatchTransition({ children, matchKey, className }: MatchTransitionProps) {
  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={matchKey}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ 
            type: 'spring',
            bounce: 0,
            duration: 0.4
          }}
          className="w-full h-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
