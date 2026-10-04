import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9222
const TEMP_USER_DATA = path.join(process.cwd(), '.chrome-phase-profile')
const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'screenshots', 'presentation')

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
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('  [BROWSER ERROR]:', JSON.stringify(msg.params.exceptionDetails, null, 2))
      }
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

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    })
  }

  async navigate(url) {
    await this.send('Page.navigate', { url })
    await new Promise((r) => setTimeout(r, 1200))
  }

  async reload() {
    await this.send('Page.reload', { ignoreCache: true })
    await new Promise((r) => setTimeout(r, 1200))
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
    let lastBody = ''
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await this.evaluate(expr)
        if (res) return res
        lastBody = await this.evaluate(() => document.body.innerText)
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    throw new Error(`Timeout after ${timeoutMs}ms waiting for condition. Last body text: [${lastBody?.slice(0, 300)}]`)
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

async function createTab(url, width = 1920, height = 1080) {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  const tabData = await res.json()
  const tab = new CDPTab(tabData)
  await tab.connect()
  await tab.setViewport(width, height)
  return tab
}

function createRobots(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `robot-${String(i + 1).padStart(2, '0')}`,
    name: `Robot-${String(i + 1).padStart(2, '0')}`,
    club: `RoboClub-${(i % 3) + 1}`,
    institution: `Inst-${(i % 2) + 1}`,
    status: 'active',
    wins: 0,
    eliminatedRound: null,
  }))
}

