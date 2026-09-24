import React from 'react'
import { Flag, Grid2X2, Layers3, Package, Shirt, Sparkles, Trophy } from 'lucide-react'

/** Small merchandise marks; the adjacent text remains the accessible label. */
export default function CategoryIcon({ kind = 'all', size = 20, className = '' }) {
  const common = { width:size, height:size, className, 'aria-hidden':true, focusable:false, 'data-category-icon':kind }
  if (kind === 'cap') return <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15.5c.2-5.3 3.2-8 8-8s7.8 2.7 8 8H4Z"/><path d="M4 15.5c-1.8.4-2.8 1.1-2.8 2 0 1.1 1.4 1.8 3.6 1.8 4 0 8.2-1.5 10.3-3.8"/><path d="M12 7.7v4"/></svg>
  if (kind === 'beanie') return <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5.2 15V11a6.8 6.8 0 0 1 13.6 0v4"/><path d="M4 15h16v4.3H4z"/><path d="M9 7.2V15m6-7.8V15"/></svg>
  const Icon = ({ jersey:Shirt, custom:Sparkles, apparel:Layers3, accessories:Package, collectibles:Trophy, gear:Flag, all:Grid2X2 })[kind] || Grid2X2
  return <Icon {...common} size={size} strokeWidth={1.8}/>
}
