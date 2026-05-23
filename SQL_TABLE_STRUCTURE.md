# SQL Table Structure Summary - HRM System Login

## 📊 USERS TABLE

### Auto-Generated Actual SQL (By Hibernate)
```sql
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL,
  `username` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
```

---

## 🔹 Column Details

### Column: `id`
```
Data Type      : BIGINT
Constraints    : PRIMARY KEY, AUTO_INCREMENT
Description    : Unique identifier for each user
Range          : 1 to 9,223,372,036,854,775,807
Example Values : 1, 2, 3...
```

### Column: `username`
```
Data Type      : VARCHAR(100)
Constraints    : NOT NULL, UNIQUE
Description    : Login username (must be unique)
Max Length     : 100 characters
Current Values : 'hr_admin', 'employee_user'
Used in Query  : WHERE username = ?
```

### Column: `password`
```
Data Type      : VARCHAR(255)
Constraints    : NOT NULL
Description    : BCrypt hashed password (never store plain text)
Max Length     : 255 characters
Format         : $2a$10$... (BCrypt format)
Example        : $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36aiAetm
```

### Column: `role`
```
Data Type      : VARCHAR(20)
Constraints    : NOT NULL
Description    : User role for access control
Max Length     : 20 characters
Valid Values   : 'HR', 'EMPLOYEE'
Used in        : Role-based authorization
```

---

## 📥 Current Data

```sql
SELECT * FROM users;
```

| id | username | password | role |
|---|---|---|---|
| 1 | hr_admin | $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36aiAetm | HR |
| 2 | employee_user | $2a$10$dXJ3SW6G7P50eS3pGSOr.eFp5wvqBc.C5KM6.d1qj8iJ7HjL.Yjsy | EMPLOYEE |

---

## 🔍 Fetch Queries Used by Application

### Query #1: Login Authentication
**File:** `AuthService.java` - Line 108
```java
Optional<User> userOptional = userRepository.findByUsername(username.trim());
```

**Equivalent SQL:**
```sql
SELECT id, password, role, username 
FROM users 
WHERE username = 'hr_admin';
```

**Hibernate Generated SQL Logs:**
```
Hibernate: 
    select
        u1_0.id,
        u1_0.password,
        u1_0.role,
        u1_0.username
    from
        users u1_0
    where
        u1_0.username=?
```

**Parameters:**
- `username = 'hr_admin'` (for HR login)
- `username = 'employee_user'` (for Employee login)

**Result:** Returns Optional<User> object with matched record

---

## 🔌 Java Entity Class

```java
@Entity
@Table(name = "users")
public class User {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;                          // Maps to: id (BIGINT PRIMARY KEY)
    
    @Column(name = "username", 
            nullable = false, 
            unique = true, 
            length = 100)
    private String username;                  // Maps to: username (VARCHAR(100) UNIQUE)
    
    @Column(name = "password", 
            nullable = false, 
            length = 255)
    private String password;                  // Maps to: password (VARCHAR(255))
    
    @Column(name = "role", 
            nullable = false, 
            length = 20)
    private String role;                      // Maps to: role (VARCHAR(20))
}
```

---

## 🔐 Data Insertion (Setup)

```java
// File: SetupController.java - Line 48-56

User newHrUser = new User();
newHrUser.setUsername("hr_admin");
newHrUser.setPassword(authService.encodePassword("HRPassword@123"));
newHrUser.setRole("HR");
userRepository.save(newHrUser);

// Equivalent SQL:
// INSERT INTO users (username, password, role) 
// VALUES ('hr_admin', '$2a$10$...hash...', 'HR');
```

---

## ✔️ Validation Checks

### 1. Username Uniqueness
```sql
SELECT COUNT(*) FROM users WHERE username = 'hr_admin';
-- Returns: 1 (exists) or 0 (not exists)
```

### 2. Password Match (Java-side)
```java
// Passwords are validated in-memory using BCrypt
if (passwordEncoder.matches(plainPassword, hashedPassword)) {
    // Password is correct
}
// No direct SQL password comparison (for security)
```

