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
  pingTimeout: 20000,     // 20s timeout gives mobile networks room to breathe
  pingInterval: 10000,    // 10s heartbeat
})

const activeStreamerIds = new Set()
let lastFrameTimestamp = 0
let wasMarkedOffline = false

const getCameraStatus = () => {
  const hasRecentFrames = lastFrameTimestamp > 0 && Date.now() - lastFrameTimestamp < 4500
  const online = activeStreamerIds.size > 0 && hasRecentFrames
  return { online, count: activeStreamerIds.size }
}

io.on('connection', (socket) => {
  // Immediately inform client of current camera status
  socket.emit('camera-status', getCameraStatus())

  // Allow clients to query status on-demand
  socket.on('get-camera-status', (cb) => {
    const status = getCameraStatus()
    if (typeof cb === 'function') {
      cb(status)
    } else {
      socket.emit('camera-status', status)
    }
  })

  socket.on('start-stream', (meta) => {
    socket.data.isStreamer = true
    activeStreamerIds.add(socket.id)
    lastFrameTimestamp = Date.now()
    wasMarkedOffline = false
    console.log(`[Arena Camera] Stream started by socket ${socket.id} (Active streamers: ${activeStreamerIds.size})`)
    io.emit('camera-status', { online: true, count: activeStreamerIds.size, meta })
  })

  socket.on('camera-frame', (frameData, ack) => {
    lastFrameTimestamp = Date.now()
    wasMarkedOffline = false

    if (!activeStreamerIds.has(socket.id)) {
      socket.data.isStreamer = true
      activeStreamerIds.add(socket.id)
      io.emit('camera-status', { online: true, count: activeStreamerIds.size })
    }

    // Broadcast frame to all connected projector displays using volatile (low-latency real-time video delivery)
    if (socket.broadcast.volatile) {
      socket.broadcast.volatile.emit('camera-frame', frameData)
    } else {
      socket.broadcast.emit('camera-frame', frameData)
    }

    if (typeof ack === 'function') {
      ack()
    }
  })

  socket.on('stop-stream', () => {
    activeStreamerIds.delete(socket.id)
    socket.data.isStreamer = false
    console.log(`[Arena Camera] Stream stopped by socket ${socket.id} (Active streamers: ${activeStreamerIds.size})`)
    io.emit('camera-status', getCameraStatus())
  })

  socket.on('disconnect', () => {
    if (activeStreamerIds.has(socket.id)) {
      activeStreamerIds.delete(socket.id)
      console.log(`[Arena Camera] Streamer disconnected ${socket.id} (Active streamers: ${activeStreamerIds.size})`)
      io.emit('camera-status', getCameraStatus())
    }
  })
})

// Stale frame watchdog: notifies displays if frames pause without wiping streamer registrations
setInterval(() => {
  if (activeStreamerIds.size > 0 && Date.now() - lastFrameTimestamp > 4000) {
    if (!wasMarkedOffline) {
      wasMarkedOffline = true
      io.emit('camera-status', { online: false, count: activeStreamerIds.size, reason: 'timeout' })
    }
  } else if (activeStreamerIds.size > 0 && Date.now() - lastFrameTimestamp <= 4000) {
    if (wasMarkedOffline) {
      wasMarkedOffline = false
      io.emit('camera-status', { online: true, count: activeStreamerIds.size })
    }
  }
}, 1500)

server.listen(port, hostname, () => {
  console.log(`[RoboCup Server] Ready on http://${hostname}:${port}`)
  console.log(`[RoboCup Server] Socket.io video relay listening on port ${port}`)
})
