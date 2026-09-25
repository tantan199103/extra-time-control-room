/**
 * Editorial cover artwork for the shop and league landing pages.
 *
 * These are deliberately kept separate from team marks: a cover is a
 * storytelling asset, while a mark is a navigation/identity asset. Keeping
 * both descriptors here gives the runtime and the static SEO builder one
 * canonical image map.
 */
export const SHOP_COVER = Object.freeze({
  src: '/assets/shop/shop-cover-fan-gear.webp',
  alt: 'Jersevo fan gear cover with jerseys, caps and game-day accessories'
})

export const CUSTOM_COVER = Object.freeze({
  src: '/assets/shop/custom-cover.webp',
  alt: 'Custom jersey studio cover with personalized names and numbers'
})

export const LEAGUE_COVERS = Object.freeze({
  nfl: Object.freeze({ src: '/assets/shop/league-nfl-cover.webp', alt: 'NFL football gear cover' }),
  nba: Object.freeze({ src: '/assets/shop/league-nba-cover.webp', alt: 'NBA basketball gear cover' }),
  mlb: Object.freeze({ src: '/assets/shop/league-mlb-cover.webp', alt: 'MLB baseball gear cover' }),
  nhl: Object.freeze({ src: '/assets/shop/league-nhl-cover.webp', alt: 'NHL hockey gear cover' }),
  ncaa: Object.freeze({ src: '/assets/shop/league-ncaa-cover.webp', alt: 'NCAA college gear cover' }),
  // No separate MLS cover was supplied in the reference set. Keep the route
  // visually complete with the existing optimized soccer campaign asset.
  mls: Object.freeze({ src: '/assets/shop/sport-mls-v2.webp', alt: 'MLS soccer gear cover' })
})

export function leagueCover(key) {
  return LEAGUE_COVERS[String(key || '').toLowerCase()] || null
}
