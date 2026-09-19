param(
  [Parameter(Mandatory = $true)] [string] $ProjectId,
  [string] $Region = 'us-central1',
  [string] $Service = 'jersevo-api',
  [string] $Repository = 'jersevo',
  [string] $AllowedOrigins = 'https://www.jersevo.com,https://jersevo.com',
  [string] $RuntimeServiceAccount = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'Google Cloud CLI (gcloud) is not installed. Install it, run gcloud auth login, then rerun this script.'
}

Write-Host "Using Google Cloud project $ProjectId in $Region"
gcloud auth list
gcloud config set project $ProjectId
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

if ([string]::IsNullOrWhiteSpace($RuntimeServiceAccount)) {
  $RuntimeServiceAccount = "$Service-runtime@$ProjectId.iam.gserviceaccount.com"
}
$runtimeName = $RuntimeServiceAccount.Split('@')[0]
gcloud iam service-accounts describe $RuntimeServiceAccount --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  gcloud iam service-accounts create $runtimeName --project=$ProjectId --display-name="$Service Cloud Run runtime"
}

gcloud artifacts repositories describe $Repository --location=$Region *> $null
if ($LASTEXITCODE -ne 0) {
  gcloud artifacts repositories create $Repository --repository-format=docker --location=$Region --description='Jersevo Cloud Run images'
}

$version = Get-Date -Format 'yyyyMMdd-HHmmss'
$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/$Service`:$version"
# The Dockerfile lives under backend/, while its COPY statements intentionally
# use the repository root as build context (api/, src/, backend/src/).
gcloud builds submit --config=deploy/cloudrun/cloudbuild.yaml --substitutions="_IMAGE=$image" .

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
$availableSecrets = @(
  $secretNames | Where-Object {
    gcloud secrets describe $_ --quiet *> $null
    $LASTEXITCODE -eq 0
  }
)
$missingSecrets = @($secretNames | Where-Object { $_ -notin $availableSecrets })
if ($missingSecrets.Count -gt 0) {
  Write-Warning ("Secret Manager entries not found; deployment will remain fail-closed until added: " + ($missingSecrets -join ', '))
}
$availableSecrets | ForEach-Object {
  gcloud secrets add-iam-policy-binding $_ --project=$ProjectId --member="serviceAccount:$RuntimeServiceAccount" --role='roles/secretmanager.secretAccessor' --condition=None --quiet --format='none'
}
$secretBindings = ($availableSecrets | ForEach-Object { "${_}=${_}:latest" }) -join ','

$deployArgs = @(
  'run', 'deploy', $Service,
  "--image=$image",
  "--region=$Region",
  '--platform=managed',
  '--allow-unauthenticated',
  "--service-account=$RuntimeServiceAccount",
  '--port=8080',
  '--cpu=1',
  '--memory=1Gi',
  '--timeout=300',
  '--concurrency=40',
  '--min-instances=0',
  '--max-instances=10',
  '--env-vars-file=deploy/cloudrun/public-env.yaml'
)
# The argument array below is the equivalent of `gcloud run deploy` and keeps
# comma-containing values out of PowerShell's dictionary parser.
if ($secretBindings) { $deployArgs += "--update-secrets=$secretBindings" }

gcloud @deployArgs

$url = gcloud run services describe $Service --region=$Region --format='value(status.url)'
Write-Host "Cloud Run service URL: $url"
Write-Host 'Next: map api.jersevo.com to this service, then set VITE_BACKEND_URL in Vercel.'
