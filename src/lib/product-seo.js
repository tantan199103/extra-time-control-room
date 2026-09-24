import { cleanSeoText, seoDescription } from './seo-text.js'
import { findLeague, findTeam, leaguePath, teamPath, productTaxonomyValues } from './league-taxonomy.js'

export const usd = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(value) || 0)
export const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
export const productPath = product => `/product/${encodeURIComponent(product.handle || product.id)}`
const absolute = (url, origin) => {
  try { const parsed = new URL(url, origin); return /^https?:$/.test(parsed.protocol) ? parsed.href : '' } catch { return '' }
}
const words = (value, length) => value.length <= length ? value : value.slice(0,length + 1).replace(/\s+\S*$/, '').trim()

export function productSeoMetadata(product, origin = 'https://www.jersevo.com') {
  const name = cleanSeoText(product.title || product.name)
  const title = cleanSeoText(product.seo?.title || name).replace(/\s*(?:\||—|–|-)\s*(?:Extra Time|Jersevo)\s*$/i,'')
  return {
    title:`${words(title,60)} | Jersevo`,
    description:cleanSeoText(product.seo?.description) || seoDescription('', product.description || product.subtitle || name,160),
    canonical:new URL(productPath(product),origin).href,
    image:absolute(product.image || product.media?.find(item => item.type === 'IMAGE')?.url || '/assets/hero-tunnel.webp',origin),
    indexable:product.status === 'PUBLISHED' && String(product.seoStatus || product.seo_status || product.seo?.status).toUpperCase() === 'INDEXABLE'
  }
}

export function productBreadcrumbs(product) {
  const values = productTaxonomyValues(product)
  const league = findLeague(values.league)
  const team = league && findTeam(league.key,values.team)
  return [
    { label:'Home', href:'/' }, { label:'Shop', href:'/shop' },
    ...(league ? [{ label:league.name, href:leaguePath(league) }] : []),
    ...(team ? [{ label:team.name, href:teamPath(league.key,team) }] : []),
    { label:product.title || product.name, href:productPath(product) }
  ]
}

export function validGtin(value) {
  const digits = String(value || '')
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits)) return false
  let sum = 0
  for (let index = digits.length - 2, weight = 3; index >= 0; index -= 1, weight = weight === 3 ? 1 : 3) sum += Number(digits[index]) * weight
  return (10 - sum % 10) % 10 === Number(digits.at(-1))
}

export function productStructuredData(product, origin = 'https://www.jersevo.com') {
  const metadata = productSeoMetadata(product, origin)
  const name = cleanSeoText(product.title || product.name)
  const images = [...new Set([metadata.image,...(product.media || []).filter(item => item.type === 'IMAGE').map(item => absolute(item.url,origin))].filter(Boolean))]
  const variants = (product.variants || []).filter(variant => variant.id && variant.status === 'ACTIVE' && Number.isFinite(Number(variant.price)) && Number(variant.price) > 0)
  const common = { name, description:cleanSeoText(product.description || metadata.description), image:images,
    brand:{ '@type':'Brand', name:product.taxonomy?.brand || product.seo?.gmc?.brand || 'Jersevo' },
    category:product.taxonomy?.category || product.productGroup || 'Fan Apparel' }
  const dimensions = new Set()
  const products = variants.map(variant => {
    const properties = {}
    for (const [key,value] of Object.entries(variant.values || variant.option_values || {})) {
      const dimension = ({size:'size',color:'color',colour:'color',material:'material',pattern:'pattern'})[key.toLowerCase()]
      if (dimension) { properties[dimension] = cleanSeoText(value); dimensions.add(`https://schema.org/${dimension}`) }
    }
    const url = `${metadata.canonical}?variant=${encodeURIComponent(variant.id)}`
    const barcode = String(variant.barcode || '')
    return {
      '@type':'Product', '@id':`${metadata.canonical}#variant-${encodeURIComponent(variant.id)}`,
      ...common, name:[name,...Object.values(properties)].join(' — '), ...properties,
      url, sku:variant.sku || undefined,
      ...(validGtin(barcode) ? { [`gtin${barcode.length}`]:barcode } : {}),
      image:variant.image ? [absolute(variant.image,origin)] : images,
      offers:{ '@type':'Offer', url, price:Number(variant.price).toFixed(2), priceCurrency:'USD',
        availability:`https://schema.org/${Number(variant.inventory || 0) > 0 ? 'InStock' : 'OutOfStock'}`,
        itemCondition:'https://schema.org/NewCondition', seller:{ '@id':`${new URL(origin).origin}/#organization` } }
    }
  })
  const entity = products.length > 1 && dimensions.size ? {
    '@context':'https://schema.org', '@type':'ProductGroup', '@id':`${metadata.canonical}#product-group`,
    ...common, url:metadata.canonical, productGroupID:product.id || product.handle,
    variesBy:[...dimensions], hasVariant:products
  } : products.length === 1 ? { '@context':'https://schema.org', ...products[0], name, url:metadata.canonical } : {
    '@context':'https://schema.org', '@type':'Product', ...common, url:metadata.canonical,
    ...(products.length ? { offers:products.map(item => item.offers) } : {})
  }
  return [entity, { '@context':'https://schema.org', '@type':'BreadcrumbList',
    itemListElement:productBreadcrumbs(product).map((item,index) => ({ '@type':'ListItem',position:index+1,name:item.label,item:new URL(item.href,origin).href })) }]
}

export function relatedProducts(product, catalog, limit = 8) {
  const taxonomy = productTaxonomyValues(product)
  return catalog.filter(item => item.id !== product.id && item.status === 'PUBLISHED').map(item => {
    const candidate = productTaxonomyValues(item)
    const score = (taxonomy.league && taxonomy.league === candidate.league ? 2 : 0)
      + (taxonomy.team && taxonomy.team === candidate.team ? 4 : 0)
      + (product.productGroup && product.productGroup === item.productGroup ? 1 : 0)
    return { item, score }
  }).filter(row => row.score > 0).sort((a,b) => b.score-a.score || String(a.item.id).localeCompare(String(b.item.id))).slice(0,limit).map(row => row.item)
}
