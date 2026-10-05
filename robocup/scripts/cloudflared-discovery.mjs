/**
 * Robust Cross-Platform Cloudflare Tunnel (cloudflared) Executable Discovery
 *
 * Discovers cloudflared.exe on Windows across:
 * - Current process.env.PATH
 * - Windows System & User Registry PATH (HKLM / HKCU)
 * - Standard Program Files (x86 & x64)
 * - WinGet Packages & WinGet Links
 * - AppData (Local, Roaming, Programs)
 * - Chocolatey, Scoop, and custom tool directories
 * - WinGet CLI package query
 *
 * Verifies executable integrity and parses its version.
 */

import fs from 'fs'
import path from 'path'
import { execFileSync, execSync } from 'child_process'

function normalizePath(p) {
  return path.normalize(p).trim()
}

function fileExists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile()
  } catch {
    return false
  }
}

// Read Registry PATH variables on Windows to catch newly installed software
function getRegistryPaths() {
  if (process.platform !== 'win32') return []
  const paths = []

  const queries = [
    'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path',
    'reg query "HKCU\\Environment" /v Path'
  ]

  for (const cmd of queries) {
    try {
      const output = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' })
      const match = output.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i)
      if (match && match[1]) {
        const parts = match[1].split(';').map((s) => s.trim()).filter(Boolean)
        paths.push(...parts)
      }
    } catch {
      // Ignore registry read errors
    }
  }

  return paths
}

// Query WinGet for package info
function queryWingetPackage() {
  if (process.platform !== 'win32') return { installed: false, version: null }
  try {
    const output = execSync('winget list --id Cloudflare.cloudflared', {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    })
    if (output.includes('Cloudflare.cloudflared') || output.toLowerCase().includes('cloudflared')) {
      const versionMatch = output.match(/Cloudflare\.cloudflared\s+([0-9.]+)/i)
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : null
      }
    }
  } catch {
    // winget may not be available or failed
  }
  return { installed: false, version: null }
}

// Recursively find files matching name within depth limit
function findInDir(dir, fileName, maxDepth = 3, currentDepth = 0) {
  if (!fs.existsSync(dir) || currentDepth > maxDepth) return []
  const results = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
        results.push(fullPath)
      } else if (entry.isDirectory() && currentDepth < maxDepth) {
        results.push(...findInDir(fullPath, fileName, maxDepth, currentDepth + 1))
      }
    }
  } catch {
    // Permission or I/O error
  }
  return results
}

// Verify binary by running --version
function verifyCloudflaredExecutable(exePath) {
  try {
    const output = execFileSync(exePath, ['--version'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 4000
    })
    const match = output.match(/cloudflared\s+version\s+([0-9.]+)/i)
    if (match && match[1]) {
      return match[1]
    }
    const fallbackMatch = output.match(/version\s+([0-9.]+)/i)
    if (fallbackMatch && fallbackMatch[1]) {
      return fallbackMatch[1]
    }
    return output.trim().split(/\r?\n/)[0] || 'Unknown version'
  } catch {
    return null
  }
}

/**
 * Main discovery function: finds cloudflared executable anywhere on the host
 */
export function discoverCloudflared() {
  const isWindows = process.platform === 'win32'
  const binaryName = isWindows ? 'cloudflared.exe' : 'cloudflared'

  // 1. Check if it's directly runnable via current PATH
  let inPath = false
  let pathExecutable = null

  try {
    const cmd = isWindows ? 'where.exe cloudflared' : 'which cloudflared'
    const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' }).trim()
    const firstMatch = out.split(/\r?\n/)[0]?.trim()
    if (firstMatch && fileExists(firstMatch)) {
      pathExecutable = firstMatch
      inPath = true
    }
  } catch {
    inPath = false
  }

  // 2. Query winget package status
  const wingetInfo = queryWingetPackage()

  // 3. Collect all candidate search directories
  const candidatePaths = []

  if (pathExecutable) {
    candidatePaths.push(pathExecutable)
  }

  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || ''
    const appData = process.env.APPDATA || ''
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const userProfile = process.env.USERPROFILE || ''
    const programData = process.env.ProgramData || 'C:\\ProgramData'

    // Standard installation directories
    candidatePaths.push(
      path.join(programFilesX86, 'cloudflared', binaryName),
      path.join(programFiles, 'cloudflared', binaryName),
      path.join(localAppData, 'cloudflared', binaryName),
      path.join(localAppData, 'Programs', 'cloudflared', binaryName),
      path.join(localAppData, 'Microsoft', 'WinGet', 'Links', binaryName),
      path.join(appData, 'cloudflared', binaryName),
      path.join(programData, 'chocolatey', 'bin', binaryName),
      path.join(userProfile, 'scoop', 'shims', binaryName),
      path.join(userProfile, 'scoop', 'apps', 'cloudflared', 'current', binaryName),
      path.join('C:\\tools', 'cloudflared', binaryName),
      path.join('C:\\cloudflared', binaryName)
    )

    // Registry PATH locations
    const regPaths = getRegistryPaths()
    for (const p of regPaths) {
      candidatePaths.push(path.join(p, binaryName))
    }

    // WinGet Packages directory deep search
    const wingetPackagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
    if (fs.existsSync(wingetPackagesDir)) {
      const foundInWinget = findInDir(wingetPackagesDir, binaryName, 3)
      candidatePaths.push(...foundInWinget)
    }

    // npm / npx cache fallback search
    const npmCacheNpx = path.join(localAppData, 'npm-cache', '_npx')
    if (fs.existsSync(npmCacheNpx)) {
      const foundInNpx = findInDir(npmCacheNpx, binaryName, 4)
      candidatePaths.push(...foundInNpx)
    }
  } else {
    // macOS / Linux locations
    candidatePaths.push(
      '/usr/local/bin/cloudflared',
      '/usr/bin/cloudflared',
      '/opt/homebrew/bin/cloudflared',
      '/home/linuxbrew/.linuxbrew/bin/cloudflared'
    )
  }

  // 4. Test each candidate
  const tested = new Set()

  for (const candidate of candidatePaths) {
    if (!candidate) continue
    const normalized = normalizePath(candidate)
    if (tested.has(normalized)) continue
    tested.add(normalized)

    if (fileExists(normalized)) {
      const version = verifyCloudflaredExecutable(normalized)
      if (version) {
        return {
          found: true,
          executablePath: normalized,
          version,
          inPath,
          packageInstalled: wingetInfo.installed || true,
          packageVersion: wingetInfo.version || version
        }
      }
    }
  }

  // 5. If not found, return diagnostic details
  return {
    found: false,
    executablePath: null,
    version: null,
    inPath: false,
    packageInstalled: wingetInfo.installed,
    packageVersion: wingetInfo.version,
    error: wingetInfo.installed
      ? `Package Cloudflare.cloudflared is installed via WinGet (${wingetInfo.version || 'installed'}), but executable cloudflared.exe was not located in standard search paths.`
      : 'cloudflared is not installed on this system.'
  }
}