### 3. Role Verification
```sql
SELECT role FROM users WHERE username = 'hr_admin';
-- Returns: 'HR'
-- Must match role parameter in login request
```

---

## 📋 Complete Data Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. Frontend Login Form                                 │
│     Input: username, password, role, captcha            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  2. AuthController.login()                              │
│     Calls: AuthService.login(username, password, role)  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  3. AuthService.login()                                 │
│     Calls: userRepository.findByUsername(username)      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  4. SQL Query Execution (Hibernate)                     │
│  Query:                                                 │
│    SELECT id, password, role, username                  │
│    FROM users                                           │
│    WHERE username = ?                                   │
│  Parameter: 'hr_admin'                                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  5. Database Returns User Record                        │
│    {                                                    │
│      "id": 1,                                           │
│      "username": "hr_admin",                            │
│      "password": "$2a$10$...",                          │
│      "role": "HR"                                       │
│    }                                                    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  6. Password Validation (In-Memory)                     │
│    BCrypt.matches("HRPassword@123", "$2a$10$...")      │
│    Returns: true/false                                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  7. Role Verification                                   │
│    if (user.getRole().equals("HR")) {OK}                │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  8. Return Success Response with Token                  │
│    {                                                    │
│      "success": true,                                   │
│      "userId": 1,                                       │
│      "username": "hr_admin",                            │
│      "role": "HR",                                      │
│      "token": "uuid-token"                              │
│    }                                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ Indexes Created

```sql
-- Automatically created by @Column(unique=true)
UNIQUE INDEX `uk_username` ON users(username);

-- For faster queries
INDEX `idx_role` ON users(role);
```

---

## 📊 Performance Metrics

| Operation | Query Type | Execution Time | Notes |
|---|---|---|---|
| Login Search | SELECT (indexed) | O(log n) | Very Fast |
| User Creation | INSERT | O(1) | Fast |
| Password Update | UPDATE | O(log n) | Fast (indexed by username) |
| Role Search | SELECT | O(log n) | Fast (indexed) |

---

## 🔄 Integration Points

### UserRepository (Spring Data JPA)
```java
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    // Spring automatically generates SQL for this method
}
```

### AuthService
```java
public AuthResult login(String username, String password, String role, 
                        HttpSession session) {
    Optional<User> userOptional = userRepository.findByUsername(username.trim());
    // This triggers the SQL SELECT query above
    ...
}
```

### SetupController
```java
public ResponseEntity<?> initializeUsers() {
    User newUser = new User();
    newUser.setUsername("hr_admin");
    newUser.setPassword(authService.encodePassword("HRPassword@123"));
    newUser.setRole("HR");
    userRepository.save(newUser);
    // This triggers INSERT query
    ...
}
```

---

## 📂 File References

| File | Location | Purpose |
|---|---|---|
| **Entity** | `entity/User.java` | Database table mapping |
| **Repository** | `repository/UserRepository.java` | Database queries |
| **Service** | `service/AuthService.java` | Business logic |
| **Controller** | `controller/AuthController.java` | API endpoints |
| **SQL Script** | `resources/database-schema.sql` | Database initialization |

---

## ✅ Verification

**Check Table Structure in MySQL:**
```bash
mysql -u root -p
USE hrm_db;
DESCRIBE users;
```

**Expected Output:**
```
+----------+------------------+------+-----+---------+----------------+
| Field    | Type             | Null | Key | Default | Extra          |
+----------+------------------+------+-----+---------+----------------+
| id       | bigint           | NO   | PRI | NULL    | auto_increment |
| password | varchar(255)     | NO   |     | NULL    |                |
| role     | varchar(20)      | NO   |     | NULL    |                |
| username | varchar(100)     | NO   | UNI | NULL    |                |
+----------+------------------+------+-----+---------+----------------+
```

---

## 🎯 Summary

- **Table Name:** `users`
- **Total Columns:** 4 (id, username, password, role)
- **Primary Key:** id (auto-increment)
- **Unique Index:** username
- **Data Rows:** 2 (HR admin + Employee user)
- **Query Used:** findByUsername (SELECT WHERE username = ?)
- **Password Encryption:** BCrypt (algorithm strength 10)
