'use client'

import React from 'react'
import { motion } from 'framer-motion'

export interface StaggeredListProps {
  children: React.ReactNode
  delay?: number
  staggerDelay?: number
  className?: string
}

export function StaggeredList({ 
  children, 
  delay = 0, 
  staggerDelay = 0.1,
  className 
}: StaggeredListProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: delay
      }
    }
  }

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { 
      opacity: 1, 
      y: 0,
      transition: {
        type: 'spring' as const,
        bounce: 0,
        duration: 0.5
      }
    }
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={className}
    >
      {React.Children.map(children, (child) => (
        <motion.div variants={item}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}
