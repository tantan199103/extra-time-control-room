import {
  ACCESSORY_FAMILY_OPTIONS,
  ACCESSORY_TYPE_OPTIONS,
  CATALOG_CATEGORY_PAGES,
  productMatchesCatalogCategory
} from './catalog-taxonomy.js'
import { LEAGUE_TAXONOMY, leaguePath, normalizeTeamSlug, teamPath, taxonomySlug } from './league-taxonomy.js'
import { TEAM_PRODUCT_PAGE_MIN_PRODUCTS, teamProductTypeCounts, teamProductTypeForProduct } from './team-product-pages.js'

const routeStatus = count => count >= TEAM_PRODUCT_PAGE_MIN_PRODUCTS ? 'INDEXABLE' : 'NOINDEX'
const rowWeight = row => Math.max(1, Number(row?.count) || 1)

function rowLeague(row = {}) {
  return taxonomySlug(row.taxonomy?.league || row.league || row.leagueKey)
}

function rowTeam(row = {}) {
  const league = rowLeague(row)
  return normalizeTeamSlug(league, row.taxonomy?.team || row.team || row.teamSlug)
}

function countRows(rows = []) {
  return rows.reduce((sum, row) => sum + rowWeight(row), 0)
}

function categoryCount(rows, category) {
  return rows.reduce((sum, row) => sum + (productMatchesCatalogCategory(row, category) ? rowWeight(row) : 0), 0)
}

function pageNode({ id, name, path, kind, count = 0, hero = '', icon = '', description = '', children = [] }) {
  return {
    id,
    name,
    handle:path?.split('/').filter(Boolean).at(-1) || id,
    path,
    pageKind:kind,
    count,
    publishedCount:count,
    hero,
    icon,
    description,
    status:routeStatus(count),
    generated:true,
    children
  }
}

function categoryNode(rows, category, children = []) {
  const count = categoryCount(rows, category)
  return pageNode({
    id:`catalog:category:${category.handle}`,
    name:category.label,
    path:`/category/${category.handle}`,
    kind:category.level === 'type' ? 'Accessory type' : category.level === 'family' ? 'Accessory family' : 'Product category',
    count,
    icon:category.icon || 'all',
    description:category.description,
    children
  })
}

/**
 * Build the Admin read model for every deterministic catalogue landing page.
 * Rows may be one product each or compact build-time navigation rows carrying
 * a `count`; this keeps Admin totals aligned with the deploy artefact without
 * downloading the complete public catalogue again.
 */
