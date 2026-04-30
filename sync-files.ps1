# ============================================================
# sync-files.ps1  —  Z:\ 파일 목록을 Link_in 서버로 동기화
# 실행: powershell -ExecutionPolicy Bypass -File sync-files.ps1
# ============================================================

param(
    [string]$ServerUrl = "http://192.168.0.12:3000",
    [string]$Username  = "admin",
    [string]$Password  = "1234",
    [string]$ScanPath  = "Z:\"
)

$ErrorActionPreference = "Stop"
$StartTime = Get-Date

Write-Host ""
Write-Host "========================================"
Write-Host "  Link_in 파일 동기화 시작"
Write-Host "  서버: $ServerUrl"
Write-Host "  경로: $ScanPath"
Write-Host "========================================"

# ── 1. 로그인 ───────────────────────────────────────────────
Write-Host ""
Write-Host "[1/3] 서버 로그인 중..."

# PS 5.1 안정적 JSON 전송: 문자열 연결로 직접 구성
$loginJson  = '{"username":"' + $Username + '","password":"' + $Password + '"}'
$loginBytes = [System.Text.Encoding]::UTF8.GetBytes($loginJson)

try {
    $loginResp = Invoke-RestMethod `
        -Uri "$ServerUrl/api/auth/login" `
        -Method POST `
        -Body $loginBytes `
        -ContentType "application/json"
    $Token = $loginResp.token
    Write-Host "      로그인 성공 (사용자: $($loginResp.user.username))"
} catch {
    $errMsg = $_.ErrorDetails.Message
    Write-Host "      로그인 실패: $errMsg"
    exit 1
}

# ── 2. Z:\ 스캔 → CSV 생성 ──────────────────────────────────
Write-Host ""
Write-Host "[2/3] $ScanPath 스캔 중..."

$CsvPath = [System.IO.Path]::Combine($env:TEMP, "linkin_$(Get-Date -Format 'yyyyMMddHHmmss').csv")

try {
    $writer = New-Object System.IO.StreamWriter($CsvPath, $false, [System.Text.Encoding]::UTF8)
    $writer.WriteLine("FullName,Name,Length,LastWriteTime")

    $count = 0
    Get-ChildItem -Path $ScanPath -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $len  = if ($_.PSIsContainer) { "" } else { $_.Length }
        $hour = $_.LastWriteTime.Hour
        $ampm = if ($hour -lt 12) { "오전" } else { "오후" }
        $h12  = if ($hour -eq 0) { 12 } elseif ($hour -gt 12) { $hour - 12 } else { $hour }
        $mod  = "$($_.LastWriteTime.ToString('yyyy-MM-dd')) $ampm $($h12.ToString('D2')):$($_.LastWriteTime.ToString('mm:ss'))"

        # 경로에 쉼표 있으면 따옴표 처리
        $fn = if ($_.FullName -match ",") { "`"$($_.FullName -replace '`"','`"`"')`"" } else { $_.FullName }
        $nm = if ($_.Name    -match ",") { "`"$($_.Name     -replace '`"','`"`"')`"" } else { $_.Name }

        $writer.WriteLine("$fn,$nm,$len,$mod")
        $count++

        if ($count % 5000 -eq 0) { Write-Host "      $count 개 처리 중..." }
    }
    $writer.Close()
    Write-Host "      스캔 완료: $count 개 항목"
} catch {
    Write-Host "      스캔 실패: $_"
    exit 1
}

# ── 3. CSV 파일 서버로 업로드 (.NET HttpClient 사용) ─────────
Write-Host ""
Write-Host "[3/3] 서버로 업로드 중..."

try {
    Add-Type -AssemblyName System.Net.Http

    $httpClient = New-Object System.Net.Http.HttpClient
    $httpClient.DefaultRequestHeaders.Add("Authorization", "Bearer $Token")

    $multipart   = New-Object System.Net.Http.MultipartFormDataContent
    $fileStream  = [System.IO.File]::OpenRead($CsvPath)
    $streamContent = New-Object System.Net.Http.StreamContent($fileStream)
    $streamContent.Headers.ContentType = `
        [System.Net.Http.Headers.MediaTypeHeaderValue]::new("text/csv")
    $multipart.Add($streamContent, "csv", [System.IO.Path]::GetFileName($CsvPath))

    $resp     = $httpClient.PostAsync("$ServerUrl/api/files/upload-csv", $multipart).GetAwaiter().GetResult()
    $respBody = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()

    $fileStream.Close()
    $httpClient.Dispose()

    if ($resp.IsSuccessStatusCode) {
        Write-Host "      업로드 성공: $respBody"
    } else {
        if ($respBody -like "*File too large*") {
            Write-Host "      CSV가 커서 업로드 제한에 걸렸습니다. 디스크 스캔으로 전환합니다..."
            $scanResp = Invoke-RestMethod `
                -Uri "$ServerUrl/api/files/scan/disk" `
                -Method POST `
                -Headers @{ Authorization = "Bearer $Token" } `
                -ContentType "application/json"
            Write-Host "      디스크 스캔 요청 성공: $($scanResp.message)"
        } else {
            Write-Host "      업로드 실패 ($($resp.StatusCode)): $respBody"
            exit 1
        }
    }
} catch {
    Write-Host "      업로드 오류: $_"
    exit 1
} finally {
    Remove-Item $CsvPath -Force -ErrorAction SilentlyContinue
}

$elapsed = [math]::Round(((Get-Date) - $StartTime).TotalSeconds, 1)
Write-Host ""
Write-Host "========================================"
Write-Host "  완료! (${elapsed}초 소요)"
Write-Host "  서버에서 DB 반영 중 (1~2분 소요됩니다)"
Write-Host "========================================"
Write-Host ""
