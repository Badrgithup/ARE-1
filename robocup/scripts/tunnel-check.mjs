#!/usr/bin/env node

/**
 * Cloudflare Tunnel Diagnostic Script
 * Command: npm run tunnel:check
 */

import { discoverCloudflared } from './cloudflared-discovery.mjs'

const info = discoverCloudflared()

console.log('='.repeat(52))
console.log('       CLOUDFLARE TUNNEL DIAGNOSTIC')
console.log('='.repeat(52))
console.log('')

if (info.packageInstalled) {
  console.log('Package:')
  console.log('✓ cloudflared installed')
  console.log('')
} else {
  console.log('Package:')
  console.log('✗ Not detected via package manager')
  console.log('')
}

if (info.version) {
  console.log('Version:')
  console.log(info.version)
  console.log('')
}

if (info.found) {
  console.log('Executable:')
  console.log('✓ Found')
  console.log('')
  console.log('Path:')
  console.log(info.executablePath)
  console.log('')
} else {
  console.log('Executable:')
  console.log('✗ Not found in standard locations')
  console.log('')
}

console.log('PATH:')
if (info.inPath) {
  console.log('✓ Available globally in PATH')
} else {
  console.log('✗ Not available globally')
}
console.log('')

console.log('Execution:')
if (info.found && info.version) {
  console.log('✓ cloudflared executable works')
} else {
  console.log('✗ Execution failed')
}

console.log('')
console.log('='.repeat(52))

if (!info.found) {
  console.log('')
  console.log('INSTALLATION INSTRUCTIONS (Windows):')
  console.log('  winget install --id Cloudflare.cloudflared')
  console.log('Or download from:')
  console.log('  https://github.com/cloudflare/cloudflared/releases')
  console.log('='.repeat(52))
  process.exit(1)
} else {
  process.exit(0)
}
