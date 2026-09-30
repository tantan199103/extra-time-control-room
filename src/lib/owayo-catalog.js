const cyclingSource = product => `https://www.owayo.com/cycling-${product}-us.htm`

const family = row => ({
  manifest:'',
  assetsReady:false,
  model:'',
  cut:'',
  designCount:0,
  sizeCount:0,
  webSport:'',
  ...row
})

const cyclingFamily = row => family({
  sport:'cycling',
  sportLabel:row.group === 'mtb' ? 'MTB' : 'Cycling',
  group:row.group || 'cycling',
  groupLabel:row.group === 'mtb' ? 'MTB' : 'Cycling',
  webSport:'radsport',
  seedDesign:row.group === 'mtb' ? 'Derny' : 'Etape',
  ...row
})

export const OWAYO_CATALOG_GROUPS = Object.freeze([
  { id:'cycling', label:'Cycling' },
  { id:'basketball', label:'Basketball' },
  { id:'hockey', label:'Hockey' },
  { id:'motocross', label:'Motocross' },
  { id:'soccer', label:'Soccer' },
  { id:'running', label:'Running' },
  { id:'mtb', label:'MTB' },
  { id:'tshirts', label:'T-Shirts' }
])

/**
 * Exact product-family discovery catalogue. A row becomes selectable only
 * after its own model, UV masks, sizes and design archives are synchronized.
 * Sport catalogues are deliberately separate from merchandising leagues:
 * a generic soccer or hockey garment is not automatically an MLS/NHL item.
 */
