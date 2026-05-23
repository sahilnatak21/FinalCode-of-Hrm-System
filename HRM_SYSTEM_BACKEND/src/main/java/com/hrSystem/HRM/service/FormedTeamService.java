package com.hrSystem.HRM.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hrSystem.HRM.entity.FormedTeam;
import com.hrSystem.HRM.repository.FormedTeamRepository;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
public class FormedTeamService {

    private final FormedTeamRepository formedTeamRepository;
    private final ObjectMapper objectMapper;

    public FormedTeamService(FormedTeamRepository formedTeamRepository, ObjectMapper objectMapper) {
        this.formedTeamRepository = formedTeamRepository;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> saveTeam(Map<String, Object> payload) {
        String savedTeamId = requiredString(payload.get("savedTeamId"), "savedTeamId");
        String projectKey = firstNonBlank(
            payload.get("projectKey"),
            payload.get("projectId"),
            payload.get("projectName"),
            savedTeamId
        );
        String projectId = firstNonBlank(payload.get("projectId"), savedTeamId);
        String projectName = firstNonBlank(payload.get("projectName"), payload.get("teamName"), "Untitled Project");
        String teamName = firstNonBlank(payload.get("teamName"), projectName, "Project Team");

        FormedTeam team = formedTeamRepository.findBySavedTeamId(savedTeamId).orElseGet(FormedTeam::new);
        team.setSavedTeamId(savedTeamId);
        team.setProjectKey(slugify(projectKey));
        team.setProjectId(projectId);
        team.setProjectName(projectName);
        team.setTeamName(teamName);
        team.setTotalTeamSize(asInteger(payload.get("totalTeamSize")));
        team.setTotalMembers(extractTotalMembers(payload));
        team.setAvgMatchScore(extractAvgMatchScore(payload));
        team.setMemberNames(extractMemberNames(payload));
        team.setPayloadJson(writeJson(payload));

        FormedTeam saved = formedTeamRepository.save(team);
        return toPayload(saved);
    }

    public List<Map<String, Object>> getAllTeams() {
        List<Map<String, Object>> teams = new ArrayList<>();
        for (FormedTeam team : formedTeamRepository.findAllByOrderByUpdatedAtDesc()) {
            teams.add(toPayload(team));
        }
        return teams;
    }

    public Optional<Map<String, Object>> getTeam(String key) {
        if (key == null || key.trim().isEmpty()) {
            return Optional.empty();
        }

        String normalized = key.trim();
        Optional<FormedTeam> directMatch = formedTeamRepository.findBySavedTeamId(normalized);
        if (directMatch.isPresent()) {
            return Optional.of(toPayload(directMatch.get()));
        }

        for (FormedTeam team : formedTeamRepository.findAllByOrderByUpdatedAtDesc()) {
            if (
                normalized.equals(team.getProjectKey()) ||
                normalized.equalsIgnoreCase(team.getProjectId()) ||
                normalized.equalsIgnoreCase(team.getProjectName())
            ) {
                return Optional.of(toPayload(team));
            }
        }

        return Optional.empty();
    }

    private Map<String, Object> toPayload(FormedTeam team) {
        Map<String, Object> payload = readJson(team.getPayloadJson());
        payload.put("savedTeamId", team.getSavedTeamId());
        payload.put("projectKey", team.getProjectKey());
        payload.put("projectId", team.getProjectId());
        payload.put("projectName", team.getProjectName());
        payload.put("teamName", team.getTeamName());
        payload.put("totalTeamSize", team.getTotalTeamSize());
        payload.put("memberNames", team.getMemberNames());
        payload.put("savedAt", team.getCreatedAt() != null ? team.getCreatedAt().toString() : null);
        payload.put("updatedAt", team.getUpdatedAt() != null ? team.getUpdatedAt().toString() : null);
        return payload;
    }

    private Map<String, Object> readJson(String value) {
        try {
            return objectMapper.readValue(value, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (IOException e) {
            throw new IllegalStateException("Unable to parse stored team payload.", e);
        }
    }

    private String writeJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (IOException e) {
            throw new IllegalStateException("Unable to serialize team payload.", e);
        }
    }

    private String requiredString(Object value, String fieldName) {
        String result = firstNonBlank(value);
        if (result == null) {
            throw new IllegalArgumentException(fieldName + " is required.");
        }
        return result;
    }

    private String firstNonBlank(Object... values) {
        for (Object value : values) {
            String text = value == null ? "" : String.valueOf(value).trim();
            if (!text.isEmpty()) {
                return text;
            }
        }
        return null;
    }

    private Integer asInteger(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return (int) Math.round(Double.parseDouble(String.valueOf(value)));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Double extractAvgMatchScore(Map<String, Object> payload) {
        Object statistics = payload.get("statistics");
        if (statistics instanceof Map<?, ?> stats) {
            Object value = stats.get("avgMatchScore");
            if (value != null) {
                try {
                    return Double.parseDouble(String.valueOf(value));
                } catch (NumberFormatException ignored) {
                    return null;
                }
            }
        }
        return null;
    }

    private Integer extractTotalMembers(Map<String, Object> payload) {
        Object statistics = payload.get("statistics");
        if (statistics instanceof Map<?, ?> stats) {
            Object value = stats.get("totalMembers");
            Integer parsed = asInteger(value);
            if (parsed != null) {
                return parsed;
            }
        }

        Object members = payload.get("members");
        if (members instanceof List<?> list) {
            return list.size();
        }
        return null;
    }

    private String extractMemberNames(Map<String, Object> payload) {
        Set<String> names = new LinkedHashSet<>();
        collectMemberNames(payload.get("members"), names);

        Object teams = payload.get("teams");
        if (teams instanceof List<?> groups) {
            for (Object group : groups) {
                if (group instanceof Map<?, ?> groupMap) {
                    collectMemberNames(groupMap.get("members"), names);
                }
            }
        }

        return names.isEmpty() ? null : String.join(", ", names);
    }

    private void collectMemberNames(Object membersObject, Set<String> names) {
        if (!(membersObject instanceof List<?> members)) {
            return;
        }

        for (Object member : members) {
            if (member instanceof Map<?, ?> memberMap) {
                String name = firstNonBlank(memberMap.get("name"), memberMap.get("employeeName"), memberMap.get("fullName"));
                if (name != null) {
                    names.add(name);
                }
            }
        }
    }

    private String slugify(String value) {
        String slug = String.valueOf(value)
            .trim()
            .toLowerCase()
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-+|-+$", "");
        return slug.isEmpty() ? "project" : slug;
    }
}
