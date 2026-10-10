#!/usr/bin/env node

/**
 * RoboCup Arena — Cloudflare Tunnel Supervisor
 *
 * Provides:
 * - Resilient process supervision with automatic 3-second recovery on exit/crash
 * - Absolute executable resolution via discoverCloudflared()
 * - Real-time stream logging to logs/tunnel/tunnel-<timestamp>.log and latest.log
 * - State tracking file: logs/tunnel/tunnel-state.json
 * - PID tracking: logs/tunnel/tunnel.pid and ./tunnel.pid
 * - Graceful termination handling for Windows and Unix
 */

import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { discoverCloudflared } from './cloudflared-discovery.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const robocupDir = path.resolve(__dirname, '..')

const LOG_DIR = path.join(robocupDir, 'logs', 'tunnel')
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-')
const LOG_FILE = path.join(LOG_DIR, `tunnel-${TIMESTAMP}.log`)
const LATEST_LOG = path.join(LOG_DIR, 'latest.log')
const STATE_FILE = path.join(LOG_DIR, 'tunnel-state.json')
const ROOT_PID_FILE = path.join(robocupDir, 'tunnel.pid')
const LOG_PID_FILE = path.join(LOG_DIR, 'tunnel.pid')

let cloudflaredProcess = null
let isIntentionallyStopped = false
let restartTimer = null
let restartCount = 0
let currentUrl = null
let lastStatus = 'INITIALIZING'

// Structured log writer
export function log(message, type = 'INFO') {
  const ts = new Date().toISOString()
  const formatted = `[${ts}] [${type}] ${message}\n`
  process.stdout.write(formatted)
  try {
    fs.appendFileSync(LOG_FILE, formatted)
    fs.appendFileSync(LATEST_LOG, formatted)
  } catch {
    // ignore filesystem write errors during shutdown
  }
}

// Update state file for health check and dashboard
function updateState(updates) {
  try {
    const currentState = getStoredState()
    const nextState = {
      ...currentState,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2))
  } catch {
    // ignore
  }
}

export function getStoredState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
    }
  } catch {
    // fallback
  }
  return {
    status: 'OFFLINE',
    pid: null,
    url: null,
    restarts: 0,
    lastConnectedAt: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  }
}

function writePid(pid) {
  try {
    const str = pid.toString()
    fs.writeFileSync(ROOT_PID_FILE, str)
    fs.writeFileSync(LOG_PID_FILE, str)
  } catch {
    // ignore
  }
}

function clearPid() {
  try {
    if (fs.existsSync(ROOT_PID_FILE)) fs.unlinkSync(ROOT_PID_FILE)
    if (fs.existsSync(LOG_PID_FILE)) fs.unlinkSync(LOG_PID_FILE)
  } catch {
    // ignore
  }
}