export const OWAYO_CATALOG_V1 = [
  cyclingFamily({ id:'cycling-c3', key:'bikejerseys', title:'Custom Cycling Jersey C3 Basic', sourceName:'Cycling Jersey C3 Basic Short Sleeve', priceUsd:85, audience:'unisex', sleeve:'short', fit:'relaxed athletic', cut:'253m', model:'253m_KA', designCount:52, sizeCount:12, manifest:'/designer/owayo/cycling-c3/manifest.json', assetsReady:true, sourceUrl:cyclingSource('bikejerseys') }),
  cyclingFamily({ id:'cycling-c5', key:'bikejerseys_pro', title:'Custom Cycling Jersey C5 Pro', sourceName:'Cycling Jersey C5 Pro Short Sleeve', priceUsd:105, audience:'men', sleeve:'short', fit:'tight', cut:'053m', model:'CUT_053m_44_KA', designCount:65, sizeCount:12, manifest:'/designer/owayo/cycling-c5/manifest.json', assetsReady:true, sourceUrl:cyclingSource('bikejerseys_pro') }),
  cyclingFamily({ id:'cycling-c7', key:'bikejerseys_epic', title:'Custom Aero Cycling Jersey C7 Epic', sourceName:'Aero Cycling Jersey C7 Epic', priceUsd:119, audience:'men', sleeve:'short aero mesh', fit:'elastic tight', cut:'221m', model:'221m', designCount:33, sizeCount:10, sourceUrl:cyclingSource('bikejerseys_epic') }),
  cyclingFamily({ id:'cycling-cl3', key:'bikejerseys_longsleeve', title:'Custom Cycling Jersey CL3 Basic', sourceName:'Cycling Jersey CL3 Basic Long Sleeve', priceUsd:89, audience:'unisex', sleeve:'long', fit:'relaxed athletic', cut:'253m', model:'253m_LA', designCount:52, sizeCount:12, sourceUrl:cyclingSource('bikejerseys_longsleeve') }),
  cyclingFamily({ id:'cycling-cl5', key:'bikejerseys_pro_longsleeves', title:'Custom Cycling Jersey CL5 Pro', sourceName:'Cycling Jersey CL5 Pro Long Sleeve', priceUsd:108, audience:'men', sleeve:'long', fit:'tight', cut:'053m', model:'CUT_053m_44_LA', designCount:65, sizeCount:12, sourceUrl:cyclingSource('bikejerseys_pro_longsleeves') }),
  cyclingFamily({ id:'cycling-cw5', key:'bikejerseys_pro_winter', title:'Custom Winter Cycling Jersey CW5 Pro', sourceName:'Winter Cycling Jersey CW5 Pro', priceUsd:117, audience:'men', sleeve:'long winter', fit:'tight', cut:'053m', model:'CUT_053m_RW', designCount:53, sizeCount:12, sourceUrl:cyclingSource('bikejerseys_pro_winter') }),
  cyclingFamily({ id:'cycling-ct5', key:'bikejerseys_pro_sleeveless', title:'Custom Sleeveless Cycling Jersey CT5 Pro', sourceName:'Cycling Jersey CT5 Pro Sleeveless', priceUsd:105, audience:'men', sleeve:'sleeveless', fit:'tight', cut:'053m', model:'CUT_053m_44_OA', designCount:50, sizeCount:12, sourceUrl:cyclingSource('bikejerseys_pro_sleeveless') }),
  cyclingFamily({ id:'cycling-c5w', key:'bikejerseys_pro_ladies', title:'Custom Cycling Jersey C5w Pro', sourceName:'Cycling Jersey C5w Pro Short Sleeve (Women)', priceUsd:105, audience:'women', sleeve:'short', fit:'tight', cut:'053w', model:'CUT_053w_44_KA', designCount:58, sizeCount:10, sourceUrl:cyclingSource('bikejerseys_pro_ladies') }),
  cyclingFamily({ id:'cycling-cl5w', key:'bikejerseys_pro_ladies_longsleeves', title:'Custom Cycling Jersey CL5w Pro', sourceName:'Cycling Jersey C5w Pro Long Sleeve (Women)', priceUsd:108, audience:'women', sleeve:'long', fit:'tight', cut:'053w', model:'CUT_053w_44_LA', designCount:58, sizeCount:10, sourceUrl:cyclingSource('bikejerseys_pro_ladies_longsleeves') }),
  cyclingFamily({ id:'cycling-cw5w', key:'bikejerseys_pro_ladies_winter', title:'Custom Winter Cycling Jersey CW5w Pro', sourceName:'Winter Cycling Jersey CW5w Pro (Women)', priceUsd:120, audience:'women', sleeve:'long winter', fit:'tight', cut:'053w', model:'CUT_053w_RW', designCount:58, sizeCount:10, sourceUrl:cyclingSource('bikejerseys_pro_ladies_winter') }),
  cyclingFamily({ id:'cycling-ct5w', key:'bikejerseys_pro_ladies_sleeveless', title:'Custom Sleeveless Cycling Jersey CT5w Pro', sourceName:'Cycling Jersey CT5w Pro Sleeveless (Women)', priceUsd:102, audience:'women', sleeve:'sleeveless', fit:'tight', cut:'053w', model:'CUT_053w_34_OA', designCount:46, sizeCount:10, sourceUrl:cyclingSource('bikejerseys_pro_ladies_sleeveless') }),
  cyclingFamily({ id:'cycling-m6', group:'mtb', key:'mtb_jerseys', title:'Custom MTB Jersey M6 Hero', sourceName:'MTB Jersey M6 Hero Short Sleeve', priceUsd:91, audience:'unisex', sleeve:'short', fit:'regular', cut:'207m', model:'207m_MTB_KA', designCount:29, sizeCount:12, sourceUrl:cyclingSource('mtb_jerseys') }),
  cyclingFamily({ id:'cycling-ml6', group:'mtb', key:'mtb_jerseys_longsleeves', title:'Custom MTB Jersey ML6 Hero', sourceName:'MTB Jersey M6 Hero Long Sleeve', priceUsd:96, audience:'unisex', sleeve:'long', fit:'regular', cut:'207m', model:'207m_MTB_LAmN', designCount:29, sizeCount:11, sourceUrl:cyclingSource('mtb_jerseys_longsleeves') }),
  cyclingFamily({ id:'cycling-m5', group:'mtb', key:'mtb_jerseys_m5', title:'Custom MTB Jersey M5 Pro', sourceName:'Dirt Jersey M5 Pro Short Sleeve', priceUsd:86, audience:'unisex', sleeve:'short', fit:'regular', cut:'207m', model:'207m-AD_KA', designCount:29, sizeCount:11, sourceUrl:cyclingSource('mtb_jerseys_m5') }),
  cyclingFamily({ id:'cycling-ml5', group:'mtb', key:'mtb_jerseys_ml5', title:'Custom MTB Jersey ML5 Pro', sourceName:'Dirt Jersey ML5 Pro Long Sleeve', priceUsd:92, audience:'unisex', sleeve:'long', fit:'regular', cut:'207m', model:'207m-AD_LA', designCount:29, sizeCount:11, sourceUrl:cyclingSource('mtb_jerseys_ml5') }),
  cyclingFamily({ id:'cycling-f1', group:'mtb', key:'shirts_f1', title:'Custom Kids MTB Jersey F1', sourceName:'MTB Jersey F1 Kids Short Sleeve', priceUsd:66, audience:'kids', sleeve:'short', fit:'regular', cut:'204k', model:'204k_EA_VK_KA', designCount:57, sizeCount:7, sourceUrl:cyclingSource('shirts_f1') }),
  cyclingFamily({ id:'cycling-fl1', group:'mtb', key:'shirts_fl1_long_sleeve', title:'Custom Kids MTB Jersey FL1', sourceName:'MTB Jersey FL1 Kids Long Sleeve', priceUsd:69, audience:'kids', sleeve:'long', fit:'regular', cut:'204k', model:'204k_EA_VK_LA', designCount:57, sizeCount:7, sourceUrl:cyclingSource('shirts_fl1_long_sleeve') }),

  family({ id:'basketball-b6', group:'basketball', groupLabel:'Basketball', sport:'basketball', sportLabel:'Basketball', key:'shirts', seedDesign:'Legend', title:'Custom Basketball Jersey B6 Hero', sourceName:'Basketball Jersey B6 Hero', priceUsd:75, audience:'men', sleeve:'sleeveless', fit:'regular', sourceUrl:'https://www.owayo.com/basketball-shirts-us.htm' }),
  family({ id:'basketball-b7', group:'basketball', groupLabel:'Basketball', sport:'basketball', sportLabel:'Basketball', key:'shirts_b7', seedDesign:'Screen', title:'Custom Basketball Jersey B7 Epic', sourceName:'Basketball Jersey B7 Epic', priceUsd:83, audience:'men', sleeve:'sleeveless', fit:'regular', sourceUrl:'https://www.owayo.com/basketball-shirts_b7-us.htm' }),
  family({ id:'hockey-h3', group:'hockey', groupLabel:'Hockey', sport:'icehockey', sportLabel:'Hockey', key:'shirts_h3', seedDesign:'Fighter', title:'Custom Hockey Jersey H3 Basic', sourceName:'Hockey Jersey H3 Basic', priceUsd:78, audience:'unisex', sleeve:'long', fit:'classic', sourceUrl:'https://www.owayo.com/hockey-shirts_h3-us.htm' }),
  family({ id:'hockey-h6', group:'hockey', groupLabel:'Hockey', sport:'icehockey', sportLabel:'Hockey', key:'shirts_h6', seedDesign:'Recreation', title:'Custom Hockey Jersey H6 Hero', sourceName:'Hockey Jersey H6 Hero', priceUsd:91, audience:'unisex', sleeve:'long', fit:'professional', sourceUrl:'https://www.owayo.com/hockey-shirts_h6-us.htm' }),
  family({ id:'motocross-mx6', group:'motocross', groupLabel:'Motocross', sport:'motocross', sportLabel:'Motocross', key:'jerseys_mx6', seedDesign:'Final', title:'Custom Motocross Jersey MX6 Hero', sourceName:'Motocross Jersey MX6 Hero', priceUsd:95, audience:'unisex', sleeve:'long', fit:'extended back', sourceUrl:'https://www.owayo.com/motocross-jerseys_mx6-us.htm' }),
  family({ id:'soccer-f3', group:'soccer', groupLabel:'Soccer', sport:'football', sportLabel:'Soccer', key:'shirts_f3', seedDesign:'City', title:'Custom Soccer Jersey F3 Basic', sourceName:'Soccer Jersey F3 Basic', priceUsd:73, audience:'unisex', sleeve:'short', fit:'classic straight', sourceUrl:'https://www.owayo.com/soccer-shirts_f3-us.htm' }),
  family({ id:'soccer-f5', group:'soccer', groupLabel:'Soccer', sport:'football', sportLabel:'Soccer', key:'shirts', seedDesign:'City', title:'Custom Soccer Jersey F5 Pro', sourceName:'Soccer Jersey F5 Pro', priceUsd:79, audience:'men', sleeve:'short', fit:'anatomic', sourceUrl:'https://www.owayo.com/design-custom-soccer-jerseys.htm' }),
  family({ id:'soccer-f6', group:'soccer', groupLabel:'Soccer', sport:'football', sportLabel:'Soccer', key:'shirts_f6', seedDesign:'City', title:'Custom Soccer Jersey F6 Hero', sourceName:'Soccer Jersey F6 Hero', priceUsd:85, audience:'men', sleeve:'short', fit:'athletic tailored', sourceUrl:'https://www.owayo.com/soccer-shirts_f6-us.htm' }),
  family({ id:'running-r5', group:'running', groupLabel:'Running', sport:'running', sportLabel:'Running', key:'custom-short-sleeve-shirts', seedDesign:'Final', title:'Custom Running Jersey R5 Pro Cool', sourceName:'Running Jersey R5 Pro Cool', priceUsd:79, audience:'men', sleeve:'short', fit:'slim', sourceUrl:'https://www.owayo.com/running-custom-short-sleeve-shirts-us.htm' }),
  family({ id:'tshirts-basic', group:'tshirts', groupLabel:'T-Shirts', sport:'productservice', sportLabel:'T-Shirts', key:'tshirts_classic_basic_productservice', seedDesign:'pure', title:'Custom T-Shirt Basic', sourceName:'T-Shirt Classic Basic', priceUsd:18, audience:'unisex', sleeve:'short', fit:'regular', sourceUrl:'https://www.owayo.com/productservice-tshirts_classic_basic_productservice-us.htm' })
]

export function owayoCatalogSummary(rows = OWAYO_CATALOG_V1) {
  return {
    total:rows.length,
    live:rows.filter(row => row.assetsReady && row.manifest).length,
    pending:rows.filter(row => !row.assetsReady || !row.manifest).length,
    groups:new Set(rows.map(row => row.group).filter(Boolean)).size,
    designsVerified:rows.reduce((sum, row) => sum + (Number(row.designCount) || 0), 0)
  }
}

export function owayoFamilyById(id, rows = OWAYO_CATALOG_V1) {
  const exact = rows.find(row => row.id === id)
  if (exact) return exact
  const matches = rows.filter(row => row.key === id)
  return matches.length === 1 ? matches[0] : null
}
