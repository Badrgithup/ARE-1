#!/usr/bin/env node

/**
 * RoboCup Arena — Unified Launcher & Tunnel Supervisor
 *
 * Provides:
 * - Next.js server launch (production start or dev)
 * - Cloudflare Tunnel auto-discovery and resilient supervisor
 * - Real-time health monitoring every 5 seconds (preventing stale URLs and Error 1033)
 * - Auto-restart within 3 seconds on tunnel crash or disconnect
 * - Persistent logging in logs/tunnel/
 * - State tracking in logs/tunnel/tunnel-state.json
 * - Dynamic live terminal banner with real-time status and error telemetry
 */

import { spawn, execSync } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { discoverCloudflared } from './cloudflared-discovery.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const robocupDir = path.resolve(__dirname, '..')

// CLI arguments
const args = process.argv.slice(2)
const isDev = args.includes('--dev') || process.env.NODE_ENV === 'development'
const portArgIndex = args.indexOf('--port')
const PORT = portArgIndex !== -1 && args[portArgIndex + 1]
  ? parseInt(args[portArgIndex + 1], 10)
  : parseInt(process.env.PORT || '3000', 10)

// Log directory setup
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

let nextProcess = null
let cloudflareProcess = null
let isShuttingDown = false
let restartTimer = null
let healthCheckTimer = null
let restartCount = 0

// Live status state
const arenaState = {
  localUrl: `http://localhost:${PORT}/`,
  lanUrl: `http://127.0.0.1:${PORT}/`,
  publicUrl: null,
  tunnelStatus: 'INITIALIZING', // INITIALIZING | CONNECTED | OFFLINE | RECONNECTING
  serverOnline: false,
  lastHealthCheck: null,
  recentErrors: [],
}

