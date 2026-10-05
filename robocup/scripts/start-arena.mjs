#!/usr/bin/env node

/**
 * RoboCup Arena — Unified Launcher
 *
 * Starts the RoboCup Arena Next.js server and Cloudflare Quick Tunnel (cloudflared),
 * detects the local, LAN, and public URLs, and displays the official terminal banner.
 */

import { spawn, execSync } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const robocupDir = path.resolve(__dirname, '..')

// Configuration
const args = process.argv.slice(2)
const isDev = args.includes('--dev') || process.env.NODE_ENV === 'development'
const portArgIndex = args.indexOf('--port')
const PORT = portArgIndex !== -1 && args[portArgIndex + 1]
  ? parseInt(args[portArgIndex + 1], 10)
  : parseInt(process.env.PORT || '3000', 10)

let nextProcess = null
let cloudflareProcess = null
let isShuttingDown = false

// Detect best LAN IPv4 address (ignore virtual interfaces, WSL, Docker, VirtualBox host-only)
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
        // Exclude VirtualBox default host-only subnet 192.168.56.x unless nothing else exists
        const isVBoxSubnet = addr.address.startsWith('192.168.56.')

        candidates.push({
          name,
          address: addr.address,
          priority: isVirtual || isVBoxSubnet ? 1 : lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('ethernet') ? 10 : 5
        })
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority)
  return candidates[0] ? candidates[0].address : '127.0.0.1'
}

