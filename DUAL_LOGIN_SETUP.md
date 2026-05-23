# HRM System - Dual Login Setup Guide

## Overview
The HRM System now supports **two separate logins**:
1. **HR Login** - For HR administrators
2. **Employee Login** - For regular employees

## Login Credentials

### HR Admin Login
- **Username:** `hr_admin`
- **Password:** `HRPassword@123`
- **Role:** `HR`

### Employee User Login
- **Username:** `employee_user`
- **Password:** `EmpPassword@123`
- **Role:** `EMPLOYEE`

## Database Schema

### Users Table
The application uses a `users` table with the following structure:

```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL
);
```

**Columns:**
- `id`: Unique identifier
- `username`: Login username (must be unique)
- `password`: BCrypt encrypted password
- `role`: User role (HR or EMPLOYEE)

## API Endpoints

### 1. Generate CAPTCHA
**Endpoint:** `GET /api/auth/captcha`

**Response:**
```json
{
    "success": true,
    "captcha": "ABC123"
}
```

### 2. Login (HR or Employee)
**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
    "username": "hr_admin",
    "password": "HRPassword@123",
    "role": "HR",
    "captcha": "ABC123"
}
```

**Response (Success):**
```json
{
    "success": true,
    "message": "Login successful.",
    "role": "HR",
    "token": "uuid-token-string",
    "username": "hr_admin",
    "userId": 1
}
```

**Response (Failure):**
```json
{
    "success": false,
    "message": "Invalid username or password.",
    "role": null
}
```

## Setup Instructions

### Option 1: Automatic Setup via API
1. Start the backend server (running on port 8080)
2. Call the initialization endpoint:
   - **URL:** `POST http://localhost:8080/api/setup/initialize-users`
   - This will automatically create both users in the database

### Option 2: Manual SQL Setup
1. Connect to your MySQL database: `hrm_db`
2. Run the SQL script `init_users.sql` located in `src/main/resources/`
3. Users will be created automatically

### Option 3: Add Custom Users
```sql
-- First, generate BCrypt password hash (use authService.encodePassword() in application)
-- Then insert into database:

INSERT INTO users (username, password, role) 
VALUES ('custom_user', '$2a$10$...bcrypt_hash...', 'HR');
```

## Login Flow

1. **Get CAPTCHA**
   - Call `/api/auth/captcha` endpoint
   - Store the returned captcha code

2. **Enter Credentials**
   - User enters username, password, and role
   - User enters the CAPTCHA

3. **Authenticate**
   - Call `/api/auth/login` with all credentials
   - Server validates CAPTCHA, username, password, and role
   - If valid, returns authentication token

4. **Session Management**
   - Token stored in session
   - User ID and role stored for authorization

## Role-Based Features

### HR Role Privileges
- View all employees
- Add/Edit employees
- Generate team formations
- View analytics and reports
- Manage system settings

### EMPLOYEE Role Privileges
- View own profile
- View team assignments
- Update personal information
- View attendance

## Security Notes

⚠️ **Important:**
- Change default passwords before production deployment
- Use HTTPS in production
- Passwords are BCrypt encrypted with strength 10
- CAPTCHA expires after 5 minutes
- Session tokens are UUID-based

## Testing the Login

### Using cURL

**1. Get CAPTCHA:**
```bash
curl -X GET http://localhost:8080/api/auth/captcha
```

**2. Login as HR Admin:**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "hr_admin",
    "password": "HRPassword@123",
    "role": "HR",
    "captcha": "ABC123"
  }'
```

**3. Login as Employee:**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "employee_user",
    "password": "EmpPassword@123",
    "role": "EMPLOYEE",
    "captcha": "ABC123"
  }'
```

### Using Frontend

1. Navigate to login page
2. Select role (HR or EMPLOYEE)
3. Enter credentials
4. Complete CAPTCHA
5. Click Login

## Database Verification

To verify users are created:

```sql
SELECT id, username, role FROM users;
```

Expected output:
```
+----+---------------+----------+
| id | username      | role     |
+----+---------------+----------+
| 1  | hr_admin      | HR       |
| 2  | employee_user | EMPLOYEE |
+----+---------------+----------+
```

## Troubleshooting

### "Invalid captcha" Error
- CAPTCHA may have expired
- Generate a new CAPTCHA and retry

### "Invalid username or password" Error
- Check username spelling
- Verify password is correct
- Ensure role matches user's role in database

### "Invalid role for this user" Error
- User's database role doesn't match login role
- If user is HR, must select HR role in login

### Database Connection Error
- Verify MySQL is running
- Check database credentials in `application.properties`
- Ensure `hrm_db` database exists

## Configuration Files

### application.properties
```properties
spring.datasource.url=jdbc:mysql://localhost:3306/hrm_db
spring.datasource.username=root
spring.datasource.password=Sahil@21
spring.jpa.hibernate.ddl-auto=update
server.port=8080
```

## Next Steps

1. ✅ Backend running on port 8080
2. ✅ Users table created with HR and Employee schemas
3. ✅ Initialize users via `/api/setup/initialize-users` or SQL script
4. ✅ Test login with both roles
5. Integrate with frontend login forms
6. Implement role-based access control (RBAC)
7. Add more user management features
