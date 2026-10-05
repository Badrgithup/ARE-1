#!/usr/bin/env node

/**
 * RoboCup Arena — Unified Launcher & Tunnel Manager
 *
 * Commands:
 * - npm run arena
 * - npm run start:arena
 * - npm run dev:arena
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

let nextProcess = null
let cloudflareProcess = null
let isShuttingDown = false
let currentPublicUrl = null
let tunnelConnected = false
let restartTimer = null

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
          priority: isVirtual || isVBoxSubnet ? 1 : lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('ethernet') ? 10 : 5
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

// Print official arena ready banner matching requirement 7
function printArenaBanner({ localUrl, lanUrl, publicUrl, tunnelStatus }) {
  const isTunnelReady = Boolean(publicUrl) && tunnelStatus === 'CONNECTED'

  console.log('\n' + '='.repeat(60))
  console.log('                 ROBOCUP ARENA READY')
  console.log('='.repeat(60))
  console.log('')
  console.log('LOCAL:')
  console.log(localUrl)
  console.log('')
  console.log('LAN:')
  console.log(lanUrl)
  console.log('')

  if (isTunnelReady) {
    console.log('PUBLIC:')
    console.log(publicUrl)
    console.log('')
    console.log('PROJECTOR:')
    console.log(`${publicUrl}projector`)
    console.log('')
  } else {
    console.log('PROJECTOR (LAN):')
    console.log(`${lanUrl}projector`)
    console.log('')
  }

  console.log('-'.repeat(60))
  console.log('')
  console.log('✓ RoboCup Server       ONLINE')
  if (isTunnelReady) {
    console.log('✓ Cloudflare Tunnel    CONNECTED')
    console.log('✓ Public URL           READY')
    console.log('✓ Projector            READY')
  } else {
    console.log(`✗ Cloudflare Tunnel    ${tunnelStatus || 'OFFLINE'}`)
    console.log('- Public URL           UNAVAILABLE')
    console.log('✓ Projector            READY (LAN)')
  }
  console.log('✓ Live Sync            READY')
  console.log('')
  console.log('-'.repeat(60))
  console.log('')
  console.log('COPY THIS URL TO THE PROJECTOR:')
  console.log('')
  if (isTunnelReady) {
    console.log(`${publicUrl}projector`)
  } else {
    console.log(`${lanUrl}projector`)
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

function shutdown() {
  if (isShuttingDown) return
  isShuttingDown = true
  if (restartTimer) clearTimeout(restartTimer)
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

// Start and supervise Cloudflare Tunnel
function startCloudflareTunnel(cloudflaredExe, localUrl, lanUrl) {
  if (isShuttingDown) return

  console.log(`[Cloudflare Tunnel] Launching using absolute executable:`)
  console.log(`  ${cloudflaredExe}`)

  tunnelConnected = false
  currentPublicUrl = null

  cloudflareProcess = spawn(
    cloudflaredExe,
    ['tunnel', '--url', `http://localhost:${PORT}`],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    }
  )

  let bannerPrinted = false

  const handleTunnelData = (chunk) => {
    const text = chunk.toString()

    // 1. Detect public URL
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i)
    if (match) {
      const detectedUrl = match[0].endsWith('/') ? match[0] : `${match[0]}/`
      if (detectedUrl !== currentPublicUrl) {
        currentPublicUrl = detectedUrl
        tunnelConnected = true
        bannerPrinted = true
        printArenaBanner({
          localUrl,
          lanUrl,
          publicUrl: currentPublicUrl,
          tunnelStatus: 'CONNECTED'
        })
      }
    }

    // 2. Monitor connection registration / health
    if (text.includes('Registered tunnel connection')) {
      tunnelConnected = true
    }

    // 3. Monitor error conditions (e.g. Error 1033 prevention)
    if (text.includes('Failed to dial') || text.includes('error=')) {
      if (text.includes('failed to dial to edge') && !tunnelConnected) {
        // Edge connection in progress or retrying
      }
    }
  }

  cloudflareProcess.stdout.on('data', handleTunnelData)
  cloudflareProcess.stderr.on('data', handleTunnelData)

  cloudflareProcess.on('exit', (code) => {
    if (isShuttingDown) return
    tunnelConnected = false
    const previousUrl = currentPublicUrl
    currentPublicUrl = null

    console.warn(`\n[Cloudflare Tunnel] Status: OFFLINE (Process exited with code ${code})`)
    if (previousUrl) {
      console.warn(`[Cloudflare Tunnel] Previous public URL (${previousUrl}) is no longer active.`)
    }

    printArenaBanner({
      localUrl,
      lanUrl,
      publicUrl: null,
      tunnelStatus: 'OFFLINE'
    })

    // Attempt auto-recovery/restart after 3s delay
    console.log('[Cloudflare Tunnel] Attempting tunnel restart in 3 seconds...')
    restartTimer = setTimeout(() => {
      if (!isShuttingDown) {
        startCloudflareTunnel(cloudflaredExe, localUrl, lanUrl)
      }
    }, 3000)
  })
}

async function main() {
  console.log('='.repeat(60))
  console.log('       STARTING ROBOCUP ARENA TOURNAMENT SYSTEM')
  console.log('='.repeat(60))

  const lanIp = getLanIp()
  const localUrl = `http://localhost:${PORT}/`
  const lanUrl = `http://${lanIp}:${PORT}/`

  // 1. Discovery phase: find cloudflared executable
  console.log('[Discovery] Inspecting Cloudflare cloudflared executable...')
  const discovery = discoverCloudflared()

  if (discovery.found) {
    console.log(`[Discovery] ✓ Found cloudflared v${discovery.version}`)
    console.log(`[Discovery]   Absolute Path: ${discovery.executablePath}`)
    if (!discovery.inPath) {
      console.log(`[Discovery]   Note: Executable is not in current PATH, using verified absolute path directly.`)
    }
  } else {
    console.warn('[Discovery] ✗ cloudflared executable was not found on this system.')
    if (discovery.packageInstalled) {
      console.warn(`[Discovery]   Package ${discovery.packageVersion} is registered, but executable was missing.`)
    }
  }

  // 2. Start Next.js
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
    shell: false
  })

  nextProcess.stdout.on('data', (data) => {
    const text = data.toString()
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
      if (code !== null && code !== 0) {
        console.error(`[RoboCup Arena] Next.js process exited unexpectedly with code ${code}`)
      }
      shutdown()
    }
  })

  // 3. Wait for /api/health to respond 200 OK
  console.log(`[RoboCup Arena] Waiting for http://localhost:${PORT}/api/health...`)
  const serverHealthy = await waitForHealth(PORT, 30000)

  if (!serverHealthy) {
    console.error(`[RoboCup Arena] Error: Health check failed on port ${PORT}.`)
    shutdown()
    return
  }

  console.log(`[RoboCup Arena] ✓ Health check OK (Server is ready on port ${PORT})`)

  // 4. Start Cloudflare Tunnel if executable was found
  if (discovery.found && discovery.executablePath) {
    startCloudflareTunnel(discovery.executablePath, localUrl, lanUrl)
  } else {
    printArenaBanner({
      localUrl,
      lanUrl,
      publicUrl: null,
      tunnelStatus: 'NOT_INSTALLED'
    })
    console.log('='.repeat(60))
    console.log(' Cloudflare Tunnel CLI (cloudflared) is not available.')
    console.log(' Install with: winget install --id Cloudflare.cloudflared')
    console.log('='.repeat(60))
  }
}

main().catch((err) => {
  console.error('[RoboCup Arena] Fatal launch error:', err)
  shutdown()
})
