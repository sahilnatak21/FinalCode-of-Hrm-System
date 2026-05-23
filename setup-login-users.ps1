# PowerShell Setup Script for Login System
# Usage: .\setup-login-users.ps1

$BackendUrl = "http://localhost:8080"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "HR Management System - Login Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check backend connection
Write-Host "Testing backend connection at $BackendUrl..."
try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/api/auth/captcha" -Method GET -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "[OK] Backend is running" -ForegroundColor Green
    }
} catch {
    Write-Host "[ERROR] Backend is not responding" -ForegroundColor Red
    Write-Host "Please ensure the backend is running on $BackendUrl"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Creating Test Users" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to create user
function Create-User {
    param(
        [string]$Username,
        [string]$Password,
        [string]$Role
    )
    
    $body = @{
        username = $Username
        password = $Password
        role = $Role
    } | ConvertTo-Json

    try {
        $response = Invoke-WebRequest -Uri "$BackendUrl/api/admin/create-user" `
            -Method POST `
            -Headers @{"Content-Type" = "application/json"} `
            -Body $body `
            -ErrorAction Stop
        
        $result = $response.Content | ConvertFrom-Json
        if ($result.success) {
            Write-Host "[OK] User created: $Username with role $Role" -ForegroundColor Green
            return $true
        } else {
            Write-Host "[SKIP] $($result.message)" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "[ERROR] Failed to create user $Username - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Create HR user
Write-Host "Creating HR user (username: hr_admin)..."
Create-User -Username "hr_admin" -Password "password123" -Role "HR"

# Create Employee user
Write-Host "Creating Employee user (username: emp_user)..."
Create-User -Username "emp_user" -Password "password123" -Role "Employee"

# Migrate existing passwords
Write-Host ""
Write-Host "Would you like to migrate existing plain-text passwords? (y/n)"
$response = Read-Host
if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host "Running password migration..."
    try {
        $response = Invoke-WebRequest -Uri "$BackendUrl/api/admin/migrate-passwords" `
            -Method POST `
            -ErrorAction Stop
        
        $result = $response.Content | ConvertFrom-Json
        Write-Host "[OK] Password migration completed" -ForegroundColor Green
        Write-Host "   Migrated: $($result.migratedCount) / $($result.totalUsers) users"
    } catch {
        Write-Host "[ERROR] Migration failed - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test Credentials:" -ForegroundColor Yellow
Write-Host ""
Write-Host "HR Account:"
Write-Host "  Username: hr_admin"
Write-Host "  Password: password123"
Write-Host "  Role: HR"
Write-Host ""
Write-Host "Employee Account:"
Write-Host "  Username: emp_user"
Write-Host "  Password: password123"
Write-Host "  Role: Employee"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Open login.html in your browser"
Write-Host "2. Enter one of the test credentials above"
Write-Host "3. Complete the CAPTCHA"
Write-Host "4. Click Login"
Write-Host ""
