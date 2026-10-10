import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface TunnelState {
  status: string
  pid: number | null
  url: string | null
  restarts?: number
  lastConnectedAt?: string | null
  lastError?: string | null
  updatedAt?: string
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function isCloudflaredProcessRunning(expectedPid?: number | null): Promise<boolean> {
  if (expectedPid && isPidAlive(expectedPid)) {
    return true
  }

  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq cloudflared.exe" /NH', {
        windowsHide: true,
      })
      return stdout.toLowerCase().includes('cloudflared.exe')
    } else {
      const { stdout } = await execAsync('pgrep -x cloudflared || pgrep -f cloudflared')
      return Boolean(stdout.trim())
    }
  } catch {
    return false
  }
}

export async function GET() {
  const timestamp = new Date().toISOString()
  const cwd = process.cwd()
  const stateFilePath = path.join(cwd, 'logs', 'tunnel', 'tunnel-state.json')

  let storedState: TunnelState = {
    status: 'OFFLINE',
    pid: null,
    url: null,
  }

  if (fs.existsSync(stateFilePath)) {
    try {
      storedState = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'))
    } catch {
      // fallback
    }
  }

  const isRunning = await isCloudflaredProcessRunning(storedState.pid)

  if (!isRunning) {
    return NextResponse.json(
      {
        status: 'offline',
        tunnel: 'disconnected',
        process: 'stopped',
        pid: null,
        publicUrl: null,
        message: 'cloudflared process is not running',
        restarts: storedState.restarts || 0,
        lastError: storedState.lastError,
        timestamp,
      },
      { status: 503 }
    )
  }

  const isConnected = storedState.status === 'CONNECTED' && Boolean(storedState.url)

  if (!isConnected) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        tunnel: storedState.status || 'connecting',
        process: 'running',
        pid: storedState.pid,
        publicUrl: storedState.url,
        message: 'Tunnel is still connecting or reconnecting',
        restarts: storedState.restarts || 0,
        lastError: storedState.lastError,
        timestamp,
      },
      { status: 503 }
    )
  }

  return NextResponse.json({
    status: 'healthy',
    tunnel: 'connected',
    process: 'running',
    pid: storedState.pid,
    publicUrl: storedState.url,
    restarts: storedState.restarts || 0,
    lastConnectedAt: storedState.lastConnectedAt,
    timestamp,
  })
}
