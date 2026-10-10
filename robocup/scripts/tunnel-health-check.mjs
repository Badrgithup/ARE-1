#!/usr/bin/env node

/**
 * Quick Cloudflare Tunnel Health Check CLI
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const robocupDir = path.resolve(__dirname, '..')

const stateFile = path.join(robocupDir, 'logs', 'tunnel', 'tunnel-state.json')

// Cloudflare Tunnel process configuration
export function spawnTunnel(cloudflaredBin = 'cloudflared', port = 3000) {
  return spawn(cloudflaredBin, [
    'tunnel',
    '--protocol', 'http1',
    '--url',
    `http://localhost:${port}`
  ])
}

function checkHttpEndpoint() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/health/tunnel', (res) => {
      let data = ''
      res.on('data', (c) => (data += c.toString()))
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode === 200, status: res.statusCode, json: JSON.parse(data) })
        } catch {
          resolve({ ok: false, status: res.statusCode, raw: data })
        }
      })
    })
    req.on('error', (err) => resolve({ ok: false, error: err.message }))
    req.setTimeout(4000, () => {
      req.destroy()
      resolve({ ok: false, error: 'Timed out' })
    })
  })
}

async function main() {
  console.log('Checking Cloudflare Tunnel Health...\n')
  const res = await checkHttpEndpoint()

  if (res.ok && res.json) {
    console.log('✓ STATUS: HEALTHY & CONNECTED')
    console.log(`✓ Process: ${res.json.process} (PID: ${res.json.pid || 'N/A'})`)
    console.log(`✓ Public URL: ${res.json.publicUrl || 'N/A'}`)
    console.log(`✓ Restarts: ${res.json.restarts || 0}`)
    console.log(`✓ Last Connected: ${res.json.lastConnectedAt || 'N/A'}`)
    process.exit(0)
  }

  // Fallback to local state file if server is starting
  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
      console.log(`⚠️ Status from disk: ${state.status}`)
      console.log(`  URL: ${state.url || 'None'}`)
      console.log(`  Restarts: ${state.restarts || 0}`)
      if (state.lastError) console.log(`  Last Error: ${state.lastError}`)
      process.exit(state.status === 'CONNECTED' ? 0 : 1)
    } catch {
      // ignore
    }
  }

  console.log(`✗ Tunnel is OFFLINE: ${res.error || `HTTP ${res.status}`}`)
  process.exit(1)
}

main()
