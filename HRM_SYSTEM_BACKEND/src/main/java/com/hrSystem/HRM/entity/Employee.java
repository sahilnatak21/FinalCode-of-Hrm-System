package com.hrSystem.HRM.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "employees")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Employee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", unique = true, nullable = true)
    private String employeeId;

    @Column(name = "username", unique = true, nullable = true)
    private String username;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "department", nullable = false)
    private String department;

    @Column(name = "role", nullable = false)
    private String role;

    @Column(name = "skills", length = 1000)
    private String skills;

    @Column(name = "skill_level")
    private Integer skillLevel = 1;

    @Column(name = "experience")
    private Double experience = 0.0;

    @Column(name = "category")
    private String category = "Full-time";

    @Column(name = "availability")
    private String availability = "Available";

    @Column(name = "performance_rating")
    private Double performanceRating = 0.0;

    @Column(name = "status")
    private String status = "Present";

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}

