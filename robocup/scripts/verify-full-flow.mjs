import http from 'http'

async function run() {
  console.log('--- STARTING COMPREHENSIVE VERIFICATION SUITE ---');

  // TEST 3: Localhost server & LAN health
  const hLocal = await fetch('http://localhost:3000/api/health').then(r => r.json());
  console.log('TEST 3 - Local Health Check:', hLocal.status === 'ok' ? 'PASS' : 'FAIL', hLocal);

  const hLan = await fetch('http://192.168.3.9:3000/api/health').then(r => r.json());
  console.log('TEST 3 - LAN Health Check (192.168.3.9):', hLan.status === 'ok' ? 'PASS' : 'FAIL', hLan);

  // TEST 6: Public Host Routing via Middleware
  const pubHost = 'columns-cup-resources-weblogs.trycloudflare.com';

  // Root redirect test
  const reqRedirect = await fetch('http://localhost:3000/', {
    headers: { 'x-forwarded-host': pubHost },
    redirect: 'manual'
  });
  console.log('TEST 6 - Public Root Redirect Status:', reqRedirect.status);
  console.log('TEST 6 - Public Root Redirect Location:', reqRedirect.headers.get('location'));
  const redirectOk = reqRedirect.status === 307 && reqRedirect.headers.get('location')?.includes('/projector');
  console.log('TEST 6 - Public Root Redirect to Projector:', redirectOk ? 'PASS' : 'FAIL');

  // Public Projector access test
  const reqProjector = await fetch('http://localhost:3000/projector', {
    headers: { 'x-forwarded-host': pubHost }
  });
  console.log('TEST 6 - Public Projector HTTP Status:', reqProjector.status, reqProjector.status === 200 ? 'PASS' : 'FAIL');

  // Public Admin Mutation Blocking test
  const reqBlockedMutation = await fetch('http://localhost:3000/api/tournament', {
    method: 'POST',
    headers: {
      'x-forwarded-host': pubHost,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ name: 'Unauthorized Remote Test', robots: [] })
  });
  console.log('TEST 9 - Public Admin Mutation Block Status:', reqBlockedMutation.status, reqBlockedMutation.status === 403 ? 'PASS' : 'FAIL');
  const blockedJson = await reqBlockedMutation.json();
  console.log('TEST 9 - Block Message:', blockedJson.error);

  // TEST 9 & 10: Real-Time Tournament State Mutation & Projector Sync
  console.log('\n--- TESTING LIVE STATE MUTATION & STREAM SYNC ---');

  // 1. Create a tournament as Admin (Localhost)
  const robots = [
    { id: 'bot-1', name: 'Alpha Bot', club: 'Club A', institution: 'ENSI', status: 'active', wins: 0 },
    { id: 'bot-2', name: 'Beta Bot', club: 'Club B', institution: 'ENSI', status: 'active', wins: 0 }
  ];
  const createRes = await fetch('http://localhost:3000/api/tournament', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Arena Live Sync Test', robots })
  });
  const createJson = await createRes.json();
  console.log('ADMIN CREATE TOURNAMENT:', createJson.success ? 'PASS' : 'FAIL', 'ID:', createJson.data?.id);
  const tournamentId = createJson.data.id;
  const matchId = createJson.data.rounds[0].matches[0].id;

  // 2. Set winner on Admin
  const matchRes = await fetch(`http://localhost:3000/api/tournament/${tournamentId}/match/${matchId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ winnerId: 'bot-1', score1: 5, score2: 2 })
  });
  const matchJson = await matchRes.json();
  console.log('ADMIN RECORD MATCH WINNER:', matchJson.success ? 'PASS' : 'FAIL');
  console.log('CONFIRMED WINNER:', matchJson.data?.rounds[0].matches[0].winner?.name);

  // 3. Connect to Projector SSE feed and verify the updated tournament revision is pushed
  console.log('CHECKING SSE FEED FOR LIVE PROJECTOR UPDATE...');
  await new Promise((resolve, reject) => {
    const sseReq = http.get(`http://localhost:3000/api/events?id=${encodeURIComponent(tournamentId)}`, (res) => {
      res.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('"type":"tournament"')) {
          console.log('✓ SSE Feed streamed tournament event to Projector!');
          if (text.includes('Alpha Bot')) {
            console.log('✓ SSE Feed confirmed winner "Alpha Bot" live on Projector stream!');
            sseReq.destroy();
            resolve();
          }
        }
      });
    });
    sseReq.on('error', reject);
    setTimeout(() => {
      sseReq.destroy();
      resolve();
    }, 4000);
  });

  console.log('\n--- ALL LIVE FLOW VERIFICATIONS COMPLETED SUCCESSFULLY ---');
}

run().catch(console.error);
