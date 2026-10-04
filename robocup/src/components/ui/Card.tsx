'use client'

import React from 'react'
import clsx from 'clsx'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  variant?: 'default' | 'gold' | 'flat'
}

export function Card({
  hoverable = false,
  padding = 'md',
  variant = 'default',
  className,
  children,
  ...props
}: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-5',
    lg: 'p-6',
  }

  const variantClasses = {
    default: 'bg-bg-surface border border-border rounded-lg shadow-sm',
    gold: 'bg-bg-surface border border-accent-gold/40 rounded-lg shadow-sm',
    flat: 'bg-bg-card border border-border rounded-md',
  }

  return (
    <div
      className={clsx(
        variantClasses[variant],
        paddingClasses[padding],
        hoverable && 'hover:border-border-strong transition-colors',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
