import React from 'react'
import type { IconProps } from './TrophyIcon'

export function RobotIcon({
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
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="15" x2="8.01" y2="15" strokeWidth={strokeWidth + 1} />
      <line x1="16" y1="15" x2="16.01" y2="15" strokeWidth={strokeWidth + 1} />
      <path d="M9 18h6" />
      <path d="M2 15h1" />
      <path d="M21 15h1" />
    </svg>
  )
}
