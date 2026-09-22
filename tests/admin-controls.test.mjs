import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const admin = await readFile(new URL('../src/admin.jsx', import.meta.url), 'utf8')
const builder = await readFile(new URL('../src/admin-builder.jsx', import.meta.url), 'utf8')
const listing = await readFile(new URL('../src/ListingWorkspace.jsx', import.meta.url), 'utf8')
const variants = await readFile(new URL('../src/VariantMatrix.jsx', import.meta.url), 'utf8')
const adapter = await readFile(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const aiRoute = await readFile(new URL('../api/ai-listing-copy.js', import.meta.url), 'utf8')
const mediaRoute = await readFile(new URL('../api/ai-listing-media.js', import.meta.url), 'utf8')
const storefront = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')

test('admin buttons either have an action or explicitly explain their unavailable state', () => {
  for (const [file, source] of [['admin.jsx', admin], ['admin-builder.jsx', builder], ['ListingWorkspace.jsx', listing], ['VariantMatrix.jsx', variants]]) {
    for (const match of source.matchAll(/<button\b[^>]*>/g)) {
      assert.ok(/\bonClick=|\bdisabled\b/.test(match[0]) || match[0].includes('=>'), `${file}: inert enabled control ${match[0]}`)
      if (/\bdisabled\b/.test(match[0]) && !/\bonClick=/.test(match[0]) && !match[0].includes('=>')) {
        assert.match(match[0], /\btitle=/, `${file}: unavailable control needs an explanation`)
      }
    }
  }
})

test('legacy template workflow is removed from admin navigation and data loading', () => {
  assert.doesNotMatch(admin, /label: 'Templates'/)
  assert.doesNotMatch(admin, /fetchAdminTemplates/)
  assert.doesNotMatch(admin, /AdminTemplates/)
  assert.match(admin, /<ListingWorkspace/)
  assert.match(admin, /aria-label="Search admin — not available yet" disabled/)
  assert.match(builder, /window\.open\(`\/collection\/\$\{selected\.handle\}`/)
  assert.match(builder, /LINKS \/ USE ARROWS TO REORDER/)
})

test('listing workspace exposes the complete product operating flow', () => {
  for (const label of ['Story & SEO','Media','Variations & price','Custom fields','Organization']) assert.match(listing, new RegExp(label.replace('&','&')))
  assert.match(listing, /requestAiListingCopy/)
  assert.match(listing, /requestAiListingReview/)
  assert.match(listing, /Review entire listing/)
  assert.match(listing, /requestAiListingMedia/)
  assert.match(listing, /Generate 5 model views/)
  assert.match(listing, /Generate custom guide/)
  assert.match(listing, /Primary keyword/)
  assert.match(listing, /Verified differences/)
  assert.match(listing, /Image caption/)
  assert.match(listing, /imagePlan/)
  assert.match(storefront, /ProductStorySignals/)
  assert.match(listing, /uploadProductMedia/)
  assert.match(listing, /Content blocks/)
  assert.match(listing, /100%/)
  assert.match(listing, /Exact image edit area/)
  assert.match(listing, /previewRegion/)
  assert.match(listing, /Draw area/)
  assert.match(listing, /onPointerMove=\{updateDrawing\}/)
  assert.doesNotMatch(listing, /setRegion\(\{x:35,y:35,width:30,height:15\}\)/)
  assert.match(listing, /Team logo/)
  assert.match(listing, /Allow optional AI fabric finish/)
  assert.match(listing, /duplicateProductDraft/)
  assert.match(listing, /disabled=\{!previewProduct\}/)
  assert.match(listing, /window\.open\(`\/product\/\$\{previewProduct\.handle \|\| previewProduct\.id\}`/)
})

test('media upload, AI writer and bulk pricing keep dangerous authority server-side', () => {
  assert.match(adapter, /storage\.from\('product-media'\)\.upload/)
  assert.match(adapter, /Authorization:`Bearer \$\{session\.access_token\}`/)
  assert.doesNotMatch(adapter, /VITE_AI_TEXT_API_KEY/)
  assert.match(aiRoute, /extra_time_role !== 'admin'/)
  assert.match(aiRoute, /AI_TEXT_API_KEY/)
  assert.match(aiRoute, /image_url/)
  assert.match(aiRoute, /FULL_AUDIT/)
  assert.match(aiRoute, /model-front/)
  assert.match(aiRoute, /suggestion\.audit\.reviewedImageCount = visionUsed \? references\.length : 0/)
  assert.match(mediaRoute, /listingMediaSlot/)
  assert.match(mediaRoute, /sanitizeImagePrivacyMetadata/)
  assert.match(mediaRoute, /requireAdmin/)
  for (const action of ['SET_PRICE','ADD_PRICE','PERCENT_PRICE','SET_COMPARE','SET_COST','SET_STOCK','SET_STATUS']) assert.match(variants,new RegExp(action))
})

test('save and upload failures are visible and never described as success', () => {
  assert.match(listing, /setNotice\(`Not saved: \$\{result\.error\}`\)/)
  assert.match(listing, /setNotice\(`Not saved: \$\{error instanceof Error/)
  assert.match(listing, /role=\{notice\.startsWith\('Not saved:'\)\?'alert':'status'\}/)
  assert.match(listing, /Upload failed:/)
  assert.match(listing, /Changes kept in this preview only; not published\./)
})

test('large admin catalogues use paginated summaries and hydrate one listing on demand', () => {
  assert.match(adapter, /ADMIN_PRODUCT_PAGE_SIZE = 200/)
  assert.match(adapter, /\.range\(from, from \+ ADMIN_PRODUCT_PAGE_SIZE - 1\)/)
  assert.match(adapter, /pod_product_variants\(count\)/)
  assert.match(adapter, /progressive: Boolean\(onPage\)/)
  assert.doesNotMatch(adapter, /'media', 'tags', 'product_group', 'custom_fields', 'seo_status'/)
  assert.match(adapter, /_catalogSummary: true/)
  assert.match(admin, /fetchAdminProduct/)
  assert.match(listing, /sourceProduct\._catalogSummary/)
})
