/**
 * Controlled catalogue values used by the admin listing workspace.
 *
 * These are intentionally small, human-readable values.  They are a UI
 * contract, not database IDs, so a future taxonomy service can replace this
 * module without changing the product shape.  Legacy values are appended by
 * the workspace so an old listing can be edited without being silently
 * rewritten.
 */
export const CATALOG_CATEGORY_OPTIONS = Object.freeze([
  { value:'Football Jerseys', label:'Football jerseys' },
  { value:'Basketball Jerseys', label:'Basketball jerseys' },
  { value:'Baseball Jerseys', label:'Baseball jerseys' },
  { value:'Fan Apparel', label:'Fan apparel' },
  { value:'Custom Jerseys', label:'Custom jerseys' },
  { value:'Accessories', label:'Accessories' }
])

export const SEASON_DROP_OPTIONS = Object.freeze([
  { value:'The 90+ Drop', label:'The 90+ Drop' },
  { value:'Drop 01 / 2026', label:'Drop 01 / 2026' },
  { value:'Drop 02 / 2026', label:'Drop 02 / 2026' },
  { value:'Evergreen', label:'Evergreen' },
  { value:'Archive', label:'Archive' }
])

export function optionsWithLegacyValues(presets, value) {
  const current = String(value || '').trim()
  if (!current || presets.some(option => option.value === current)) return presets
  return [{ value:current, label:`Legacy value · ${current}` }, ...presets]
}

export function controlledTaxonomyValues() {
  return {
    categories: CATALOG_CATEGORY_OPTIONS.map(option => option.value),
    seasons: SEASON_DROP_OPTIONS.map(option => option.value)
  }
}
