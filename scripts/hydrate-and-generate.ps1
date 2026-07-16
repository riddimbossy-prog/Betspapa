param(
  [Parameter(Mandatory=$true)]
  [string]$Date,

  [string]$ApiBase = "https://api.betspapa.com"
)

$secret = Read-Host "Enter ADMIN_SYNC_SECRET" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)

try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $headers = @{
    "x-admin-secret" = $plain
    "Content-Type" = "application/json"
  }

  Write-Host "Hydrating individual team histories for $Date..." -ForegroundColor Cyan
  $hydrate = Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBase/api/admin/hydrate-date" `
    -Headers $headers `
    -Body (@{ date = $Date; force = $true } | ConvertTo-Json)

  $hydrate | ConvertTo-Json -Depth 12

  Write-Host "Generating PapaSense v1.8 predictions..." -ForegroundColor Cyan
  $generate = Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBase/api/admin/generate-predictions" `
    -Headers $headers `
    -Body (@{ date = $Date } | ConvertTo-Json)

  $generate | ConvertTo-Json -Depth 12
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
