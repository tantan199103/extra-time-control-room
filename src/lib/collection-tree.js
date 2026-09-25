/**
 * Small, deterministic helpers for the admin collection tree. The database
 * stores the parent reference in the collection metadata so older projects
 * without a dedicated parent_id column remain readable.
 */
export function collectionParentId(collection = {}) {
  const seo = collection.seo && typeof collection.seo === 'object' ? collection.seo : {}
  const value = collection.parentId || collection.parent_id || collection.parentCollectionId || seo.parentId || seo.parent_id || ''
  const parent = String(value || '').trim()
  return parent && parent !== String(collection.id || '') ? parent : ''
}

function collectionLabel(collection = {}) {
  return String(collection.name || collection.handle || collection.id || '').trim().toLowerCase()
}

function compareCollections(a, b) {
  const order = Number(a.sortOrder ?? a.sort_order)
  const otherOrder = Number(b.sortOrder ?? b.sort_order)
  if (Number.isFinite(order) && Number.isFinite(otherOrder) && order !== otherOrder) return order - otherOrder
  return collectionLabel(a).localeCompare(collectionLabel(b)) || String(a.id || '').localeCompare(String(b.id || ''))
}

/** Build a tree without mutating the collection records supplied by Admin. */
export function buildCollectionTree(collections = []) {
  const rows = Array.isArray(collections) ? collections.filter(row => row && row.id) : []
  const byId = new Map(rows.map(row => [String(row.id), row]))
  const nodes = new Map(rows.map(row => [String(row.id), { ...row, children: [] }]))
  const roots = []

  rows.forEach(row => {
    const id = String(row.id)
    const parentId = collectionParentId(row)
    // A missing parent or a parent that would create a cycle stays at root.
    let cursor = parentId
    const seen = new Set([id])
    let validParent = Boolean(parentId && byId.has(parentId))
    while (validParent && cursor) {
      if (seen.has(cursor)) { validParent = false; break }
      seen.add(cursor)
      cursor = collectionParentId(byId.get(cursor))
    }
    if (validParent) nodes.get(parentId).children.push(nodes.get(id))
    else roots.push(nodes.get(id))
  })

  const sortTree = list => {
    list.sort(compareCollections)
    list.forEach(node => sortTree(node.children))
    return list
  }
  return sortTree(roots)
}

export function flattenCollectionTree(nodes = [], output = []) {
  ;(nodes || []).forEach(node => {
    output.push(node)
    flattenCollectionTree(node.children, output)
  })
  return output
}

export function collectionDescendantIds(collections = [], collectionId = '') {
  const target = String(collectionId || '')
  const descendants = new Set()
  const visit = parentId => {
    collections.forEach(row => {
      if (collectionParentId(row) === parentId && !descendants.has(String(row.id))) {
        descendants.add(String(row.id))
        visit(String(row.id))
      }
    })
  }
  if (target) visit(target)
  return descendants
}
