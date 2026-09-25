import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyProductGroup, categoryForGroup } from '../src/lib/product-group-classifier.js'

test('original merchandise type wins over team names and incidental jersey words', () => {
  assert.equal(classifyProductGroup({title:'Washington Capitals NHL Steak Knife Set',taxonomy:{league:'nhl',productGroup:'Cutlery'}}),'Accessories')
  assert.equal(classifyProductGroup({title:'Moritz Seider Jersey Framed NHL Photo',taxonomy:{league:'nhl',productGroup:'Frames'}}),'Collectibles')
  assert.equal(classifyProductGroup({title:'New Jersey Devils Hockey Hoodie',taxonomy:{league:'nhl',productGroup:'Hoodies'}}),'Fan Apparel')
  assert.equal(classifyProductGroup({title:'New York Yankees Mini Cap Key Chain',taxonomy:{league:'mlb',productGroup:'New York Yankees'}}),'Accessories')
  assert.equal(classifyProductGroup({title:'T.J. Watt Steelers Jersey Pin',taxonomy:{league:'nfl',productGroup:'Pittsburgh Steelers'}}),'Accessories')
})

test('jersey groups route by league and ambiguous apparel uses product noun', () => {
  assert.equal(classifyProductGroup({title:'Garrett Wilson NFL Trikot',taxonomy:{league:'nfl',productGroup:'Jerseys'}}),'Football Jersey')
  assert.equal(classifyProductGroup({title:'Atlanta United Custom Soccer Jersey',taxonomy:{league:'mls',productGroup:'Apparel'}}),'Soccer Jersey')
  assert.equal(classifyProductGroup({title:'Boston Celtics Snapback Cap',taxonomy:{league:'nba',productGroup:'Apparel'}}),'Caps')
  assert.equal(categoryForGroup('Hockey Jersey'),'Hockey Jerseys')
  assert.equal(categoryForGroup('Collectibles'),'Collectibles')
})
