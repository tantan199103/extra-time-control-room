import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const admin = await readFile(new URL('../src/admin.jsx', import.meta.url), 'utf8')
const builder = await readFile(new URL('../src/admin-builder.jsx', import.meta.url), 'utf8')

test('admin buttons either have an action or explicitly explain their unavailable state', () => {
  for (const [file, source] of [['admin.jsx', admin], ['admin-builder.jsx', builder]]) {
    for (const match of source.matchAll(/<button\b[^>]*>/g)) {
      assert.match(match[0], /\bonClick=|\bdisabled\b/, `${file}: inert enabled control ${match[0]}`)
      if (/\bdisabled\b/.test(match[0]) && !/\bonClick=/.test(match[0])) {
        assert.match(match[0], /\btitle=/, `${file}: unavailable control needs an explanation`)
      }
    }
  }
})

test('missing admin journeys no longer pretend to be actionable', () => {
  assert.match(admin, /action="New template · Coming soon" actionDisabled/)
  assert.doesNotMatch(admin, /setSelectedId\(null\)/)
  assert.match(admin, /aria-label="Search admin — not available yet" disabled/)
  assert.doesNotMatch(builder, /window\.open\(`\/collection\//)
  assert.match(builder, /disabled title="Collection pages are not available on the storefront yet\."/)
  assert.match(builder, /LINKS \/ USE ARROWS TO REORDER/)
})

test('product preview is only enabled for an existing storefront listing', () => {
  assert.match(admin, /storefrontProducts\.find\(product => product\.id === draft\.id\)/)
  assert.match(admin, /disabled=\{!previewProduct\}/)
  assert.match(admin, /go\(`\/product\/\$\{previewProduct\.id\}`\)/)
})

function createSaveHandler(component, saveName, persist) {
  const start = admin.indexOf(`function ${component}(`)
  const section = admin.slice(start, admin.indexOf('\nfunction ', start + 1))
  const handler = section.match(/const save = (async \(\) => \{[\s\S]*?\n  \})/)?.[1]
  assert.ok(handler, `${component} save handler exists`)
  const notices = []
  const saving = []
  const updates = []
  const draft = { id: 'test', title: 'Draft', description: 'Draft description' }
  const save = Function(saveName, 'setSaving', 'setNotice', 'draft', 'selected', 'onSaved', 'setDraft', 'id', `return (${handler})`)(
    persist,
    value => saving.push(value),
    value => notices.push(value),
    draft,
    draft,
    value => updates.push(value),
    () => {},
    'existing-product'
  )
  return { save, notices, saving, updates }
}

for (const [component, saveName] of [['AdminProductEditor', 'saveAdminProduct'], ['AdminTemplates', 'saveAdminTemplate']]) {
  test(`${component}: returned save errors stay errors and never update success state`, async () => {
    const state = createSaveHandler(component, saveName, async () => ({ source: 'preview', error: 'Permission denied' }))
    await state.save()
    assert.equal(state.notices.at(-1), 'Not saved: Permission denied')
    assert.deepEqual(state.updates, [])
    assert.deepEqual(state.saving, [true, false])
  })

  test(`${component}: thrown save errors are visible and release the busy state`, async () => {
    const state = createSaveHandler(component, saveName, async () => { throw new Error('Network unavailable') })
    await state.save()
    assert.equal(state.notices.at(-1), 'Not saved: Network unavailable')
    assert.deepEqual(state.updates, [])
    assert.deepEqual(state.saving, [true, false])
  })

  test(`${component}: local preview edits are never described as published`, async () => {
    const state = createSaveHandler(component, saveName, async () => ({ source: 'preview', error: null }))
    await state.save()
    assert.equal(state.notices.at(-1), 'Changes kept in this preview only; not published.')
    assert.deepEqual(state.saving, [true, false])
    assert.equal(state.updates.length, component === 'AdminProductEditor' ? 1 : 0)
  })
}

test('save failure notices use alert semantics and an error icon', () => {
  for (const source of [admin, builder]) {
    assert.match(source, /role=\{notice\.startsWith\("Not saved:"\) \? "alert" : "status"\}/)
    assert.match(source, /notice\.startsWith\("Not saved:"\) \? <X size=\{15\}\/> : <Check/)
  }
})
