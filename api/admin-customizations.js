import { enforceSameOrigin, handleApiError, readBody, requireAdmin, safeText, sendJson, serverSupabase } from './_security.js'

const allowedStatuses=new Set(['PREVIEW','CONFIRMED','RENDERING','READY','CANCELLED'])
const transitions={PREVIEW:new Set(['CONFIRMED','CANCELLED']),CONFIRMED:new Set(['RENDERING','CANCELLED']),RENDERING:new Set(['READY','CANCELLED']),READY:new Set([]),CANCELLED:new Set([])}

async function signedAsset(client, ref) {
  const bucket=safeText(ref?.bucket,80), path=safeText(ref?.path,700)
  if(!['customer-references','ai-previews'].includes(bucket)||!path)return null
  const {data,error}=await client.storage.from(bucket).createSignedUrl(path,60*60)
  return error||!data?.signedUrl?null:{bucket,path,url:data.signedUrl,expiresIn:3600}
}

async function present(client,row){
  const payload=row.payload&&typeof row.payload==='object'?row.payload:{}
  const references=(await Promise.all(Object.entries(payload.assetRefs||{}).map(async([key,ref])=>({key,...await signedAsset(client,ref)})))).filter(item=>item.url)
  const aiPreview=await signedAsset(client,payload.aiPreviewStorage)
  return {...row,payload:{...payload,aiPreviewUrl:undefined},assets:{references,aiPreview}}
}

export default async function handler(request,response){
  try{
    enforceSameOrigin(request)
    const client=serverSupabase()
    const admin=await requireAdmin(request,client)
    if(request.method==='GET'){
      const status=safeText(request.query?.status,20).toUpperCase()
      let query=client.from('pod_customization_orders').select('id,product_id,variant_id,payload,status,customer_email,created_at,updated_at').order('created_at',{ascending:false}).limit(200)
      if(allowedStatuses.has(status))query=query.eq('status',status)
      const {data,error}=await query
      if(error)throw error
      return sendJson(response,200,{orders:await Promise.all((data||[]).map(row=>present(client,row)))})
    }
    if(request.method==='PATCH'){
      const body=readBody(request,12000)
      const id=safeText(body.id,180), next=safeText(body.status,20).toUpperCase()
      if(!id||!allowedStatuses.has(next))throw Object.assign(new Error('A valid request and status are required.'),{status:422})
      const {data:current,error:readError}=await client.from('pod_customization_orders').select('id,status').eq('id',id).maybeSingle()
      if(readError)throw readError
      if(!current)throw Object.assign(new Error('Customization request not found.'),{status:404})
      if(current.status!==next&&!transitions[current.status]?.has(next))throw Object.assign(new Error(`Cannot move ${current.status} to ${next}.`),{status:409})
      const {data,error}=await client.from('pod_customization_orders').update({status:next,updated_at:new Date().toISOString()}).eq('id',id).select('id,status,updated_at').single()
      if(error)throw error
      await client.from('pod_audit_logs').insert({actor_id:admin.id,entity_type:'customization-order',entity_id:id,action:`STATUS_${next}`,snapshot:{previousStatus:current.status,status:next}})
      return sendJson(response,200,{order:data})
    }
    return sendJson(response,405,{error:'GET or PATCH customization operations only.'})
  }catch(error){return handleApiError(response,error,'Customization operations could not be loaded.')}
}
