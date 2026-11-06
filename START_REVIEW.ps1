param([int]$WebPort=3100,[int]$ApiPort=8100)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
if (!(Test-Path 'node_modules/next/dist/bin/next')) { throw 'Dependencies missing. Run npm ci in this folder first.' }
node scripts/init-review.cjs
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize local accounts.' }
$env:PYTHONPATH=Join-Path $PSScriptRoot 'src'
$env:ALGORITHM_ENGINE_URL="http://127.0.0.1:$ApiPort"
$logDirectory=Join-Path $PSScriptRoot 'data/local-publication'
$pythonCommand=(Get-Command python).Source
$nodeCommand=(Get-Command node).Source
$api=Start-Process -FilePath $pythonCommand -ArgumentList '-m','uvicorn','api.main:app','--host','127.0.0.1','--port',"$ApiPort" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'api.out.log') -RedirectStandardError (Join-Path $logDirectory 'api.err.log')
$web=Start-Process -FilePath $nodeCommand -ArgumentList 'node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',"$WebPort" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'web.out.log') -RedirectStandardError (Join-Path $logDirectory 'web.err.log')
@{api_pid=$api.Id;web_pid=$web.Id;web_port=$WebPort;api_port=$ApiPort;started=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $logDirectory 'review-processes.json')
Write-Output "Starting local review: http://127.0.0.1:$WebPort/login"
Write-Output 'Initial passwords: data/local-publication/REVIEW_CREDENTIALS.txt'
Write-Output 'Use STOP_REVIEW.ps1 to stop only these processes. Check data/local-publication/*.log if startup fails.'
