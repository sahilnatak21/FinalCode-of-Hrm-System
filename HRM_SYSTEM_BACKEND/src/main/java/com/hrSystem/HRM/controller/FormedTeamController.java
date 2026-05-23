package com.hrSystem.HRM.controller;

import com.hrSystem.HRM.service.FormedTeamService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/teams")
@CrossOrigin(origins = "*")
public class FormedTeamController {

    private final FormedTeamService formedTeamService;

    public FormedTeamController(FormedTeamService formedTeamService) {
        this.formedTeamService = formedTeamService;
    }

    @PostMapping
    public ResponseEntity<?> saveTeam(@RequestBody Map<String, Object> payload) {
        try {
            return ResponseEntity.ok(formedTeamService.saveTeam(payload));
        } catch (IllegalArgumentException ex) {
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("success", false);
            response.put("message", ex.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAllTeams() {
        return ResponseEntity.ok(formedTeamService.getAllTeams());
    }

    @GetMapping("/{key}")
    public ResponseEntity<?> getTeam(@PathVariable String key) {
        Optional<Map<String, Object>> team = formedTeamService.getTeam(key);
        if (team.isPresent()) {
            return ResponseEntity.ok(team.get());
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", false);
        response.put("message", "Team not found.");
        return ResponseEntity.status(404).body(response);
    }
}
