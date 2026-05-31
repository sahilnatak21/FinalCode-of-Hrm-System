package com.hrSystem.HRM.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class EmployeeResponseDTO {

    private Long id;
    private String employeeId;
    private String username;
    private String name;
    private String department;
    private String role;
    private String skills;
    private Integer skillLevel;
    private Double experience;
    private String category;
    private String availability;
    private Double performanceRating;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

