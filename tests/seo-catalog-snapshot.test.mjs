import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchPublishedProductRows } from '../scripts/seo-catalog-snapshot.mjs'

const ok = data => ({
  ok:true,
  status:200,
  json:async () => data,
  text:async () => JSON.stringify(data)
})

function catalogueFetch({ ids, verificationIds = ids, missingDetailId = '' }) {
  let indexPass = 0
  return async input => {
    const url = new URL(input)
    const select = url.searchParams.get('select') || ''
    const filters = url.searchParams.getAll('id')
    const limit = Number(url.searchParams.get('limit') || 1000)
    if (select === 'id') {
      const cursor = filters.find(value => value.startsWith('gt.'))?.slice(3) || ''
      if (!cursor) indexPass += 1
      const source = indexPass > 1 ? verificationIds : ids
      return ok(source.filter(id => !cursor || id > cursor).slice(0, limit).map(id => ({ id })))
    }
    const first = filters.find(value => value.startsWith('gte.'))?.slice(4) || ''
    const last = filters.find(value => value.startsWith('lte.'))?.slice(4) || ''
    const cursor = filters.find(value => value.startsWith('gt.'))?.slice(3) || ''
    const rows = ids
      .filter(id => (!first || id >= first) && (!last || id <= last) && (!cursor || id > cursor) && id !== missingDetailId)
      .slice(0, limit)
      .map(id => ({ id, title:`Product ${id}` }))
    return ok(rows)
  }
}

test('SEO catalogue snapshot hydrates bounded ranges concurrently and preserves every id', async () => {
  const ids = ['a','b','c','d','e']
  const progress = []
  const rows = await fetchPublishedProductRows({
    base:'https://catalog.example.test',
    key:'test-key',
    select:'id,title',
    detailPageSize:2,
    indexPageSize:2,
    concurrency:2,
    fetchImpl:catalogueFetch({ ids }),
    onProgress:event => progress.push(event.loaded)
  })
  assert.deepEqual(rows.map(row => row.id), ids)
  assert.equal(progress[0], 0)
  assert.equal(progress.at(-1), ids.length)
})

test('SEO catalogue snapshot fails closed when a detail range is incomplete', async () => {
  const ids = ['a','b','c']
  await assert.rejects(
    fetchPublishedProductRows({
      base:'https://catalog.example.test',
      key:'test-key',
      select:'id,title',
      detailPageSize:2,
      indexPageSize:2,
      concurrency:2,
      fetchImpl:catalogueFetch({ ids, missingDetailId:'b' })
    }),
    /product detail 1\/2 changed during the snapshot/
  )
})

test('SEO catalogue snapshot fails closed when publication changes during hydration', async () => {
  const ids = ['a','b','c']
  await assert.rejects(
    fetchPublishedProductRows({
      base:'https://catalog.example.test',
      key:'test-key',
      select:'id,title',
      detailPageSize:2,
      indexPageSize:2,
      concurrency:2,
      fetchImpl:catalogueFetch({ ids, verificationIds:[...ids,'d'] })
    }),
    /published catalogue changed during the snapshot/
  )
})
