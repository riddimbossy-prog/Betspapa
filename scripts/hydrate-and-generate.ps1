param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^\d{4}-\d{2}-\d{2}$')]
  [string]$Date,

  [string]$ApiBase = "https://api.betspapa.com",

  [switch]$Force,

  [switch]$SkipGenerate,

  [int]$TimeoutSec = 240
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $repoRoot "hydration-$Date.log"
$transcriptStarted = $false
$secretPtr = [IntPtr]::Zero

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-BetsPapa {
  param(
    [ValidateSet("GET", "POST")]
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers,
    [object]$Body = $null
  )

  $uri = "$ApiBase$Path"
  $params = @{
    Method = $Method
    Uri = $uri
    Headers = $Headers
    TimeoutSec = $TimeoutSec
  }

  if ($Method -eq "POST") {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
  }

  try {
    return Invoke-RestMethod @params
  }
  catch {
    $message = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $message = "$message`n$($_.ErrorDetails.Message)"
    }
    throw "Request failed: $Method $uri`n$message"
  }
}

try {
  Start-Transcript -Path $logPath -Append | Out-Null
  $transcriptStarted = $true

  Write-Host "BetsPapa hydration progress runner" -ForegroundColor Yellow
  Write-Host "Date: $Date"
  Write-Host "API:  $ApiBase"
  Write-Host "Log:  $logPath"

  $secureSecret = Read-Host "Enter ADMIN_SYNC_SECRET" -AsSecureString
  $secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
  $plainSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)

  $headers = @{
    "x-admin-secret" = $plainSecret
    "Accept" = "application/json"
  }

  Write-Step "Checking API health"
  $health = Invoke-RestMethod `
    -Method Get `
    -Uri "$ApiBase/api/health" `
    -TimeoutSec 30

  Write-Host "Connected: $($health.service)" -ForegroundColor Green
  Write-Host "Version:   $($health.version)"
  Write-Host "Database:  $($health.database)"

  if ($health.database -ne "connected") {
    throw "The API is online, but Supabase is not connected."
  }

  Write-Step "Building the team hydration plan"
  $forceQuery = if ($Force) { "true" } else { "false" }
  $plan = Invoke-BetsPapa `
    -Method GET `
    -Path "/api/admin/hydration-plan?date=$Date&force=$forceQuery" `
    -Headers $headers

  $allTeams = @($plan.result.teams)
  $teams = @($allTeams | Where-Object { $_.needsHydration -eq $true })

  Write-Host "Fixtures found:        $($plan.fixtures)"
  Write-Host "Teams checked:         $($plan.result.teamsChecked)"
  Write-Host "Already ready:         $($plan.result.readyTeams)" -ForegroundColor Green
  Write-Host "Need hydration:        $($teams.Count)" -ForegroundColor Yellow

  if ($teams.Count -eq 0) {
    Write-Host "All teams already have enough individual history." -ForegroundColor Green
  }
  else {
    $completed = 0
    $ready = 0
    $failed = 0
    $imported = 0

    foreach ($team in $teams) {
      $completed += 1
      $percent = [math]::Round(($completed / $teams.Count) * 100)

      Write-Progress `
        -Activity "Hydrating individual team histories" `
        -Status "$completed of $($teams.Count): $($team.teamName)" `
        -PercentComplete $percent

      Write-Host ""
      Write-Host "[$completed/$($teams.Count)] $($team.teamName)" -ForegroundColor White
      Write-Host "  Current overall: $($team.coverage.overall)"
      Write-Host "  Current venue:   $($team.coverage.venue | ConvertTo-Json -Compress)"

      try {
        $response = Invoke-BetsPapa `
          -Method POST `
          -Path "/api/admin/hydrate-team" `
          -Headers $headers `
          -Body @{
            date = $Date
            teamId = [int]$team.teamId
            force = [bool]$Force
          }

        $audit = @($response.result.audits)[0]
        $imported += [int]($response.result.importedFixtures)

        if ($audit.ready) {
          $ready += 1
          Write-Host "  READY" -ForegroundColor Green
        }
        else {
          $failed += 1
          Write-Host "  NOT READY" -ForegroundColor Yellow
        }

        Write-Host "  Provider results: $($audit.providerResults)"
        Write-Host "  Imported fixtures: $($response.result.importedFixtures)"
        Write-Host "  Overall after: $($audit.after.overall)"
        Write-Host "  Venue after:   $($audit.after.venue | ConvertTo-Json -Compress)"

        if ($audit.error) {
          Write-Host "  Note: $($audit.error)" -ForegroundColor Yellow
        }
      }
      catch {
        $failed += 1
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
      }
    }

    Write-Progress -Activity "Hydrating individual team histories" -Completed
    Write-Step "Hydration summary"
    Write-Host "Completed:         $completed"
    Write-Host "Ready:             $ready" -ForegroundColor Green
    Write-Host "Not ready/errors:  $failed" -ForegroundColor Yellow
    Write-Host "Imported fixtures: $imported"
  }

  if (-not $SkipGenerate) {
    Write-Step "Generating PapaSense predictions"
    $generate = Invoke-BetsPapa `
      -Method POST `
      -Path "/api/admin/generate-predictions" `
      -Headers $headers `
      -Body @{ date = $Date }

    Write-Host "Generated: $($generate.result.generated)" -ForegroundColor Green
    Write-Host "Published: $($generate.result.published)" -ForegroundColor Green
    Write-Host "Skipped:   $(@($generate.result.skipped).Count)" -ForegroundColor Yellow

    if (@($generate.result.skipped).Count -gt 0) {
      Write-Host ""
      Write-Host "Skipped fixtures:" -ForegroundColor Yellow
      $generate.result.skipped |
        Select-Object fixtureId, externalFixtureId, code, message |
        Format-Table -AutoSize
    }
  }

  Write-Step "Finished"
  Write-Host "Refresh: https://betspapa.com" -ForegroundColor Green
  Write-Host "Full log saved to: $logPath"
}
catch {
  Write-Host ""
  Write-Host "FAILED" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Log: $logPath"
  exit 1
}
finally {
  if ($secretPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)
  }
  if ($transcriptStarted) {
    Stop-Transcript | Out-Null
  }
}
