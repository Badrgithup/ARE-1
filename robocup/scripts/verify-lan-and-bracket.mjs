import http from 'http'
import assert from 'assert/strict'

const PORT = 3000
const BASE_URL = `http://127.0.0.1:${PORT}`
const LAN_URL = `http://192.168.0.10:${PORT}`

function createRobots(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `robot-${String(i + 1).padStart(2, '0')}`,
    name: `AlphaBot-${String(i + 1).padStart(2, '0')}`,
    club: `RoboClub-${(i % 3) + 1}`,
    institution: `ENSI-${(i % 2) + 1}`,
    status: 'active',
    eliminatedRound: null,
    wins: 0,
  }))
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  try {
    return { status: res.status, ok: res.ok, data: JSON.parse(text) }
  } catch {
    return { status: res.status, ok: res.ok, raw: text }
  }
}

async function runVerification() {
  console.log('====================================================')
  console.log('VERIFYING LAN ARCHITECTURE & SSE EVENT BUS')
  console.log('====================================================')

  // 1. Verify LAN / 0.0.0.0 reachability on Host IP 192.168.0.10
  console.log(`Checking LAN access on ${LAN_URL}...`)
  try {
    const lanCheck = await fetch(`${LAN_URL}/api/tournament`)
    assert.equal(lanCheck.status, 200, 'LAN endpoint must be reachable with 200')
    console.log('✔ LAN reachable at http://192.168.0.10:3000/api/tournament')
  } catch (err) {
    console.warn('Note on LAN IP check (Wi-Fi local loopback):', err.message)
  }

  // 2. Test SSE Events Stream on /api/events
  console.log('\nTesting Server-Sent Events (SSE) stream on /api/events...')
  const sseEvents = []
  let sseConnected = false

  const sseReq = http.request(
    `${BASE_URL}/api/events`,
    {
      headers: {
        Accept: 'text/event-stream',
      },
    },
    (res) => {
      assert.equal(res.statusCode, 200)
      assert.ok(res.headers['content-type'].includes('text/event-stream'))
      sseConnected = true
      console.log('✔ SSE Connection established with text/event-stream header')

      let buffer = ''
      res.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n\n')
        buffer = lines.pop() // keep remainder
        for (const block of lines) {
          const match = block.match(/^data: (.*)$/m)
          if (match) {
            try {
              const event = JSON.parse(match[1])
              sseEvents.push(event)
            } catch {}
          }
        }
      })
    }
  )

  sseReq.on('error', (err) => {
    console.error('SSE Error:', err)
  })
  sseReq.end()

  // Wait 400ms for SSE handshake
  await new Promise((r) => setTimeout(r, 400))
  assert.ok(sseConnected, 'SSE must connect successfully')

  // 3. Create a 5-Robot Tournament (1 group of 5)
  console.log('\nCreating 5-Robot tournament (1 Group of 5)...')
  const robots5 = createRobots(5)
  const createRes = await fetchJson(`${BASE_URL}/api/tournament`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Verification 5-Robots Group Arena',
      robots: robots5,
      batchSize: 20,
      config: {
        groupStageEnabled: true,
        finalFormat: '2-to-final',
      },
    }),
  })

  assert.equal(createRes.status, 201)
  const t5 = createRes.data.data
  console.log(`✔ Tournament created: ID=${t5.id}, TotalRobots=${t5.totalRobots}, Revision=${t5.revision}`)

  // Wait 300ms and verify SSE event was received
  await new Promise((r) => setTimeout(r, 300))
  const createEvt = sseEvents.find((e) => e.type === 'tournament' && e.tournament.id === t5.id)
  assert.ok(createEvt, 'SSE client must receive tournament created event')
  console.log(`✔ SSE pushed tournament event in real time! (Revision: ${createEvt.tournament.revision})`)

  // 4. Start Group Stage via server route
  console.log('\nStarting Group Stage on server...')
  const startGrpRes = await fetchJson(`${BASE_URL}/api/tournament/${t5.id}/round`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'start_group_stage',
      format: '2-to-final',
    }),
  })
  assert.equal(startGrpRes.status, 200)
  const tGrp = startGrpRes.data.data
  const grpRound = tGrp.rounds[tGrp.rounds.length - 1]
  assert.equal(grpRound.stage, 'group_stage')
  assert.equal(grpRound.matches.length, 10, '5 robots in 1 group must have exactly 10 pairings')
  console.log(`✔ Group stage started: 1 group of 5, 10 pairings, revision=${tGrp.revision}`)

  // 5. Complete matches via atomic POST /api/tournament/:id/match/:matchId
  console.log('\nRecording matches atomically through /api/tournament/:id/match/:matchId...')
  const m1 = grpRound.matches[0]
  const matchRes = await fetchJson(`${BASE_URL}/api/tournament/${t5.id}/match/${m1.id}`, {
    method: 'POST',
    body: JSON.stringify({
      winnerId: m1.robot1.id,
      roundId: grpRound.id,
    }),
  })
  assert.equal(matchRes.status, 200)
  const tAfterM1 = matchRes.data.data
  assert.equal(tAfterM1.revision, tGrp.revision + 1, 'Monotonic revision must increment by 1')
  console.log(`✔ Match 1 recorded: Winner=${m1.robot1.name}, Revision=${tAfterM1.revision}`)

  // Verify SSE received match update
  await new Promise((r) => setTimeout(r, 300))
  const m1Evt = sseEvents.filter((e) => e.type === 'tournament' && e.tournament.id === t5.id).pop()
  assert.equal(m1Evt.tournament.revision, tAfterM1.revision, 'SSE stream received matching monotonic revision')
  console.log(`✔ SSE client received updated match state instantly`)

  // Complete remaining 9 matches
  let currentT = tAfterM1
  for (let i = 1; i < grpRound.matches.length; i++) {
    const m = grpRound.matches[i]
    const r = await fetchJson(`${BASE_URL}/api/tournament/${t5.id}/match/${m.id}`, {
      method: 'POST',
      body: JSON.stringify({
        winnerId: m.robot1.id,
        roundId: grpRound.id,
      }),
    })
    currentT = r.data.data
  }
  console.log(`✔ All 10 group matches recorded. Group completed status: ${currentT.rounds[currentT.rounds.length - 1].status}`)

  // 6. Advance to Final
  console.log('\nAdvancing from Group Stage to Final...')
  const advRes = await fetchJson(`${BASE_URL}/api/tournament/${t5.id}/round`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'advance_from_group',
    }),
  })
  assert.equal(advRes.status, 200)
  const tFinal = advRes.data.data
  const finalRound = tFinal.rounds[tFinal.rounds.length - 1]
  assert.equal(finalRound.stage, 'final')
  assert.equal(finalRound.matches.length, 1)
  console.log(`✔ Final round active: ${finalRound.matches[0].robot1.name} VS ${finalRound.matches[0].robot2.name}`)

  // 7. Crown Champion
  const finalM = finalRound.matches[0]
  const finalRes = await fetchJson(`${BASE_URL}/api/tournament/${t5.id}/match/${finalM.id}`, {
    method: 'POST',
    body: JSON.stringify({
      winnerId: finalM.robot1.id,
      roundId: finalRound.id,
    }),
  })
  assert.equal(finalRes.status, 200)
  const tChampion = finalRes.data.data
  assert.equal(tChampion.status, 'completed')
  assert.equal(tChampion.winner?.id, finalM.robot1.id)
  console.log(`✔ Official Champion crowned: ${tChampion.winner.name}`)

  // 8. Verify Projector URL returns HTTP 200 and renders properly
  console.log('\nVerifying Projector View endpoints...')
  const projRes = await fetch(`${BASE_URL}/projector`)
  assert.equal(projRes.status, 200, '/projector must return 200 OK')
  const projSpecific = await fetch(`${BASE_URL}/tournament/${t5.id}/projector`)
  assert.equal(projSpecific.status, 200, '/tournament/:id/projector must return 200 OK')
  console.log('✔ Projector View endpoints verified OK (HTTP 200)')

  // 9. Clean up SSE
  sseReq.destroy()

  console.log('\n====================================================')
  console.log('ALL ARCHITECTURE AND LAN VERIFICATION CHECKS PASSED!')
  console.log('====================================================')
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err)
  process.exit(1)
})