function logTunnel(message, type = 'INFO') {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${type}] ${message}\n`
  try {
    fs.appendFileSync(LOG_FILE, line)
    fs.appendFileSync(LATEST_LOG, line)
  } catch {
    // ignore
  }
}

function updateStateFile(updates) {
  try {
    let current = {}
    if (fs.existsSync(STATE_FILE)) {
      current = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
    }
    const merged = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2))
  } catch {
    // ignore
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

// Detect best physical LAN IPv4 address
function getLanIp() {
  const interfaces = os.networkInterfaces()
  const candidates = []

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    const lowerName = name.toLowerCase()
    const isVirtual =
      lowerName.includes('vethernet') ||
      lowerName.includes('wsl') ||
      lowerName.includes('virtualbox') ||
      lowerName.includes('vmware') ||
      lowerName.includes('docker') ||
      lowerName.includes('loopback')

    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        if (addr.address.startsWith('127.') || addr.address.startsWith('169.254.')) {
          continue
        }
        const isVBoxSubnet = addr.address.startsWith('192.168.56.')
        candidates.push({
          name,
          address: addr.address,
          priority: isVirtual || isVBoxSubnet ? 1 : lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('ethernet') ? 10 : 5,
        })
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority)
  return candidates[0] ? candidates[0].address : '127.0.0.1'
}

// Check if local health check endpoint is responding
function waitForHealth(port, timeoutMs = 30000) {
  const startTime = Date.now()
  return new Promise((resolve) => {
    let resolved = false
    const check = () => {
      if (isShuttingDown || resolved) return
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume()
        if (res.statusCode === 200) {
          if (!resolved) {
            resolved = true
            resolve(true)
          }
        } else {
          setTimeout(check, 300)
        }
      })
      req.on('error', () => {
        if (Date.now() - startTime > timeoutMs) {
          if (!resolved) {
            resolved = true
            resolve(false)
          }
        } else {
          setTimeout(check, 300)
        }
      })
      req.setTimeout(3000, () => {
        req.destroy()
        if (!resolved) {
          if (Date.now() - startTime > timeoutMs) {
            resolved = true
            resolve(false)
          } else {
            setTimeout(check, 300)
          }
        }
      })
    }
    check()
  })
}

// Print official arena ready banner with live status telemetry
function printArenaBanner() {
  const isTunnelReady = arenaState.tunnelStatus === 'CONNECTED' && Boolean(arenaState.publicUrl)

  console.log('\n' + '='.repeat(60))
  console.log('                 ROBOCUP ARENA READY')
  console.log('='.repeat(60))
  console.log('')
  console.log('LOCAL:')
  console.log(arenaState.localUrl)
  console.log('')
  console.log('LAN:')
  console.log(arenaState.lanUrl)
  console.log('')

  if (isTunnelReady) {
    console.log('PUBLIC:')
    console.log(arenaState.publicUrl)
    console.log('')
    console.log('PROJECTOR:')
    console.log(`${arenaState.publicUrl}projector`)
    console.log('')
  } else {
    console.log('PUBLIC:')
    console.log(`❌ ${arenaState.tunnelStatus} - Waiting for tunnel reconnection...`)
    console.log('')
    console.log('PROJECTOR (LAN):')
    console.log(`${arenaState.lanUrl}projector`)
    console.log('')
  }

  console.log('-'.repeat(60))
  console.log('')
  console.log(`✓ RoboCup Server       ${arenaState.serverOnline ? 'ONLINE' : 'OFFLINE'}`)
  if (isTunnelReady) {
    console.log('✓ Cloudflare Tunnel    CONNECTED')
    console.log('✓ Public URL           READY')
    console.log('✓ Projector            READY')
  } else {
    console.log(`✗ Cloudflare Tunnel    ${arenaState.tunnelStatus}`)
    console.log('- Public URL           UNAVAILABLE')
    console.log('✓ Projector            READY (LAN FALLBACK)')
  }
  console.log('✓ Live Sync            READY')
  if (restartCount > 0) {
    console.log(`ℹ Restarts Managed     ${restartCount}`)
  }
  if (arenaState.lastHealthCheck) {
    console.log(`ℹ Last Health Check    ${arenaState.lastHealthCheck.toLocaleTimeString()}`)
  }
  if (arenaState.recentErrors.length > 0) {
    console.log('')
    console.log('Recent Diagnostic Alerts:')
    arenaState.recentErrors.slice(-2).forEach((e) => console.log(`  - ${e}`))
  }
  console.log('')
  console.log('-'.repeat(60))
  console.log('')
  console.log('COPY THIS URL TO THE PROJECTOR:')
  console.log('')
  if (isTunnelReady) {
    console.log(`${arenaState.publicUrl}projector`)
  } else {
    console.log(`${arenaState.lanUrl}projector`)
  }
  console.log('')
  console.log('='.repeat(60))
  console.log('\n[Press Ctrl+C to stop the arena server]\n')
}

// Kill process cleanly on Windows and Unix
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
      proc.kill('SIGTERM')
    } catch {
      // ignore
    }
  }
}

// Automatically ensure target port is free by terminating orphaned listeners
async function freePort(port) {
  try {
    if (process.platform === 'win32') {
      const netstatOutput = execSync('netstat -ano', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      const lines = netstatOutput.split(/\r?\n/)
      const pidsToKill = new Set()

      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid && pid !== '0' && pid !== String(process.pid)) {
            pidsToKill.add(pid)
          }
        }
      }

      for (const pid of pidsToKill) {
        console.log(`[RoboCup Arena] Port ${port} is occupied by orphaned PID ${pid}. Clearing port...`)
        try {
          execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' })
        } catch {
          // ignore
        }
      }

      if (pidsToKill.size > 0) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    } else {
      try {
        const pids = execSync(`lsof -t -i :${port}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
          .trim()
          .split(/\r?\n/)
        for (const pid of pids) {
          if (pid && pid !== String(process.pid)) {
            console.log(`[RoboCup Arena] Port ${port} is occupied by PID ${pid}. Clearing port...`)
            process.kill(Number(pid), 'SIGKILL')
          }
        }
        await new Promise((r) => setTimeout(r, 800))
      } catch {
        // no process found
      }
    }
  } catch {
    // ignore
  }
}

