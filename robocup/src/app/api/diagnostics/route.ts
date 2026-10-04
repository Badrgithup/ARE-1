import { NextResponse } from 'next/server'
import { getLocalDiagnostics } from '@/lib/tournament-repository'

export async function GET() {
  try {
    const diagnostics = await getLocalDiagnostics()
    return NextResponse.json({
      success: true,
      diagnostics: {
        ...diagnostics,
        platform: process.platform,
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Diagnostics check failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
