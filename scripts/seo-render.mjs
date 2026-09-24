import { productBreadcrumbs, productPath, productSeoMetadata, safeJson, usd } from '../src/lib/product-seo.js'
import { cleanSeoText } from '../src/lib/seo-text.js'
import { DEFAULT_QUANTITY_DISCOUNT_POLICY, normalizeQuantityDiscountPolicy, quantityDiscountLabel } from '../src/lib/quantity-pricing.js'

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))
export function publicProductPayload(product) {
  const keys = ['id','handle','title','name','subtitle','story','description','status','price','compareAt','image','alt','media','options','variants','taxonomy','productGroup','type','color','sku','customFields','personalization','artworkLock','contentBlocks','seo','seoStatus','updatedAt','inventory','badge','delivery','bulkOffers','commerce','merchandising','printTechnology']
  const row = Object.fromEntries(keys.filter(key => product[key] !== undefined).map(key => [key,product[key]]))
  row.variants = (product.variants || []).filter(v => v.status === 'ACTIVE').map(v => Object.fromEntries(['id','sku','values','price','compareAt','inventory','status','image','barcode'].filter(k => v[k] !== undefined).map(k => [k,v[k]])))
  row.media = (product.media || []).map(m => Object.fromEntries(['id','type','url','alt','width','height','filename','role'].filter(k => m?.[k] !== undefined).map(k => [k,m[k]])))
  return row
}

export function productBootstrap(product, related = []) {
  return `<script type="application/json" id="jersevo-route-data">${safeJson({version:1,product:publicProductPayload(product),related:related.map(publicProductPayload)})}</script>`
}

export function renderProductContent(product, related = []) {
  const e = escapeHtml
  const breadcrumb = productBreadcrumbs(product).map((item,index,items) => index === items.length-1 ? `<span aria-current="page">${e(item.label)}</span>` : `<a href="${e(item.href)}">${e(item.label)}</a>`).join(' / ')
  const variants = (product.variants || []).filter(v => v.status === 'ACTIVE' && Number(v.price) > 0)
  const images = (product.media || []).filter(m => m.type === 'IMAGE' && m.url)
  if (!images.length && product.image) images.push({url:product.image,alt:product.alt})
  const copy = (product.contentBlocks || []).filter(Boolean).map(b => {
    const type = String(b.type || 'paragraph').toLowerCase()
    if (type === 'list' || type === 'bullets') {
      const items = Array.isArray(b.items) ? b.items : String(b.content || '').split(/\n|•/).map(item => item.trim()).filter(Boolean)
      return items.length ? `<ul>${items.map(item => `<li>${e(cleanSeoText(item))}</li>`).join('')}</ul>` : ''
    }
    if (!['paragraph','heading','quote'].includes(type)) return ''
    const tag = type === 'heading' ? 'h2' : type === 'quote' ? 'blockquote' : 'p'
    return `<${tag}>${e(cleanSeoText(b.content))}</${tag}>`
  }).join('')
  const customFields = Array.isArray(product.customFields) ? product.customFields.filter(Boolean) : []
  const customCopy = customFields.length ? `<section><h2>Personalization options</h2><p>This design stays fixed while the enabled fields can be personalized before checkout.</p><ul>${customFields.map(field => `<li><strong>${e(field.label || field.key || 'Custom detail')}</strong>${field.help ? ` — ${e(field.help)}` : ''}</li>`).join('')}</ul></section>` : ''
  const commerce = product.commerce || product.merchandising || {}
  const delivery = product.delivery || commerce.delivery || {}
  const production = delivery.production || '3–5 business days'
  const transit = delivery.transit || '5–8 business days'
  const shippingLabel = delivery.shippingLabel || 'FREE US SHIPPING OVER $100'
  const offers = normalizeQuantityDiscountPolicy(product.bulkOffers || commerce.bulkOffers || DEFAULT_QUANTITY_DISCOUNT_POLICY)
  const offerCopy = offers.length ? `<section><h2>Order programs</h2><p>Add eligible pieces to unlock the configured quantity saving at checkout.</p><ul>${offers.map(offer => `<li>${e(quantityDiscountLabel(offer))}: ${offer.discountPercent}% off</li>`).join('')}</ul></section>` : ''
  const facts = Object.entries({Category:product.productGroup,Material:product.taxonomy?.material,Color:product.color,Brand:product.taxonomy?.brand}).filter(([,v])=>v).map(([k,v])=>`<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')
  return `<main class="seo-fallback"><nav aria-label="Breadcrumb">${breadcrumb}</nav><h1>${e(product.title || product.name)}</h1><p>${e(product.description || productSeoMetadata(product).description)}</p>
    <div>${images.slice(0,12).map((m,i)=>`<img src="${e(m.url)}" alt="${e(m.alt || `${product.title} — product view ${i+1}`)}" ${m.width ? `width="${Number(m.width)}"` : ''} ${m.height ? `height="${Number(m.height)}"` : ''} loading="${i ? 'lazy':'eager'}" ${i ? '' : 'fetchpriority="high"'} decoding="async"/>`).join('')}</div>
    ${facts ? `<section><h2>Product details</h2><dl>${facts}</dl></section>` : ''}${customCopy}${copy}${offerCopy}
    <section><h2>Available options and prices</h2><table><thead><tr><th>Option</th><th>Price (USD)</th><th>Availability</th></tr></thead><tbody>${variants.map(v=>`<tr><td><a href="${e(productPath(product))}?variant=${encodeURIComponent(v.id)}">${e(Object.values(v.values || {}).join(' / ') || 'Standard')}</a></td><td>${usd(v.price)}</td><td>${Number(v.inventory)>0?'In stock':'Out of stock'}</td></tr>`).join('')}</tbody></table></section>
    <section><h2>Shipping and returns</h2><p>${e(shippingLabel)}. Production is usually ${e(production)} and transit is usually ${e(transit)}; the final destination quote and delivery window are confirmed at checkout.</p><p>Standard pieces can be returned within 30 days when eligible. Personalized pieces follow the approved custom request; defects and studio errors are reviewed.</p><a href="/shipping">Shipping information</a> · <a href="/returns">Return conditions</a> · <a href="/warranty">Warranty support</a></section>
    ${related.length ? `<nav aria-label="Related products"><h2>More from this collection</h2><ul>${related.map(p=>`<li><a href="${e(productPath(p))}">${e(p.title || p.name)}</a></li>`).join('')}</ul></nav>`:''}</main>`
}

export function renderSitemap(entries, origin) {
  const unique = [...new Map(entries.map(item=>[item.path,item])).values()]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${unique.map(item=>`<url><loc>${escapeHtml(new URL(item.path,origin).href)}</loc>${item.lastmod && Number.isFinite(Date.parse(item.lastmod)) ? `<lastmod>${new Date(item.lastmod).toISOString()}</lastmod>`:''}${(item.images || []).filter(Boolean).slice(0,12).map(url=>`<image:image><image:loc>${escapeHtml(new URL(url,origin).href)}</image:loc></image:image>`).join('')}</url>`).join('\n')}</urlset>`
}
