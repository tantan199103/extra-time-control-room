import { productBreadcrumbs, productPath, productSeoMetadata, safeJson, usd } from '../src/lib/product-seo.js'
import { cleanSeoText } from '../src/lib/seo-text.js'

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))
export function publicProductPayload(product) {
  const keys = ['id','handle','title','name','subtitle','story','description','status','price','compareAt','image','alt','media','options','variants','taxonomy','productGroup','type','color','sku','customFields','personalization','artworkLock','contentBlocks','seo','seoStatus','updatedAt','inventory','badge']
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
  const copy = (product.contentBlocks || []).filter(b => ['paragraph','heading','quote'].includes(b.type)).map(b => {
    const tag = b.type === 'heading' ? 'h2' : b.type === 'quote' ? 'blockquote' : 'p'
    return `<${tag}>${e(cleanSeoText(b.content))}</${tag}>`
  }).join('')
  const facts = Object.entries({Category:product.productGroup,Material:product.taxonomy?.material,Color:product.color,Brand:product.taxonomy?.brand}).filter(([,v])=>v).map(([k,v])=>`<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')
  return `<main class="seo-fallback"><nav aria-label="Breadcrumb">${breadcrumb}</nav><h1>${e(product.title || product.name)}</h1><p>${e(product.description || productSeoMetadata(product).description)}</p>
    <div>${images.slice(0,12).map((m,i)=>`<img src="${e(m.url)}" alt="${e(m.alt || `${product.title} — product view ${i+1}`)}" ${m.width ? `width="${Number(m.width)}"` : ''} ${m.height ? `height="${Number(m.height)}"` : ''} loading="${i ? 'lazy':'eager'}" ${i ? '' : 'fetchpriority="high"'} decoding="async"/>`).join('')}</div>
    ${facts ? `<section><h2>Product details</h2><dl>${facts}</dl></section>` : ''}${copy}
    <section><h2>Available options and prices</h2><table><thead><tr><th>Option</th><th>Price (USD)</th><th>Availability</th></tr></thead><tbody>${variants.map(v=>`<tr><td><a href="${e(productPath(product))}?variant=${encodeURIComponent(v.id)}">${e(Object.values(v.values || {}).join(' / ') || 'Standard')}</a></td><td>${usd(v.price)}</td><td>${Number(v.inventory)>0?'In stock':'Out of stock'}</td></tr>`).join('')}</tbody></table></section>
    <section><h2>Shipping and returns</h2><p>Shipping options and charges are confirmed at checkout. Standard and personalized orders have different return conditions.</p><a href="/shipping">Shipping information</a> · <a href="/returns">Return conditions</a> · <a href="/warranty">Warranty support</a></section>
    ${related.length ? `<nav aria-label="Related products"><h2>More from this collection</h2><ul>${related.map(p=>`<li><a href="${e(productPath(p))}">${e(p.title || p.name)}</a></li>`).join('')}</ul></nav>`:''}</main>`
}

export function renderSitemap(entries, origin) {
  const unique = [...new Map(entries.map(item=>[item.path,item])).values()]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${unique.map(item=>`<url><loc>${escapeHtml(new URL(item.path,origin).href)}</loc>${item.lastmod && Number.isFinite(Date.parse(item.lastmod)) ? `<lastmod>${new Date(item.lastmod).toISOString()}</lastmod>`:''}${(item.images || []).filter(Boolean).slice(0,12).map(url=>`<image:image><image:loc>${escapeHtml(new URL(url,origin).href)}</image:loc></image:image>`).join('')}</url>`).join('\n')}</urlset>`
}
