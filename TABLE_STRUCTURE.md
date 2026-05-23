# SQL Table Structure - HRM System

## 📊 USERS TABLE (Primary Login Table)

### Table Schema

```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
```

---

## 🔍 Table Structure Details

| Column Name | Data Type | Null | Key | Default | Description |
|---|---|---|---|---|---|
| **id** | BIGINT | NO | PRIMARY | AUTO_INCREMENT | Unique identifier for each user |
| **username** | VARCHAR(100) | NO | UNIQUE | - | Login username (Must be unique) |
| **password** | VARCHAR(255) | NO | - | - | BCrypt encrypted password |
| **role** | VARCHAR(20) | NO | - | - | User role: `HR` or `EMPLOYEE` |
| **created_at** | TIMESTAMP | NO | - | CURRENT_TIMESTAMP | When user account was created |
| **updated_at** | TIMESTAMP | NO | - | CURRENT_TIMESTAMP | When user data was last updated |
| **is_active** | BOOLEAN | YES | - | TRUE | Whether account is active |

---

## 📝 Current Data in Users Table

```
+----+---------------+----------------------------------------------------------+----------+-----------+
| id | username      | password                                                 | role     | is_active |
+----+---------------+----------------------------------------------------------+----------+-----------+
| 1  | hr_admin      | $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3Xe...             | HR       | 1         |
| 2  | employee_user | $2a$10$dXJ3SW6G7P50eS3pGSOr.eFp5wvqBc.C5K...             | EMPLOYEE | 1         |
+----+---------------+----------------------------------------------------------+----------+-----------+
```

---

## 🔐 User Credentials

### HR Admin Account
```
ID:       1
Username: hr_admin
Password: HRPassword@123 (encrypted)
Role:     HR
Active:   Yes
```

### Employee Account
```
ID:       2
Username: employee_user
Password: EmpPassword@123 (encrypted)
Role:     EMPLOYEE
Active:   Yes
```

---

## 📂 Entity Class Mapping

The `User` entity maps to the `users` table:

```java
@Entity
@Table(name = "users")
public class User {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "username", nullable = false, unique = true, length = 100)
    private String username;
    
    @Column(name = "password", nullable = false, length = 255)
    private String password;
    
    @Column(name = "role", nullable = false, length = 20)
    private String role;
    
    // Optional: created_at, updated_at, is_active
}
```

---

## 🧾 Key Queries Used for Authentication

### 1. Find User by Username (Login Query)
```sql
SELECT id, username, password, role, is_active 
FROM users 
WHERE username = 'hr_admin' AND is_active = TRUE;
```
**Used in:** `AuthService.login()`

### 2. Get All Active Users
```sql
SELECT id, username, role, is_active 
FROM users 
WHERE is_active = TRUE;
```

### 3. Get Users by Role
```sql
SELECT id, username, role 
FROM users 
WHERE role = 'HR' AND is_active = TRUE;
```

### 4. Verify User Exists
```sql
SELECT COUNT(*) 
FROM users 
WHERE username = 'hr_admin';
```

---

## 🗂️ Indexes for Performance

```sql
CREATE UNIQUE INDEX idx_username ON users(username);
CREATE INDEX idx_role ON users(role);
CREATE INDEX idx_is_active ON users(is_active);
```

**Why Indexes?**
- `idx_username`: Fast login queries (UNIQUE ensures no duplicates)
- `idx_role`: Quick role-based filtering
- `idx_is_active`: Fast active user queries

---

## 💾 Password Encryption

**Algorithm:** BCrypt  
**Strength:** 10 (rounds)  
**Stored Format:** `$2a$10$...`

### Password Examples
```
Plain Text:     HRPassword@123
BCrypt Hash:    $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36aiAetm

Plain Text:     EmpPassword@123
BCrypt Hash:    $2a$10$dXJ3SW6G7P50eS3pGSOr.eFp5wvqBc.C5KM6.d1qj8iJ7HjL.Yjsy
```

---

## 🔄 CRUD Operations

### CREATE (Insert New User)
```sql
INSERT INTO users (username, password, role, is_active) 
VALUES ('new_user', '$2a$10$...hash...', 'EMPLOYEE', TRUE);
```

### READ (Select User)
```sql
SELECT * FROM users WHERE username = 'hr_admin';
```

### UPDATE (Modify User)
```sql
UPDATE users 
SET password = '$2a$10$...newhash...' 
WHERE username = 'hr_admin';
```

### DELETE (Remove User)
```sql
DELETE FROM users WHERE username = 'old_user';
```

---

## 📊 Data Relationships

```
┌─────────────────────────────────────┐
│          USERS TABLE                │
├─────────────────────────────────────┤
│ id (Primary Key)                    │
│ username (Unique Index)             │
│ password (Encrypted)                │
│ role (Index) ──┬─> 'HR'            │
│              └─> 'EMPLOYEE'        │
│ created_at                          │
│ updated_at                          │
│ is_active (Index)                   │
└─────────────────────────────────────┘
```

---

## 🚀 Backend Access Methods

### Via Hibernate Repository
```java
// In UserRepository
Optional<User> findByUsername(String username);
```

### In AuthService
```java
Optional<User> userOptional = userRepository.findByUsername(username.trim());
if (userOptional.isPresent()) {
    User user = userOptional.get();
    // Validate password with BCrypt
    if (passwordEncoder.matches(password, user.getPassword())) {
        // Login successful
    }
}
```

---

## 📈 Scaling Future Tables

For future enhancements, you might add:

```sql
-- Employee Details Table
CREATE TABLE employees (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    department VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Attendance Table
CREATE TABLE attendance (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    attendance_date DATE,
    status VARCHAR(20),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Team Formation Table
CREATE TABLE teams (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_name VARCHAR(100),
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

---

## ⚙️ Database Configuration

**File:** `application.properties`

```properties
# MySQL Database Configuration
spring.datasource.url=jdbc:mysql://localhost:3306/hrm_db
spring.datasource.username=root
spring.datasource.password=Sahil@21
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

# JPA / Hibernate Configuration
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.database-platform=org.hibernate.dialect.MySQLDialect
spring.jpa.properties.hibernate.format_sql=true
```

---

## ✅ Verification Query

To verify the table structure in MySQL:

```sql
USE hrm_db;
DESCRIBE users;
```

Expected output:
```
+----------+------------------+------+-----+---------+----------------+
| Field    | Type             | Null | Key | Default | Extra          |
+----------+------------------+------+-----+---------+----------------+
| id       | bigint           | NO   | PRI | NULL    | auto_increment |
| username | varchar(100)     | NO   | UNI | NULL    |                |
| password | varchar(255)     | NO   |     | NULL    |                |
| role     | varchar(20)      | NO   |     | NULL    |                |
| created_at | timestamp      | YES  |     | NULL    |                |
| updated_at | timestamp      | YES  |     | NULL    |                |
| is_active | tinyint(1)      | YES  |     | 1       |                |
+----------+------------------+------+-----+---------+----------------+
```

---

## 🔗 File Locations

- **SQL Schema:** `HRM_SYSTEM_BACKEND/src/main/resources/database-schema.sql`
- **Java Entity:** `HRM_SYSTEM_BACKEND/src/main/java/com/hrSystem/HRM/entity/User.java`
- **Repository:** `HRM_SYSTEM_BACKEND/src/main/java/com/hrSystem/HRM/repository/UserRepository.java`
- **Service:** `HRM_SYSTEM_BACKEND/src/main/java/com/hrSystem/HRM/service/AuthService.java`
