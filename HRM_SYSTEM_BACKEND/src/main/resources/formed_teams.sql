CREATE TABLE formed_teams (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    saved_team_id VARCHAR(150) NOT NULL UNIQUE,
    project_key VARCHAR(150) NOT NULL,
    project_id VARCHAR(150) NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    team_name VARCHAR(255) NOT NULL,
    total_team_size INT NULL,
    total_members INT NULL,
    avg_match_score DOUBLE NULL,
    member_names LONGTEXT NULL,
    payload_json LONGTEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_formed_teams_project_key (project_key),
    INDEX idx_formed_teams_project_id (project_id),
    INDEX idx_formed_teams_updated_at (updated_at)
);
