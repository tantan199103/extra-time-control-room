// Designer source rows are written with deterministic IDs by the catalogue
// sync scripts. Querying those IDs directly keeps the Custom Lab fast on a
// large pod_products table; scanning JSON metadata or the tags array has
// repeatedly hit the database statement timeout.
const STUDIO_PRODUCT_IDS = Object.freeze([
  'cycling-c3', 'cycling-c5', 'cycling-c7', 'cycling-cl3', 'cycling-cl5',
  'cycling-cw5', 'cycling-ct5', 'cycling-c5w', 'cycling-cl5w', 'cycling-cw5w',
  'cycling-ct5w', 'cycling-m6', 'cycling-ml6', 'cycling-m5', 'cycling-ml5',
  'cycling-f1', 'cycling-fl1', 'basketball-b6', 'basketball-b7', 'hockey-h3',
  'hockey-h6', 'motocross-mx6', 'soccer-f3', 'soccer-f5', 'soccer-f6',
  'running-r5', 'tshirts-basic', 'basketball-b1', 'basketball-b7w', 'basketball-br1',
  'basketball-br6', 'basketball-shooting-f1', 'bowling-f5', 'bowling-basic', 'bowling-xp5',
  'darts-basic', 'darts-f5', 'darts-xp5', 'esports-e3', 'esports-e6',
  'esports-f1', 'esports-long-el5', 'fieldhockey-f3', 'fieldhockey-d6', 'fieldhockey-f1',
  'handball-basic', 'handball-d6', 'handball-f1', 'handball-f3', 'handball-gk-f1',
  'rowing-w6', 'rowing-w6-comp', 'running-long', 'running-short-ladies', 'running-singlets',
  'motocross-m5', 'motocross-ml5', 'volleyball-f3', 'floorball-f3', 'tabletennis-f3',
  'yoga-pants-highwaist'
])

const TEAMWEAR_PRODUCT_IDS = Object.freeze([
  'FASTPITCH3D', 'BASEBALL3D', 'SLOWPITCH3D', 'BASKETBALL3D',
  'BASKETBALLREV3D', 'WOMENSBASKETBALL3D', 'WOMENSBASKETBALLREV3D',
  'FOOTBALL3D', 'FOOTBALLREV3D', 'VOLLEYBALL3D', 'MENSVOLLEYBALL3D',
  'HOCKEY3D', 'MENSAPPAREL3D', 'WOMENSAPPAREL3D', 'ACCESSORIES3D',
  'GLOVES3D', 'SOCKS3D', 'MENSPANTS3D', 'WOMENSPANTS3D', 'SHOES3D',
  'WOMENSSHOES3D'
])

const studioListingIds = STUDIO_PRODUCT_IDS
  .map(id => `listing-jersevo-custom-${id}`)

const teamwearListingIds = TEAMWEAR_PRODUCT_IDS
  .map(id => `custom-${id.toLowerCase()}-teamwear`)

export const DESIGNER_LISTING_IDS = Object.freeze([...studioListingIds, ...teamwearListingIds])
