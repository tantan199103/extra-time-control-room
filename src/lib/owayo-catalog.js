const cyclingSource = () => ''

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
  { id:'tshirts', label:'T-Shirts' },
  { id:'bowling', label:'Bowling' },
  { id:'darts', label:'Darts' },
  { id:'esports', label:'eSports' },
  { id:'fieldhockey', label:'Field Hockey' },
  { id:'handball', label:'Handball' },
  { id:'rowing', label:'Rowing' },
  { id:'volleyball', label:'Volleyball' },
  { id:'floorball', label:'Floorball' },
  { id:'tabletennis', label:'Table Tennis' },
  { id:'yoga', label:'Yoga' }
])

/**
 * Exact product-family discovery catalogue. A row becomes selectable only
 * after its own model, UV masks, sizes and design archives are synchronized.
 * Sport catalogues are deliberately separate from merchandising leagues:
 * a generic soccer or hockey garment is not automatically an MLS/NHL item.
 */
export const OWAYO_CATALOG_V1 = [
  cyclingFamily({ id:'cycling-c3', key:'bikejerseys', title:'Custom Cycling Jersey C3 Basic', sourceName:'Cycling Jersey C3 Basic Short Sleeve', priceUsd:85, audience:'unisex', sleeve:'short', fit:'relaxed athletic', cut:'253m', model:'253m_KA', designCount:52, sizeCount:12, manifest:'/designer/studio/cycling-c3/manifest.json', assetsReady:true }),
  cyclingFamily({ id:'cycling-c5', key:'bikejerseys_pro', title:'Custom Cycling Jersey C5 Pro', sourceName:'Cycling Jersey C5 Pro Short Sleeve', priceUsd:105, audience:'men', sleeve:'short', fit:'tight', cut:'053m', model:'CUT_053m_44_KA', designCount:65, sizeCount:12, manifest:'/designer/studio/cycling-c5/manifest.json', assetsReady:true }),
  cyclingFamily({ id:'cycling-c7', key:'bikejerseys_epic', title:'Custom Aero Cycling Jersey C7 Epic', sourceName:'Aero Cycling Jersey C7 Epic', priceUsd:119, audience:'men', sleeve:'short aero mesh', fit:'elastic tight', cut:'221m', model:'221m', designCount:33, sizeCount:10 }),
  cyclingFamily({ id:'cycling-cl3', key:'bikejerseys_longsleeve', title:'Custom Cycling Jersey CL3 Basic', sourceName:'Cycling Jersey CL3 Basic Long Sleeve', priceUsd:89, audience:'unisex', sleeve:'long', fit:'relaxed athletic', cut:'253m', model:'253m_LA', designCount:52, sizeCount:12 }),
  cyclingFamily({ id:'cycling-cl5', key:'bikejerseys_pro_longsleeves', title:'Custom Cycling Jersey CL5 Pro', sourceName:'Cycling Jersey CL5 Pro Long Sleeve', priceUsd:108, audience:'men', sleeve:'long', fit:'tight', cut:'053m', model:'CUT_053m_44_LA', designCount:65, sizeCount:12 }),
  cyclingFamily({ id:'cycling-cw5', key:'bikejerseys_pro_winter', title:'Custom Winter Cycling Jersey CW5 Pro', sourceName:'Winter Cycling Jersey CW5 Pro', priceUsd:117, audience:'men', sleeve:'long winter', fit:'tight', cut:'053m', model:'CUT_053m_RW', designCount:53, sizeCount:12 }),
  cyclingFamily({ id:'cycling-ct5', key:'bikejerseys_pro_sleeveless', title:'Custom Sleeveless Cycling Jersey CT5 Pro', sourceName:'Cycling Jersey CT5 Pro Sleeveless', priceUsd:105, audience:'men', sleeve:'sleeveless', fit:'tight', cut:'053m', model:'CUT_053m_44_OA', designCount:50, sizeCount:12 }),
  cyclingFamily({ id:'cycling-c5w', key:'bikejerseys_pro_ladies', title:'Custom Cycling Jersey C5w Pro', sourceName:'Cycling Jersey C5w Pro Short Sleeve (Women)', priceUsd:105, audience:'women', sleeve:'short', fit:'tight', cut:'053w', model:'CUT_053w_44_KA', designCount:58, sizeCount:10 }),
  cyclingFamily({ id:'cycling-cl5w', key:'bikejerseys_pro_ladies_longsleeves', title:'Custom Cycling Jersey CL5w Pro', sourceName:'Cycling Jersey C5w Pro Long Sleeve (Women)', priceUsd:108, audience:'women', sleeve:'long', fit:'tight', cut:'053w', model:'CUT_053w_44_LA', designCount:58, sizeCount:10 }),
  cyclingFamily({ id:'cycling-cw5w', key:'bikejerseys_pro_ladies_winter', title:'Custom Winter Cycling Jersey CW5w Pro', sourceName:'Winter Cycling Jersey CW5w Pro (Women)', priceUsd:120, audience:'women', sleeve:'long winter', fit:'tight', cut:'053w', model:'CUT_053w_RW', designCount:58, sizeCount:10 }),
  cyclingFamily({ id:'cycling-ct5w', key:'bikejerseys_pro_ladies_sleeveless', title:'Custom Sleeveless Cycling Jersey CT5w Pro', sourceName:'Cycling Jersey CT5w Pro Sleeveless (Women)', priceUsd:102, audience:'women', sleeve:'sleeveless', fit:'tight', cut:'053w', model:'CUT_053w_34_OA', designCount:46, sizeCount:10 }),
  cyclingFamily({ id:'cycling-m6', group:'mtb', key:'mtb_jerseys', title:'Custom MTB Jersey M6 Hero', sourceName:'MTB Jersey M6 Hero Short Sleeve', priceUsd:91, audience:'unisex', sleeve:'short', fit:'regular', cut:'207m', model:'207m_MTB_KA', designCount:29, sizeCount:12 }),
  cyclingFamily({ id:'cycling-ml6', group:'mtb', key:'mtb_jerseys_longsleeves', title:'Custom MTB Jersey ML6 Hero', sourceName:'MTB Jersey M6 Hero Long Sleeve', priceUsd:96, audience:'unisex', sleeve:'long', fit:'regular', cut:'207m', model:'207m_MTB_LAmN', designCount:29, sizeCount:11 }),
  cyclingFamily({ id:'cycling-m5', group:'mtb', key:'mtb_jerseys_m5', title:'Custom MTB Jersey M5 Pro', sourceName:'Dirt Jersey M5 Pro Short Sleeve', priceUsd:86, audience:'unisex', sleeve:'short', fit:'regular', cut:'207m', model:'207m-AD_KA', designCount:29, sizeCount:11 }),
  cyclingFamily({ id:'cycling-ml5', group:'mtb', key:'mtb_jerseys_ml5', title:'Custom MTB Jersey ML5 Pro', sourceName:'Dirt Jersey ML5 Pro Long Sleeve', priceUsd:92, audience:'unisex', sleeve:'long', fit:'regular', cut:'207m', model:'207m-AD_LA', designCount:29, sizeCount:11 }),
  cyclingFamily({ id:'cycling-f1', group:'mtb', key:'shirts_f1', title:'Custom Kids MTB Jersey F1', sourceName:'MTB Jersey F1 Kids Short Sleeve', priceUsd:66, audience:'kids', sleeve:'short', fit:'regular', cut:'204k', model:'204k_EA_VK_KA', designCount:57, sizeCount:7 }),
  cyclingFamily({ id:'cycling-fl1', group:'mtb', key:'shirts_fl1_long_sleeve', title:'Custom Kids MTB Jersey FL1', sourceName:'MTB Jersey FL1 Kids Long Sleeve', priceUsd:69, audience:'kids', sleeve:'long', fit:'regular', cut:'204k', model:'204k_EA_VK_LA', designCount:57, sizeCount:7 }),

  family({ id:'basketball-b6', group:'basketball', groupLabel:'Basketball', sport:'basketball', sportLabel:'Basketball', key:'shirts', seedDesign:'Legend', title:'Custom Basketball Jersey B6 Hero', sourceName:'Basketball Jersey B6 Hero', priceUsd:75, audience:'men', sleeve:'sleeveless', fit:'regular' }),
  family({ id:'basketball-b7', group:'basketball', groupLabel:'Basketball', sport:'basketball', sportLabel:'Basketball', key:'shirts_b7', seedDesign:'Screen', title:'Custom Basketball Jersey B7 Epic', sourceName:'Basketball Jersey B7 Epic', priceUsd:83, audience:'men', sleeve:'sleeveless', fit:'regular' }),
  family({ id:'hockey-h3', group:'hockey', groupLabel:'Hockey', sport:'icehockey', sportLabel:'Hockey', key:'shirts_h3', seedDesign:'Fighter', title:'Custom Hockey Jersey H3 Basic', sourceName:'Hockey Jersey H3 Basic', priceUsd:78, audience:'unisex', sleeve:'long', fit:'classic' }),
  family({ id:'hockey-h6', group:'hockey', groupLabel:'Hockey', sport:'icehockey', sportLabel:'Hockey', key:'shirts_h6', seedDesign:'Recreation', title:'Custom Hockey Jersey H6 Hero', sourceName:'Hockey Jersey H6 Hero', priceUsd:91, audience:'unisex', sleeve:'long', fit:'professional' }),
  family({ id:'motocross-mx6', group:'motocross', groupLabel:'Motocross', sport:'motocross', sportLabel:'Motocross', key:'jerseys_mx6', seedDesign:'Final', title:'Custom Motocross Jersey MX6 Hero', sourceName:'Motocross Jersey MX6 Hero', priceUsd:95, audience:'unisex', sleeve:'long', fit:'extended back' }),
  family({ id:'soccer-f3', group:'soccer', groupLabel:'Soccer', sport:'football', sportLabel:'Soccer', key:'shirts_f3', seedDesign:'City', title:'Custom Soccer Jersey F3 Basic', sourceName:'Soccer Jersey F3 Basic', priceUsd:73, audience:'unisex', sleeve:'short', fit:'classic straight' }),
  family({ id:'soccer-f5', group:'soccer', groupLabel:'Soccer', sport:'football', sportLabel:'Soccer', key:'shirts', seedDesign:'City', title:'Custom Soccer Jersey F5 Pro', sourceName:'Soccer Jersey F5 Pro', priceUsd:79, audience:'men', sleeve:'short', fit:'anatomic' }),
  family({ id:'soccer-f6', group:'soccer', groupLabel:'Soccer', sport:'football', sportLabel:'Soccer', key:'shirts_f6', seedDesign:'City', title:'Custom Soccer Jersey F6 Hero', sourceName:'Soccer Jersey F6 Hero', priceUsd:85, audience:'men', sleeve:'short', fit:'athletic tailored' }),
  family({ id:'running-r5', group:'running', groupLabel:'Running', sport:'running', sportLabel:'Running', key:'custom-short-sleeve-shirts', seedDesign:'Final', title:'Custom Running Jersey R5 Pro Cool', sourceName:'Running Jersey R5 Pro Cool', priceUsd:79, audience:'men', sleeve:'short', fit:'slim' }),
  family({ id:'tshirts-basic', group:'tshirts', groupLabel:'T-Shirts', sport:'productservice', sportLabel:'T-Shirts', key:'tshirts_classic_basic_productservice', seedDesign:'pure', title:'Custom T-Shirt Basic', sourceName:'T-Shirt Classic Basic', priceUsd:18, audience:'unisex', sleeve:'short', fit:'regular' }),

  // Additional Owayo catalogue families. These rows intentionally describe
  // exact configurator products rather than treating a sport landing page as
  // a generic jersey. The asset sync resolves each row to its own model,
  // masks, size map and design archive before it becomes selectable.
  family({ id:'basketball-b1', group:'basketball', groupLabel:'Basketball', sport:'basketball', sportLabel:'Basketball', key:'shirts_b1', seedDesign:'Legend', title:'Custom Basketball Jersey B1 Basic', sourceName:'Basketball Jersey B1 Basic', priceUsd:69, audience:'unisex', sleeve:'sleeveless', fit:'regular' }),
  family({ id:'basketball-b7w', group:'basketball', groupLabel:'Basketball', sport:'basketball', sportLabel:'Basketball', key:'shirts_b7w', seedDesign:'Legend', title:'Custom Basketball Jersey B7w Epic', sourceName:'Basketball Jersey B7w Epic Women', priceUsd:83, audience:'women', sleeve:'sleeveless', fit:'athletic' }),
  family({ id:'basketball-br1', group:'basketball', groupLabel:'Basketball', sport:'basketball', sportLabel:'Basketball', key:'shirts_br1', seedDesign:'Legend', title:'Custom Reversible Basketball Jersey BR1', sourceName:'Reversible Basketball Jersey BR1', priceUsd:89, audience:'unisex', sleeve:'sleeveless reversible', fit:'regular' }),
  family({ id:'basketball-br6', group:'basketball', groupLabel:'Basketball', sport:'basketball', sportLabel:'Basketball', key:'shirts_br6', seedDesign:'Legend', title:'Custom Reversible Basketball Jersey BR6', sourceName:'Reversible Basketball Jersey BR6 Hero', priceUsd:99, audience:'unisex', sleeve:'sleeveless reversible', fit:'professional' }),
  family({ id:'basketball-shooting-f1', group:'basketball', groupLabel:'Basketball', sport:'basketball', sportLabel:'Basketball', key:'shooting_shirts_f1', seedDesign:'Throw', title:'Custom Basketball Shooting Shirt F1', sourceName:'Basketball Shooting Shirt F1', priceUsd:72, audience:'unisex', sleeve:'short', fit:'regular' }),

  family({ id:'bowling-f5', group:'bowling', groupLabel:'Bowling', sport:'bowling', sportLabel:'Bowling', key:'shirts_f5_bowling', seedDesign:'Dirt', title:'Custom Bowling Shirt F5', sourceName:'Bowling Shirt F5', priceUsd:78, audience:'unisex', sleeve:'short', fit:'regular' }),
  family({ id:'bowling-basic', group:'bowling', groupLabel:'Bowling', sport:'bowling', sportLabel:'Bowling', key:'shirts_bowling', seedDesign:'Dirt', title:'Custom Bowling Shirt Basic', sourceName:'Bowling Shirt Basic', priceUsd:74, audience:'unisex', sleeve:'short', fit:'regular' }),
  family({ id:'bowling-xp5', group:'bowling', groupLabel:'Bowling', sport:'bowling', sportLabel:'Bowling', key:'shirts_bowling_xp5', seedDesign:'Pure', title:'Custom Bowling Shirt XP5', sourceName:'Bowling Shirt XP5', priceUsd:86, audience:'unisex', sleeve:'short', fit:'athletic' }),

  family({ id:'darts-basic', group:'darts', groupLabel:'Darts', sport:'darts', sportLabel:'Darts', key:'shirts_dart', seedDesign:'Dirt', title:'Custom Darts Shirt Basic', sourceName:'Darts Shirt Basic', priceUsd:74, audience:'unisex', sleeve:'short', fit:'regular' }),
  family({ id:'darts-f5', group:'darts', groupLabel:'Darts', sport:'darts', sportLabel:'Darts', key:'shirts_f5_dart', seedDesign:'Dirt', title:'Custom Darts Shirt F5', sourceName:'Darts Shirt F5', priceUsd:79, audience:'unisex', sleeve:'short', fit:'regular' }),
  family({ id:'darts-xp5', group:'darts', groupLabel:'Darts', sport:'darts', sportLabel:'Darts', key:'shirts_dart_xp5', seedDesign:'Dirt', title:'Custom Darts Shirt XP5', sourceName:'Darts Shirt XP5', priceUsd:86, audience:'unisex', sleeve:'short', fit:'athletic' }),

  family({ id:'esports-e3', group:'esports', groupLabel:'eSports', sport:'esports', sportLabel:'eSports', key:'shirts_e3', seedDesign:'League', title:'Custom eSports Jersey E3', sourceName:'eSports Jersey E3', priceUsd:69, audience:'unisex', sleeve:'short', fit:'regular' }),
  family({ id:'esports-e6', group:'esports', groupLabel:'eSports', sport:'esports', sportLabel:'eSports', key:'shirts_e6', seedDesign:'League', title:'Custom eSports Jersey E6', sourceName:'eSports Jersey E6', priceUsd:79, audience:'unisex', sleeve:'short', fit:'athletic' }),
  family({ id:'esports-f1', group:'esports', groupLabel:'eSports', sport:'esports', sportLabel:'eSports', key:'shirts_f1', seedDesign:'Final', title:'Custom eSports Jersey F1', sourceName:'eSports Jersey F1', priceUsd:72, audience:'kids', sleeve:'short', fit:'regular' }),
  family({ id:'esports-long-el5', group:'esports', groupLabel:'eSports', sport:'esports', sportLabel:'eSports', key:'shirts_long_sleeve_el5', seedDesign:'League', title:'Custom eSports Jersey EL5 Long Sleeve', sourceName:'eSports Jersey EL5 Long Sleeve', priceUsd:84, audience:'unisex', sleeve:'long', fit:'athletic' }),

  family({ id:'fieldhockey-f3', group:'fieldhockey', groupLabel:'Field Hockey', sport:'fieldhockey', sportLabel:'Field Hockey', key:'shirts_f3', seedDesign:'Final', title:'Custom Field Hockey Jersey F3', sourceName:'Field Hockey Jersey F3', priceUsd:76, audience:'unisex', sleeve:'short', fit:'classic' }),
  family({ id:'fieldhockey-d6', group:'fieldhockey', groupLabel:'Field Hockey', sport:'fieldhockey', sportLabel:'Field Hockey', key:'shirts_d6', seedDesign:'Final', title:'Custom Field Hockey Jersey D6', sourceName:'Field Hockey Jersey D6', priceUsd:84, audience:'unisex', sleeve:'short', fit:'athletic' }),
  family({ id:'fieldhockey-f1', group:'fieldhockey', groupLabel:'Field Hockey', sport:'fieldhockey', sportLabel:'Field Hockey', key:'shirts_f1', seedDesign:'Pure', title:'Custom Field Hockey Jersey F1 Kids', sourceName:'Field Hockey Jersey F1 Kids', priceUsd:65, audience:'kids', sleeve:'short', fit:'regular' }),

  family({ id:'handball-basic', group:'handball', groupLabel:'Handball', sport:'handball', sportLabel:'Handball', key:'shirts', seedDesign:'Gladiator', title:'Custom Handball Jersey Basic', sourceName:'Handball Jersey Basic', priceUsd:76, audience:'unisex', sleeve:'short', fit:'classic' }),
  family({ id:'handball-d6', group:'handball', groupLabel:'Handball', sport:'handball', sportLabel:'Handball', key:'shirts_d6', seedDesign:'Gladiator', title:'Custom Handball Jersey D6', sourceName:'Handball Jersey D6', priceUsd:84, audience:'unisex', sleeve:'short', fit:'athletic' }),
  family({ id:'handball-f1', group:'handball', groupLabel:'Handball', sport:'handball', sportLabel:'Handball', key:'shirts_f1', seedDesign:'Gladiator', title:'Custom Handball Jersey F1 Kids', sourceName:'Handball Jersey F1 Kids', priceUsd:65, audience:'kids', sleeve:'short', fit:'regular' }),
  family({ id:'handball-f3', group:'handball', groupLabel:'Handball', sport:'handball', sportLabel:'Handball', key:'shirts_f3', seedDesign:'Gladiator', title:'Custom Handball Jersey F3', sourceName:'Handball Jersey F3', priceUsd:79, audience:'unisex', sleeve:'short', fit:'classic' }),
  family({ id:'handball-gk-f1', group:'handball', groupLabel:'Handball', sport:'handball', sportLabel:'Handball', key:'shirts_f1_goalkeeper', seedDesign:'Gladiator', title:'Custom Handball Goalkeeper Jersey F1', sourceName:'Handball Goalkeeper Jersey F1', priceUsd:82, audience:'unisex', sleeve:'long', fit:'regular' }),

  family({ id:'rowing-w6', group:'rowing', groupLabel:'Rowing', sport:'rowing', sportLabel:'Rowing', key:'unisuit_w6', seedDesign:'Limit', title:'Custom Rowing Unisuit W6', sourceName:'Rowing Unisuit W6', priceUsd:119, audience:'unisex', sleeve:'sleeveless', fit:'race' }),
  family({ id:'rowing-w6-comp', group:'rowing', groupLabel:'Rowing', sport:'rowing', sportLabel:'Rowing', key:'ruderanzug_w6_comp', seedDesign:'Limit', title:'Custom Rowing Unisuit W6 Competition', sourceName:'Rowing Unisuit W6 Competition', priceUsd:129, audience:'unisex', sleeve:'sleeveless', fit:'race' }),

  family({ id:'running-long', group:'running', groupLabel:'Running', sport:'running', sportLabel:'Running', key:'custom-long-sleeve-shirts', seedDesign:'Rise', title:'Custom Running Jersey R5 Long Sleeve', sourceName:'Running Long Sleeve Shirt', priceUsd:86, audience:'men', sleeve:'long', fit:'slim' }),
  family({ id:'running-short-ladies', group:'running', groupLabel:'Running', sport:'running', sportLabel:'Running', key:'custom-short-sleeve-shirts_ladies', seedDesign:'Rise', title:'Custom Running Jersey R5 Women', sourceName:'Running Short Sleeve Shirt Women', priceUsd:79, audience:'women', sleeve:'short', fit:'slim' }),
  family({ id:'running-singlets', group:'running', groupLabel:'Running', sport:'running', sportLabel:'Running', key:'singlets', seedDesign:'Rise', title:'Custom Running Singlet', sourceName:'Running Singlet', priceUsd:69, audience:'men', sleeve:'sleeveless', fit:'slim' }),

  family({ id:'motocross-m5', group:'motocross', groupLabel:'Motocross', sport:'motocross', sportLabel:'Motocross', key:'jerseys_m5', seedDesign:'Flight', title:'Custom Motocross Jersey M5', sourceName:'Motocross Jersey M5', priceUsd:89, audience:'unisex', sleeve:'long', fit:'extended back' }),
  family({ id:'motocross-ml5', group:'motocross', groupLabel:'Motocross', sport:'motocross', sportLabel:'Motocross', key:'jerseys_ml5', seedDesign:'Flight', title:'Custom Motocross Jersey ML5 Long Sleeve', sourceName:'Motocross Jersey ML5', priceUsd:94, audience:'unisex', sleeve:'long', fit:'extended back' }),

  // These catalogue pages use the shared teamsport configurator but expose
  // distinct sport-specific design archives, so they remain separate family
  // cards and can be filtered independently in the designer.
  family({ id:'volleyball-f3', group:'volleyball', groupLabel:'Volleyball', sport:'teamsport', sportLabel:'Volleyball', key:'shirts_f3', seedDesign:'City', title:'Custom Volleyball Jersey F3', sourceName:'Volleyball Jersey F3', priceUsd:76, audience:'unisex', sleeve:'short', fit:'classic' }),
  family({ id:'floorball-f3', group:'floorball', groupLabel:'Floorball', sport:'teamsport', sportLabel:'Floorball', key:'shirts_f3', seedDesign:'City', title:'Custom Floorball Jersey F3', sourceName:'Floorball Jersey F3', priceUsd:76, audience:'unisex', sleeve:'short', fit:'classic' }),
  family({ id:'tabletennis-f3', group:'tabletennis', groupLabel:'Table Tennis', sport:'teamsport', sportLabel:'Table Tennis', key:'shirts_f3', seedDesign:'City', title:'Custom Table Tennis Jersey F3', sourceName:'Table Tennis Jersey F3', priceUsd:72, audience:'unisex', sleeve:'short', fit:'regular' }),
  family({ id:'yoga-pants-highwaist', group:'yoga', groupLabel:'Yoga', sport:'yoga', sportLabel:'Yoga', key:'yogapants_highwaist_light', seedDesign:'Flight', title:'Custom Yoga High-Waist Pants', sourceName:'Yoga Pants High-Waist Light', priceUsd:64, audience:'women', sleeve:'n/a', fit:'high-waist' })
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
