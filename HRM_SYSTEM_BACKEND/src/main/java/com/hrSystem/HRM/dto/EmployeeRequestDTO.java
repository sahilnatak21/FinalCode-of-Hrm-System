package com.hrSystem.HRM.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonSetter;
import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class EmployeeRequestDTO {

    @JsonAlias({"Employee", "employee", "employee_id", "Employee ID", "candidateId", "candidate_id", "Candidate ID", "Candidate", "candidateCode", "candidate_code", "id"})
    private String employeeId;

    private String username;
    private String password;

    @JsonAlias({"Name", "name", "candidateName", "candidate_name", "Candidate Name", "fullName", "full_name", "candidateFullName", "candidate_full_name"})
    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters")
    private String name;

    @JsonAlias({"Department", "Departme", "department", "candidateDepartment", "candidate_department", "Candidate Department", "team", "Team", "domain", "specialization"})
    @NotBlank(message = "Department is required")
    @Size(max = 50, message = "Department must not exceed 50 characters")
    private String department;

    @JsonAlias({"Role", "role", "position", "Position", "candidateRole", "candidate_role", "Candidate Role", "jobTitle", "job_title", "jobRole", "job_role", "designation"})
    @NotBlank(message = "Role is required")
    @Size(max = 100, message = "Role must not exceed 100 characters")
    private String role;

    @JsonAlias({"Skills", "skills", "candidateSkills", "candidate_skills", "Candidate Skills", "skillSet", "skill_set", "technologies", "techStack", "tech_stack"})
    @Size(max = 1000, message = "Skills must not exceed 1000 characters")
    private String skills;

    @JsonAlias({"Skill Level", "skill_level", "skillLevel", "candidateSkillLevel", "candidate_skill_level", "Candidate Skill Level"})
    @Min(value = 1, message = "Skill level must be at least 1")
    @Max(value = 10, message = "Skill level must be at most 10")
    private Integer skillLevel = 1;

    @JsonAlias({"Experience", "experience", "candidateExperience", "candidate_experience", "Candidate Experience"})
    @Min(value = 0, message = "Experience cannot be negative")
    private Double experience = 0.0;

    @JsonAlias({"Category", "category", "candidateCategory", "candidate_category", "Candidate Category"})
    @Size(max = 50, message = "Category must not exceed 50 characters")
    private String category = "Full-time";

    @JsonAlias({"Availability", "Availabilit", "availability", "candidateAvailability", "candidate_availability", "Candidate Availability"})
    @Size(max = 50, message = "Availability must not exceed 50 characters")
    private String availability = "Available";

    @JsonAlias({"Performance", "Performar", "Performance Rating", "performance_rating", "performanceRating", "candidatePerformance", "candidate_performance", "Candidate Performance"})
    @Min(value = 0, message = "Performance rating cannot be negative")
    @Max(value = 10, message = "Performance rating must be at most 10")
    private Double performanceRating = 0.0;

    @JsonAlias({"Status", "status", "candidateStatus", "candidate_status", "Candidate Status"})
    @Size(max = 50, message = "Status must not exceed 50 characters")
    private String status = "Present";

    @JsonAlias({"firstName", "first_name", "candidateFirstName", "candidate_first_name"})
    private String firstName;

    @JsonAlias({"lastName", "last_name", "candidateLastName", "candidate_last_name"})
    private String lastName;

    @JsonSetter("candidate")
    public void unpackCandidate(Map<String, Object> candidate) {
        applyFromNestedMap(candidate);
    }

    @JsonSetter("data")
    public void unpackData(Map<String, Object> data) {
        applyFromNestedMap(data);
    }

    @JsonSetter("candidateData")
    public void unpackCandidateData(Map<String, Object> candidateData) {
        applyFromNestedMap(candidateData);
    }

    private void applyFromNestedMap(Map<String, Object> map) {
        if (map == null || map.isEmpty()) {
            return;
        }

        this.employeeId = firstNonBlank(this.employeeId, asString(map.get("employeeId")), asString(map.get("candidateId")), asString(map.get("candidate_code")), asString(map.get("id")));
        this.firstName = firstNonBlank(this.firstName, asString(map.get("firstName")), asString(map.get("first_name")));
        this.lastName = firstNonBlank(this.lastName, asString(map.get("lastName")), asString(map.get("last_name")));
        this.name = firstNonBlank(this.name, asString(map.get("name")), asString(map.get("candidateName")), asString(map.get("fullName")), joinNames(this.firstName, this.lastName));
        this.department = firstNonBlank(this.department, asString(map.get("department")), asString(map.get("candidateDepartment")), asString(map.get("team")), asString(map.get("domain")));
        this.role = firstNonBlank(this.role, asString(map.get("role")), asString(map.get("candidateRole")), asString(map.get("position")), asString(map.get("jobTitle")), asString(map.get("designation")));
        this.skills = firstNonBlank(this.skills, asString(map.get("skills")), asString(map.get("candidateSkills")), asString(map.get("skillSet")), asString(map.get("techStack")));
    }

    private String joinNames(String first, String last) {
        String f = safeTrim(first);
        String l = safeTrim(last);
        if (f == null && l == null) {
            return null;
        }
        if (f == null) {
            return l;
        }
        if (l == null) {
            return f;
        }
        return f + " " + l;
    }

    private String asString(Object value) {
        if (value == null) {
            return null;
        }
        return String.valueOf(value);
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            String trimmed = safeTrim(value);
            if (trimmed != null) {
                return trimmed;
            }
        }
        return null;
    }

    private String safeTrim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

