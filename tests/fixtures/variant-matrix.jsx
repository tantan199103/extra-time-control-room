// Dev-only component fixture. No authentication bypass, API calls or store data.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import VariantMatrix from '../../src/VariantMatrix'
import '../../src/styles.css'
function Fixture() {
  const [product,setProduct]=useState({id:'fixture',sku:'QA',price:89,options:[],variants:[]})
  return <main style={{maxWidth:700,margin:'32px auto'}}><h1>Isolated variant matrix test</h1><p>Local fixture only. Changes are not saved to the store.</p><VariantMatrix product={product} onChange={variants=>setProduct(current=>({...current,variants}))} onOptionsChange={options=>setProduct(current=>({...current,options}))}/></main>
}
createRoot(document.getElementById('root')).render(<Fixture/> )
