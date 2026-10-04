'use client'

import React from 'react'
import clsx from 'clsx'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'gold' | 'blue' | 'red' | 'green' | 'gray'
}

export function Badge({ variant = 'gray', className, children, ...props }: BadgeProps) {
  const variantClasses = {
    gold: 'bg-accent-gold/10 text-accent-gold border-accent-gold/30',
    blue: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30',
    red: 'bg-danger/10 text-danger border-danger/30',
    green: 'bg-success/10 text-success border-success/30',
    gray: 'bg-bg-card text-text-secondary border-border',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium border select-none',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