// Find cloudflared executable
function findCloudflaredBinary() {
  // 1. Try PATH
  try {
    const cmd = process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared'
    const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' }).trim()
    const firstLine = out.split(/\r?\n/)[0].trim()
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine
    }
  } catch {
    // Not found in PATH
  }

  // 2. Check standard Windows paths
  if (process.platform === 'win32') {
    const knownPaths = [
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
      'C:\\Program Files\\cloudflared\\cloudflared.exe',
      path.join(process.env.LOCALAPPDATA || '', 'cloudflared', 'cloudflared.exe'),
      path.join(process.env.PROGRAMDATA || '', 'chocolatey', 'bin', 'cloudflared.exe')
    ]

    for (const p of knownPaths) {
      if (fs.existsSync(p)) {
        return p
      }
    }

    // Check WinGet packages directory
    const localAppData = process.env.LOCALAPPDATA || ''
    const wingetDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
    if (fs.existsSync(wingetDir)) {
      try {
        const entries = fs.readdirSync(wingetDir)
        for (const entry of entries) {
          if (entry.toLowerCase().includes('cloudflared')) {
            const candidate = path.join(wingetDir, entry, 'cloudflared.exe')
            if (fs.existsSync(candidate)) {
              return candidate
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return null
}

// Check if local server is responding
function waitForServer(port, timeoutMs = 30000) {
  const startTime = Date.now()
  return new Promise((resolve) => {
    let resolved = false
    const check = () => {
      if (isShuttingDown || resolved) return
      const req = http.get(`http://127.0.0.1:${port}/api/tournament`, (res) => {
        res.resume()
        if (!resolved) {
          resolved = true
          resolve(true)
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
      req.setTimeout(4000, () => {
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

// Print official arena banner
function printArenaBanner({ localUrl, lanUrl, publicUrl, cloudflaredMissing }) {
  console.log('\n' + '='.repeat(52))
  console.log('           ROBOCUP ARENA IS READY')
  console.log('='.repeat(52))
  console.log('')
  console.log('LOCAL:')
  console.log(localUrl)
  console.log('')
  console.log('LAN:')
  console.log(lanUrl)
  console.log('')

  if (publicUrl) {
    console.log('PUBLIC:')
    console.log(publicUrl)
    console.log('')
    console.log('PROJECTOR:')
    console.log(`${publicUrl}projector`)
    console.log('')
    console.log('ADMIN:')
    console.log(publicUrl)
    console.log('')
    console.log('='.repeat(52))
    console.log('COPY THIS URL TO THE PROJECTOR:')
    console.log(`${publicUrl}projector`)
    console.log('='.repeat(52))
  } else {
    console.log('PROJECTOR (LAN):')
    console.log(`${lanUrl}projector`)
    console.log('')
    console.log('ADMIN (LAN):')
    console.log(lanUrl)
    console.log('')
    console.log('='.repeat(52))
    console.log('COPY THIS URL TO THE PROJECTOR:')
    console.log(`${lanUrl}projector`)
    console.log('='.repeat(52))

    if (cloudflaredMissing) {
      console.log('\n' + '='.repeat(52))
      console.log(' Cloudflare Tunnel CLI (cloudflared) is not found!')
      console.log(' Install it with:')
      console.log('   winget install --id Cloudflare.cloudflared')
      console.log(' Or download from:')
      console.log('   https://github.com/cloudflare/cloudflared/releases')
      console.log('='.repeat(52))
    }
  }
  console.log('\n[Press Ctrl+C to stop the arena server]\n')
}

// Kill process cleanly
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

// Clean shutdown handler
function shutdown() {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log('\n\n[RoboCup Arena] Stopping services...')
  if (cloudflareProcess) {
    killProcess(cloudflareProcess)
    cloudflareProcess = null
  }
  if (nextProcess) {
    killProcess(nextProcess)
    nextProcess = null
  }
  console.log('[RoboCup Arena] All services stopped cleanly.')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGHUP', shutdown)
process.on('exit', () => {
  if (cloudflareProcess) killProcess(cloudflareProcess)
  if (nextProcess) killProcess(nextProcess)
})

async function main() {
  console.log('====================================================')
  console.log('       STARTING ROBOCUP ARENA TOURNAMENT SYSTEM      ')
  console.log('====================================================')

  const lanIp = getLanIp()
  const localUrl = `http://localhost:${PORT}/`
  const lanUrl = `http://${lanIp}:${PORT}/`

  // 1. Prepare Next.js command
  const hasBuild = fs.existsSync(path.join(robocupDir, '.next'))
  let mode = isDev ? 'dev' : hasBuild ? 'start' : 'dev'

  if (!isDev && !hasBuild) {
    console.log('[RoboCup Arena] No build found in .next directory. Starting in dev mode...')
    mode = 'dev'
  }

  console.log(`[RoboCup Arena] Launching Next.js server (${mode} mode on 0.0.0.0:${PORT})...`)

  const nextBin = path.join(robocupDir, 'node_modules', 'next', 'dist', 'bin', 'next')
  nextProcess = spawn(process.execPath, [nextBin, mode, '-H', '0.0.0.0', '-p', String(PORT)], {
    cwd: robocupDir,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT) },
    shell: false
  })

  nextProcess.stdout.on('data', (data) => {
    const text = data.toString()
    // Suppress verbose initial Next.js lines once banner is displayed, or show build logs
    if (!isShuttingDown) {
      if (text.includes('Ready in') || text.includes('Compiled') || text.includes('error')) {
        process.stdout.write(text)
      }
    }
  })

  nextProcess.stderr.on('data', (data) => {
    if (!isShuttingDown) {
      process.stderr.write(data)
    }
  })

  nextProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`[RoboCup Arena] Next.js process exited unexpectedly with code ${code}`)
      shutdown()
    }
  })

  // 2. Wait for local server to respond
  console.log('[RoboCup Arena] Waiting for local server to be ready...')
  const serverReady = await waitForServer(PORT, 30000)
  if (!serverReady) {
    console.error(`[RoboCup Arena] Error: Server failed to start on port ${PORT}.`)
    shutdown()
    return
  }
  console.log(`[RoboCup Arena] Server is online on port ${PORT}!`)

  // 3. Find and launch cloudflared
  const cloudflaredBinary = findCloudflaredBinary()
  let publicUrl = null
  let cloudflaredMissing = false

  if (!cloudflaredBinary) {
    cloudflaredMissing = true
    console.warn('[RoboCup Arena] Cloudflare Tunnel (cloudflared) not detected.')
    printArenaBanner({ localUrl, lanUrl, publicUrl: null, cloudflaredMissing: true })
    return
  }

  console.log(`[RoboCup Arena] Starting Cloudflare Quick Tunnel using: ${cloudflaredBinary}...`)
  cloudflareProcess = spawn(
    cloudflaredBinary,
    ['tunnel', '--url', `http://localhost:${PORT}`],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    }
  )

  let tunnelFound = false

  const onTunnelOutput = (chunk) => {
    const text = chunk.toString()
    if (!tunnelFound) {
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i)
      if (match) {
        tunnelFound = true
        publicUrl = match[0].endsWith('/') ? match[0] : `${match[0]}/`
        printArenaBanner({ localUrl, lanUrl, publicUrl, cloudflaredMissing: false })
      }
    }
  }

  cloudflareProcess.stdout.on('data', onTunnelOutput)
  cloudflareProcess.stderr.on('data', onTunnelOutput)

  cloudflareProcess.on('exit', (code) => {
    if (!tunnelFound && !isShuttingDown) {
      console.warn(`[RoboCup Arena] Cloudflare Tunnel exited (code ${code}). Running in local/LAN mode.`)
      printArenaBanner({ localUrl, lanUrl, publicUrl: null, cloudflaredMissing: false })
    }
  })

  // Fallback timeout: if cloudflared doesn't yield URL within 15 seconds, show LAN banner
  setTimeout(() => {
    if (!tunnelFound && !isShuttingDown) {
      console.warn('[RoboCup Arena] Cloudflare Tunnel timed out acquiring public URL. Running in local/LAN mode.')
      printArenaBanner({ localUrl, lanUrl, publicUrl: null, cloudflaredMissing: false })
    }
  }, 15000)
}

main().catch((err) => {
  console.error('[RoboCup Arena] Fatal launch error:', err)
  shutdown()
})
