import { createServer } from 'http'
import next from 'next'
import { Server as SocketServer } from 'socket.io'

const dev = process.argv.includes('--dev') || process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

console.log(`[RoboCup Server] Initializing Next.js 15 (dev: ${dev})...`)
await app.prepare()

const server = createServer(async (req, res) => {
  try {
    await handle(req, res)
  } catch (err) {
    console.error('[RoboCup Server] Error handling request:', err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
})

// Attach Socket.io to the exact same HTTP server on port 3000
const io = new SocketServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 5e6, // 5MB buffer for video frames
  pingTimeout: 10000,
  pingInterval: 5000,
})

let activeStreamers = 0
let lastFrameTimestamp = 0

io.on('connection', (socket) => {
  // Immediately inform client of current camera status
  socket.emit('camera-status', {
    online: activeStreamers > 0 && Date.now() - lastFrameTimestamp < 5000,
    count: activeStreamers,
  })

  socket.on('start-stream', (meta) => {
    socket.data.isStreamer = true
    activeStreamers++
    lastFrameTimestamp = Date.now()
    console.log(`[Arena Camera] Stream started by socket ${socket.id} (Active streamers: ${activeStreamers})`)
    io.emit('camera-status', { online: true, count: activeStreamers, meta })
  })

  socket.on('camera-frame', (frameData) => {
    lastFrameTimestamp = Date.now()
    if (!socket.data.isStreamer) {
      socket.data.isStreamer = true
      activeStreamers = Math.max(1, activeStreamers)
    }
    // Broadcast frame to all connected projector displays
    socket.broadcast.emit('camera-frame', frameData)
  })

  socket.on('stop-stream', () => {
    if (socket.data.isStreamer) {
      socket.data.isStreamer = false
      activeStreamers = Math.max(0, activeStreamers - 1)
      console.log(`[Arena Camera] Stream stopped by socket ${socket.id} (Active streamers: ${activeStreamers})`)
      io.emit('camera-status', { online: activeStreamers > 0, count: activeStreamers })
    }
  })

  socket.on('disconnect', () => {
    if (socket.data.isStreamer) {
      activeStreamers = Math.max(0, activeStreamers - 1)
      console.log(`[Arena Camera] Streamer disconnected ${socket.id} (Active streamers: ${activeStreamers})`)
      io.emit('camera-status', { online: activeStreamers > 0, count: activeStreamers })
    }
  })
})

// Stale frame watchdog: auto-mark offline if frames cease for > 4 seconds
setInterval(() => {
  if (activeStreamers > 0 && Date.now() - lastFrameTimestamp > 4000) {
    activeStreamers = 0
    io.emit('camera-status', { online: false, count: 0, reason: 'timeout' })
  }
}, 2000)

server.listen(port, hostname, () => {
  console.log(`[RoboCup Server] Ready on http://${hostname}:${port}`)
  console.log(`[RoboCup Server] Socket.io video relay listening on port ${port}`)
})
