'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import io, { Socket } from 'socket.io-client'
import {
  Camera,
  Video,
  VideoOff,
  RefreshCw,
  Radio,
  Zap,
  ZapOff,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Settings2,
} from 'lucide-react'

type FacingMode = 'environment' | 'user'
type ResolutionPreset = '720p' | '480p' | '360p'
type FpsPreset = 30 | 24 | 15

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const socketRef = useRef<Socket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const wakeLockRef = useRef<any>(null)

  // State
  const [isStreaming, setIsStreaming] = useState(false)
  const [isSocketConnected, setIsSocketConnected] = useState(false)
  const [facingMode, setFacingMode] = useState<FacingMode>('environment')
  const [resolution, setResolution] = useState<ResolutionPreset>('480p')
  const [targetFps, setTargetFps] = useState<FpsPreset>(24)
  const [error, setError] = useState<string | null>(null)
  const [fps, setFps] = useState(0)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Telemetry ref
  const frameCountRef = useRef(0)
  const lastFpsCalcRef = useRef(Date.now())

  // Stop current video stream
  const stopVideoStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setTorchOn(false)
    setTorchAvailable(false)
  }, [])

  // Start camera media stream
  const startVideoStream = useCallback(
    async (facing: FacingMode, res: ResolutionPreset) => {
      stopVideoStream()
      setError(null)

      let targetWidth = 854
      let targetHeight = 480

      if (res === '720p') {
        targetWidth = 1280
        targetHeight = 720
      } else if (res === '360p') {
        targetWidth = 640
        targetHeight = 360
      }

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API is not supported in this browser or context.')
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: targetWidth },
            height: { ideal: targetHeight },
          },
          audio: false,
        })

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // Check if torch/flashlight is supported
        const track = stream.getVideoTracks()[0]
        if (track && typeof track.getCapabilities === 'function') {
          const capabilities = track.getCapabilities() as { torch?: boolean }
          setTorchAvailable(Boolean(capabilities?.torch))
        }

        return true
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to access camera'
        console.error('Camera access error:', err)
        setError(message)
        return false
      }
    },
    [stopVideoStream]
  )

  // Screen Wake Lock handlers
  const requestWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
      }
    } catch (err) {
      console.warn('Wake lock request prevented:', err)
    }
  }, [])

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
      }
    } catch {}
  }, [])

  // Toggle torch / flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return

    try {
      const nextTorch = !torchOn
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      })
      setTorchOn(nextTorch)
    } catch (err) {
      console.warn('Torch toggle failed:', err)
    }
  }

  // Toggle camera direction (rear / front)
  const handleFlipCamera = async () => {
    const nextMode: FacingMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
    await startVideoStream(nextMode, resolution)
  }

  // Initialize Socket.io connection with persistent settings
  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setIsSocketConnected(true)
      if (isStreaming) {
        socket.emit('start-stream', {
          facingMode,
          resolution,
        })
      }
    })

    socket.on('disconnect', () => {
      setIsSocketConnected(false)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [isStreaming, facingMode, resolution])

  // Screen keep-alive effect
  useEffect(() => {
    if (isStreaming) {
      requestWakeLock()
    } else {
      releaseWakeLock()
    }
    return () => {
      releaseWakeLock()
    }
  }, [isStreaming, requestWakeLock, releaseWakeLock])

  // Handle visibility change to restore wake lock if user returns to browser tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isStreaming) {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isStreaming, requestWakeLock])

  // Start camera on mount
  useEffect(() => {
    startVideoStream(facingMode, resolution)
    return () => {
      stopVideoStream()
    }
  }, [facingMode, resolution, startVideoStream, stopVideoStream])

  // Broadcast loop: captures canvas frame at target FPS (default 24 FPS) with non-blocking volatile streaming
  useEffect(() => {
    if (!isStreaming) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (socketRef.current) socketRef.current.emit('stop-stream')
      return
    }

    if (socketRef.current) {
      socketRef.current.emit('start-stream', {
        facingMode,
        resolution,
        fps: targetFps,
      })
    }

    // Set canvas dimensions based on resolution
    if (canvasRef.current) {
      let width = 854
      let height = 480
      if (resolution === '720p') {
        width = 1280
        height = 720
      } else if (resolution === '360p') {
        width = 640
        height = 360
      }
      canvasRef.current.width = width
      canvasRef.current.height = height
    }

    // Smooth real-time interval (e.g. ~41ms for 24 FPS, ~33ms for 30 FPS)
    const intervalMs = Math.max(25, Math.round(1000 / targetFps))

    intervalRef.current = setInterval(() => {
      if (!canvasRef.current || !videoRef.current || videoRef.current.readyState < 2) {
        return
      }

      if (!socketRef.current || !socketRef.current.connected) {
        return
      }

      // Check client-side WebSocket send buffer: if congested (>96KB), drop frame to maintain real-time latency
      const transport = (socketRef.current?.io?.engine as any)?.transport
      const ws = transport?.ws
      if (ws && typeof ws.bufferedAmount === 'number' && ws.bufferedAmount > 98304) {
        return
      }

      const ctx = canvasRef.current.getContext('2d')
      if (!ctx) return

      ctx.drawImage(
        videoRef.current,
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      )

      // Quality tuned for rapid encoding and high framerate throughput
      const quality = resolution === '720p' ? 0.50 : resolution === '480p' ? 0.44 : 0.42
      const frameData = canvasRef.current.toDataURL('image/jpeg', quality)

      // Volatile emit: UDP-style real-time delivery without blocking roundtrip ACKs
      if (socketRef.current.volatile) {
        socketRef.current.volatile.emit('camera-frame', frameData)
      } else {
        socketRef.current.emit('camera-frame', frameData)
      }

      // Track FPS
      frameCountRef.current++
      const now = Date.now()
      if (now - lastFpsCalcRef.current >= 1000) {
        setFps(frameCountRef.current)
        frameCountRef.current = 0
        lastFpsCalcRef.current = now
      }
    }, intervalMs)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isStreaming, facingMode, resolution, targetFps])

  // Fullscreen toggle
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] bg-[#0B0D12] text-[#F1F3F9] flex flex-col overflow-hidden select-none font-sans">
      {/* ─────────────────────────────────────────────────────────────
          MOBILE ARENA CAMERA TOP BAR
         ───────────────────────────────────────────────────────────── */}
      <header className="h-14 px-4 bg-[#0B0D12]/90 backdrop-blur-md border-b border-[#232838] flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[#181B26] border border-[#333B50] flex items-center justify-center text-accent-gold">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-gold">
                ARENA CAMERA
              </span>
              <span className="text-text-muted text-xs">·</span>
              <span className="text-xs font-mono text-text-secondary">PROJECTOR RELAY</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isStreaming && isSocketConnected
                    ? 'bg-accent-gold animate-pulse'
                    : isSocketConnected
                    ? 'bg-emerald-500'
                    : 'bg-rose-500'
                }`}
              />
              <span className="text-[10px] font-mono text-text-muted uppercase">
                {isStreaming
                  ? `LIVE STREAMING (${fps} FPS)`
                  : isSocketConnected
                  ? 'STANDBY READY'
                  : 'CONNECTING SERVER...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {torchAvailable && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded border text-xs font-mono transition-colors ${
                torchOn
                  ? 'bg-accent-gold text-black border-accent-gold'
                  : 'bg-[#181B26] text-text-primary border-[#232838]'
              }`}
              title="Torch / Flashlight"
            >
              {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={() => setShowSettings((prev) => !prev)}
            className={`p-2 rounded border text-xs font-mono transition-colors ${
              showSettings
                ? 'bg-accent-gold text-black border-accent-gold'
                : 'bg-[#181B26] text-text-primary border-[#232838]'
            }`}
            title="Resolution Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded bg-[#181B26] border border-[#232838] text-text-primary text-xs font-mono transition-colors"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Settings drawer overlay */}
      {showSettings && (
        <div className="absolute top-14 left-0 right-0 z-30 bg-[#12151E] border-b border-[#232838] p-4 flex flex-col gap-3 font-mono text-xs shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-text-muted uppercase text-[10px]">Res:</span>
              <button
                onClick={() => setResolution('720p')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                  resolution === '720p'
                    ? 'bg-accent-gold text-black'
                    : 'bg-[#181B26] text-text-secondary border border-[#232838]'
                }`}
              >
                720p
              </button>
              <button
                onClick={() => setResolution('480p')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                  resolution === '480p'
                    ? 'bg-accent-gold text-black'
                    : 'bg-[#181B26] text-text-secondary border border-[#232838]'
                }`}
              >
                480p (Standard)
              </button>
              <button
                onClick={() => setResolution('360p')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                  resolution === '360p'
                    ? 'bg-accent-gold text-black'
                    : 'bg-[#181B26] text-text-secondary border border-[#232838]'
                }`}
              >
                360p (Fast)
              </button>
            </div>
            <span className="text-text-muted text-[11px] shrink-0">
              {facingMode === 'environment' ? 'Rear Cam' : 'Front Cam'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap border-t border-[#232838]/60 pt-2.5">
            <span className="text-text-muted uppercase text-[10px]">Target FPS:</span>
            <button
              onClick={() => setTargetFps(30)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                targetFps === 30
                  ? 'bg-accent-gold text-black'
                  : 'bg-[#181B26] text-text-secondary border border-[#232838]'
              }`}
            >
              30 FPS (Max Smooth)
            </button>
            <button
              onClick={() => setTargetFps(24)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                targetFps === 24
                  ? 'bg-accent-gold text-black'
                  : 'bg-[#181B26] text-text-secondary border border-[#232838]'
              }`}
            >
              24 FPS (Default)
            </button>
            <button
              onClick={() => setTargetFps(15)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                targetFps === 15
                  ? 'bg-accent-gold text-black'
                  : 'bg-[#181B26] text-text-secondary border border-[#232838]'
              }`}
            >
              15 FPS (Economy)
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          CAMERA VIEWFINDER STAGE
         ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="p-6 max-w-sm text-center bg-[#12151E] border border-rose-500/30 rounded-lg shadow-2xl">
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-text-primary mb-1 uppercase font-mono">
              Camera Access Denied
            </h3>
            <p className="text-xs text-text-muted mb-4">{error}</p>
            <button
              onClick={() => startVideoStream(facingMode, resolution)}
              className="px-4 py-2 bg-accent-gold text-black font-bold text-xs rounded uppercase tracking-wider font-mono"
            >
              Retry Camera
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Viewfinder crosshair overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-48 sm:w-64 sm:h-64 border border-white/20 rounded-lg relative">
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-accent-gold" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-accent-gold" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-accent-gold" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-accent-gold" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent-gold/40" />
              </div>
            </div>

            {/* Live badge overlay on viewfinder */}
            {isStreaming && (
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-accent-gold/40">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-gold animate-pulse" />
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-accent-gold">
                  LIVE ARENA BROADCAST
                </span>
              </div>
            )}
          </>
        )}

        {/* Offscreen canvas used for JPEG frame generation */}
        <canvas ref={canvasRef} className="hidden" />
      </main>

      {/* ─────────────────────────────────────────────────────────────
          MOBILE CONTROLS DOCK (BOTTOM)
         ───────────────────────────────────────────────────────────── */}
      <footer className="h-20 px-6 bg-[#0B0D12] border-t border-[#232838] flex items-center justify-between shrink-0 z-20">
        {/* Flip camera */}
        <button
          onClick={handleFlipCamera}
          className="p-3.5 rounded-full bg-[#181B26] hover:bg-[#1F2332] border border-[#333B50] text-text-primary active:scale-95 transition-all cursor-pointer"
          title="Flip Camera (Rear / Front)"
        >
          <RefreshCw className="w-5 h-5 text-accent-gold" />
        </button>

        {/* Big Start / Stop Stream Toggle Button */}
        <button
          onClick={() => setIsStreaming((prev) => !prev)}
          className={`flex items-center gap-2.5 px-6 py-3 rounded-full font-mono text-sm font-bold uppercase tracking-wider transition-all cursor-pointer shadow-lg active:scale-95 ${
            isStreaming
              ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-rose-900/30'
              : 'bg-accent-gold text-black hover:brightness-110 shadow-amber-900/30'
          }`}
        >
          {isStreaming ? (
            <>
              <VideoOff className="w-5 h-5" />
              <span>Stop Stream</span>
            </>
          ) : (
            <>
              <Radio className="w-5 h-5 animate-pulse" />
              <span>Start Stream</span>
            </>
          )}
        </button>

        {/* Refresh Camera Stream */}
        <button
          onClick={() => startVideoStream(facingMode, resolution)}
          className="p-3.5 rounded-full bg-[#181B26] hover:bg-[#1F2332] border border-[#333B50] text-text-primary active:scale-95 transition-all cursor-pointer"
          title="Restart Video Feed"
        >
          <Video className="w-5 h-5 text-accent-cyan" />
        </button>
      </footer>
    </div>
  )
}
