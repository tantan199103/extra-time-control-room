param(
  [Parameter(Mandatory = $true)] [string] $ProjectId,
  [string] $Region = 'us-central1',
  [string] $Service = 'jersevo-api',
  [string] $Repository = 'jersevo',
  [string] $AllowedOrigins = 'https://www.jersevo.com,https://jersevo.com'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'Google Cloud CLI (gcloud) is not installed. Install it, run gcloud auth login, then rerun this script.'
}

Write-Host "Using Google Cloud project $ProjectId in $Region"
gcloud auth list
gcloud config set project $ProjectId
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories describe $Repository --location=$Region *> $null
if ($LASTEXITCODE -ne 0) {
  gcloud artifacts repositories create $Repository --repository-format=docker --location=$Region --description='Jersevo Cloud Run images'
}

$version = Get-Date -Format 'yyyyMMdd-HHmmss'
$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/$Service`:$version"
gcloud builds submit --tag $image .

# Secrets must already exist in Secret Manager. The script never reads or
# prints their values. Grant the Cloud Run service identity secretAccessor for
# these secrets before the first deploy.
$secretNames = @(
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CHECKOUT_SIGNING_SECRET',
  'AI_IMAGE_API_KEY',
  'AI_TEXT_API_KEY',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_WEBHOOK_ID',
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET'
)
$secretBindings = ($secretNames | ForEach-Object { "${_}=${_}:latest" }) -join ','

gcloud run deploy $Service `
  --image=$image `
  --region=$Region `
  --platform=managed `
  --allow-unauthenticated `
  --port=8080 `
  --cpu=1 `
  --memory=1Gi `
  --timeout=300 `
  --concurrency=40 `
  --min-instances=0 `
  --max-instances=10 `
  --set-env-vars="NODE_ENV=production,PORT=8080,ALLOWED_ORIGINS=$AllowedOrigins,TRUST_PROXY=true,SITE_URL=https://www.jersevo.com,AI_IMAGE_API_URL=https://api.apikey.fan/v1/images/edits,AI_IMAGE_MODEL=gpt-image-2,AI_IMAGE_QUALITY=medium,AI_TEXT_API_URL=https://api.apikey.fan/v1,AI_TEXT_MODEL=gpt-4.1-mini" `
  --update-secrets=$secretBindings

$url = gcloud run services describe $Service --region=$Region --format='value(status.url)'
Write-Host "Cloud Run service URL: $url"
Write-Host 'Next: map api.jersevo.com to this service, then set VITE_BACKEND_URL in Vercel.'
