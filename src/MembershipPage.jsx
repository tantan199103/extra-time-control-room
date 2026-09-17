import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Clock3, LogOut, Percent, ShieldCheck, Sparkles, Ticket, Truck } from 'lucide-react'
import { customerAuthSnapshot, fetchMembershipOffer, membershipPreview, requestMembershipEnrollment, sendCustomerMagicLink, signOutCustomer } from './lib/supabase'
import './membership.css'

const money = value => `$${Number(value || 0).toFixed(0)}`
const formatDate = value => value ? new Intl.DateTimeFormat('en',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)) : 'Not set'

export default function MembershipPage({ account, onAccountChange }) {
  const [offer,setOffer]=useState(membershipPreview)
  const [selected,setSelected]=useState(membershipPreview.prices[2].id)
  const [email,setEmail]=useState('')
  const [accepted,setAccepted]=useState(false)
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const current=account || {user:null,membership:null,requests:[]}
  const active=['ACTIVE','TRIALING'].includes(current.membership?.status) && (!current.membership.current_period_end || new Date(current.membership.current_period_end)>new Date())
  const pending=current.requests?.find(item=>item.status==='PENDING')

  useEffect(()=>{ let alive=true; fetchMembershipOffer().then(result=>{if(!alive)return;setOffer(result.data || membershipPreview);const annual=(result.data?.prices||[]).find(item=>item.billing_interval==='YEAR');if(annual)setSelected(annual.id)});return()=>{alive=false}},[])
  useEffect(()=>{ if(window.location.hash==='#account') requestAnimationFrame(()=>document.getElementById('account')?.scrollIntoView({behavior:'smooth'})) },[])
  const plan=offer.prices.find(item=>item.id===selected) || offer.prices[0]
  const annualSaving=useMemo(()=>{
    const monthly=offer.prices.find(item=>item.billing_interval==='MONTH')
    const annual=offer.prices.find(item=>item.billing_interval==='YEAR')
    return monthly&&annual ? Math.max(0,monthly.amount*12-annual.amount) : 0
  },[offer])
  const login=async event=>{
    event.preventDefault();setBusy(true);setError('');setMessage('')
    try{await sendCustomerMagicLink(email);setMessage(`Check ${email}. Open the secure link on this device to continue.`)}
    catch(caught){setError(caught instanceof Error?caught.message:'Sign-in link could not be sent.')}
    finally{setBusy(false)}
  }
  const enroll=async()=>{
    if(!current.user){document.getElementById('account')?.scrollIntoView({behavior:'smooth'});setError('Sign in with your email before requesting a season pass.');return}
    setBusy(true);setError('');setMessage('')
    try{const result=await requestMembershipEnrollment({priceId:plan.id,policyVersionId:offer.policy.id,note,accepted});setMessage(result.message);const snapshot=await customerAuthSnapshot();onAccountChange?.(snapshot)}
    catch(caught){setError(caught instanceof Error?caught.message:'Membership request could not be saved.')}
    finally{setBusy(false)}
  }
  const logout=async()=>{setBusy(true);setError('');try{await signOutCustomer();const snapshot=await customerAuthSnapshot();onAccountChange?.(snapshot)}catch(caught){setError(caught.message)}finally{setBusy(false)}}
  return <main className="membership-page">
    <section className="membership-hero">
      <div className="membership-hero__copy">
        <p>90+ CLUB / SEASON 2026</p>
        <h1>MORE TIME.<br/>BETTER ACCESS.</h1>
        <span>{offer.program.description}</span>
        <div className="membership-hero__facts"><b><Percent/>20–40% <small>eligible member pricing</small></b><b><Truck/>Included <small>eligible standard shipping</small></b><b><Clock3/>First in <small>selected drops and releases</small></b></div>
      </div>
      <aside className="season-pass" aria-label="Selected 90+ Club season pass">
        <div className="season-pass__rail"><span>90+</span><small>MEMBER<br/>ACCESS</small></div>
        <div className="season-pass__body">
          <div className="season-pass__top"><span>EXTRA TIME</span><Ticket size={21}/></div>
          <div><small>SEASON PASS</small><strong>{offer.program.name}</strong><p>{plan?.label || 'Choose a period'} · Membership request</p></div>
          <div className="season-pass__price"><strong>{money(plan?.amount)}</strong><span>/{plan?.billing_interval==='MONTH'?'month':plan?.billing_interval==='QUARTER'?'quarter':'year'}</span></div>
          <div className="season-pass__code"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
          <small>Activation requires confirmed payment or authorized manual approval.</small>
        </div>
      </aside>
    </section>

    <section className="membership-join" id="join">
      <div className="membership-join__intro"><span>CHOOSE YOUR TERM</span><h2>ONE CLUB.<br/>YOUR CADENCE.</h2><p>Every period unlocks the same benefits. Longer terms reduce the effective monthly membership fee.</p></div>
      <div className="membership-enroll">
        <div className="membership-periods" role="radiogroup" aria-label="Billing period">{offer.prices.map(item=><button role="radio" aria-checked={selected===item.id} className={selected===item.id?'is-active':''} key={item.id} onClick={()=>{setSelected(item.id);setError('')}}><span>{item.label}</span><strong>{money(item.amount)}</strong><small>{item.billing_interval==='YEAR'&&annualSaving?`Save ${money(annualSaving)} vs monthly`:item.billing_interval==='QUARTER'?`${money(item.amount/3)} / month equivalent`:'Flexible entry'}</small></button>)}</div>
        <div className="membership-enroll__terms">
          <label><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/><span>I accept <button onClick={()=>document.getElementById('club-policy')?.scrollIntoView({behavior:'smooth'})}>{offer.policy.title}</button> ({offer.policy.version}).</span></label>
          <label className="membership-note"><span>Note for the club team <small>Optional</small></span><textarea value={note} onChange={event=>setNote(event.target.value.slice(0,500))} placeholder="Questions about delivery, eligibility or your account…"/><small>{note.length}/500</small></label>
        </div>
        {active ? <div className="membership-state is-active"><Check/><span><strong>Your season pass is active.</strong><small>Valid until {formatDate(current.membership.current_period_end)} · Benefits are calculated automatically when eligible.</small></span></div> : pending ? <div className="membership-state"><Clock3/><span><strong>Your request is waiting for review.</strong><small>No payment has been taken and VIP benefits are not active yet.</small></span></div> : <button className="membership-enroll__cta" onClick={enroll} disabled={busy||!plan||(Boolean(current.user)&&!accepted)}>{busy?'SAVING REQUEST…':current.user?`REQUEST ${plan?.label?.toUpperCase()} PASS`:'SIGN IN TO REQUEST'}<ArrowRight/></button>}
        <p className="membership-enroll__truth"><ShieldCheck size={15}/> This build records an enrollment request only. It does not charge you or claim that membership is active.</p>
        {message&&<p className="membership-feedback" role="status">{message}</p>}{error&&<p className="membership-feedback is-error" role="alert">{error}</p>}
      </div>
    </section>

    <section className="membership-benefits"><div><span>WHAT THE PASS UNLOCKS</span><h2>BUILT FOR THE<br/>NEXT DROP.</h2></div><div className="membership-benefits__list">{offer.program.benefits.map((benefit,index)=><article key={benefit.id || benefit.title}><span>{String(index+1).padStart(2,'0')}</span><div><h3>{benefit.title}</h3><p>{benefit.copy}</p></div><Check/></article>)}</div></section>

    <section className="membership-account" id="account">
      <div className="membership-account__head"><span>YOUR ACCOUNT</span><h2>{current.user?'THE PASS HOLDER.':'ENTER BY EMAIL.'}</h2></div>
      {current.user ? <div className="membership-account__signed"><div><small>SIGNED IN AS</small><strong>{current.user.email}</strong><span>{active?`Membership ${current.membership.status.toLowerCase()}`:pending?'Enrollment pending':'No active membership'}</span></div><button onClick={logout} disabled={busy}><LogOut size={16}/> Sign out</button></div> : <form onSubmit={login}><label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@example.com" required/></label><button disabled={busy}>{busy?'SENDING LINK…':'EMAIL ME A SIGN-IN LINK'}<ArrowRight size={17}/></button><small>No password needed. The secure link returns you to this page.</small></form>}
    </section>

    <section className="membership-policy" id="club-policy"><div><Sparkles/><span>THE CLEAR VERSION</span><h2>BENEFITS WITH<br/>BOUNDARIES.</h2></div><div><p>{offer.policy.summary}</p>{String(offer.policy.content||'').split(/\n\n+/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}<small>Policy {offer.policy.version} · Published benefits in Admin control the live offer.</small></div></section>
  </main>
}
