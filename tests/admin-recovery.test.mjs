import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const access = await readFile(new URL('../src/AdminAccess.jsx', import.meta.url), 'utf8')

test('admin password recovery uses the current deployment and a dedicated recovery route', () => {
  assert.match(access, /new URL\('\/admin\?recovery=1', window\.location\.origin\)/)
  assert.match(access, /resetPasswordForEmail\(email\.trim\(\), \{ redirectTo \}\)/)
  assert.match(access, /event === 'PASSWORD_RECOVERY'/)
})

test('admin password reset requires confirmation and a minimum length', () => {
  assert.match(access, /password\.length < 8/)
  assert.match(access, /password !== passwordConfirm/)
  assert.match(access, /updateUser\(\{ password \}\)/)
  assert.match(access, /autoComplete="new-password"/)
})

test('admin sign-in exposes a real forgot-password action', () => {
  assert.match(access, />Forgot password\?<\/button>/)
  assert.match(access, /'Send recovery link'/)
  assert.match(access, /onSubmit=\{view === 'recovery' \? sendRecovery : signIn\}/)
  assert.doesNotMatch(access, /type="password"[^>]*value=\{password\}[^>]*onChange[^>]*value=\{passwordConfirm\}/)
})
