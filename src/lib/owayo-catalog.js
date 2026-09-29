const source = product => `https://www.owayo.com/cycling-${product}-us.htm`

/**
 * Product-family discovery catalogue. A row is sellable in Jersevo only after
 * its exact model, UV masks, sizes and design archive have been synchronized.
 * This prevents a C3 mockup from being presented as a C5/C7 or women's cut.
 */
export const OWAYO_CATALOG_V1 = [
  { id:'cycling-c3', key:'bikejerseys', title:'Jersevo Custom Cycling Jersey C3 Basic', sourceName:'Cycling Jersey C3 Basic Short Sleeve', priceUsd:85, audience:'unisex', sleeve:'short', fit:'relaxed athletic', cut:'253m', model:'253m_KA', designCount:52, sizeCount:12, manifest:'/designer/owayo/cycling-c3/manifest.json', assetsReady:true, sourceUrl:source('bikejerseys') },
  { id:'cycling-c5', key:'bikejerseys_pro', title:'Jersevo Custom Cycling Jersey C5 Pro', sourceName:'Cycling Jersey C5 Pro Short Sleeve', priceUsd:105, audience:'men', sleeve:'short', fit:'tight', cut:'053m', model:'CUT_053m_44_KA', designCount:65, sizeCount:12, manifest:'/designer/owayo/cycling-c5/manifest.json', assetsReady:true, sourceUrl:source('bikejerseys_pro') },
  { id:'cycling-c7', key:'bikejerseys_epic', title:'Jersevo Custom Aero Cycling Jersey C7 Epic', sourceName:'Aero Cycling Jersey C7 Epic', priceUsd:119, audience:'men', sleeve:'short aero mesh', fit:'elastic tight', cut:'221m', model:'221m', designCount:33, sizeCount:10, manifest:'', assetsReady:false, sourceUrl:source('bikejerseys_epic') },
  { id:'cycling-cl3', key:'bikejerseys_longsleeve', title:'Jersevo Custom Cycling Jersey CL3 Basic', sourceName:'Cycling Jersey CL3 Basic Long Sleeve', priceUsd:89, audience:'unisex', sleeve:'long', fit:'relaxed athletic', cut:'253m', model:'253m_LA', designCount:52, sizeCount:12, manifest:'', assetsReady:false, sourceUrl:source('bikejerseys_longsleeve') },
  { id:'cycling-cl5', key:'bikejerseys_pro_longsleeves', title:'Jersevo Custom Cycling Jersey CL5 Pro', sourceName:'Cycling Jersey CL5 Pro Long Sleeve', priceUsd:108, audience:'men', sleeve:'long', fit:'tight', cut:'053m', model:'CUT_053m_44_LA', designCount:65, sizeCount:12, manifest:'', assetsReady:false, sourceUrl:source('bikejerseys_pro_longsleeves') },
  { id:'cycling-cw5', key:'bikejerseys_pro_winter', title:'Jersevo Custom Winter Cycling Jersey CW5 Pro', sourceName:'Winter Cycling Jersey CW5 Pro', priceUsd:117, audience:'men', sleeve:'long winter', fit:'tight', cut:'053m', model:'CUT_053m_RW', designCount:53, sizeCount:12, manifest:'', assetsReady:false, sourceUrl:source('bikejerseys_pro_winter') },
  { id:'cycling-ct5', key:'bikejerseys_pro_sleeveless', title:'Jersevo Custom Sleeveless Cycling Jersey CT5 Pro', sourceName:'Cycling Jersey CT5 Pro Sleeveless', priceUsd:105, audience:'men', sleeve:'sleeveless', fit:'tight', cut:'053m', model:'CUT_053m_44_OA', designCount:50, sizeCount:12, manifest:'', assetsReady:false, sourceUrl:source('bikejerseys_pro_sleeveless') },
  { id:'cycling-c5w', key:'bikejerseys_pro_ladies', title:'Jersevo Custom Cycling Jersey C5w Pro', sourceName:'Cycling Jersey C5w Pro Short Sleeve (Women)', priceUsd:105, audience:'women', sleeve:'short', fit:'tight', cut:'053w', model:'CUT_053w_44_KA', designCount:58, sizeCount:10, manifest:'', assetsReady:false, sourceUrl:source('bikejerseys_pro_ladies') },
  { id:'cycling-cl5w', key:'bikejerseys_pro_ladies_longsleeves', title:'Jersevo Custom Cycling Jersey CL5w Pro', sourceName:'Cycling Jersey CL5w Pro Long Sleeve (Women)', priceUsd:108, audience:'women', sleeve:'long', fit:'tight', cut:'053w', model:'CUT_053w_44_LA', designCount:58, sizeCount:10, manifest:'', assetsReady:false, sourceUrl:source('bikejerseys_pro_ladies_longsleeves') },
  { id:'cycling-cw5w', key:'bikejerseys_pro_ladies_winter', title:'Jersevo Custom Winter Cycling Jersey CW5w Pro', sourceName:'Winter Cycling Jersey CW5w Pro (Women)', priceUsd:120, audience:'women', sleeve:'long winter', fit:'tight', cut:'053w', model:'CUT_053w_RW', designCount:58, sizeCount:10, manifest:'', assetsReady:false, sourceUrl:source('bikejerseys_pro_ladies_winter') },
  { id:'cycling-ct5w', key:'bikejerseys_pro_ladies_sleeveless', title:'Jersevo Custom Sleeveless Cycling Jersey CT5w Pro', sourceName:'Cycling Jersey CT5w Pro Sleeveless (Women)', priceUsd:102, audience:'women', sleeve:'sleeveless', fit:'tight', cut:'053w', model:'CUT_053w_34_OA', designCount:46, sizeCount:10, manifest:'', assetsReady:false, sourceUrl:source('bikejerseys_pro_ladies_sleeveless') },
  { id:'cycling-m6', key:'mtb_jerseys', title:'Jersevo Custom MTB Jersey M6 Hero', sourceName:'MTB Jersey M6 Hero Short Sleeve', priceUsd:91, audience:'unisex', sleeve:'short', fit:'regular', cut:'207m', model:'207m_MTB_KA', designCount:29, sizeCount:12, manifest:'', assetsReady:false, sourceUrl:source('mtb_jerseys') },
  { id:'cycling-ml6', key:'mtb_jerseys_longsleeves', title:'Jersevo Custom MTB Jersey ML6 Hero', sourceName:'MTB Jersey M6 Hero Long Sleeve', priceUsd:96, audience:'unisex', sleeve:'long', fit:'regular', cut:'207m', model:'207m_MTB_LAmN', designCount:29, sizeCount:11, manifest:'', assetsReady:false, sourceUrl:source('mtb_jerseys_longsleeves') },
  { id:'cycling-m5', key:'mtb_jerseys_m5', title:'Jersevo Custom MTB Jersey M5 Pro', sourceName:'Dirt Jersey M5 Pro Short Sleeve', priceUsd:86, audience:'unisex', sleeve:'short', fit:'regular', cut:'207m', model:'207m-AD_KA', designCount:29, sizeCount:11, manifest:'', assetsReady:false, sourceUrl:'https://www.owayo.com/cycling-mtb_jerseys_m5-us.htm' },
  { id:'cycling-ml5', key:'mtb_jerseys_ml5', title:'Jersevo Custom MTB Jersey ML5 Pro', sourceName:'Dirt Jersey ML5 Pro Long Sleeve', priceUsd:92, audience:'unisex', sleeve:'long', fit:'regular', cut:'207m', model:'207m-AD_LA', designCount:29, sizeCount:11, manifest:'', assetsReady:false, sourceUrl:'https://www.owayo.com/cycling-mtb_jerseys_ml5-us.htm' },
  { id:'cycling-f1', key:'shirts_f1', title:'Jersevo Custom Kids MTB Jersey F1', sourceName:'MTB Jersey F1 Kids Short Sleeve', priceUsd:66, audience:'kids', sleeve:'short', fit:'regular', cut:'204k', model:'204k_EA_VK_KA', designCount:57, sizeCount:7, manifest:'', assetsReady:false, sourceUrl:'https://www.owayo.com/cycling-shirts_f1-us.htm' },
  { id:'cycling-fl1', key:'shirts_fl1_long_sleeve', title:'Jersevo Custom Kids MTB Jersey FL1', sourceName:'MTB Jersey FL1 Kids Long Sleeve', priceUsd:69, audience:'kids', sleeve:'long', fit:'regular', cut:'204k', model:'204k_EA_VK_LA', designCount:57, sizeCount:7, manifest:'', assetsReady:false, sourceUrl:'https://www.owayo.com/cycling-shirts_fl1_long_sleeve-us.htm' }
]

export function owayoCatalogSummary(rows = OWAYO_CATALOG_V1) {
  return {
    total:rows.length,
    live:rows.filter(row => row.assetsReady && row.manifest).length,
    pending:rows.filter(row => !row.assetsReady || !row.manifest).length,
    designsVerified:rows.reduce((sum, row) => sum + (Number(row.designCount) || 0), 0)
  }
}

export function owayoFamilyById(id, rows = OWAYO_CATALOG_V1) {
  return rows.find(row => row.id === id || row.key === id) || null
}