function killProcess(proc) {
  if (!proc || !proc.pid) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(-proc.pid, 'SIGTERM')
    }
  } catch {
    try {
      proc.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
}

export function startTunnel(targetPort = 3000) {
  if (cloudflaredProcess) {
    log(`Tunnel process is already running (PID: ${cloudflaredProcess.pid})`, 'WARN')
    return cloudflaredProcess
  }

  log(`Locating cloudflared executable...`)
  const discovery = discoverCloudflared()
  if (!discovery.found || !discovery.executablePath) {
    const errMsg = discovery.error || 'cloudflared executable could not be found'
    log(errMsg, 'ERROR')
    updateState({
      status: 'ERROR',
      lastError: errMsg,
    })
    return null
  }

  const exePath = discovery.executablePath
  log(`Using cloudflared binary: ${exePath} (v${discovery.version})`)
  log(`Target local service: http://localhost:${targetPort}`)

  updateState({
    status: 'CONNECTING',
    pid: null,
    url: null,
    lastError: null,
  })

  isIntentionallyStopped = false

  try {
    // Configure cloudflared process arguments with explicit HTTP protocol
    const tunnelArgs = [
      'tunnel',
      '--protocol', 'http1',
      '--url',
      `http://localhost:${targetPort}`
    ]

    // Note: cloudflared Go binary accepts 'http2', 'quic', 'auto' for edge egress (origin proxy is always HTTP/1.1)
    const sanitizedArgs = tunnelArgs.map((arg) => (arg === 'http1' ? 'http2' : arg))

    log(`Spawning cloudflared with protocol: http1 (edge: http2, origin: http1.1)`)
    cloudflaredProcess = spawn(
      exePath,
      sanitizedArgs,
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      }
    )
  } catch (err) {
    log(`Failed to spawn cloudflared: ${err.message}`, 'ERROR')
    updateState({ status: 'ERROR', lastError: err.message })
    scheduleRestart(targetPort)
    return null
  }

  const pid = cloudflaredProcess.pid
  writePid(pid)
  log(`cloudflared process started (PID: ${pid})`, 'SUCCESS')
  updateState({ pid, status: 'CONNECTING' })

  const handleStreamData = (data, isError = false) => {
    const text = data.toString()
    const lines = text.split(/\r?\n/).filter(Boolean)

    for (const line of lines) {
      log(line, isError ? 'STDERR' : 'STDOUT')

      // Detect public URL
      const match = line.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i)
      if (match) {
        const detectedUrl = match[0].endsWith('/') ? match[0] : `${match[0]}/`
        if (detectedUrl !== currentUrl) {
          currentUrl = detectedUrl
          lastStatus = 'CONNECTED'
          log(`🌍 Public Tunnel URL Established: ${currentUrl}`, 'SUCCESS')
          updateState({
            status: 'CONNECTED',
            url: currentUrl,
            lastConnectedAt: new Date().toISOString(),
            lastError: null,
          })
        }
      }

      if (line.includes('Registered tunnel connection')) {
        lastStatus = 'CONNECTED'
        updateState({ status: 'CONNECTED', lastError: null })
      }

      if (line.includes('failed to dial to edge') || line.includes('Error 1033') || line.includes('quic: timeout')) {
        updateState({ lastError: line })
      }
    }
  }

  cloudflaredProcess.stdout.on('data', (d) => handleStreamData(d, false))
  cloudflaredProcess.stderr.on('data', (d) => handleStreamData(d, true))

  cloudflaredProcess.on('exit', (code, signal) => {
    log(`cloudflared exited (code: ${code}, signal: ${signal})`, 'WARN')
    cloudflaredProcess = null
    clearPid()
    currentUrl = null
    updateState({
      status: 'OFFLINE',
      pid: null,
      url: null,
      lastError: `Exited with code ${code}`,
    })

    if (!isIntentionallyStopped) {
      scheduleRestart(targetPort)
    }
  })

  cloudflaredProcess.on('error', (err) => {
    log(`Process error: ${err.message}`, 'ERROR')
    updateState({ lastError: err.message, status: 'ERROR' })
  })

  return cloudflaredProcess
}

function scheduleRestart(targetPort) {
  restartCount++
  log(`🔄 Auto-restarting tunnel in 3 seconds (Attempt #${restartCount})...`, 'WARN')
  updateState({ status: 'RESTARTING', restarts: restartCount })
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    if (!isIntentionallyStopped) {
      startTunnel(targetPort)
    }
  }, 3000)
}

export function stopTunnel() {
  isIntentionallyStopped = true
  if (restartTimer) clearTimeout(restartTimer)
  log('Stopping cloudflared tunnel process...', 'INFO')
  if (cloudflaredProcess) {
    killProcess(cloudflaredProcess)
    cloudflaredProcess = null
  }
  clearPid()
  updateState({
    status: 'STOPPED',
    pid: null,
    url: null,
  })
  log('Tunnel process stopped cleanly.', 'INFO')
}

// Graceful signal termination
function handleShutdown() {
  stopTunnel()
  process.exit(0)
}

process.on('SIGINT', handleShutdown)
process.on('SIGTERM', handleShutdown)

// If executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const port = parseInt(process.env.PORT || '3000', 10)
  log('Starting standalone Tunnel Supervisor...')
  startTunnel(port)
}
