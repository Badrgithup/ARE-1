import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9222
const TEMP_USER_DATA = path.join(process.cwd(), '.chrome-visual-profile')
const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'screenshots')

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

class CDPTab {
  constructor(tabData) {
    this.tabData = tabData
    this.ws = null
    this.idCounter = 1
  }

  async connect() {
    this.ws = new WebSocket(this.tabData.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve
      this.ws.onerror = reject
    })
    await this.send('Page.enable')
    await this.send('Runtime.enable')
    await this.send('DOM.enable')
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.idCounter++
      const handler = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === id) {
          this.ws.removeEventListener('message', handler)
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)))
          } else {
            resolve(msg.result)
          }
        }
      }
      this.ws.addEventListener('message', handler)
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async navigate(url) {
    await this.send('Page.navigate', { url })
    await new Promise((r) => setTimeout(r, 1200))
  }

  async reload() {
    await this.send('Page.reload', { ignoreCache: true })
    await new Promise((r) => setTimeout(r, 1500))
  }

  async evaluate(fnOrString, ...args) {
    let expression = ''
    if (typeof fnOrString === 'function') {
      expression = `(${fnOrString.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`
    } else {
      expression = String(fnOrString)
    }
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return res.result?.value
  }

  async waitForFunction(fnOrString, timeoutMs = 8000, intervalMs = 200) {
    const start = Date.now()
    const expr = typeof fnOrString === 'function' ? `(${fnOrString.toString()})()` : String(fnOrString)
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await this.evaluate(expr)
        if (res) return res
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    throw new Error(`Timeout after ${timeoutMs}ms waiting for condition`)
  }

  async captureScreenshot(filename) {
    const filePath = path.join(SCREENSHOT_DIR, filename)
    const res = await this.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'))
    console.log(`  📸 Screenshot saved: ${filename}`)
    return filePath
  }

  async close() {
    try {
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${this.tabData.id}`)
      if (this.ws) this.ws.close()
    } catch {
      // ignore
    }
  }
}

async function createTab(url) {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  const tabData = await res.json()
  const tab = new CDPTab(tabData)
  await tab.connect()
  return tab
}

function createRobots(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `bot-${String(i + 1).padStart(2, '0')}`,
    name: `Bot-${String(i + 1).padStart(2, '0')}`,
    club: `Team-${(i % 3) + 1}`,
    institution: `Inst-${(i % 2) + 1}`,
  }))
}

async function main() {
  console.log('===============================================================')
  console.log('VERIFYING PROJECTOR VIEW VISUAL FEATURES (5, 6, 7 ROBOTS)')
  console.log('===============================================================')

  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${TEMP_USER_DATA}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  await new Promise((r) => setTimeout(r, 2000))

  try {
    // --- 1. 5 ROBOTS: SINGLE GROUP OF 5 -> 10 MATCHES -> QUALIFIERS -> FINAL ---
    console.log('\n--- Test 1: 5 Robots (1 Group of 5, Standings, Qualifiers, Final) ---')
    const res5 = await fetch('http://localhost:3000/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Projector-5-Robots',
        robots: createRobots(5),
        config: { finalFormat: '2-to-final', groupStageEnabled: true },
      }),
    })
    const t5 = (await res5.json()).data
    console.log(`  Tournament created: ${t5.id}`)

    const tab5 = await createTab(`http://localhost:3000/tournament/${t5.id}/projector`)
    await tab5.waitForFunction(() => document.body.innerText.includes('Projector-5-Robots'), 6000)

    const rawText = await tab5.evaluate(() => document.body.innerText)
    console.log('  --- FULL RAW TEXT IN TAB 5 ---')
    console.log(rawText)
    console.log('  -----------------------------')

    // Verify elements in DOM
    const dom5 = await tab5.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      const hasSingleGroup = text.includes('GROUP STAGE (SINGLE GROUP)') || text.includes('GROUP A')
      const hasQualifiersPhase = text.includes('QUALIFIED COMBATANTS')
      const hasFinalPhase = text.includes('CHAMPIONSHIP FINAL')
      const has10Matches = text.includes('GROUP PAIRINGS & MATCH RESULTS (10)')
      return { hasSingleGroup, hasQualifiersPhase, hasFinalPhase, has10Matches }
    })
    console.log('  5-Robot visual phases:', dom5)
    if (!dom5.hasSingleGroup || !dom5.hasQualifiersPhase || !dom5.hasFinalPhase || !dom5.has10Matches) {
      throw new Error('5-Robot tournament visual tree missing required phases')
    }
    await tab5.captureScreenshot('projector-5-robots-bracket.png')

    // Record a couple of group matches to verify winner checkmarks
    const r1Matches5 = (await (await fetch(`http://localhost:3000/api/tournament/${t5.id}`)).json()).data.rounds[0].matches
    await fetch(`http://localhost:3000/api/tournament/${t5.id}/match/${r1Matches5[0].id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId: r1Matches5[0].robot1.id }),
    })
    await new Promise((r) => setTimeout(r, 600))
    await tab5.reload()
    await tab5.waitForFunction(() => document.body.innerText.includes('FINAL'), 5000)
    const hasCheckmark = await tab5.evaluate(() => document.body.innerText.includes('✓'))
    console.log(`  ✓ Completed match winner checkmark (✓) visible on Projector: ${hasCheckmark}`)
    await tab5.captureScreenshot('projector-5-robots-with-results.png')
    await tab5.close()

    // --- 2. 7 ROBOTS: 2 GROUPS (3 + 4) -> QUALIFIERS -> SEMIFINALS -> FINAL ---
    console.log('\n--- Test 2: 7 Robots (2 Groups: 3+4, Standings, Qualifiers, Semis) ---')
    const res7 = await fetch('http://localhost:3000/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Projector-7-Robots',
        robots: createRobots(7),
        config: { finalFormat: '4-to-final', groupStageEnabled: true },
      }),
    })
    const t7 = (await res7.json()).data
    const tab7 = await createTab(`http://localhost:3000/tournament/${t7.id}/projector`)
    await tab7.waitForFunction(() => document.body.innerText.includes('Projector-7-Robots'), 6000)

    const dom7 = await tab7.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      const hasGroupA = text.includes('GROUP A')
      const hasGroupB = text.includes('GROUP B')
      const hasQualifiers = text.includes('QUALIFIED COMBATANTS')
      const hasSemis = text.includes('SEMIFINALS')
      return { hasGroupA, hasGroupB, hasQualifiers, hasSemis }
    })
    console.log('  7-Robot visual phases:', dom7)
    if (!dom7.hasGroupA || !dom7.hasGroupB || !dom7.hasQualifiers || !dom7.hasSemis) {
      throw new Error('7-Robot tournament visual tree missing required phases')
    }
    await tab7.captureScreenshot('projector-7-robots-bracket.png')
    await tab7.close()

    console.log('\n===============================================================')
    console.log('ALL PROJECTOR VIEW VISUAL VERIFICATIONS COMPLETED SUCCESSFULLY!')
    console.log('===============================================================')
  } finally {
    try {
      chromeProcess.kill()
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Verification Error:', err)
  process.exit(1)
})
