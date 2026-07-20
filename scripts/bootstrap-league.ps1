param(
  [Parameter(Mandatory=$true)][int]$LeagueId,
  [Parameter(Mandatory=$true)][int]$Season,
  [Parameter(Mandatory=$true)][string]$From,
  [Parameter(Mandatory=$true)][string]$To,
  [string]$PredictionDate = (Get-Date -Format "yyyy-MM-dd"),
  [string]$ApiBase = "https://api.betspapa.com"
)

$Secret = Read-Host "Enter ADMIN_SYNC_SECRET"
$Headers = @{ "x-admin-secret" = $Secret }
$Body = @{
  leagueId = $LeagueId
  season = $Season
  from = $From
  to = $To
  predictionDate = $PredictionDate
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$ApiBase/api/admin/bootstrap-league" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body | ConvertTo-Json -Depth 12
