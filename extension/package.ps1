$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'dist-extension'
$artifactDirectory = Join-Path $repoRoot 'artifacts'
$destination = Join-Path $artifactDirectory 'pod-bridge-v1.zip'

if (-not (Test-Path -LiteralPath (Join-Path $source 'manifest.json'))) {
  throw 'Build dist-extension before packaging POD Bridge.'
}
New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
Compress-Archive -Path (Join-Path $source '*') -DestinationPath $destination -CompressionLevel Optimal
Write-Output $destination
