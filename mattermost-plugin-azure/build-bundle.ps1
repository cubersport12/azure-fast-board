# Builds Mattermost-compatible plugin bundles with Unix executable bits.
# Layout:
#   com.azurefastboard.ado/plugin.json
#   com.azurefastboard.ado/server/dist/plugin-<os>-<arch>  (mode 0755)
#   com.azurefastboard.ado/webapp/dist/main.js

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
  [System.Environment]::GetEnvironmentVariable('Path', 'User')

$PluginId = 'com.azurefastboard.ado'
$Version = '0.3.0'
$LdFlags = '-s -w'
$Dist = Join-Path $Root 'dist'
$ServerDist = Join-Path $Root 'server\dist'
$WebappDist = Join-Path $Root 'webapp\dist'
$MkTar = Join-Path $Root 'tools\mktargz'
New-Item -ItemType Directory -Force -Path $Dist, $ServerDist, $WebappDist | Out-Null

function Build-Webapp {
  Write-Host 'Building webapp...'
  Push-Location (Join-Path $Root 'webapp')
  try {
    if (-not (Test-Path 'node_modules')) {
      npm ci
      if ($LASTEXITCODE -ne 0) { npm install }
    } else {
      npm install
    }
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'webapp build failed' }
  }
  finally {
    Pop-Location
  }
  $mainJs = Join-Path $WebappDist 'main.js'
  if (-not (Test-Path -LiteralPath $mainJs)) { throw "webapp bundle missing: $mainJs" }
}

function Build-Binary([string]$Goos, [string]$Goarch, [string]$OutName) {
  Write-Host "Building $OutName ..."
  Push-Location (Join-Path $Root 'server')
  try {
    $env:CGO_ENABLED = '0'
    $env:GOOS = $Goos
    $env:GOARCH = $Goarch
    go build -trimpath -ldflags $LdFlags -o (Join-Path $ServerDist $OutName) .
  }
  finally {
    Pop-Location
    Remove-Item Env:GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
    Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue
  }
}

Build-Webapp

Write-Host 'Building mktargz helper...'
go build -o (Join-Path $Dist 'mktargz.exe') (Join-Path $MkTar 'main.go')

Build-Binary 'linux' 'amd64' 'plugin-linux-amd64'
Build-Binary 'linux' 'arm64' 'plugin-linux-arm64'
Build-Binary 'windows' 'amd64' 'plugin-windows-amd64.exe'

function New-Bundle([string]$Label, [string]$ManifestFile, [string[]]$BinaryNames) {
  $bundleName = "$PluginId-$Version-$Label.tar.gz"
  $bundlePath = Join-Path $Dist $bundleName
  if (Test-Path $bundlePath) { Remove-Item -Force $bundlePath }

  $argList = @(
    '-out', $bundlePath,
    '-prefix', $PluginId,
    ((Join-Path $Root $ManifestFile) + '|plugin.json|644'),
    ((Join-Path $WebappDist 'main.js') + '|webapp/dist/main.js|644')
  )
  foreach ($name in $BinaryNames) {
    $argList += ((Join-Path $ServerDist $name) + '|server/dist/' + $name + '|755')
  }

  $exe = Join-Path $Dist 'mktargz.exe'
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $exe @argList 2>&1
    $code = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $prev
  }
  $output | ForEach-Object { Write-Host $_ }
  if ($code -ne 0) { throw "mktargz failed for $Label (exit $code)" }
  if (-not (Test-Path -LiteralPath $bundlePath)) { throw "bundle missing: $bundlePath" }

  $mb = [math]::Round((Get-Item -LiteralPath $bundlePath).Length / 1MB, 1)
  Write-Host "Created $bundlePath ($mb MB)"
  return $bundlePath
}

$linuxBundle = New-Bundle 'linux-amd64' 'plugin-linux-amd64.json' @('plugin-linux-amd64')
[void](New-Bundle 'multi' 'plugin.json' @(
  'plugin-linux-amd64',
  'plugin-linux-arm64',
  'plugin-windows-amd64.exe'
))

$recommended = Join-Path $Dist "$PluginId-$Version.tar.gz"
Copy-Item -LiteralPath $linuxBundle -Destination $recommended -Force

Write-Host ''
Write-Host "Recommended upload: dist\$PluginId-$Version.tar.gz"
Write-Host 'Binary inside archive has Unix mode 0755 (fixes permission denied on Mattermost Linux).'
