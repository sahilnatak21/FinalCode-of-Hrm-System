@echo off
REM Login System Setup Script - Windows
REM This script helps set up test users for the login system

echo.
echo ========================================
echo HR Management System - Login Setup
echo ========================================
echo.
echo This script will help you create test users for the HR Management System.
echo Make sure the backend is running on http://localhost:8080
echo.

setlocal enabledelayedexpansion

set "backend_url=http://localhost:8080"

REM Check if curl is available
where curl >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: curl is not installed or not in PATH
    echo Please install curl or run the requests manually
    pause
    exit /b 1
)

echo Testing backend connection...
curl -s -o nul -w "%%{http_code}" "%backend_url%/api/auth/captcha" > temp_code.txt
set /p http_code=<temp_code.txt
del temp_code.txt

if "%http_code%"=="200" (
    echo [OK] Backend is running
) else (
    echo [ERROR] Backend is not responding (HTTP %http_code%)
    echo Please ensure the backend is running on %backend_url%
    pause
    exit /b 1
)

echo.
echo ========================================
echo Creating Test Users
echo ========================================
echo.

REM Create HR user
echo Creating HR user (username: hr_admin)...
curl -X POST "%backend_url%/api/admin/create-user" ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"hr_admin\",\"password\":\"password123\",\"role\":\"HR\"}" ^
  -s | findstr /c:"success" >nul

if %ERRORLEVEL% EQU 0 (
    echo [OK] HR user created: hr_admin / password123
) else (
    echo [SKIP] HR user may already exist
)

REM Create Employee user
echo Creating Employee user (username: emp_user)...
curl -X POST "%backend_url%/api/admin/create-user" ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"emp_user\",\"password\":\"password123\",\"role\":\"Employee\"}" ^
  -s | findstr /c:"success" >nul

if %ERRORLEVEL% EQU 0 (
    echo [OK] Employee user created: emp_user / password123
) else (
    echo [SKIP] Employee user may already exist
)

echo.
echo ========================================
echo User Creation Complete
echo ========================================
echo.
echo You can now test the login with these credentials:
echo.
echo HR Login:
echo   Username: hr_admin
echo   Password: password123
echo   Role: HR
echo.
echo Employee Login:
echo   Username: emp_user
echo   Password: password123
echo   Role: Employee
echo.
echo If you have existing users with plain-text passwords, run:
echo   POST %backend_url%/api/admin/migrate-passwords
echo.
pause
