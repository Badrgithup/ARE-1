import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9222
const TEMP_USER_DATA = path.join(process.cwd(), '.chrome-e2e-profile')

async function run() {
  console.log('Starting Chrome headless...')
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--remote-allow-origins=*',
    `--user-data-dir=${TEMP_USER_DATA}`,
    'about:blank',
  ], { stdio: 'ignore' })

  // Wait for debug port
  let versionData = null
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
      versionData = await res.json()
      break
    } catch {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  if (!versionData) {
    chromeProcess.kill()
    throw new Error('Failed to connect to Chrome CDP')
  }

  console.log('Connected to Chrome:', versionData.Browser)

  // Create a new tab
  const newTabRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://localhost:3000/history`, { method: 'PUT' })
  const tabData = await newTabRes.json()
  console.log('Opened tab:', tabData.id, tabData.url)

  const ws = new WebSocket(tabData.webSocketDebuggerUrl)
  await new Promise((resolve) => ws.onopen = resolve)

  let idCounter = 1
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++
      const handler = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === id) {
          ws.removeEventListener('message', handler)
          if (msg.error) reject(msg.error)
          else resolve(msg.result)
        }
      }
      ws.addEventListener('message', handler)
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  await send('Page.enable')
  await send('Runtime.enable')

  // Wait 1.5s for page to render
  await new Promise(r => setTimeout(r, 1500))

  const evalRes = await send('Runtime.evaluate', {
    expression: 'document.title'
  })
  console.log('Evaluated document.title:', evalRes.result?.value)

  ws.close()
  chromeProcess.kill()
  console.log('CDP Test Success!')
}

run().catch((err) => {
  console.error('CDP test failed:', err)
  process.exit(1)
})
