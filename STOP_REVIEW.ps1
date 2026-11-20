$ErrorActionPreference='Stop'
$record=Join-Path $PSScriptRoot 'data/local-publication/review-processes.json'
if (!(Test-Path $record)) { Write-Output 'No recorded review processes.'; exit }
$state=Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
foreach ($processId in @($state.api_pid,$state.web_pid)) {
  $process=Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -in @('node','python','python3','python313')) {
    # Check creation time to avoid acting on a recycled PID.
    if ($process.StartTime -ge ([datetime]$state.started).AddSeconds(-5)) {
      # taskkill /T stops only this recorded process tree, not all Node/Python processes.
      taskkill.exe /PID $processId /T /F
    }
  }
}
