# ============================================================
# register-task.ps1  —  주간 자동 동기화 작업 등록
# 관리자 권한으로 실행 필요
# ============================================================

$ScriptPath = "C:\Users\ETK_302\Desktop\개인개발\link\sync-files.ps1"
$TaskName   = "LinkIn_FileSync"

# 매주 월요일 오전 9시 실행
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "09:00"

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Trigger $trigger `
    -Action $action `
    -Settings $settings `
    -RunLevel Highest `
    -Force

Write-Host "작업 등록 완료: $TaskName" -ForegroundColor Green
Write-Host "실행 일정: 매주 월요일 오전 9:00" -ForegroundColor Green
Write-Host ""
Write-Host "지금 바로 테스트하려면:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
