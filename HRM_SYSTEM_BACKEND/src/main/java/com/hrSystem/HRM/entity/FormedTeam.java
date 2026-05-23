package com.hrSystem.HRM.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "formed_teams")
public class FormedTeam {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "saved_team_id", nullable = false, unique = true, length = 150)
    private String savedTeamId;

    @Column(name = "project_key", nullable = false, length = 150)
    private String projectKey;

    @Column(name = "project_id", nullable = false, length = 150)
    private String projectId;

    @Column(name = "project_name", nullable = false, length = 255)
    private String projectName;

    @Column(name = "team_name", nullable = false, length = 255)
    private String teamName;

    @Column(name = "total_team_size")
    private Integer totalTeamSize;

    @Column(name = "total_members")
    private Integer totalMembers;

    @Column(name = "avg_match_score")
    private Double avgMatchScore;

    @Lob
    @Column(name = "member_names", columnDefinition = "LONGTEXT")
    private String memberNames;

    @Lob
    @Column(name = "payload_json", nullable = false, columnDefinition = "LONGTEXT")
    private String payloadJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSavedTeamId() {
        return savedTeamId;
    }

    public void setSavedTeamId(String savedTeamId) {
        this.savedTeamId = savedTeamId;
    }

    public String getProjectKey() {
        return projectKey;
    }

    public void setProjectKey(String projectKey) {
        this.projectKey = projectKey;
    }

    public String getProjectId() {
        return projectId;
    }

    public void setProjectId(String projectId) {
        this.projectId = projectId;
    }

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public String getTeamName() {
        return teamName;
    }

    public void setTeamName(String teamName) {
        this.teamName = teamName;
    }

    public Integer getTotalTeamSize() {
        return totalTeamSize;
    }

    public void setTotalTeamSize(Integer totalTeamSize) {
        this.totalTeamSize = totalTeamSize;
    }

    public Integer getTotalMembers() {
        return totalMembers;
    }

    public void setTotalMembers(Integer totalMembers) {
        this.totalMembers = totalMembers;
    }

    public Double getAvgMatchScore() {
        return avgMatchScore;
    }

    public void setAvgMatchScore(Double avgMatchScore) {
        this.avgMatchScore = avgMatchScore;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(String payloadJson) {
        this.payloadJson = payloadJson;
    }

    public String getMemberNames() {
        return memberNames;
    }

    public void setMemberNames(String memberNames) {
        this.memberNames = memberNames;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
