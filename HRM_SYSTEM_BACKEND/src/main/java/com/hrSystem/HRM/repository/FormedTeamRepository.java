package com.hrSystem.HRM.repository;

import com.hrSystem.HRM.entity.FormedTeam;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FormedTeamRepository extends JpaRepository<FormedTeam, Long> {
    Optional<FormedTeam> findBySavedTeamId(String savedTeamId);
    List<FormedTeam> findAllByOrderByUpdatedAtDesc();
}
