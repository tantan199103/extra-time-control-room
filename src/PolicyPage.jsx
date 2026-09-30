import { useEffect, useState } from 'react'
import { ArrowRight, Check, ChevronDown, CircleHelp, PackageCheck, ShieldCheck } from 'lucide-react'
import { TRUST_PAGES } from './lib/trust-pages'

const BUSINESS_DETAILS = Object.freeze({
  legalName:'Jersevo',
  brand:'Extra Time',
  email:'support@jersevo.com',
  location:'Texas, United States'
})

function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'instant' })
}
export default function PolicyPage({ type, components = {} }) {
  const { Breadcrumbs, StorefrontTrust } = components
  const page = TRUST_PAGES[type] || TRUST_PAGES.shipping
  const [openFaq,setOpenFaq] = useState(0)
  useEffect(() => setOpenFaq(0), [type])
  const policyLinks = [['shipping','Shipping'],['returns','Returns'],['privacy','Privacy'],['terms','Terms'],['accessibility','Accessibility']]
  return <main className={`policy-page policy-page--${type}`}>
    <div className="policy-breadcrumb-wrap"><Breadcrumbs items={[{ label:'Trust desk', href:'/shipping' }, { label:page.title.replace('.', '') }]}/></div><section className="policy-hero"><div className="policy-hero__copy"><span>{page.eyebrow}</span><h1>{page.title}<br /><em>{page.accent}</em></h1><p>{page.intro}</p><div className="policy-hero__actions"><button className="button button--dark" onClick={() => navigate('/shop')}>SHOP THE DROP <ArrowRight size={16}/></button><button className="button-link" onClick={() => navigate('/track-order')}>TRACK AN ORDER <ArrowRight size={16}/></button></div></div><figure className="policy-hero__media"><img src={page.image} alt={page.imageAlt} loading="eager" fetchPriority="high" decoding="async"/><figcaption><span>EXTRA TIME / TRUST DESK</span><strong>Clear answers before you commit.</strong></figcaption></figure></section>
    <section className="policy-facts" aria-label={`${page.title} at a glance`}>{page.facts.map(([label,value],index) => <div key={label}><span>{String(index + 1).padStart(2,'0')}</span><strong>{label}</strong><small>{value}</small></div>)}</section><section className="policy-contact" aria-label="Jersevo business contact"><span>BUSINESS CONTACT</span><div><strong>{BUSINESS_DETAILS.legalName}</strong><p>Operator of {BUSINESS_DETAILS.brand} · {BUSINESS_DETAILS.location}</p></div><a href={`mailto:${BUSINESS_DETAILS.email}`}>{BUSINESS_DETAILS.email}<ArrowRight size={15}/></a></section>
    <section className="policy-layout"><aside className="policy-rail"><div><span>IN THIS DESK</span>{policyLinks.map(([key,label]) => <button key={key} className={type === key ? 'is-active' : ''} onClick={() => navigate(`/${key}`)}>{label}<ArrowRight size={14}/></button>)}<button className={type === 'warranty' ? 'is-active' : ''} onClick={() => navigate('/warranty')}>Warranty<ArrowRight size={14}/></button><button className={type === 'journal' ? 'is-active' : ''} onClick={() => navigate('/journal')}>Journal<ArrowRight size={14}/></button></div><div className="policy-rail__note"><ShieldCheck size={18}/><strong>Built for a confident checkout.</strong><span>Payment is verified server-side, private order links protect status details and publishing never happens by accident.</span></div></aside><article className="policy-article"><div className="policy-article__intro"><span>{type === 'journal' ? 'READ THE STORY' : 'READ BEFORE YOU ORDER'}</span><h2>{type === 'journal' ? 'The useful version of the story.' : 'The short version first.'}</h2><p>{type === 'privacy' ? 'A privacy page should tell you what happens to your details, not bury the answer under legal fog.' : type === 'terms' ? 'These are the operating rules for product, payment and personalization. If a detail matters to the order, it appears before payment.' : type === 'warranty' ? 'A warranty page should separate a production problem from normal wear and give you a safe next action.' : 'Use the sections below to find the decision that matters to you.'}</p></div>{page.sections.map(section => <section className="policy-section" key={section.heading}><h3>{section.heading}</h3><p>{section.body}</p><ul>{section.list.map(item => <li key={item}><Check size={15}/><span>{item}</span></li>)}</ul></section>)}<section className="policy-faq"><div className="policy-faq__heading"><CircleHelp size={19}/><div><span>QUICK ANSWERS</span><h3>Still deciding?</h3></div></div>{page.faqs.map(([question,answer],index) => <div className={`policy-faq__item ${openFaq === index ? 'is-open' : ''}`} key={question}><button onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}><span>{question}</span><ChevronDown size={16}/></button>{openFaq === index && <p>{answer}</p>}</div>)}</section><div className="policy-article__footer"><PackageCheck size={18}/><span>Need order-specific help? Use the private tracking link, then return to the <button onClick={() => navigate('/shop')}>current drop</button>.</span></div></article></section>
    <StorefrontTrust compact/>
  </main>
}