function shutdown() {
  if (isShuttingDown) return
  isShuttingDown = true
  if (restartTimer) clearTimeout(restartTimer)
  if (healthCheckTimer) clearInterval(healthCheckTimer)
  console.log('\n\n[RoboCup Arena] Stopping services...')
  if (cloudflareProcess) {
    killProcess(cloudflareProcess)
    cloudflareProcess = null
  }
  if (nextProcess) {
    killProcess(nextProcess)
    nextProcess = null
  }
  clearPid()
  updateStateFile({ status: 'STOPPED', pid: null, url: null })
  console.log('[RoboCup Arena] All services stopped cleanly.')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGHUP', shutdown)
process.on('exit', () => {
  if (cloudflareProcess) killProcess(cloudflareProcess)
  if (nextProcess) killProcess(nextProcess)
  clearPid()
})

// Start and supervise Cloudflare Tunnel with auto-recovery
function startCloudflareTunnel(cloudflaredExe) {
  if (isShuttingDown) return

  logTunnel(`Launching cloudflared: ${cloudflaredExe} --url http://localhost:${PORT}`)
  console.log(`[Cloudflare Tunnel] Launching using absolute executable:`)
  console.log(`  ${cloudflaredExe}`)

  arenaState.tunnelStatus = 'CONNECTING'
  arenaState.publicUrl = null

  updateStateFile({
    status: 'CONNECTING',
    pid: null,
    url: null,
  })

  try {
    const requestedProtocol = (process.env.TUNNEL_PROTOCOL || 'http2').toLowerCase()
    // cloudflared supports 'http2' (TCP), 'quic' (UDP), and 'auto'.
    // Origin communication to localhost is always HTTP/1.1 by default.
    const protocol = requestedProtocol === 'http1' ? 'http2' : requestedProtocol

    logTunnel(`Using tunnel edge protocol: ${protocol} (origin is HTTP/1.1)`)
    cloudflareProcess = spawn(
      cloudflaredExe,
      ['tunnel', '--protocol', protocol, '--url', `http://localhost:${PORT}`],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      }
    )
  } catch (err) {
    logTunnel(`Spawn error: ${err.message}`, 'ERROR')
    arenaState.tunnelStatus = 'ERROR'
    arenaState.recentErrors.push(err.message)
    scheduleTunnelRestart(cloudflaredExe)
    return
  }

  writePid(cloudflareProcess.pid)
  updateStateFile({ pid: cloudflareProcess.pid })

  const handleTunnelData = (chunk, isErr = false) => {
    const text = chunk.toString()
    logTunnel(text.trim(), isErr ? 'STDERR' : 'STDOUT')

    // 1. Detect public URL
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i)
    if (match) {
      const detectedUrl = match[0].endsWith('/') ? match[0] : `${match[0]}/`
      if (detectedUrl !== arenaState.publicUrl) {
        arenaState.publicUrl = detectedUrl
        arenaState.tunnelStatus = 'CONNECTED'
        updateStateFile({
          status: 'CONNECTED',
          url: detectedUrl,
          lastConnectedAt: new Date().toISOString(),
          lastError: null,
        })
        printArenaBanner()
      }
    }

    // 2. Monitor connection registration
    if (text.includes('Registered tunnel connection')) {
      if (arenaState.tunnelStatus !== 'CONNECTED') {
        arenaState.tunnelStatus = 'CONNECTED'
        updateStateFile({ status: 'CONNECTED' })
      }
    }

    // 3. Monitor Error 1033 and disconnect triggers
    if (text.includes('failed to dial to edge') || text.includes('Error 1033') || text.includes('quic: timeout')) {
      arenaState.recentErrors.push(text.trim().substring(0, 80))
      updateStateFile({ lastError: text.trim() })
    }
  }

  cloudflareProcess.stdout.on('data', (d) => handleTunnelData(d, false))
  cloudflareProcess.stderr.on('data', (d) => handleTunnelData(d, true))

  cloudflareProcess.on('exit', (code, signal) => {
    logTunnel(`Process exited (code: ${code}, signal: ${signal})`, 'WARN')
    clearPid()
    cloudflareProcess = null

    if (isShuttingDown) return

    const previousUrl = arenaState.publicUrl
    arenaState.publicUrl = null
    arenaState.tunnelStatus = 'OFFLINE'

    updateStateFile({
      status: 'OFFLINE',
      pid: null,
      url: null,
      lastError: `Process exited with code ${code}`,
    })

    console.warn(`\n[Cloudflare Tunnel] Status: OFFLINE (Process exited with code ${code})`)
    if (previousUrl) {
      console.warn(`[Cloudflare Tunnel] Previous public URL (${previousUrl}) is no longer valid.`)
    }

    printArenaBanner()
    scheduleTunnelRestart(cloudflaredExe)
  })

  cloudflareProcess.on('error', (err) => {
    logTunnel(`Process error: ${err.message}`, 'ERROR')
    arenaState.recentErrors.push(err.message)
    updateStateFile({ lastError: err.message, status: 'ERROR' })
  })
}

function scheduleTunnelRestart(cloudflaredExe) {
  if (isShuttingDown) return
  restartCount++
  arenaState.tunnelStatus = 'RECONNECTING'
  updateStateFile({ status: 'RECONNECTING', restarts: restartCount })

  console.log(`[Cloudflare Tunnel] 🔄 Auto-recovering tunnel in 3 seconds (Attempt #${restartCount})...`)
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    if (!isShuttingDown) {
      startCloudflareTunnel(cloudflaredExe)
    }
  }, 3000)
}

// Persistent agent maintains keep-alive connection in ESTABLISHED state
const internalHealthAgent = new http.Agent({ keepAlive: true, maxSockets: 2 })

