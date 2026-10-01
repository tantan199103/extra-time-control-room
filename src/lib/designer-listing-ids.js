import { OWAYO_CATALOG_V1 } from './owayo-catalog.js'

// Designer source rows are written with deterministic IDs by the catalogue
// sync scripts.  Querying those IDs directly keeps the Custom Lab fast on a
// large pod_products table; scanning JSON metadata or the tags array has
// repeatedly hit the database statement timeout.  Keep the Boombah IDs here
// in the same order as public/designer/boombah/catalog.json.
const BOOMBAH_PRODUCT_IDS = Object.freeze([
  'FASTPITCH3D', 'BASEBALL3D', 'SLOWPITCH3D', 'BASKETBALL3D',
  'BASKETBALLREV3D', 'WOMENSBASKETBALL3D', 'WOMENSBASKETBALLREV3D',
  'FOOTBALL3D', 'FOOTBALLREV3D', 'VOLLEYBALL3D', 'MENSVOLLEYBALL3D',
  'HOCKEY3D', 'MENSAPPAREL3D', 'WOMENSAPPAREL3D', 'ACCESSORIES3D',
  'GLOVES3D', 'SOCKS3D', 'MENSPANTS3D', 'WOMENSPANTS3D', 'SHOES3D',
  'WOMENSSHOES3D'
])

const owayoListingIds = OWAYO_CATALOG_V1
  .map(item => String(item?.id || '').trim())
  .filter(Boolean)
  .map(id => `listing-jersevo-custom-${id}`)

const boombahListingIds = BOOMBAH_PRODUCT_IDS
  .map(id => `custom-${id.toLowerCase()}-teamwear`)

export const DESIGNER_LISTING_IDS = Object.freeze([...owayoListingIds, ...boombahListingIds])
