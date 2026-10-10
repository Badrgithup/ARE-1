'use client'

import React, { useEffect, useRef, useState } from 'react'
import io, { Socket } from 'socket.io-client'
import {
  Camera,
  Radio,
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
  Activity,
  Layers,
} from 'lucide-react'

export interface ProjectorCameraWidgetProps {
  layoutMode?: 'split' | 'pip' | 'embedded'
  onToggleLayout?: () => void
  onClose?: () => void
}

export function ProjectorCameraWidget({
  layoutMode = 'split',
  onToggleLayout,
  onClose,
}: ProjectorCameraWidgetProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const socketRef = useRef<Socket | null>(null)

  // Status & Telemetry
  const [isConnected, setIsConnected] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [fps, setFps] = useState(0)
  const [lastFrameTime, setLastFrameTime] = useState<number | null>(null)

  const frameCounterRef = useRef(0)
  const lastFpsCalcRef = useRef(Date.now())

  useEffect(() => {
    // Connect to Socket.io relay on current origin
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
      setIsLive(false)
    })

    socket.on('camera-status', (status: { online: boolean; count: number }) => {
      setIsLive(status.online)
    })

    socket.on('camera-frame', (frameData: string) => {
      setIsLive(true)
      setLastFrameTime(Date.now())

      if (imgRef.current) {
        imgRef.current.src = frameData
      }

      frameCounterRef.current++
      const now = Date.now()
      if (now - lastFpsCalcRef.current >= 1000) {
        setFps(frameCounterRef.current)
        frameCounterRef.current = 0
        lastFpsCalcRef.current = now
      }
    })

    // Heartbeat: detect if frames stop arriving for > 3 seconds
    const interval = setInterval(() => {
      if (lastFrameTime && Date.now() - lastFrameTime > 3500) {
        setIsLive(false)
        setFps(0)
      }
    }, 1500)

    return () => {
      clearInterval(interval)
      socket.disconnect()
      socketRef.current = null
    }
  }, [lastFrameTime])

  return (
    <div
      className={`w-full h-full bg-[#0B0D12] border border-[#232838] rounded-lg overflow-hidden flex flex-col shadow-2xl transition-all ${
        layoutMode === 'pip' ? 'ring-2 ring-accent-gold/40' : ''
      }`}
    >
      {/* ─────────────────────────────────────────────────────────────
          WIDGET HEADER (TECHNICAL BROADCAST BAR)
         ───────────────────────────────────────────────────────────── */}
      <div className="h-10 px-4 bg-[#12151E] border-b border-[#232838] flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded bg-[#181B26] border border-[#333B50] flex items-center justify-center text-accent-gold">
            <Camera className="w-3 h-3" />
          </div>
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">
            LIVE ARENA CAMERA
          </span>

          {/* Live / Standby Status Pill */}
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-[#181B26] border border-[#232838]">
            <span
              className={`w-2 h-2 rounded-full ${
                isLive
                  ? 'bg-emerald-500 animate-pulse'
                  : isConnected
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
            <span
              className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                isLive ? 'text-emerald-400' : 'text-text-muted'
              }`}
            >
              {isLive ? 'LIVE BROADCAST' : isConnected ? 'STANDBY' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* Telemetry and view mode actions */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          {isLive && fps > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-text-secondary bg-[#181B26] px-2 py-0.5 rounded border border-[#232838]">
              <Activity className="w-3 h-3 text-accent-cyan" />
              <span>{fps} FPS</span>
            </div>
          )}

          {onToggleLayout && (
            <button
              onClick={onToggleLayout}
              className="p-1 rounded hover:bg-[#181B26] text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              title="Toggle Layout (Split / PiP)"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[#181B26] text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              title="Close Camera View"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          VIDEO STAGE
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden min-h-0">
        {/* Active Frame */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="Live Arena Camera"
          className={`w-full h-full object-contain ${isLive ? 'block' : 'hidden'}`}
        />

        {/* Standby screen when no camera is actively broadcasting */}
        {!isLive && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-gradient-to-b from-[#0B0D12] to-[#12151E]">
            {/* Standby Reticle */}
            <div className="w-20 h-20 rounded-full border border-dashed border-[#333B50] flex items-center justify-center mb-3 relative">
              <Camera className="w-8 h-8 text-text-muted" />
              <div className="absolute inset-0 rounded-full border border-accent-gold/20 animate-ping" />
            </div>

            <h4 className="text-sm font-mono font-bold uppercase tracking-wider text-text-primary mb-1">
              Arena Camera Standby
            </h4>
            <p className="text-xs text-text-muted max-w-sm mb-3">
              Open the camera broadcast URL on any smartphone at the arena floor:
            </p>
            <div className="px-3 py-1.5 bg-[#181B26] border border-accent-gold/40 rounded text-accent-gold font-mono text-xs font-bold tracking-widest shadow-inner">
              /camera
            </div>
          </div>
        )}

        {/* Watermark / Live bug in corner */}
        {isLive && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/70 backdrop-blur-md border border-white/10 text-white font-mono text-[10px] uppercase tracking-wider pointer-events-none">
            <Radio className="w-3 h-3 text-rose-500 animate-pulse" />
            <span>ARENA FLOOR</span>
          </div>
        )}
      </div>
    </div>
  )
}
