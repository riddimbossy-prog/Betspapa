param(
  [string]$Date = (Get-Date -Format "yyyy-MM-dd"),
  [string]$ApiBase = "https://api.betspapa.com"
)

$Secret = Read-Host "Enter ADMIN_SYNC_SECRET"
$Headers = @{ "x-admin-secret" = $Secret }
$Body = @{ date = $Date } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$ApiBase/api/admin/sync-date" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body | ConvertTo-Json -Depth 10
