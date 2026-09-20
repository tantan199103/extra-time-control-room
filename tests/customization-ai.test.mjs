import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { buildExactPreviewDirection, normalizePreviewRegion } from '../src/lib/customization-ai.js'
import { prepareExactImageEdit, validateExactImageEdit } from '../api/_exact-image-edit.js'

test('structured personalisation builds a strict in-place edit direction', () => {
  const result = buildExactPreviewDirection({
    title:'After 90',
    details:[
      { label:'Name', value:'TAN', region:{x:30,y:20,width:40,height:10} },
      { label:'Number', value:'16', region:{x:35,y:32,width:30,height:24} }
    ]
  })
  assert.equal(result.mode, 'exact-image-edit')
  assert.equal(result.summary, 'Name: TAN; Number: 16')
  assert.match(result.direction, /strict two-dimensional image edit/i)
  assert.match(result.direction, /Keep the original canvas size, crop, camera angle, garment silhouette/i)
  assert.match(result.direction, /Do not create a 3D mockup/i)
})

test('preview regions are bounded and every requested field requires one', () => {
  assert.deepEqual(normalizePreviewRegion({x:90,y:95,width:40,height:20}), {x:90,y:95,width:10,height:5})
  assert.equal(normalizePreviewRegion({x:'bad',y:0,width:10,height:10}), null)
  assert.throws(() => buildExactPreviewDirection({ title:'After 90' }), /at least one personal detail/)
  assert.throws(() => buildExactPreviewDirection({ title:'After 90', details:[{label:'Name',value:'TAN'}] }), /designer-approved edit area/)
})

test('preview direction removes control characters without accepting freeform notes', () => {
  const result = buildExactPreviewDirection({ title:'Touchline', details:[{ label:'Name', value:'TA\u0000N', region:{x:20,y:20,width:20,height:10} }] })
  assert.equal(result.details[0].value, 'TAN')
  assert.equal('note' in result, false)
})

test('exact edit mask preserves locked pixels and rejects a redesigned result', async () => {
  const reference = await sharp({create:{width:120,height:160,channels:3,background:{r:30,g:80,b:130}}})
    .composite([{input:Buffer.from('<svg width="120" height="160"><rect x="35" y="50" width="50" height="30" fill="#eeeeee"/></svg>'),top:0,left:0}])
    .png().toBuffer()
  const prepared = await prepareExactImageEdit(reference, [{x:28,y:30,width:44,height:22}])
  assert.equal(prepared.canvas.width, 1024)
  assert.equal(prepared.canvas.height, 1536)
  const unchanged = await validateExactImageEdit(prepared, prepared.imageBytes)
  assert.equal(unchanged.type, 'image/png')
  assert.ok(unchanged.metrics.meanDifference < 0.01)
  const redesigned = await sharp({create:{width:1024,height:1536,channels:3,background:{r:220,g:30,b:40}}}).png().toBuffer()
  await assert.rejects(() => validateExactImageEdit(prepared, redesigned), /changed locked parts/)
})
