import React from 'react'
import type { IconProps } from './TrophyIcon'

export function HistoryIcon({
  className = '',
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 6 12 12 16 14" />
      <path d="M3.05 11a9 9 0 0 1 .5-2m-.5 2H1m2.05 0L5 8.5" />
    </svg>
  )
}
