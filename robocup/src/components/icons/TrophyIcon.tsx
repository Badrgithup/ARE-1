import React from 'react'

export interface IconProps {
  className?: string
  size?: number
  color?: string
  strokeWidth?: number
}

export function TrophyIcon({
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
      <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" />
      <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
      <path d="M6 3h12v7a6 6 0 0 1-12 0V3z" />
      <path d="M12 16v4" />
      <path d="M8 20h8" />
    </svg>
  )
}
