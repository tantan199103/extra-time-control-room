import React, { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { isAdminUser } from './lib/catalog-model'
import './admin-access.css'

const isRecoveryRoute = () => new URLSearchParams(window.location.search).get('recovery') === '1'

export default function AdminAccess({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [view, setView] = useState(() => isRecoveryRoute() ? 'reset' : 'signin')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) { setChecking(false); return }
    let active = true
    supabase.auth.getUser().then(({data, error: authError}) => {
      if (!active) return
      setUser(data?.user || null)
      if (authError && authError.name !== 'AuthSessionMissingError' && !isRecoveryRoute()) setError(authError.message)
      setChecking(false)
    }).catch(() => { if (active) { setError('Cannot verify your session. Please retry.'); setChecking(false) } })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') {
        setView('reset')
        setError('')
      }
      setUser(session?.user || null)
      setChecking(false)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const signIn = async event => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) setError(authError.message)
      else { setPassword(''); setUser(data?.user || null) }
    } catch { setError('Sign-in could not be completed. Please retry.') }
    finally { setBusy(false) }
  }

  const sendRecovery = async event => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const redirectTo = new URL('/admin?recovery=1', window.location.origin).toString()
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (authError) setError(authError.message)
      else setNotice(`Recovery email sent to ${email.trim()}. Open the newest link to choose a new password.`)
    } catch { setError('Recovery email could not be sent. Please retry.') }
    finally { setBusy(false) }
  }

  const updatePassword = async event => {
    event.preventDefault()
    setError(''); setNotice('')
    if (password.length < 8) { setError('Use at least 8 characters for the new password.'); return }
    if (password !== passwordConfirm) { setError('The two passwords do not match.'); return }
    setBusy(true)
    try {
      const { data, error: authError } = await supabase.auth.updateUser({ password })
      if (authError) { setError(authError.message); return }
      window.history.replaceState({}, '', '/admin')
      setPassword(''); setPasswordConfirm(''); setUser(data?.user || user); setView('signin')
      setNotice('Password updated. Your admin session is now active.')
    } catch { setError('Password could not be updated. Request a new recovery link and retry.') }
    finally { setBusy(false) }
  }

  const signOut = async () => {
    const { error: authError } = await supabase.auth.signOut({ scope:'local' })
    if (authError) { setError(authError.message); return }
    setUser(null); setPassword(''); setPasswordConfirm(''); setNotice(''); setView('signin')
  }

  if (checking) return <main className="admin-access"><p role="status">Checking admin access…</p></main>
  if (view === 'reset') return <main className="admin-access"><section className="admin-access__panel">
    <a href="/" className="admin-access__brand">90+ <span>Extra Time</span></a>
    <h1>Choose a new password</h1>
    {!supabase ? <p role="alert">Supabase is not configured. Password recovery is unavailable.</p> : user ? <form onSubmit={updatePassword}>
      <p>This secure recovery link is ready. Use a unique password with at least 8 characters.</p>
      <label>New password<input type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} minLength={8} required/></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" value={passwordConfirm} onChange={event=>setPasswordConfirm(event.target.value)} minLength={8} required/></label>
      <button className="admin-access__submit" disabled={busy}>{busy ? 'Updating password…' : 'Update password'}</button>
    </form> : <>
      <p role="alert">This recovery link is invalid or has expired. Request a new link from the Admin sign-in page.</p>
      <button className="admin-access__secondary" onClick={() => { window.history.replaceState({}, '', '/admin'); setView('recovery'); setError('') }}>Request a new link</button>
    </>}
    {error && <p className="admin-access__error" role="alert">{error}</p>}
    <a href="/">Back to the store</a>
  </section></main>
  if (isAdminUser(user)) return <><div className="admin-session-bar"><span>Signed in as {user.email}</span><button onClick={signOut}>Sign out</button>{notice && <span role="status">{notice}</span>}{error && <span role="alert">{error}</span>}</div>{children}</>
  return <main className="admin-access"><section className="admin-access__panel">
    <a href="/" className="admin-access__brand">90+ <span>Extra Time</span></a>
    <h1>{user ? 'Admin access required' : view === 'recovery' ? 'Reset your password' : 'Sign in to your control room'}</h1>
    {!supabase ? <p role="alert">Supabase is not configured. Add the project URL and public key before using Admin.</p> : user ? <><p>This account does not have the admin role. Ask the store owner to grant access through the trusted Supabase admin tools.</p><button className="admin-access__submit" onClick={signOut}>Use a different account</button></> : <form onSubmit={view === 'recovery' ? sendRecovery : signIn}>
      {view === 'recovery' ? <>
        <p>Enter the administrator email. We will send one secure link to choose a new password.</p>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} required/></label>
        <button className="admin-access__submit" disabled={busy}>{busy ? 'Sending recovery link…' : 'Send recovery link'}</button>
        <button type="button" className="admin-access__text-button" onClick={() => { setView('signin'); setError(''); setNotice('') }}>Back to sign in</button>
      </> : <>
        <p>Use an existing store administrator account. Customer accounts cannot manage this store.</p>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required/></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>
        <button className="admin-access__submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="admin-access__text-button" onClick={() => { setView('recovery'); setError(''); setNotice('') }}>Forgot password?</button>
      </>}
    </form>}
    {error && <p className="admin-access__error" role="alert">{error}</p>}
    {notice && <p className="admin-access__notice" role="status">{notice}</p>}
    <a href="/">Back to the store</a>
  </section></main>
}
