'use client'

import React from 'react'
import clsx from 'clsx'
import { BATCH_SIZE_OPTIONS } from '@/lib/constants'

export interface BatchSelectorProps {
  value: number
  onChange: (value: number) => void
  className?: string
}

export function BatchSelector({ value, onChange, className }: BatchSelectorProps) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <label htmlFor="batch-size" className="text-sm font-medium text-text-secondary">
        Batch Size:
      </label>
      <div className="relative">
        <select
          id="batch-size"
          value={value === Infinity ? 'all' : value.toString()}
          onChange={(e) => {
            const val = e.target.value
            onChange(val === 'all' ? Infinity : parseInt(val, 10))
          }}
          className="appearance-none bg-bg-surface border border-border text-text-primary text-sm rounded-lg focus:ring-2 focus:ring-accent-gold focus:border-accent-gold block w-full p-2.5 pr-8 transition-colors outline-none cursor-pointer"
        >
          {BATCH_SIZE_OPTIONS.map(size => (
            <option key={size} value={size.toString()}>{size} Matches</option>
          ))}
          <option value="all">All Matches</option>
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-secondary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </div>
      </div>
    </div>
  )
}
