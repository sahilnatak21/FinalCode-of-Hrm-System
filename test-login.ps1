# Test Login Functionality
$baseUrl = "http://localhost:8081"

Write-Host "====== LOGIN FUNCTIONALITY TESTS ======`n" -ForegroundColor Cyan

# Test 1: CORRECT credentials
Write-Host "TEST 1: Login with CORRECT username, password, and role" -ForegroundColor Green
$cap = (Invoke-WebRequest -Uri "$baseUrl/api/auth/captcha" -Method GET -UseBasicParsing | ConvertFrom-Json).captcha
$body = @{username="hr_admin"; password="password123"; role="HR"; captcha=$cap} | ConvertTo-Json
$resp = (Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Result: Success=$($resp.success), Role=$($resp.role), Message='$($resp.message)'" -ForegroundColor Green
Write-Host "Token present: $(if($resp.token) {'YES ✓'} else {'NO ✗'})`n"

# Test 2: WRONG password
Write-Host "TEST 2: Login with CORRECT username but WRONG password" -ForegroundColor Yellow
$cap = (Invoke-WebRequest -Uri "$baseUrl/api/auth/captcha" -Method GET -UseBasicParsing | ConvertFrom-Json).captcha
$body = @{username="hr_admin"; password="wrongpassword"; role="HR"; captcha=$cap} | ConvertTo-Json
try {
    $resp = (Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -ErrorAction Stop).Content | ConvertFrom-Json
} catch {
    # Try to parse error response
    $resp = $_.ErrorDetails.Message | ConvertFrom-Json
}
Write-Host "Result: Success=$($resp.success), Message='$($resp.message)'" -ForegroundColor Yellow

# Test 3: WRONG username
Write-Host "`nTEST 3: Login with WRONG username but correct password" -ForegroundColor Yellow
$cap = (Invoke-WebRequest -Uri "$baseUrl/api/auth/captcha" -Method GET -UseBasicParsing | ConvertFrom-Json).captcha
$body = @{username="wronguser"; password="password123"; role="HR"; captcha=$cap} | ConvertTo-Json
try {
    $resp = (Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -ErrorAction Stop).Content | ConvertFrom-Json
} catch {
    $resp = $_.ErrorDetails.Message | ConvertFrom-Json
}
Write-Host "Result: Success=$($resp.success), Message='$($resp.message)'" -ForegroundColor Yellow

# Test 4: WRONG role
Write-Host "`nTEST 4: Login with correct username & password but WRONG role" -ForegroundColor Yellow
$cap = (Invoke-WebRequest -Uri "$baseUrl/api/auth/captcha" -Method GET -UseBasicParsing | ConvertFrom-Json).captcha
$body = @{username="hr_admin"; password="password123"; role="Employee"; captcha=$cap} | ConvertTo-Json
try {
    $resp = (Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -ErrorAction Stop).Content | ConvertFrom-Json
} catch {
    $resp = $_.ErrorDetails.Message | ConvertFrom-Json
}
Write-Host "Result: Success=$($resp.success), Message='$($resp.message)'" -ForegroundColor Yellow

# Test 5: Employee login with CORRECT credentials
Write-Host "`nTEST 5: Employee login with CORRECT credentials" -ForegroundColor Green
$cap = (Invoke-WebRequest -Uri "$baseUrl/api/auth/captcha" -Method GET -UseBasicParsing | ConvertFrom-Json).captcha
$body = @{username="emp_user"; password="password123"; role="Employee"; captcha=$cap} | ConvertTo-Json
$resp = (Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Result: Success=$($resp.success), Role=$($resp.role), Message='$($resp.message)'" -ForegroundColor Green
Write-Host "Token present: $(if($resp.token) {'YES ✓'} else {'NO ✗'})`n"

Write-Host "====== ALL TESTS COMPLETED ======" -ForegroundColor Cyan
