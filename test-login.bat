@echo off
setlocal enabledelayedexpansion

echo.
echo ====== LOGIN FUNCTIONALITY TESTS ======
echo.

set baseUrl=http://localhost:8081

REM Test 1: Get CAPTCHA
echo TEST 1: Getting CAPTCHA...
for /f "tokens=*" %%A in ('curl -s -X GET "%baseUrl%/api/auth/captcha"') do set captchaResponse=%%A
echo Response: !captchaResponse!

REM Extract captcha value using PowerShell
for /f "tokens=2 delims=:{,}" %%A in ('echo !captchaResponse! ^| powershell -Command "ConvertFrom-Json | Select-Object -ExpandProperty captcha"') do set captcha=%%A
echo CAPTCHA extracted: !captcha!
echo.

REM Test 2: CORRECT credentials
echo TEST 2: Login with CORRECT username, password, and role
set loginPayload={"username":"hr_admin","password":"password123","role":"HR","captcha":"!captcha!"}
echo Payload: !loginPayload!
for /f "tokens=*" %%A in ('curl -s -X POST "%baseUrl%/api/auth/login" -H "Content-Type: application/json" -d "!loginPayload!"') do set loginResponse=%%A
echo Response: !loginResponse!
echo.

pause
