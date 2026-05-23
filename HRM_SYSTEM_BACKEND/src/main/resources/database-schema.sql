-- =====================================================
-- HRM System Database Schema
-- =====================================================

-- =====================================================
-- 1. USERS TABLE (Primary Login Table)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'User ID',
    username VARCHAR(100) NOT NULL UNIQUE COMMENT 'Login username (unique)',
    password VARCHAR(255) NOT NULL COMMENT 'BCrypt encrypted password',
    role VARCHAR(20) NOT NULL COMMENT 'User role: HR or EMPLOYEE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation date',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update date',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Account active status'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='User authentication and role management table';

-- Create index on username for faster login queries
CREATE UNIQUE INDEX idx_username ON users(username);
CREATE INDEX idx_role ON users(role);
CREATE INDEX idx_is_active ON users(is_active);

-- =====================================================
-- 2. INSERT INITIAL USERS
-- =====================================================
-- HR Admin User
-- Username: hr_admin
-- Password: HRPassword@123 (BCrypt Hash)
INSERT INTO users (username, password, role, is_active) 
VALUES (
    'hr_admin',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36aiAetm',
    'HR',
    TRUE
) ON DUPLICATE KEY UPDATE password=password;

-- Employee User
-- Username: employee_user
-- Password: EmpPassword@123 (BCrypt Hash)
INSERT INTO users (username, password, role, is_active) 
VALUES (
    'employee_user',
    '$2a$10$dXJ3SW6G7P50eS3pGSOr.eFp5wvqBc.C5KM6.d1qj8iJ7HjL.Yjsy',
    'EMPLOYEE',
    TRUE
) ON DUPLICATE KEY UPDATE password=password;

-- =====================================================
-- 3. USERS TABLE STRUCTURE (Show Table Details)
-- =====================================================

-- View table structure
DESCRIBE users;

-- Show table creation statement
SHOW CREATE TABLE users;

-- =====================================================
-- 4. SELECT QUERIES FOR LOGIN
-- =====================================================

-- Query to fetch user by username (used in AuthService)
SELECT id, username, password, role, is_active, created_at FROM users 
WHERE username = 'hr_admin' AND is_active = TRUE;

-- Query to fetch all active users
SELECT id, username, role, is_active, created_at FROM users 
WHERE is_active = TRUE;

-- Query to fetch all HR users
SELECT id, username, role FROM users 
WHERE role = 'HR' AND is_active = TRUE;

-- Query to fetch all EMPLOYEE users
SELECT id, username, role FROM users 
WHERE role = 'EMPLOYEE' AND is_active = TRUE;

-- =====================================================
-- 5. SAMPLE DATA FOR TESTING
-- =====================================================

-- Display current users
SELECT 
    id,
    username,
    role,
    is_active,
    created_at,
    
    updated_at
FROM users
ORDER BY id ASC;

-- Count users by role
SELECT 
    role,
    COUNT(*) as total_users
FROM users
WHERE is_active = TRUE
GROUP BY role;

-- =====================================================
-- 6. UPDATE QUERIES (if needed)
-- =====================================================

-- Update user password
UPDATE users 
SET password = '$2a$10$newHashHere' 
WHERE username = 'hr_admin';

-- Deactivate a user
UPDATE users 
SET is_active = FALSE 
WHERE username = 'employee_user';

-- Reactivate a user
UPDATE users 
SET is_active = TRUE 
WHERE username = 'employee_user';

-- =====================================================
-- 7. DELETE QUERIES (if needed)
-- =====================================================

-- Delete a specific user
DELETE FROM users WHERE username = 'employee_user';

-- Delete all inactive users
DELETE FROM users WHERE is_active = FALSE;

-- =====================================================
-- TABLE COLUMNS REFERENCE
-- =====================================================
/*
Column Name    | Data Type      | Constraints      | Description
---------------|----------------|------------------|------------------------------------------
id             | BIGINT         | PK, AUTO_INC     | Unique user identifier
username       | VARCHAR(100)   | NOT NULL, UNIQUE | Login username
password       | VARCHAR(255)   | NOT NULL         | BCrypt encrypted password
role           | VARCHAR(20)    | NOT NULL         | User role (HR/EMPLOYEE)
created_at     | TIMESTAMP      | DEFAULT NOW()    | Account creation timestamp
updated_at     | TIMESTAMP      | ON UPDATE NOW()  | Last modification timestamp
is_active      | BOOLEAN        | DEFAULT TRUE     | Account active status
*/

-- =====================================================
-- HIBERNATE AUTO-GENERATED TABLE (Alternative)
-- =====================================================
-- If using Hibernate ddl-auto=update, the table structure will be:
/*
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL,
  `username` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
*/

-- =====================================================
-- DATA ENCRYPTION NOTE
-- =====================================================
/*
Password Encryption Details:
- Algorithm: BCrypt
- Strength: 10
- Username: hr_admin
  Password: HRPassword@123
  Hash: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36aiAetm

- Username: employee_user
  Password: EmpPassword@123
  Hash: $2a$10$dXJ3SW6G7P50eS3pGSOr.eFp5wvqBc.C5KM6.d1qj8iJ7HjL.Yjsy

NOTE: Never store plain text passwords. Always use BCrypt or similar.
*/
