const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function requestHeaders(key) {
  return { apikey:key, Authorization:`Bearer ${key}`, Accept:'application/json' }
}

/**
 * Walk a PostgREST query with keyset pagination. Existing id constraints are
 * retained, which lets the same reader hydrate a bounded id range without
 * falling back to increasingly expensive offsets.
 */
export async function fetchSeoRows(path, key, {
  pageSize = 200,
  label = 'catalogue',
  fetchImpl = fetch,
  timeoutMs = 30000
} = {}) {
  const rows = []
  const safePageSize = Math.max(1, Math.min(1000, Math.trunc(Number(pageSize) || 200)))
  let cursor = ''
  for (;;) {
    const url = new URL(path)
    url.searchParams.set('limit', String(safePageSize))
    if (cursor) url.searchParams.append('id', `gt.${cursor}`)
    let page
    let lastError
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          headers:requestHeaders(key),
          signal:AbortSignal.timeout(timeoutMs)
        })
        if (!response.ok) {
          const detail = (await response.text()).slice(0, 180)
          const error = new Error(`Supabase SEO ${label} query failed (${response.status}) after id ${cursor || '(start)'}: ${detail}`)
          if (response.status !== 429 && response.status < 500) throw error
          lastError = error
          await wait(Math.min(8000, 1000 * (attempt + 1)))
          continue
        }
        page = await response.json()
        break
      } catch (error) {
        lastError = error
        if (attempt === 3 || !/abort|fetch|network|429|5\d\d/i.test(String(error?.message || error))) throw error
        await wait(Math.min(8000, 1000 * (attempt + 1)))
      }
    }
    if (!page) throw lastError || new Error(`Supabase SEO ${label} query failed after id ${cursor || '(start)'}.`)
    if (!Array.isArray(page)) throw new Error(`Supabase SEO ${label} query did not return an array.`)
    rows.push(...page)
    if (page.length < safePageSize) return rows
    const nextCursor = String(page.at(-1)?.id || '')
    if (!nextCursor || nextCursor === cursor) throw new Error(`Supabase SEO ${label} pagination did not advance.`)
    cursor = nextCursor
  }
}

function productIndexUrl(base) {
  const url = new URL('/rest/v1/pod_products', base)
  url.searchParams.set('select', 'id')
  url.searchParams.set('status', 'eq.PUBLISHED')
  url.searchParams.set('order', 'id.asc')
  return url.toString()
}

function productRangeUrl(base, select, firstId, lastId) {
  const url = new URL('/rest/v1/pod_products', base)
  url.searchParams.set('select', select)
  url.searchParams.set('status', 'eq.PUBLISHED')
  url.searchParams.append('id', `gte.${firstId}`)
  url.searchParams.append('id', `lte.${lastId}`)
  url.searchParams.set('order', 'id.asc')
  return url.toString()
}

const idList = rows => rows.map(row => String(row?.id || '')).filter(Boolean)

function assertUniqueIds(ids, label) {
  if (new Set(ids).size !== ids.length) throw new Error(`Supabase SEO ${label} returned duplicate product IDs.`)
}

function assertSameIds(expected, actual, label) {
  const left = [...expected].sort()
  const right = [...actual].sort()
  if (left.length === right.length && left.every((value, index) => value === right[index])) return
  const expectedSet = new Set(left)
  const actualSet = new Set(right)
  const missing = left.filter(id => !actualSet.has(id)).slice(0, 3)
  const extra = right.filter(id => !expectedSet.has(id)).slice(0, 3)
  throw new Error(`Supabase SEO ${label} changed during the snapshot (expected ${left.length}, received ${right.length}; missing ${missing.join(', ') || 'none'}; extra ${extra.join(', ') || 'none'}).`)
}

/**
 * Capture a complete published catalogue without serially downloading every
 * heavy product relation. A lightweight, ordered id snapshot defines the
 * boundary; bounded workers hydrate non-overlapping ranges; a second id walk
 * proves that publication state did not change while the snapshot was built.
 */
export async function fetchPublishedProductRows({
  base,
  key,
  select,
  fetchImpl = fetch,
  detailPageSize = 200,
  indexPageSize = 1000,
  concurrency = 4,
  onProgress = null
}) {
  const indexUrl = productIndexUrl(base)
  const beforeRows = await fetchSeoRows(indexUrl, key, {
    pageSize:indexPageSize,
    label:'product index',
    fetchImpl
  })
  const ids = idList(beforeRows)
  assertUniqueIds(ids, 'product index')
  if (!ids.length) return []

  const chunkSize = Math.max(1, Math.min(500, Math.trunc(Number(detailPageSize) || 200)))
  const chunks = []
  for (let offset = 0; offset < ids.length; offset += chunkSize) chunks.push(ids.slice(offset, offset + chunkSize))
  const results = new Array(chunks.length)
  let nextChunk = 0
  let loaded = 0
  onProgress?.({ loaded:0, total:ids.length, completedChunks:0, totalChunks:chunks.length })
  const worker = async () => {
    for (;;) {
      const index = nextChunk
      nextChunk += 1
      if (index >= chunks.length) return
      const chunk = chunks[index]
      const rows = await fetchSeoRows(productRangeUrl(base, select, chunk[0], chunk.at(-1)), key, {
        // One spare row makes a stable range finish in one response while an
        // inserted row is still observable by the completeness assertion.
        pageSize:Math.min(1000, chunk.length + 1),
        label:`product detail ${index + 1}/${chunks.length}`,
        fetchImpl
      })
      assertUniqueIds(idList(rows), `product detail ${index + 1}/${chunks.length}`)
      assertSameIds(chunk, idList(rows), `product detail ${index + 1}/${chunks.length}`)
      results[index] = rows
      loaded += rows.length
      onProgress?.({ loaded, total:ids.length, completedChunks:results.filter(Boolean).length, totalChunks:chunks.length })
    }
  }
  await Promise.all(Array.from({ length:Math.min(Math.max(1,Math.trunc(Number(concurrency) || 4)),chunks.length) }, () => worker()))

  const afterRows = await fetchSeoRows(indexUrl, key, {
    pageSize:indexPageSize,
    label:'product index verification',
    fetchImpl
  })
  const afterIds = idList(afterRows)
  assertUniqueIds(afterIds, 'product index verification')
  assertSameIds(ids, afterIds, 'published catalogue')
  return results.flat()
}
