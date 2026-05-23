# Login Functionality - Fixed Issues & Implementation Guide

## Issues Fixed

### 1. **Security Vulnerability: Plain Text Passwords**
- **Problem**: Passwords were being compared in plain text, stored unencrypted in the database
- **Solution**: Implemented BCrypt password hashing using Spring Security
- **Change**: Updated `AuthService.login()` to use `passwordEncoder.matches()` instead of `String.equals()`

### 2. **API Response Mismatch**
- **Problem**: Frontend expected a `token` field that backend didn't return
- **Solution**: Added token generation and included it in the login response
- **Change**: Backend now returns `token`, `username`, and `userId` in the response

### 3. **Role Validation Missing**
- **Problem**: Role parameter was sent but not validated against the user's actual role
- **Solution**: Added role validation in the login process
- **Change**: Backend now verifies that the submitted role matches the user's role in the database

### 4. **Frontend Redirect Issues**
- **Problem**: Redirect paths were incorrect (used `/hr-dashboard` instead of relative paths)
- **Solution**: Fixed redirect paths to use relative URLs
- **Change**: Updated redirects to `./hr-dashboard/index.html` and `./employee-dashboard/index.html`

## Backend Changes

### 1. Dependencies Added (`pom.xml`)
- Added `spring-boot-starter-security` for password encryption

### 2. New Files
- `SecurityConfig.java`: Spring Security configuration with BCrypt PasswordEncoder
- `AdminController.java`: Admin endpoints for user creation and password migration

### 3. Modified Files
- `AuthService.java`:
  - Added `BCryptPasswordEncoder` bean
  - Updated `login()` method signature to include `role` parameter
  - Implemented role validation
  - Added `encodePassword()` utility method
  - Returns token in response
  
- `AuthController.java`:
  - Updated to pass `role` from request to `AuthService.login()`

## Frontend Changes

- `login.js`:
  - Added role validation before submission
  - Enhanced error handling
  - Fixed redirect paths to use relative URLs
  - Better success message display with timeout
  - Improved localStorage data structure

## Setup Instructions

### Step 1: Rebuild the Backend
```bash
cd HRM_SYSTEM_BACKEND
mvn clean install
mvn spring-boot:run
```

### Step 2: Create Test Users
Make a POST request to `http://localhost:8080/api/admin/create-user`:

```json
{
  "username": "hr_admin",
  "password": "password123",
  "role": "HR"
}
```

```json
{
  "username": "emp_user",
  "password": "password123",
  "role": "Employee"
}
```

### Step 3: Migrate Existing Users (if any)
If you have existing users with plain text passwords, run this endpoint ONCE:

```bash
POST http://localhost:8080/api/admin/migrate-passwords
```

This will hash all existing passwords while preserving user data.

### Step 4: Test Login
1. Open `login.html` in a browser
2. Enter username: `hr_admin` / password: `password123` / role: `HR`
3. Complete CAPTCHA
4. Click Login

## API Endpoints

### Authentication Endpoints

#### Get CAPTCHA
```
GET /api/auth/captcha
Response: { "success": true, "captcha": "ABC123" }
```

#### Login
```
POST /api/auth/login
Body: {
  "username": "hr_admin",
  "password": "password123",
  "role": "HR",
  "captcha": "ABC123"
}
Response: {
  "success": true,
  "message": "Login successful.",
  "token": "uuid-string",
  "username": "hr_admin",
  "role": "HR",
  "userId": 1
}
```

### Admin Endpoints

#### Create User
```
POST /api/admin/create-user
Body: {
  "username": "new_user",
  "password": "securepass123",
  "role": "Employee"
}
```

#### Migrate Passwords (One-time use)
```
POST /api/admin/migrate-passwords
```

## Security Notes

1. **Password Hashing**: All passwords are now hashed using BCrypt (strength=10)
2. **Session Tokens**: Login generates unique session tokens stored in the HTTP session
3. **CAPTCHA Validation**: Still implemented and required for each login
4. **Role-based Access**: Role is verified during login to prevent privilege escalation
5. **Production Recommendations**:
   - Disable `/api/admin/*` endpoints in production or add authentication
   - Use HTTPS only
   - Implement rate limiting on login endpoint
   - Consider JWT tokens instead of session tokens for scalability

## Troubleshooting

### "Captcha expired" error
- The CAPTCHA expires after session timeout
- Click "Refresh" button to generate a new CAPTCHA

### "Invalid username or password"
- Verify credentials are correct
- Ensure user exists in the database
- Check that password is correct

### "Invalid role for this user"
- Make sure the selected role matches the user's role in the database
- Example: If user is created with role "HR", must select "HR" during login

### Database connection issues
- Verify MySQL is running on localhost:3306
- Check credentials in `application.properties`
- Ensure `hrm_db` database exists

## Database Schema

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Insert test users with hashed passwords:
```sql
INSERT INTO users (username, password, role) VALUES 
('hr_admin', '$2a$10$...', 'HR'),
('emp_user', '$2a$10$...', 'Employee');
```

> Note: Use `/api/admin/create-user` endpoint to automatically create users with hashed passwords.
