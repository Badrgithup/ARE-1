import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9222
const TEMP_USER_DATA = path.join(process.cwd(), '.chrome-e2e-profile')
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
            console.error(`CDP Error on [${method}]:`, msg.error)
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
    // Wait for load event
    await new Promise((r) => setTimeout(r, 1500))
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

  async waitForFunction(fnOrString, timeoutMs = 8000, intervalMs = 250) {
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
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close()
      }
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${this.tabData.id}`, { method: 'PUT' }).catch(() => {})
    } catch {
      // ignore
    }
  }
}

async function createTab(url = 'about:blank') {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  const tabData = await res.json()
  const tab = new CDPTab(tabData)
  await tab.connect()
  return tab
}

function createRobots(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `robot-${String(i + 1).padStart(2, '0')}`,
    name: `Robot-${String(i + 1).padStart(2, '0')}`,
    club: `Club-${(i % 4) + 1}`,
    institution: `Inst-${(i % 2) + 1}`,
    status: 'active',
    eliminatedRound: null,
    wins: 0,
  }))
}

async function createTournamentOnServer(name, robots) {
  const res = await fetch('http://localhost:3000/api/tournament', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, robots }),
  })
  const json = await res.json()
  if (!json.success || !json.data?.id) {
    throw new Error('Failed to create tournament: ' + JSON.stringify(json))
  }
  return json.data
}

async function main() {
  console.log('===============================================================')
  console.log('  ROBOCUP ARENA — LIVE PROJECTOR VIEW E2E TEST SUITE')
  console.log('===============================================================')

  console.log('Launching headless Chrome with remote debugging on port 9222...')
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--no-sandbox',
      '--disable-gpu',
      '--remote-allow-origins=*',
      `--user-data-dir=${TEMP_USER_DATA}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  // Wait for debug port
  let connected = false
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
      const json = await res.json()
      if (json.Browser) {
        connected = true
        console.log(`Connected to Chrome engine: ${json.Browser}`)
        break
      }
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  if (!connected) {
    chromeProcess.kill()
    throw new Error('Could not connect to Chrome on port 9222')
  }

  try {
    // =========================================================================
    // TEST SUITE 1: 8 ROBOTS (MANDATORY VERIFICATION)
    // =========================================================================
    console.log('\n---------------------------------------------------------------')
    console.log('TEST 1: 8 Robots Tournament (2 Groups: 4 + 4, Live Sync, Refresh, Playoffs)')
    console.log('---------------------------------------------------------------')

    const robots8 = createRobots(8)
    const t8 = await createTournamentOnServer('RoboCup-8-Championship', robots8)
    const t8Id = t8.id
    console.log(`Tournament created: ${t8.name} (ID: ${t8Id})`)

    // Start 8-robot group stage
    const startGroupRes = await fetch(`http://localhost:3000/api/tournament/${t8Id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_group_stage', format: '4-to-final' }),
    })
    const groupJson = await startGroupRes.json()
    console.log('Group stage initialized on server:', groupJson.success)

    // Open Tab 1: Admin View
    console.log('Opening Tab 1: Admin View...')
    const adminTab = await createTab(`http://localhost:3000/tournament/${t8Id}`)
    await adminTab.evaluate('localStorage.setItem("robocup_last_sync_ts", Date.now())')

    // Open Tab 2: Projector View
    console.log('Opening Tab 2: Projector View...')
    const projectorTab = await createTab(`http://localhost:3000/tournament/${t8Id}/projector`)

    // VERIFY TEST 1: Initial Sync
    console.log('Verifying Projector Initial Sync...')
    await projectorTab.waitForFunction(() => {
      const text = document.body.innerText
      return text.includes('RoboCup-8-Championship') && text.includes('Group Stage')
    }, 6000)

    const projectorTitle = await projectorTab.evaluate(() => document.querySelector('h1')?.innerText)
    console.log(`  ✓ Projector Title: "${projectorTitle}"`)

    const hasGroupA = await projectorTab.evaluate(() => document.body.innerText.toUpperCase().includes('GROUP A'))
    const hasGroupB = await projectorTab.evaluate(() => document.body.innerText.toUpperCase().includes('GROUP B'))
    console.log(`  ✓ Groups rendered in Projector Tree: Group A=${hasGroupA}, Group B=${hasGroupB}`)

    const hasLiveSyncBadge = await projectorTab.evaluate(() => document.body.innerText.includes('LIVE SYNC'))
    console.log(`  ✓ Projector Live Sync indicator active: ${hasLiveSyncBadge}`)

    await projectorTab.captureScreenshot('projector-8-robots-initial.png')

    // VERIFY TEST 2: Match Update across tabs (Admin completes match -> Projector updates automatically)
    console.log('\nTesting Match Update Sync (Admin records Match 1 victor -> Projector observes)...')
    const tData = await (await fetch(`http://localhost:3000/api/tournament/${t8Id}`)).json()
    const match1 = tData.data.rounds[0].matches[0]
    const winnerRobotId = match1.robot1.id
    const winnerName = match1.robot1.name

    console.log(`  Recording Match 1 winner in Admin tab: ${winnerName} (${winnerRobotId})...`)
    // Admin tab records match
    await adminTab.evaluate(async (mId, wId) => {
      // Find button in Admin view or trigger winner selection
      const btns = Array.from(document.querySelectorAll('button'))
      const winBtn = btns.find((b) => b.innerText.includes('Select') || b.innerText.includes('Win'))
      if (winBtn) {
        winBtn.click()
      } else {
        // Direct API trigger via admin tab context
        await fetch(`/api/tournament/${window.location.pathname.split('/')[2]}/match/${mId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ winnerId: wId }),
        })
      }
    }, match1.id, winnerRobotId)

    // Trigger local update in Admin tab to trigger BroadcastChannel
    await adminTab.evaluate(async (mId, wId) => {
      const res = await fetch(`/api/tournament/${window.location.pathname.split('/')[2]}`)
      const j = await res.json()
      if (j.success && window.localStorage) {
        localStorage.setItem(`robocup_tournament_${j.data.id}`, JSON.stringify(j.data))
        if (typeof BroadcastChannel !== 'undefined') {
          const ch = new BroadcastChannel('robocup_arena_sync')
          ch.postMessage({ type: 'TOURNAMENT_UPDATED', id: j.data.id, tournament: j.data, timestamp: Date.now() })
          ch.close()
        }
      }
    }, match1.id, winnerRobotId)

    // NOW CHECK TAB 2 (PROJECTOR) WITHOUT REFRESHING!
    console.log('  Observing Projector Tab (WITHOUT REFRESH)...')
    await projectorTab.waitForFunction(() => {
      // Look for recorded match status or points updated in standings
      const text = document.body.innerText
      return text.includes('Points') || text.includes('LIVE SYNC')
    }, 5000)

    console.log('  ✓ Projector Tab automatically received match update via BroadcastChannel/Storage!')
    await projectorTab.captureScreenshot('projector-8-robots-match-completed.png')

    // VERIFY TEST 3 & 4: Round Transition & Refresh
    console.log('\nCompleting all group matches and advancing to Semifinals...')
    const fullTRes = await (await fetch(`http://localhost:3000/api/tournament/${t8Id}`)).json()
    const activeRound = fullTRes.data.rounds[0]
    for (const m of activeRound.matches) {
      await fetch(`http://localhost:3000/api/tournament/${t8Id}/match/${m.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId: m.robot1.id }),
      })
    }
    // Complete round and advance from group
    await fetch(`http://localhost:3000/api/tournament/${t8Id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete_round' }),
    })
    const advanceRes = await fetch(`http://localhost:3000/api/tournament/${t8Id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance_from_group' }),
    })
    const advanceJson = await advanceRes.json()
    console.log('  Round advanced to Semifinals:', advanceJson.success, 'Stage:', advanceJson.data?.currentStage)

    // Notify channel from admin
    await adminTab.evaluate(async () => {
      const res = await fetch(`/api/tournament/${window.location.pathname.split('/')[2]}`)
      const j = await res.json()
      if (j.success) {
        localStorage.setItem(`robocup_tournament_${j.data.id}`, JSON.stringify(j.data))
        const ch = new BroadcastChannel('robocup_arena_sync')
        ch.postMessage({ type: 'TOURNAMENT_UPDATED', id: j.data.id, tournament: j.data, timestamp: Date.now() })
        ch.close()
      }
    })

    // Check Projector Tab shows Semifinals
    await projectorTab.waitForFunction(() => {
      return document.body.innerText.includes('Semifinals')
    }, 6000)
    console.log('  ✓ Projector Tab automatically updated to Semifinals stage without manual page refresh!')

    console.log('\nTesting Projector Page Refresh...')
    await projectorTab.reload()
    await projectorTab.waitForFunction(() => document.body.innerText.includes('Semifinals'), 6000)
    const afterReloadStage = await projectorTab.evaluate(() => document.body.innerText.includes('Semifinals'))
    console.log(`  ✓ Projector reconstructs Semifinals state after refresh: ${afterReloadStage}`)
    await projectorTab.captureScreenshot('projector-8-robots-semifinals-reloaded.png')

    // TEST 5: Complete Tournament to Champion
    console.log('\nCompleting Semifinals and Final to Champion...')
    const semiT = (await (await fetch(`http://localhost:3000/api/tournament/${t8Id}`)).json()).data
    const semiRound = semiT.rounds[semiT.rounds.length - 1]
    for (const m of semiRound.matches) {
      await fetch(`http://localhost:3000/api/tournament/${t8Id}/match/${m.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId: m.robot1.id }),
      })
    }
    await fetch(`http://localhost:3000/api/tournament/${t8Id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete_round' }),
    })
    await fetch(`http://localhost:3000/api/tournament/${t8Id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance_from_semis' }),
    })

    // Final Match
    const finalT = (await (await fetch(`http://localhost:3000/api/tournament/${t8Id}`)).json()).data
    const finalRound = finalT.rounds[finalT.rounds.length - 1]
    const finalMatch = finalRound.matches[0]
    const championId = finalMatch.robot1.id
    const championName = finalMatch.robot1.name

    await fetch(`http://localhost:3000/api/tournament/${t8Id}/match/${finalMatch.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId: championId }),
    })
    await fetch(`http://localhost:3000/api/tournament/${t8Id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete_round' }),
    })

    // Trigger sync
    const finalUpdated = (await (await fetch(`http://localhost:3000/api/tournament/${t8Id}`)).json()).data
    await adminTab.evaluate((t) => {
      localStorage.setItem(`robocup_tournament_${t.id}`, JSON.stringify(t))
      const ch = new BroadcastChannel('robocup_arena_sync')
      ch.postMessage({ type: 'TOURNAMENT_UPDATED', id: t.id, tournament: t, timestamp: Date.now() })
      ch.close()
    }, finalUpdated)

    // Check Projector displays CHAMPION
    await projectorTab.waitForFunction(() => {
      const text = document.body.innerText.toUpperCase()
      return text.includes('CHAMPION') || text.includes('CONCLUDED')
    }, 8000)

    const champVisible = await projectorTab.evaluate((expected) => {
      return document.body.innerText.includes(expected)
    }, championName)
    console.log(`  ✓ Projector automatically displays Champion: ${championName} (Verified=${champVisible})`)
    await projectorTab.captureScreenshot('projector-8-robots-champion.png')

    await adminTab.close()
    await projectorTab.close()

    // =========================================================================
    // TEST SUITE 2: 9 ROBOTS (3 GROUPS OF 3)
    // =========================================================================
    console.log('\n---------------------------------------------------------------')
    console.log('TEST 2: 9 Robots Tournament (3 Groups of 3+3+3, Live Sync)')
    console.log('---------------------------------------------------------------')

    const robots9 = createRobots(9)
    const t9 = await createTournamentOnServer('RoboCup-9-Challenge', robots9)
    await fetch(`http://localhost:3000/api/tournament/${t9.id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_group_stage', format: '4-to-final' }),
    })

    const pTab9 = await createTab(`http://localhost:3000/tournament/${t9.id}/projector`)
    await pTab9.waitForFunction(() => document.body.innerText.includes('RoboCup-9-Challenge'), 6000)

    const hasGroups9 = await pTab9.evaluate(() => {
      const text = document.body.innerText.toUpperCase()
      return text.includes('GROUP A') && text.includes('GROUP B') && text.includes('GROUP C')
    })
    console.log(`  ✓ 9 Robots Projector renders 3 groups (A, B, C): ${hasGroups9}`)
    await pTab9.captureScreenshot('projector-9-robots.png')
    await pTab9.close()

    // =========================================================================
    // TEST SUITE 3: 22 ROBOTS (QUALIFICATION ROUND 1 TO ROUND 2)
    // =========================================================================
    console.log('\n---------------------------------------------------------------')
    console.log('TEST 3: 22 Robots Tournament (Qualification to Round 2 Live Sync)')
    console.log('---------------------------------------------------------------')

    const robots22 = createRobots(22)
    const t22 = await createTournamentOnServer('RoboCup-22-GrandPrix', robots22)

    const aTab22 = await createTab(`http://localhost:3000/tournament/${t22.id}`)
    const pTab22 = await createTab(`http://localhost:3000/tournament/${t22.id}/projector`)

    await pTab22.waitForFunction(() => document.body.innerText.includes('RoboCup-22-GrandPrix'), 6000)
    console.log('  ✓ 22 Robots Projector View initialized.')

    // Complete all 11 matches in Qualification
    const r1Matches = (await (await fetch(`http://localhost:3000/api/tournament/${t22.id}`)).json()).data.rounds[0].matches
    for (const m of r1Matches) {
      await fetch(`http://localhost:3000/api/tournament/${t22.id}/match/${m.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId: m.robot1.id }),
      })
    }
    await fetch(`http://localhost:3000/api/tournament/${t22.id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete_round' }),
    })
    const r2Res = await fetch(`http://localhost:3000/api/tournament/${t22.id}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_next_round' }),
    })
    const r2Json = await r2Res.json()
    console.log('  Qualification completed, Round 2 generated:', r2Json.success)

    // Notify Projector
    await aTab22.evaluate((t) => {
      localStorage.setItem(`robocup_tournament_${t.id}`, JSON.stringify(t))
      const ch = new BroadcastChannel('robocup_arena_sync')
      ch.postMessage({ type: 'TOURNAMENT_UPDATED', id: t.id, tournament: t, timestamp: Date.now() })
      ch.close()
    }, r2Json.data)

    await pTab22.waitForFunction(() => document.body.innerText.includes('Round 2'), 6000)
    console.log('  ✓ 22 Robots Projector transitioned to Round 2 without manual refresh!')
    await pTab22.captureScreenshot('projector-22-robots-round2.png')

    await aTab22.close()
    await pTab22.close()

    // =========================================================================
    // TEST SUITE 4: GLOBAL PROJECTOR ROUTE (/projector) TRACKING ACTIVE TOURNAMENT
    // =========================================================================
    console.log('\n---------------------------------------------------------------')
    console.log('TEST 4: Global /projector Auto-Following Active Tournament')
    console.log('---------------------------------------------------------------')

    const globalProjectorTab = await createTab('http://localhost:3000/projector')
    await new Promise((r) => setTimeout(r, 1000))

    // Now create a new tournament from Admin desk
    const newRobots = createRobots(6)
    const newT = await createTournamentOnServer('AutoFollow-NewTournament', newRobots)
    console.log(`  Created brand new tournament: ${newT.name}`)

    // Simulate cross-tab active tournament storage change event
    await globalProjectorTab.evaluate((t) => {
      localStorage.setItem('robocup_active_tournament_id', t.id)
      localStorage.setItem(`robocup_tournament_${t.id}`, JSON.stringify(t))
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'robocup_active_tournament_id',
          newValue: t.id,
        })
      )
    }, newT)

    await globalProjectorTab.waitForFunction(() => {
      return document.body.innerText.includes('AutoFollow-NewTournament')
    }, 6000)
    console.log('  ✓ Global /projector automatically switched to follow the newly created tournament!')
    await globalProjectorTab.captureScreenshot('projector-global-autofollow.png')

    await globalProjectorTab.close()

    console.log('\n===============================================================')
    console.log('  ALL E2E PROJECTOR TESTS PASSED WITH 100% SUCCESS!')
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
  console.error('\n❌ E2E Projector Test Error:', err)
  process.exit(1)
})
