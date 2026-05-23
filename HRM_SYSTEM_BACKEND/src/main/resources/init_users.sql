-- SQL Script to initialize HRM System with HR and Employee login users
-- This script creates the users table and inserts sample HR and Employee users

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL
);

-- Clear existing data (optional - comment out to keep existing data)
-- TRUNCATE TABLE users;

-- Insert HR Admin User
-- Username: hr_admin
-- Password: HRPassword@123 (encrypted with BCrypt)
-- BCrypt Hash: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36aiAetm
INSERT INTO users (username, password, role) 
SELECT 'hr_admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36aiAetm', 'HR'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'hr_admin');

-- Insert Employee User
-- Username: employee_user
-- Password: EmpPassword@123 (encrypted with BCrypt)
-- BCrypt Hash: $2a$10$dXJ3SW6G7P50eS3pGSOr.eFp5wvqBc.C5KM6.d1qj8iJ7HjL.Yjsy
INSERT INTO users (username, password, role) 
SELECT 'employee_user', '$2a$10$dXJ3SW6G7P50eS3pGSOr.eFp5wvqBc.C5KM6.d1qj8iJ7HjL.Yjsy', 'EMPLOYEE'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'employee_user');

-- View all users
SELECT id, username, role FROM users;