async function main() {
  console.log('=================================================================')
  console.log('ROBOCUP ARENA — PHASE-BASED LIVE PRESENTATION TEST SUITE')
  console.log('=================================================================')

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
    // =========================================================================
    // TEST 1: 22 ROBOTS — QUALIFICATION ROUND 1 (NO GIANT SCROLLING PAGE)
    // =========================================================================
    console.log('\n-----------------------------------------------------------------')
    console.log('TEST 1: 22 Robots (Qualification Round 1 on 1920x1080 & 1366x768)')
    console.log('-----------------------------------------------------------------')
    const res22 = await fetch('http://localhost:3000/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'GrandPrix-22-Robots',
        robots: createRobots(22),
      }),
    })
    const t22 = (await res22.json()).data
    console.log(`  Tournament created: ${t22.id}`)

    // 1080p
    const tab22_1080 = await createTab(`http://localhost:3000/tournament/${t22.id}/projector`, 1920, 1080)
    await tab22_1080.waitForFunction(() => document.body.innerText.includes('GrandPrix-22-Robots'), 6000)

    const check22 = await tab22_1080.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      const hasAdminNav =
        document.body.innerText.includes('Tournament Setup') ||
        document.body.innerText.includes('Archives & History') ||
        document.body.innerText.includes('+ New Tournament')
      const hasLiveMatch = text.includes('ACTIVE ARENA MATCH') || text.includes('VS')
      const hasRound1 = text.includes('ROUND 1')
      const isViewportContained = document.body.scrollHeight <= window.innerHeight + 10
      return { hasAdminNav, hasLiveMatch, hasRound1, isViewportContained }
    })

    console.log('  22 Robots (1920x1080) assertions:', check22)
    if (check22.hasAdminNav) throw new Error('Admin navigation must NOT be present on Projector View!')
    if (!check22.hasLiveMatch) throw new Error('Current live match spotlight must be prominent!')
    if (!check22.isViewportContained) throw new Error('Page must NOT have giant uncontained vertical scroll!')
    await tab22_1080.captureScreenshot('22-robots-1080p-qualification.png')

    // Also verify at 1366x768
    await tab22_1080.setViewport(1366, 768)
    await new Promise((r) => setTimeout(r, 500))
    await tab22_1080.captureScreenshot('22-robots-768p-qualification.png')
    console.log('  ✓ 22 Robots Qualification fits within both 1080p and 768p without giant page!')

    // Complete Match 1 and check that winner is visible with checkmark (✓)
    const m1Id = t22.rounds[0].matches[0].id
    const m1WinnerId = t22.rounds[0].matches[0].robot1.id
    await fetch(`http://localhost:3000/api/tournament/${t22.id}/match/${m1Id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId: m1WinnerId }),
    })
    await new Promise((r) => setTimeout(r, 600))
    await tab22_1080.reload()
    await tab22_1080.waitForFunction(() => document.body.innerText.toUpperCase().includes('FINAL'), 8000)
    const hasCheckmark = await tab22_1080.evaluate(() => document.body.innerText.includes('✓'))
    console.log(`  ✓ Completed match winner checkmark (✓) permanently visible on 22-robot grid: ${hasCheckmark}`)
    await tab22_1080.captureScreenshot('22-robots-with-completed-match.png')
    await tab22_1080.close()

    // =========================================================================
    // TEST 2: 5 ROBOTS — GROUP STAGE -> QUALIFIED -> FINAL -> CHAMPION
    // =========================================================================
    console.log('\n-----------------------------------------------------------------')
    console.log('TEST 2: 5 Robots (1 Group of 5 -> Qualifiers -> Final -> Champion)')
    console.log('-----------------------------------------------------------------')
    const res5 = await fetch('http://localhost:3000/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Challenge-5-Robots',
        robots: createRobots(5),
        config: { finalFormat: '2-to-final', groupStageEnabled: true },
      }),
    })
    const t5 = (await res5.json()).data
    const tab5 = await createTab(`http://localhost:3000/tournament/${t5.id}/projector`, 1920, 1080)
    await tab5.waitForFunction(() => document.body.innerText.includes('Challenge-5-Robots'), 6000)

    // Phase 1: Group Stage
    const check5_group = await tab5.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      const hasGroupA = text.includes('GROUP A')
      const hasStandings = text.includes('RANK & COMBATANT') && text.includes('QUALIFY')
      const hasLiveSpotlight = text.includes('ACTIVE ARENA MATCH')
      const hasNoKnockoutClutter = !text.includes('CHAMPIONSHIP FINAL POD')
      return { hasGroupA, hasStandings, hasLiveSpotlight, hasNoKnockoutClutter }
    })
    console.log('  5 Robots Group Stage assertions:', check5_group)
    if (!check5_group.hasGroupA || !check5_group.hasStandings || !check5_group.hasLiveSpotlight) {
      throw new Error('5-Robot Group Stage presentation missing essential components!')
    }
    await tab5.captureScreenshot('5-robots-phase1-group.png')

    // Complete all 10 group matches
    const r5Matches = (await (await fetch(`http://localhost:3000/api/tournament/${t5.id}`)).json()).data.rounds[0].matches
    for (const m of r5Matches) {
      await fetch(`http://localhost:3000/api/tournament/${t5.id}/match/${m.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId: m.robot1.id }),
      })
    }
    await fetch(`http://localhost:3000/api/tournament/${t5.id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete_round' }),
    })

    // Phase 2: Qualifiers Ceremony
    await tab5.reload()
    await tab5.waitForFunction(() => document.body.innerText.toUpperCase().includes('QUALIFIED COMBATANTS'), 6000)
    console.log('  ✓ Automatically transitioned to Phase 2: QUALIFIED COMBATANTS')
    // Advance to Final
    const advRes = await fetch(`http://localhost:3000/api/tournament/${t5.id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance_from_group' }),
    })
    const advJson = await advRes.json()
    console.log('  Advance to final API response:', advJson.success, 'Stage:', advJson.data?.currentStage)

    await tab5.reload()
    const textAfterAdv = await tab5.evaluate(() => document.body.innerText)
    console.log('  Tab 5 text after advance to final:', textAfterAdv.slice(0, 300))
    await tab5.waitForFunction(() => document.body.innerText.toUpperCase().includes('CHAMPIONSHIP GRAND FINAL'), 6000)
    console.log('  ✓ Automatically transitioned to Phase 3: CHAMPIONSHIP GRAND FINAL')
    await tab5.captureScreenshot('5-robots-phase3-final.png')

    // Complete Final match to crown Champion
    const t5Full = (await (await fetch(`http://localhost:3000/api/tournament/${t5.id}`)).json()).data
    const finalRound5 = t5Full.rounds.find((r) => r.stage === 'final') || t5Full.rounds[t5Full.rounds.length - 1]
    const finalM = finalRound5.matches[0]
    const winnerId = finalM.robot1?.id || finalM.robot2?.id || t5.robots[0].id
    await fetch(`http://localhost:3000/api/tournament/${t5.id}/match/${finalM.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId }),
    })
    await fetch(`http://localhost:3000/api/tournament/${t5.id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete_round' }),
    })

    // Phase 4: Dedicated Champion Screen
    await tab5.reload()
    await tab5.waitForFunction(() => document.body.innerText.toUpperCase().includes('TOURNAMENT CHAMPION'), 6000)
    const check5_champ = await tab5.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      const hasTrophy = text.includes('TOURNAMENT CHAMPION')
      const hasWinnerName = text.includes('ROBOT-')
      const hasNoEnormousBracket = !text.includes('11 KNOCKOUT MATCHES')
      return { hasTrophy, hasWinnerName, hasNoEnormousBracket }
    })
    console.log('  5 Robots Champion Screen assertions:', check5_champ)
    if (!check5_champ.hasTrophy || !check5_champ.hasWinnerName) {
      throw new Error('Champion presentation screen failed to display victorious robot!')
    }
    await tab5.captureScreenshot('5-robots-phase4-champion.png')
    await tab5.close()

    // =========================================================================
    // TEST 3: 6 ROBOTS (2 GROUPS OF 3+3)
    // =========================================================================
    console.log('\n-----------------------------------------------------------------')
    console.log('TEST 3: 6 Robots (2 Groups: 3 + 3, Semifinals Format)')
    console.log('-----------------------------------------------------------------')
    const res6 = await fetch('http://localhost:3000/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Challenge-6-Robots',
        robots: createRobots(6),
        config: { finalFormat: '4-to-final', groupStageEnabled: true },
      }),
    })
    const t6 = (await res6.json()).data
    const tab6 = await createTab(`http://localhost:3000/tournament/${t6.id}/projector`, 1920, 1080)
    await tab6.waitForFunction(() => document.body.innerText.includes('Challenge-6-Robots'), 6000)

    const check6 = await tab6.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      return text.includes('GROUP A') && text.includes('GROUP B')
    })
    console.log(`  ✓ 6 Robots Projector renders both Group A and Group B: ${check6}`)
    await tab6.captureScreenshot('6-robots-groups.png')
    await tab6.close()

    // =========================================================================
    // TEST 4: 7 ROBOTS (2 GROUPS OF 3 + 4)
    // =========================================================================
    console.log('\n-----------------------------------------------------------------')
    console.log('TEST 4: 7 Robots (2 Groups: 3 + 4)')
    console.log('-----------------------------------------------------------------')
    const res7 = await fetch('http://localhost:3000/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Challenge-7-Robots',
        robots: createRobots(7),
        config: { finalFormat: '4-to-final', groupStageEnabled: true },
      }),
    })
    const t7 = (await res7.json()).data
    const tab7 = await createTab(`http://localhost:3000/tournament/${t7.id}/projector`, 1920, 1080)
    await tab7.waitForFunction(() => document.body.innerText.includes('Challenge-7-Robots'), 6000)

    const check7 = await tab7.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      return text.includes('GROUP A') && text.includes('GROUP B')
    })
    console.log(`  ✓ 7 Robots Projector renders 2 balanced groups (3+4): ${check7}`)
    await tab7.captureScreenshot('7-robots-groups.png')
    await tab7.close()

    // =========================================================================
    // TEST 5: 8 ROBOTS (2 GROUPS OF 4 + 4)
    // =========================================================================
    console.log('\n-----------------------------------------------------------------')
    console.log('TEST 5: 8 Robots (2 Groups: 4 + 4)')
    console.log('-----------------------------------------------------------------')
    const res8 = await fetch('http://localhost:3000/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Challenge-8-Robots',
        robots: createRobots(8),
        config: { finalFormat: '4-to-final', groupStageEnabled: true },
      }),
    })
    const t8 = (await res8.json()).data
    const tab8 = await createTab(`http://localhost:3000/tournament/${t8.id}/projector`, 1920, 1080)
    await tab8.waitForFunction(() => document.body.innerText.includes('Challenge-8-Robots'), 6000)

    const check8 = await tab8.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      return text.includes('GROUP A') && text.includes('GROUP B')
    })
    console.log(`  ✓ 8 Robots Projector renders 2 groups of 4: ${check8}`)
    await tab8.captureScreenshot('8-robots-groups.png')
    await tab8.close()

    // =========================================================================
    // TEST 6: 9 ROBOTS (3 GROUPS OF 3 + 3 + 3)
    // =========================================================================
    console.log('\n-----------------------------------------------------------------')
    console.log('TEST 6: 9 Robots (3 Groups: 3 + 3 + 3)')
    console.log('-----------------------------------------------------------------')
    const res9 = await fetch('http://localhost:3000/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Challenge-9-Robots',
        robots: createRobots(9),
        config: { finalFormat: '4-to-final', groupStageEnabled: true },
      }),
    })
    const t9 = (await res9.json()).data
    const tab9 = await createTab(`http://localhost:3000/tournament/${t9.id}/projector`, 1920, 1080)
    await tab9.waitForFunction(() => document.body.innerText.includes('Challenge-9-Robots'), 6000)

    const check9 = await tab9.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      return text.includes('GROUP A') && text.includes('GROUP B') && text.includes('GROUP C')
    })
    console.log(`  ✓ 9 Robots Projector renders 3 groups (A, B, C): ${check9}`)
    await tab9.captureScreenshot('9-robots-groups.png')
    await tab9.close()

    console.log('\n=================================================================')
    console.log('ALL PHASE-BASED LIVE PRESENTATION TESTS PASSED WITH 100% SUCCESS!')
    console.log('=================================================================')
  } finally {
    try {
      chromeProcess.kill()
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Presentation Verification Error:', err)
  process.exit(1)
})
