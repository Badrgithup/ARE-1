'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { PlusIcon } from '@/components/icons'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isProjector = pathname ? pathname.includes('/projector') : false
  const isCamera = pathname ? pathname.includes('/camera') : false

  if (isProjector || isCamera) {
    return (
      <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#0B0D12] select-none text-text-primary">
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary antialiased flex flex-col font-sans">
      {/* Professional Competition Control Header */}
      <header className="border-b border-border bg-bg-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Real Association Robotique ENSI Branding */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded overflow-hidden border border-border-strong bg-black shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/are-logo.jpg"
                  alt="Association Robotique ENSI"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-text-primary tracking-tight">RoboCup Arena</span>
                </div>
                <p className="text-[11px] text-text-muted leading-none">Association Robotique ENSI</p>
              </div>
            </Link>

            {/* Navigation Tabs */}
            <nav className="hidden sm:flex items-center gap-1 border-l border-border pl-6">
              <Link
                href="/"
                className="px-3 py-1.5 text-xs font-medium rounded text-text-secondary hover:text-text-primary hover:bg-bg-card transition-colors"
              >
                Tournament Setup
              </Link>
              <Link
                href="/history"
                className="px-3 py-1.5 text-xs font-medium rounded text-text-secondary hover:text-text-primary hover:bg-bg-card transition-colors"
              >
                Archives & History
              </Link>
              <Link
                href="/camera"
                target="_blank"
                className="px-3 py-1.5 text-xs font-medium rounded text-accent-gold hover:text-accent-gold/80 hover:bg-bg-card transition-colors flex items-center gap-1.5"
              >
                Arena Camera
              </Link>
            </nav>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded hover:border-border-strong transition-colors flex items-center gap-1.5"
            >
              <PlusIcon size={13} className="text-accent-gold" />
              <span>New Tournament</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        {children}
      </main>

      {/* Restrained Technical Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-text-muted font-mono">
        <p>Association Robotique ENSI (ARE) · Competition Management System</p>
      </footer>
    </div>
  )
}
