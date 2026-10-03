import { next } from '@vercel/functions'
import { routeIndexability } from './src/lib/route-indexability.js'

export const config = {
  matcher: [
    '/designer/:path*',
    '/shop/:path*',
    '/category/:path*',
    '/collection/:path*',
    '/collections/:path*',
    '/league/:path*',
    '/team/:path*',
    '/product/:path*'
  ]
}

export default function catalogIndexabilityMiddleware(request) {
  const url = new URL(request.url)

  // These provider-named routes were removed from the current public build,
  // but an older deployment/CDN object can still be addressed directly. A
  // 410 prevents the stale JSON from being served again while keeping the
  // current canonical /designer/studio and /designer/teamwear contracts live.
  if (/^\/designer\/(?:owayo|boombah)(?:\/|$)/i.test(url.pathname)) {
    return new Response(JSON.stringify({ error: 'Designer asset no longer available.' }), {
      status: 410,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    })
  }

  const decision = routeIndexability({ pathname: url.pathname, search: url.search })

  if (decision.redirectPath) {
    return new Response(null, {
      status: 308,
      headers: { Location: new URL(decision.redirectPath, url.origin).toString() }
    })
  }

  if (decision.noindex) {
    return next({
      headers: {
        'X-Robots-Tag': decision.robots,
        'X-Jersevo-Indexability': decision.reasons.join(',')
      }
    })
  }

  return next()
}
