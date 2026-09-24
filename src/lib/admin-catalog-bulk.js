import { prepareDraftVariantActivation } from './catalog-model.js'

/**
 * Apply a catalogue change to full listings only. The list view holds summary
 * records without media, content blocks, options or variants; sending one of
 * those records to pod_save_listing would overwrite or archive real data.
 */
export async function runAdminCatalogBulk(targets, action, value, { fetchProduct, saveProduct, onProgress, concurrency = 3 }) {
  if (!Array.isArray(targets) || !targets.length) return { error:'Select at least one listing.' }
  if (['ADD_TAG','SET_GROUP'].includes(action) && !String(value || '').trim()) return { error:'Enter a value for the bulk change.' }
  if (!['ADD_TAG','SET_GROUP','CLEAR_GROUP','DRAFT','PUBLISHED','ARCHIVED','ACTIVATE_DRAFT_VARIANTS'].includes(action)) return { error:'Choose a supported bulk action.' }
  if (action === 'ACTIVATE_DRAFT_VARIANTS') {
    try { prepareDraftVariantActivation({ variants:[] }, value) }
    catch (error) { return { error:error.message } }
  }

  const saved = []
  const failures = []
  let processed = 0
  let skipped = 0
  let activated = 0
  let ineligibleVariants = 0
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < targets.length) {
      const summary = targets[nextIndex++]
      try {
        const hydrated = await fetchProduct(summary.id)
        if (hydrated.error || !hydrated.data) throw new Error(hydrated.error || 'Complete listing could not be loaded.')
        const product = hydrated.data
        let candidate
        let activating = 0
        let unpriced = 0
        if (action === 'ACTIVATE_DRAFT_VARIANTS') {
          const prepared = prepareDraftVariantActivation(product, value)
          if (!prepared.activated) {
            skipped++
            ineligibleVariants += prepared.skipped
            continue
          }
          candidate = prepared.product
          activating = prepared.activated
          unpriced = prepared.skipped
        } else if (action === 'ADD_TAG') {
          const tag = String(value).trim().toLowerCase().replace(/\s+/g, '-')
          if ((product.tags || []).includes(tag)) { skipped++; continue }
          candidate = { ...product, tags:[...(product.tags || []), tag] }
        } else if (action === 'SET_GROUP') {
          if (product.productGroup === String(value).trim()) { skipped++; continue }
          candidate = { ...product, productGroup:String(value).trim() }
        } else if (action === 'CLEAR_GROUP') {
          if (!product.productGroup) { skipped++; continue }
          candidate = { ...product, productGroup:'' }
        } else {
          if (product.status === action) { skipped++; continue }
          candidate = { ...product, status:action }
        }
        const result = await saveProduct(candidate)
        if (result.error || !result.data) throw new Error(result.error || 'Listing was not saved.')
        saved.push(result.data)
        activated += activating
        ineligibleVariants += unpriced
      } catch (error) {
        failures.push({ id:summary.id, name:summary.name || summary.id, error:error instanceof Error ? error.message : 'Bulk change failed.' })
      } finally {
        processed++
        onProgress?.({ processed, total:targets.length, updated:saved.length, failed:failures.length })
      }
    }
  }

  await Promise.all(Array.from({ length:Math.min(Math.max(1,Number(concurrency) || 1),targets.length) },worker))
  return { data:saved, updated:saved.length, activated, skipped, ineligibleVariants, failures }
}
