# ============================================================
# Script: set-ngrok-url.ps1
# Mục đích: Cập nhật .env.local với ngrok URL
# Cách dùng: .\set-ngrok-url.ps1 https://abc123.ngrok-free.app
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$NgrokUrl
)

# Loại bỏ dấu / ở cuối nếu có
$NgrokUrl = $NgrokUrl.TrimEnd('/')

# Tính WS URL (https -> wss, http -> ws)
$WsUrl = $NgrokUrl -replace '^https://', 'wss://' -replace '^http://', 'ws://'

$envFile = "$PSScriptRoot\frontend\.env.local"

$content = @"
# Backend API URL (ngrok)
NEXT_PUBLIC_API_URL=$NgrokUrl

# WebSocket URLs (ngrok)
NEXT_PUBLIC_WS_URL=$WsUrl/ws/sign
NEXT_PUBLIC_CHAT_WS_URL=$WsUrl/ws/chat
"@

Set-Content -Path $envFile -Value $content -Encoding UTF8

Write-Host ""
Write-Host "✅ Da cap nhat .env.local!" -ForegroundColor Green
Write-Host ""
Write-Host "   API URL : $NgrokUrl" -ForegroundColor Cyan
Write-Host "   Sign WS : $WsUrl/ws/sign" -ForegroundColor Cyan
Write-Host "   Chat WS : $WsUrl/ws/chat" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  Nho RESTART frontend de ap dung:" -ForegroundColor Yellow
Write-Host "   cd frontend" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor White
Write-Host ""
