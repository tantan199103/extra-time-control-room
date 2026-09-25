import test from 'node:test'
import assert from 'node:assert/strict'
import { planTaassCoverage } from '../scripts/audit-taass-coverage.mjs'

test('coverage audit names exact missing families even when URL scopes overlap', () => {
  const groups = [
    { familyCode: '100001', urls: ['https://www.taass.com/team-cap/100001'] },
    { familyCode: '100002', urls: ['https://www.taass.com/team-jersey/100002'] },
    { familyCode: '100003', urls: ['https://www.taass.com/jersey-shore-cap/100003'] },
    { familyCode: '100004', urls: ['https://www.taass.com/team-sweater/100004'] }
  ]
  const result = planTaassCoverage(groups, ['100001'])
  assert.equal(result.importedFamilies, 1)
  assert.equal(result.missingFamilies, 3)
  assert.deepEqual(result.missing.map(row => [row.familyCode, row.candidateScopes]), [
    ['100002', ['JERSEY']],
    ['100003', ['HEADWEAR', 'JERSEY']],
    ['100004', []]
  ])
})
