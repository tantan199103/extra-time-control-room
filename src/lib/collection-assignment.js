const updateMembers = (collection, productIds) => ({
  ...collection,
  products:productIds,
  productLinks:productIds.map((productId, sortOrder) => ({
    productId,
    sortOrder,
    featured:sortOrder === 0
  })),
  count:productIds.length
})

/** Change collection membership without deleting or unpublishing the listing. */
export function changeCollectionMembership(collections, productId, sourceId, destinationId = '') {
  const source = collections.find(row => row.id === sourceId)
  const destination = destinationId ? collections.find(row => row.id === destinationId) : null
  if (!source || destinationId && !destination) throw new Error('Choose an existing collection.')
  if (sourceId === destinationId) return { collections, changedIds:[] }
  const sourceMembers = source.products || []
  const destinationMembers = destination?.products || []
  if (!sourceMembers.includes(productId) && !destination) return { collections, changedIds:[] }
  const changedIds = []
  const next = collections.map(row => {
    if (row.id === sourceId && sourceMembers.includes(productId)) {
      changedIds.push(row.id)
      return updateMembers(row, sourceMembers.filter(id => id !== productId))
    }
    if (destination && row.id === destinationId && !destinationMembers.includes(productId)) {
      changedIds.push(row.id)
      return updateMembers(row, [...destinationMembers, productId])
    }
    return row
  })
  return { collections:next, changedIds }
}

export function addToCollection(collections, productId, collectionId) {
  const target = collections.find(row => row.id === collectionId)
  if (!target) throw new Error('Choose an existing collection.')
  if ((target.products || []).includes(productId)) return { collections, changedIds:[] }
  return {
    collections:collections.map(row => row.id === collectionId ? updateMembers(row,[...(row.products || []),productId]) : row),
    changedIds:[collectionId]
  }
}

export function applyCollectionMembership(collections, productIds, action, collectionId = '') {
  const ids = new Set((productIds || []).map(String))
  const target = collectionId ? collections.find(row => row.id === collectionId) : null
  if (!target) throw new Error('Choose an existing collection.')
  const changed = new Set()
  const next = collections.map(row => {
    let members = [...(row.products || [])]
    const before = members.join('|')
    if (action === 'MOVE_COLLECTION' && row.id !== collectionId || action === 'REMOVE_FROM_COLLECTION' && row.id === collectionId) members = members.filter(id => !ids.has(String(id)))
    if (action === 'ADD_TO_COLLECTION' && row.id === collectionId) members = [...members, ...[...ids].filter(id => !members.includes(id))]
    if (action === 'MOVE_COLLECTION' && row.id === collectionId) members = [...members, ...[...ids].filter(id => !members.includes(id))]
    if (members.join('|') !== before) changed.add(row.id)
    return members.join('|') === before ? row : updateMembers(row, members)
  })
  return { collections:next, changedIds:[...changed] }
}

export function collectionMembershipDiff(changedCollections, originalCollections) {
  const originals = new Map(originalCollections.map(row => [row.id,row]))
  const additions = []
  const removals = []
  for (const row of changedCollections) {
    const before = new Set(originals.get(row.id)?.products || [])
    const after = new Set(row.products || [])
    if (after.size !== (row.products || []).length) throw new Error(`${row.name}: duplicate listing assignment.`)
    for (const id of after) if (!before.has(id)) additions.push({collection_id:row.id,product_id:id,sort_order:(row.products || []).indexOf(id),featured:(row.products || []).indexOf(id) === 0})
    for (const id of before) if (!after.has(id)) removals.push({collectionId:row.id,productId:id})
  }
  return { additions, removals }
}
