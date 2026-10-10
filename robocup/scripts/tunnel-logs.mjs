#!/usr/bin/env node

/**
 * Cloudflare Tunnel Logs Viewer
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const robocupDir = path.resolve(__dirname, '..')

const logDir = path.join(robocupDir, 'logs', 'tunnel')
const latestLog = path.join(logDir, 'latest.log')

if (!fs.existsSync(logDir)) {
  console.log('No tunnel logs directory found.')
  process.exit(0)
}

if (fs.existsSync(latestLog)) {
  const lines = fs.readFileSync(latestLog, 'utf-8').split(/\r?\n/).filter(Boolean)
  console.log(`Showing last ${Math.min(lines.length, 30)} lines from logs/tunnel/latest.log:\n`)
  lines.slice(-30).forEach((l) => console.log(l))
} else {
  const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.log')).sort().reverse()
  if (files.length > 0) {
    const lines = fs.readFileSync(path.join(logDir, files[0]), 'utf-8').split(/\r?\n/).filter(Boolean)
    console.log(`Showing last ${Math.min(lines.length, 30)} lines from logs/tunnel/${files[0]}:\n`)
    lines.slice(-30).forEach((l) => console.log(l))
  } else {
    console.log('No log files found in logs/tunnel/')
  }
}
