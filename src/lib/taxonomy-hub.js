import { normalizeTeamSlug, productMatchesTaxonomy } from './league-taxonomy.js'

const weight = row => Math.max(1, Number(row?.count) || 1)

/** Counts are built from the compact published navigation index, not one page of cards. */
export function taxonomyHubCounts(rows = [], { league = '', team = '' } = {}) {
  const teams = new Map()
  const groups = new Map()
  let total = 0
  for (const row of rows) {
    if (!productMatchesTaxonomy(row, { league })) continue
    const rowTeam = normalizeTeamSlug(row?.taxonomy?.league || league, row?.taxonomy?.team || '')
    const count = weight(row)
    if (rowTeam) teams.set(rowTeam, (teams.get(rowTeam) || 0) + count)
    if (team && rowTeam !== normalizeTeamSlug(league, team)) continue
    total += count
    const group = String(row?.productGroup || row?.product_group || '').trim()
    if (group) groups.set(group, (groups.get(group) || 0) + count)
  }
  return {
    total,
    teams,
    groups:[...groups].map(([name,count]) => ({ name,count })).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name))
  }
}
