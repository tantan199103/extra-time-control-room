import { json, options, proxyToNode, withError } from '../_shared/http.ts'

// Checkout quote remains a signed, payment-adjacent operation.  The Edge
// Function is the public Supabase entry point, while the Node runtime owns the
// shared signing and inventory code. This keeps one source of truth during the
// migration and avoids divergent prices between runtimes.
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return options(request)
  if (request.method !== 'POST') return json(request, { error: 'POST checkout quote requests only.' }, 405)
  try { return await proxyToNode(request, '/api/checkout-quote') }
  catch (error) { return withError(request, error, 'Checkout quote could not be calculated.') }
})
