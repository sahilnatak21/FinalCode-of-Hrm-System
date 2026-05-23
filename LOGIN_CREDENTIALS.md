# HRM System - Quick Login Reference

## ✅ Backend Status
- **Status:** Running Successfully
- **Port:** 8080
- **Database:** Connected (MySQL - hrm_db)
- **Users:** Initialized ✓

---

## 📝 Login Credentials

### HR Admin Login
```
Username: hr_admin
Password: HRPassword@123
Role: HR
```

### Employee Login
```
Username: employee_user
Password: EmpPassword@123
Role: EMPLOYEE
```

---

## 🔧 Database Table

The system uses a `users` table created automatically by Hibernate:

```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,        -- BCrypt encrypted
    role VARCHAR(20) NOT NULL              -- HR or EMPLOYEE
);
```

### Current Users in Database:
| ID | Username | Role |
|---|---|---|
| 1 | hr_admin | HR |
| 2 | employee_user | EMPLOYEE |

---

## 🌐 API Endpoints

### 1. Generate CAPTCHA
```
GET http://localhost:8080/api/auth/captcha
```

**Response:**
```json
{
    "success": true,
    "captcha": "ABC123"
}
```

### 2. Login
```
POST http://localhost:8080/api/auth/login
Content-Type: application/json
```

**Request:**
```json
{
    "username": "hr_admin",
    "password": "HRPassword@123",
    "role": "HR",
    "captcha": "ABC123"
}
```

**Success Response:**
```json
{
    "success": true,
    "message": "Login successful.",
    "role": "HR",
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "username": "hr_admin",
    "userId": 1
}
```

**Failure Response:**
```json
{
    "success": false,
    "message": "Invalid username or password.",
    "role": null
}
```

### 3. Initialize Users (Auto-setup)
```
POST http://localhost:8080/api/setup/initialize-users
```

---

## 🧪 Testing the Logins

### Using PowerShell:

**Test HR Login:**
```powershell
$captcha = (Invoke-RestMethod "http://localhost:8080/api/auth/captcha").captcha

$body = @{
    username = "hr_admin"
    password = "HRPassword@123"
    role = "HR"
    captcha = $captcha
} | ConvertTo-Json

Invoke-RestMethod "http://localhost:8080/api/auth/login" `
    -Method Post `
    -Body $body `
    -ContentType "application/json" | ConvertTo-Json
```

**Test Employee Login:**
```powershell
$captcha = (Invoke-RestMethod "http://localhost:8080/api/auth/captcha").captcha

$body = @{
    username = "employee_user"
    password = "EmpPassword@123"
    role = "EMPLOYEE"
    captcha = $captcha
} | ConvertTo-Json

Invoke-RestMethod "http://localhost:8080/api/auth/login" `
    -Method Post `
    -Body $body `
    -ContentType "application/json" | ConvertTo-Json
```

### Using cURL:

**Test HR Login:**
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

---

## 🗄️ Database Verification

Check users in database:

```sql
USE hrm_db;
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

---

## 📋 Key Features

✅ **Two Separate Login Types:**
- HR login with admin privileges
- Employee login with user privileges

✅ **Security Features:**
- BCrypt password encryption
- CAPTCHA validation (expires in 5 minutes)
- Session-based authentication
- UUID tokens for API access

✅ **Database-Driven:**
- Users stored in MySQL database
- Automatic table creation via Hibernate
- Role-based access control ready

✅ **Easy Integration:**
- RESTful API endpoints
- CORS enabled for frontend integration
- JSON request/response format

---

## ⚙️ Configuration

**File:** `application.properties`

```properties
spring.datasource.url=jdbc:mysql://localhost:3306/hrm_db
spring.datasource.username=root
spring.datasource.password=Sahil@21
spring.jpa.hibernate.ddl-auto=update
server.port=8080
```

---

## 🚀 Next Steps

1. ✅ Backend running on port 8080
2. ✅ Database initialized
3. ✅ Users created (HR and Employee)
4. 📋 Connect frontend login forms to API
5. 📋 Implement role-based dashboard
6. 📋 Add employee management features
7. 📋 Add team formation features

---

## 🆘 Troubleshooting

| Issue | Solution |
|---|---|
| Connection refused | Ensure backend is running on port 8080 |
| Invalid credentials | Check username and password match |
| CAPTCHA expired | Generate new CAPTCHA before login |
| Role mismatch | Ensure role matches user's role in DB |
| Database error | Verify MySQL is running and hrm_db exists |

---

## 📞 Support

For detailed setup guide, see: `DUAL_LOGIN_SETUP.md`

Backend logs: Running on Terminal with ID `44cc922b-4154-4c16-a9ee-7ef8908a561f`
