import test from 'node:test'
import assert from 'node:assert/strict'
import { planTaassBrandTitle } from '../scripts/clean-taass-brand-titles.mjs'

test('TAASS title cleanup removes only the manufacturer and preserves SEO metadata', () => {
  const row = {
    id:'listing-one', title:'Brooklyn Nets New Era 59FIFTY Fitted NBA Cap',
    taxonomy:{ league:'nba', team:'brooklyn-nets', brand:'New Era' },
    product_group:'Caps', status:'PUBLISHED', seo_status:'INDEXABLE',
    seo:{ title:'Brooklyn Nets New Era 59FIFTY Fitted NBA Cap | Jersevo', status:'INDEXABLE', gmc:{ brand:'New Era' } }
  }
  const plan = planTaassBrandTitle(row)
  assert.equal(plan.after, 'Brooklyn Nets 59FIFTY Fitted NBA Cap')
  assert.equal(plan.seoAfter, 'Brooklyn Nets 59FIFTY Fitted NBA Cap | Jersevo')
  assert.equal(plan.titleChanged, true)
  assert.equal(plan.seoTitleChanged, true)
  assert.equal(row.seo.gmc.brand, 'New Era')
})

test('unrelated team and player names stay unchanged', () => {
  assert.equal(planTaassBrandTitle({ title:'New York Jets NFL Cap', taxonomy:{ brand:'New Era' }, seo:{} }).titleChanged, false)
  assert.equal(planTaassBrandTitle({ title:'Michael Jordan Chicago Bulls NBA Figure', taxonomy:{ brand:'Jordan' }, seo:{} }).after, 'Michael Jordan Chicago Bulls NBA Figure')
})
