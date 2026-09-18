# Cloud Run deployment

Cloud Run is the production runtime for the Node API. It runs the existing
`backend/Dockerfile`; Vercel continues to serve the frontend/SEO, and Supabase
continues to provide database, auth, storage and lightweight Edge Functions.

## 1. Google Cloud setup

Install Google Cloud CLI, then authenticate and select a billing-enabled
project:

```powershell
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

The project needs Cloud Run, Artifact Registry, Cloud Build and Secret Manager
APIs. The deploy script enables them automatically.

## 2. Create server secrets

Create these Secret Manager secrets once, without putting values in Git:

```powershell
$names = 'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CHECKOUT_SIGNING_SECRET','AI_IMAGE_API_KEY','AI_TEXT_API_KEY','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID','PADDLE_API_KEY','PADDLE_WEBHOOK_SECRET'
foreach ($name in $names) { gcloud secrets create $name --replication-policy=automatic }
```

Add each value interactively or from a protected CI secret store:

```powershell
gcloud secrets versions add SUPABASE_SERVICE_ROLE_KEY --data-file=.<protected-file>
```

Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor`
on these secrets. Do not pass secret values as `--set-env-vars` and do not put
them in the frontend `.env.local`.

## 3. Build and deploy

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\cloudrun\deploy.ps1 `
  -ProjectId YOUR_PROJECT_ID `
  -Region us-central1
```

The script builds the image in Cloud Build, stores it in Artifact Registry and
deploys a public Cloud Run service. Public invocation is required because the
browser calls the API and PayPal/Paddle must call the webhook. Application
authorization still happens inside the existing handlers.

The service is configured with 1 vCPU, 1 GiB memory, 300-second request timeout,
scale-to-zero and a maximum of 10 instances. Adjust these after observing real
traffic and AI latency.

## 4. Custom domain and Tenten DNS

After deployment, use the Cloud Run console or `gcloud beta run domain-mappings`
to map `api.jersevo.com`, then add the exact DNS records Google provides in the
Tenten DNS panel. Do not guess an A record from the Vercel IP. Cloud Run's
default `run.app` URL is available for smoke testing before DNS is changed.

For production, Google recommends a global external Application Load Balancer
in front of Cloud Run. Direct Cloud Run domain mapping is simpler but currently
preview/limited; choose it only for a small internal launch and verify the
certificate status before switching payment webhooks.

## 5. Vercel and webhook configuration

Set these Vercel variables and redeploy:

```env
VITE_SUPABASE_FUNCTIONS_URL=https://YOUR_PROJECT.supabase.co/functions/v1
VITE_BACKEND_URL=https://api.jersevo.com
```

Set the PayPal/Paddle webhook URL to:

```text
https://api.jersevo.com/api/payment-webhook
```

Verify:

```text
https://api.jersevo.com/health
https://api.jersevo.com/ready
```

`/ready` must return HTTP 200 before enabling live payment settings. Test a
PayPal sandbox create → approve → capture → duplicate webhook sequence first.
