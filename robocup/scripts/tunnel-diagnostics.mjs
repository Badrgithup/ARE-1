#!/usr/bin/env node

/**
 * RoboCup Arena — Cloudflare Tunnel Comprehensive Diagnostics
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'
import { discoverCloudflared } from './cloudflared-discovery.mjs'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const robocupDir = path.resolve(__dirname, '..')

async function checkUrl(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url)
      const req = http.get(
        {
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: parsed.pathname,
          timeout: timeoutMs,
        },
        (res) => {
          let body = ''
          res.on('data', (d) => (body += d.toString()))
          res.on('end', () => {
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body })
          })
        }
      )
      req.on('error', (err) => resolve({ ok: false, error: err.message }))
      req.on('timeout', () => {
        req.destroy()
        resolve({ ok: false, error: 'Connection timed out' })
      })
    } catch (err) {
      resolve({ ok: false, error: err.message })
    }
  })
}

async function runDiagnostics() {
  console.log('='.repeat(60))
  console.log('       CLOUDFLARE TUNNEL DIAGNOSTICS & SYSTEM AUDIT')
  console.log('='.repeat(60) + '\n')

  // 1. Check cloudflared binary
  console.log('[1/5] Executable Discovery:')
  const discovery = discoverCloudflared()
  if (discovery.found) {
    console.log(`  ✓ cloudflared installed: v${discovery.version}`)
    console.log(`  ✓ Path: ${discovery.executablePath}`)
    console.log(`  ✓ In PATH: ${discovery.inPath ? 'Yes' : 'No (using verified absolute path)'}`)
  } else {
    console.log(`  ✗ cloudflared NOT found: ${discovery.error || 'Executable missing'}`)
  }
  console.log('')

  // 2. Check process state
  console.log('[2/5] Process Inspection:')
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq cloudflared.exe" /FO CSV /NH', {
        windowsHide: true,
      })
      if (stdout.toLowerCase().includes('cloudflared.exe')) {
        const lines = stdout.trim().split(/\r?\n/)
        console.log(`  ✓ cloudflared process running (${lines.length} instance(s)):`)
        for (const line of lines) {
          const parts = line.split('","').map((s) => s.replace(/"/g, ''))
          console.log(`    - PID: ${parts[1]} | Memory: ${parts[4] || 'N/A'}`)
        }
      } else {
        console.log('  ✗ cloudflared process is NOT running')
      }
    } else {
      const { stdout } = await execAsync('pgrep -a cloudflared || true')
      if (stdout.trim()) {
        console.log(`  ✓ cloudflared process running:\n    ${stdout.trim()}`)
      } else {
        console.log('  ✗ cloudflared process is NOT running')
      }
    }
  } catch (err) {
    console.log(`  ✗ Failed to inspect process: ${err.message}`)
  }
  console.log('')

  // 3. Check logs directory & state file
  console.log('[3/5] Tunnel Logs & Stored State:')
  const logDir = path.join(robocupDir, 'logs', 'tunnel')
  const stateFile = path.join(logDir, 'tunnel-state.json')

  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
      console.log(`  ✓ Current State: ${state.status}`)
      console.log(`  ✓ Public URL: ${state.url || 'None'}`)
      console.log(`  ✓ Restarts Recorded: ${state.restarts || 0}`)
      if (state.lastError) console.log(`  ⚠️ Last Error: ${state.lastError}`)
    } catch {
      console.log('  ⚠️ State file corrupted or unreadable')
    }
  } else {
    console.log('  - No state file found yet')
  }

  if (fs.existsSync(logDir)) {
    const files = fs
      .readdirSync(logDir)
      .filter((f) => f.endsWith('.log'))
      .sort()
      .reverse()

    if (files.length > 0) {
      const latest = files[0]
      console.log(`  ✓ Latest log file: logs/tunnel/${latest}`)
      const lines = fs.readFileSync(path.join(logDir, latest), 'utf-8').split(/\r?\n/).filter(Boolean)
      const last5 = lines.slice(-5)
      console.log('  Recent log output:')
      for (const l of last5) {
        console.log(`    ${l}`)
      }
    } else {
      console.log('  - No log files found in logs/tunnel/')
    }
  } else {
    console.log('  - Log directory logs/tunnel/ does not exist')
  }
  console.log('')

  // 4. Check localhost & health endpoints
  console.log('[4/5] Local Service Connectivity:')
  const localHealth = await checkUrl('http://127.0.0.1:3000/api/health')
  if (localHealth.ok) {
    console.log('  ✓ Local server responding on http://localhost:3000/api/health (200 OK)')
  } else {
    console.log(`  ✗ Local server not responding: ${localHealth.error || `HTTP ${localHealth.status}`}`)
  }

  const tunnelHealth = await checkUrl('http://127.0.0.1:3000/api/health/tunnel')
  if (tunnelHealth.ok) {
    console.log('  ✓ Tunnel health endpoint responding (Healthy & Connected)')
  } else {
    console.log(`  ⚠️ Tunnel health endpoint: ${tunnelHealth.error || `HTTP ${tunnelHealth.status}`}`)
    if (tunnelHealth.body) {
      try {
        const parsed = JSON.parse(tunnelHealth.body)
        console.log(`    Message: ${parsed.message || parsed.status}`)
      } catch {
        // ignore
      }
    }
  }
  console.log('')

  // 5. Check port 3000 listening
  console.log('[5/5] Port 3000 Port Binding:')
  try {
    const cmd = process.platform === 'win32' ? 'netstat -ano | findstr :3000' : 'netstat -tuln | grep 3000'
    const { stdout } = await execAsync(cmd, { windowsHide: true })
    if (stdout.trim()) {
      console.log(`  ✓ Port 3000 active socket:\n    ${stdout.trim().split(/\r?\n/)[0]}`)
    } else {
      console.log('  ✗ Port 3000 is not currently listening')
    }
  } catch {
    console.log('  - Port 3000 check returned no active connections')
  }

  console.log('\n' + '='.repeat(60) + '\n')
}

runDiagnostics().catch(console.error)