// Start continuous 5-second health verification loop
function startHealthMonitor() {
  if (healthCheckTimer) clearInterval(healthCheckTimer)

  healthCheckTimer = setInterval(async () => {
    if (isShuttingDown) return

    arenaState.lastHealthCheck = new Date()

    // Query internal health check with keep-alive agent
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/health/tunnel',
        agent: internalHealthAgent,
      },
      (res) => {
      let data = ''
      res.on('data', (c) => (data += c.toString()))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (res.statusCode === 200 && json.status === 'healthy') {
            if (arenaState.tunnelStatus !== 'CONNECTED') {
              arenaState.tunnelStatus = 'CONNECTED'
              arenaState.publicUrl = json.publicUrl || arenaState.publicUrl
              printArenaBanner()
            }
          } else {
            if (arenaState.tunnelStatus === 'CONNECTED') {
              arenaState.tunnelStatus = 'UNHEALTHY'
              arenaState.recentErrors.push(json.message || `Health check failed (${res.statusCode})`)
              printArenaBanner()
            }
          }
        } catch {
          // ignore parsing error
        }
      })
    })

    req.on('error', (err) => {
      if (arenaState.tunnelStatus === 'CONNECTED') {
        arenaState.tunnelStatus = 'OFFLINE'
        arenaState.recentErrors.push(`Local ping failed: ${err.message}`)
        printArenaBanner()
      }
    })

    req.setTimeout(3000, () => req.destroy())
  }, 5000)
}

async function main() {
  console.log('='.repeat(60))
  console.log('       STARTING ROBOCUP ARENA TOURNAMENT SYSTEM')
  console.log('='.repeat(60))

  const lanIp = getLanIp()
  arenaState.localUrl = `http://localhost:${PORT}/`
  arenaState.lanUrl = `http://${lanIp}:${PORT}/`

  // 1. Discovery phase: find cloudflared executable
  console.log('[Discovery] Inspecting Cloudflare cloudflared executable...')
  const discovery = discoverCloudflared()

  let cloudflaredExe = null
  if (discovery.found) {
    cloudflaredExe = discovery.executablePath
    console.log(`[Discovery] ✓ Found cloudflared v${discovery.version}`)
    console.log(`[Discovery]   Absolute Path: ${cloudflaredExe}`)
  } else {
    console.warn('[Discovery] ✗ cloudflared executable was not found on this system.')
    if (discovery.packageInstalled) {
      console.warn(`[Discovery]   Package ${discovery.packageVersion} is registered, but executable was missing.`)
    }
  }

  // 2. Ensure port 3000 is clean and not occupied by orphaned processes
  await freePort(PORT)

  // 3. Start Next.js
  const hasBuild = fs.existsSync(path.join(robocupDir, '.next'))
  let mode = isDev ? 'dev' : hasBuild ? 'start' : 'dev'

  if (!isDev && !hasBuild) {
    console.log('[RoboCup Arena] No production build found in .next. Starting in dev mode...')
    mode = 'dev'
  }

  console.log(`[RoboCup Arena] Launching Next.js server (${mode} mode on 0.0.0.0:${PORT})...`)

  const nextBin = path.join(robocupDir, 'node_modules', 'next', 'dist', 'bin', 'next')
  nextProcess = spawn(process.execPath, [nextBin, mode, '-H', '0.0.0.0', '-p', String(PORT)], {
    cwd: robocupDir,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT) },
    shell: false,
  })

  nextProcess.stdout.on('data', (data) => {
    const text = data.toString()
    if (!isShuttingDown) {
      if (text.includes('Ready in') || text.includes('Compiled') || text.includes('error')) {
        process.stdout.write(`[Next.js] ${text}`)
      }
    }
  })

  nextProcess.stderr.on('data', (data) => {
    const text = data.toString()
    if (!isShuttingDown) {
      process.stderr.write(`[Next.js error] ${text}`)
    }
  })

  nextProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`[RoboCup Arena] Next.js process exited unexpectedly with code ${code}`)
      shutdown()
    }
  })

  // 3. Wait for Next.js server to respond
  console.log(`[RoboCup Arena] Waiting for http://127.0.0.1:${PORT}/api/health ...`)
  const isHealthy = await waitForHealth(PORT, 30000)

  if (!isHealthy) {
    console.error(`[RoboCup Arena] Next.js failed to respond on port ${PORT} within 30 seconds.`)
    shutdown()
    return
  }

  console.log(`[RoboCup Arena]  OK (Server is ready on port ${PORT})`)
  arenaState.serverOnline = true

  // 4. Start Cloudflare Tunnel Supervisor
  if (cloudflaredExe) {
    startCloudflareTunnel(cloudflaredExe)
    startHealthMonitor()
  } else {
    arenaState.tunnelStatus = 'NOT_FOUND'
    printArenaBanner()
  }
}

main().catch((err) => {
  console.error('[RoboCup Arena] Fatal launch error:', err)
  shutdown()
})
