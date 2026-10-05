import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * RoboCup Arena Security Middleware
 *
 * Enforces Read-Only audience experience over public Cloudflare Tunnels:
 * - Redirects root (/) to (/projector) for public visitors
 * - Blocks admin write mutations (POST/PUT/DELETE/PATCH) coming through public tunnels
 * - Preserves full Admin desk access on Local (localhost) and LAN (192.168.x.x)
 */
export function middleware(request: NextRequest) {
  const host = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    ''
  ).toLowerCase()
  const isPublicTunnel = host.includes('trycloudflare.com') || request.headers.has('cf-ray')

  if (isPublicTunnel) {
    const { pathname } = request.nextUrl

    // 1. Redirect public visitors from root to the live projector
    if (pathname === '/' || pathname === '') {
      const url = request.nextUrl.clone()
      url.pathname = '/projector'
      return NextResponse.redirect(url)
    }

    // 2. Redirect /tournament/[id] (Admin view) to projector view
    if (pathname.startsWith('/tournament/') && !pathname.endsWith('/projector')) {
      const url = request.nextUrl.clone()
      url.pathname = `${pathname}/projector`
      return NextResponse.redirect(url)
    }

    // 3. Block write/mutate operations on API through public tunnel
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      if (pathname.startsWith('/api/tournament')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: Tournament admin operations are restricted to the local arena host machine.',
          },
          { status: 403 }
        )
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, fonts
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
