import { next } from '@vercel/functions'
import { routeIndexability } from './src/lib/route-indexability.js'

export const config = {
  matcher: [
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
