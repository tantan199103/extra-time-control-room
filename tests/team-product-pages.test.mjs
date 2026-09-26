import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCatalogPagePath } from '../src/lib/catalog-pagination.js'
import { TEAM_PRODUCT_PAGE_MIN_PRODUCTS, productMatchesTeamProductType, teamProductTypeByHandle, teamProductTypeCounts, teamProductTypePath } from '../src/lib/team-product-pages.js'

const product = (id, group = 'Football Jersey') => ({
  id, title:`Dallas Cowboys ${group}`, productGroup:group,
  taxonomy:{ league:'nfl', team:'dallas-cowboys', sport:'football' }
})

test('team product type routes are controlled and support path pagination', () => {
  assert.equal(teamProductTypeByHandle('jerseys').label,'Jerseys')
  assert.equal(teamProductTypeByHandle('unknown'),null)
  assert.equal(teamProductTypePath('nfl','dallas-cowboys','jerseys'),'/team/nfl/dallas-cowboys/jerseys')
  assert.deepEqual(parseCatalogPagePath('/team/nfl/dallas-cowboys/jerseys/page/2'),{
    basePath:'/team/nfl/dallas-cowboys/jerseys',page:2,paginated:true
  })
})

test('team product type matching keeps product families distinct', () => {
  assert.equal(productMatchesTeamProductType(product('j1'),'jerseys'),true)
  assert.equal(productMatchesTeamProductType(product('c1','Caps'),'caps'),true)
  assert.equal(productMatchesTeamProductType(product('c2','Caps'),'jerseys'),false)
})

test('team product landing pages require six valid products', () => {
  const rows = Array.from({length:TEAM_PRODUCT_PAGE_MIN_PRODUCTS},(_,index) => product(`j${index}`))
  rows.push({ ...product('wrong'), taxonomy:{league:'nhl',team:'dallas-stars',sport:'hockey'} })
  const pages = teamProductTypeCounts(rows,{league:'nfl',team:'dallas-cowboys'})
  assert.deepEqual(pages.map(page => [page.handle,page.count]),[['jerseys',6]])
  assert.equal(teamProductTypeCounts(rows.slice(0,5),{league:'nfl',team:'dallas-cowboys'}).length,0)
})

test('team product counts understand compact navigation rows', () => {
  const pages = teamProductTypeCounts([{ ...product('aggregate'), count:6 }], { league:'nfl', team:'dallas-cowboys' })
  assert.equal(pages[0].handle,'jerseys')
  assert.equal(pages[0].count,6)
})
