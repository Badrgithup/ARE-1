'use client'

import React from 'react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { StaggeredList } from '../animations/StaggeredList'
import type { Robot } from '@/lib/types'

export interface RobotListProps {
  robots: Robot[]
  showStatus?: boolean
}

export function RobotList({ robots, showStatus = true }: RobotListProps) {
  return (
    <StaggeredList className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" staggerDelay={0.05}>
      {robots.map((robot) => (
        <Card key={robot.id} hoverable padding="sm" className="flex flex-col h-full relative overflow-hidden">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-mono font-bold text-lg text-text-primary truncate" title={robot.name}>
              {robot.name}
            </h3>
            {showStatus && (
              <Badge variant={robot.status === 'active' ? 'gold' : 'red'} className="ml-2 shrink-0">
                {robot.status === 'active' ? 'Active' : 'Eliminated'}
              </Badge>
            )}
          </div>
          <div className="mt-auto flex flex-col gap-1 text-sm">
            <div className="flex items-center text-text-secondary">
              <span className="truncate">{robot.club}</span>
            </div>
            {robot.institution && (
              <div className="flex items-center text-text-muted text-xs">
                <span className="truncate">{robot.institution}</span>
              </div>
            )}
          </div>
        </Card>
      ))}
    </StaggeredList>
  )
}