export function buildCatalogPageTree(rows = []) {
  const source = Array.isArray(rows) ? rows.filter(Boolean) : []
  const leagueNodes = LEAGUE_TAXONOMY.map(league => {
    const leagueRows = source.filter(row => rowLeague(row) === league.key)
    const teamNodes = league.teams.map(team => {
      const teamRows = leagueRows.filter(row => rowTeam(row) === team.slug)
      const count = countRows(teamRows)
      const typeNodes = teamProductTypeCounts(teamRows, { league:league.key, team:team.slug }).map(type => pageNode({
        id:`catalog:team-type:${league.key}:${team.slug}:${type.handle}`,
        name:type.label,
        path:type.path,
        kind:'Team product type',
        count:type.count,
        icon:type.handle === 'jerseys' ? 'jersey' : type.handle === 'caps' ? 'cap' : type.handle === 'knit-hats' ? 'beanie' : type.handle,
        description:type.description
      }))
      return pageNode({
        id:`catalog:team:${league.key}:${team.slug}`,
        name:team.name,
        path:teamPath(league.key, team),
        kind:'Team page',
        count,
        hero:team.media?.src || '',
        icon:'gear',
        description:`Generated from published ${team.name} listing taxonomy.`,
        children:typeNodes
      })
    })
    const count = countRows(leagueRows)
    return pageNode({
      id:`catalog:league:${league.key}`,
      name:league.name,
      path:leaguePath(league),
      kind:'League page',
      count,
      hero:league.media?.src || '',
      icon:'gear',
      description:league.description,
      children:teamNodes
    })
  }).filter(node => node.count > 0)

  const accessories = CATALOG_CATEGORY_PAGES.find(category => category.handle === 'accessories')
  const accessoryFamilies = ACCESSORY_FAMILY_OPTIONS.map(family => {
    const typeNodes = ACCESSORY_TYPE_OPTIONS
      .filter(type => type.family === family.value && type.handle !== family.handle)
      .map(type => categoryNode(source, {
        ...type,
        value:type.value,
        accessoryFamily:type.family,
        accessoryType:type.value,
        level:'type',
        description:`Shop ${type.label.toLowerCase()} for game day and everyday fan life.`
      }))
    return categoryNode(source, {
      ...family,
      value:family.value,
      accessoryFamily:family.value,
      level:'family'
    }, typeNodes)
  })
  const primaryCategories = CATALOG_CATEGORY_PAGES
    .filter(category => !['accessories','caps','knit-hats'].includes(category.handle))
    .map(category => categoryNode(source, category))
  const accessoryNode = categoryNode(source, accessories, accessoryFamilies)
  const categoryNodes = [...primaryCategories, accessoryNode].filter(node => node.count > 0 || node.children.some(child => child.count > 0))

  return [
    {
      id:'catalog:root:leagues', name:'Leagues & teams', handle:'sports', path:'/sports', pageKind:'Page group',
      count:countRows(source.filter(row => rowLeague(row))), publishedCount:countRows(source.filter(row => rowLeague(row))),
      status:'SYSTEM', generated:true, icon:'gear', description:'League, team and qualified team product-type pages.', children:leagueNodes
    },
    {
      id:'catalog:root:categories', name:'Products & accessories', handle:'shop', path:'/shop', pageKind:'Page group',
      count:countRows(source), publishedCount:countRows(source), status:'SYSTEM', generated:true, icon:'all',
      description:'Product categories and the complete Accessories family/type structure.', children:categoryNodes
    }
  ]
}

export function flattenCatalogPageTree(nodes = [], output = []) {
  for (const node of nodes || []) {
    output.push(node)
    flattenCatalogPageTree(node.children, output)
  }
  return output
}

export function catalogPageTreeStats(nodes = []) {
  const pages = flattenCatalogPageTree(nodes, []).filter(node => node.path)
  const countKind = kind => pages.filter(node => node.pageKind === kind).length
  return {
    total:pages.length,
    indexable:pages.filter(node => node.status === 'INDEXABLE' || node.status === 'SYSTEM').length,
    noindex:pages.filter(node => node.status === 'NOINDEX').length,
    leagues:countKind('League page'),
    teams:countKind('Team page'),
    productTypes:countKind('Team product type'),
    categories:pages.filter(node => /category|accessory/i.test(node.pageKind)).length
  }
}

/** Match a local fallback product to the same route rules used by Supabase. */
export function productMatchesCatalogPage(product = {}, path = '') {
  const parts = String(path || '').split('/').filter(Boolean)
  if (!parts.length || parts[0] === 'shop' || parts[0] === 'sports') return true
  const league = rowLeague(product)
  const team = rowTeam(product)
  if (parts[0] === 'league') return league === taxonomySlug(parts[1])
  if (parts[0] === 'team') {
    if (league !== taxonomySlug(parts[1]) || team !== normalizeTeamSlug(parts[1], parts[2])) return false
    if (!parts[3]) return true
    return teamProductTypeForProduct(product)?.handle === parts[3]
  }
  if (parts[0] === 'category') {
    const category = [...CATALOG_CATEGORY_PAGES, ...ACCESSORY_FAMILY_OPTIONS.map(item => ({ ...item, accessoryFamily:item.value })), ...ACCESSORY_TYPE_OPTIONS.map(item => ({ ...item, accessoryFamily:item.family, accessoryType:item.value }))]
      .find(item => item.handle === parts[1])
    return Boolean(category && productMatchesCatalogCategory(product, category))
  }
  return true
}
