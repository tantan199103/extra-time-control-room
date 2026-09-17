import { enforceSameOrigin, handleApiError, readBody, safeText, sendJson, serverSupabase } from './_security.js'

async function requireCustomer(request,client) {
  const token=String(request.headers?.authorization||'').replace(/^Bearer\s+/i,'')
  if(!token) throw Object.assign(new Error('Sign in with your email before requesting membership.'),{status:401})
  const {data,error}=await client.auth.getUser(token)
  if(error||!data?.user) throw Object.assign(new Error('Your customer session is invalid or expired.'),{status:401})
  return data.user
}

export default async function handler(request,response) {
  if(request.method!=='POST') return sendJson(response,405,{error:'POST membership enrollment requests only.'})
  try {
    enforceSameOrigin(request)
    const body=readBody(request,12000)
    const client=serverSupabase()
    const user=await requireCustomer(request,client)
    const priceId=safeText(body.priceId,64)
    const policyVersionId=safeText(body.policyVersionId,64)
    const customerNote=safeText(body.note,500)
    if(!priceId||!policyVersionId||body.accepted!==true) throw Object.assign(new Error('Choose a billing period and accept the current membership policy.'),{status:422})
    const [{data:price,error:priceError},{data:policy,error:policyError},{data:existingMembership,error:memberError}]=await Promise.all([
      client.from('pod_membership_prices').select('id,program_id,status').eq('id',priceId).eq('status','ACTIVE').maybeSingle(),
      client.from('pod_membership_policy_versions').select('id,program_id,status').eq('id',policyVersionId).eq('status','PUBLISHED').maybeSingle(),
      client.from('pod_memberships').select('id,status,current_period_end').eq('user_id',user.id).in('status',['ACTIVE','TRIALING','PAST_DUE']).limit(1).maybeSingle()
    ])
    if(priceError||policyError||memberError) throw priceError||policyError||memberError
    if(!price||!policy||price.program_id!==policy.program_id) throw Object.assign(new Error('This membership offer is no longer available. Refresh and try again.'),{status:409})
    if(existingMembership) return sendJson(response,409,{error:'This account already has a current membership.',membership:existingMembership})
    await client.from('pod_customer_profiles').upsert({user_id:user.id,email:user.email||'',updated_at:new Date().toISOString()},{onConflict:'user_id'})
    const {error:acceptError}=await client.from('pod_member_policy_acceptances').upsert({user_id:user.id,policy_version_id:policy.id},{onConflict:'user_id,policy_version_id'})
    if(acceptError) throw acceptError
    const requestRow={user_id:user.id,program_id:price.program_id,price_id:price.id,policy_version_id:policy.id,status:'PENDING',customer_note:customerNote}
    const {data,error}=await client.from('pod_membership_enrollment_requests').insert(requestRow).select('id,status,requested_at,price_id').single()
    if(error?.code==='23505') {
      const existing=await client.from('pod_membership_enrollment_requests').select('id,status,requested_at,price_id').eq('user_id',user.id).eq('program_id',price.program_id).eq('status','PENDING').maybeSingle()
      if(existing.data) return sendJson(response,200,{request:existing.data,replayed:true,message:'Your membership request is already waiting for review. No payment has been taken.'})
    }
    if(error) throw error
    return sendJson(response,201,{request:data,message:'Request received. No payment has been taken and membership is not active yet.'})
  } catch(error) { return handleApiError(response,error,'Membership request could not be saved.') }
}
