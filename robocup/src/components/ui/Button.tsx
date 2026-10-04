'use client'

import React from 'react'
import clsx from 'clsx'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  isStatic?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  isStatic = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = clsx(
    'inline-flex items-center justify-center font-medium select-none cursor-pointer',
    'rounded border transition-colors duration-150',
    'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-gold',
    !isStatic && !disabled && 'active:scale-[0.98]'
  )

  const variantClasses = {
    primary:
      'bg-accent-gold text-[#0B0D12] font-semibold border-accent-gold hover:bg-[#E5A817] shadow-sm',
    secondary:
      'bg-bg-card text-text-primary border-border hover:border-border-strong hover:bg-bg-card-hover',
    outline:
      'bg-transparent text-accent-gold border-accent-gold/40 hover:border-accent-gold hover:bg-accent-gold/5',
    danger:
      'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20',
    ghost:
      'bg-transparent text-text-secondary border-transparent hover:text-text-primary hover:bg-white/[0.04]',
  }

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3.5 py-1.5 text-xs sm:text-sm gap-2',
    lg: 'px-5 py-2 text-sm sm:text-base gap-2',
  }

  return (
    <button
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        disabled && 'opacity-40 cursor-not-allowed active:scale-100 hover:bg-auto',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
