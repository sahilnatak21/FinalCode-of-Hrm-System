package com.hrSystem.HRM.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Service
public class MlModelService {

    private final RestTemplate restTemplate;
    private final String mlApiUrl;

    public MlModelService(
            RestTemplateBuilder builder,
            @Value("${ml.api.url:http://localhost:5000/api/ml/team-formation}") String mlApiUrl
    ) {
        this.restTemplate = builder
                .setConnectTimeout(Duration.ofSeconds(5))
                .setReadTimeout(Duration.ofSeconds(30))
                .build();
        this.mlApiUrl = mlApiUrl;
    }

    public JsonNode generateTeam(Map<String, Object> requestPayload) {
        Map<String, Object> criteria = getMap(requestPayload, "criteria");
        Map<String, Object> config = getMap(requestPayload, "config");
        Map<String, Object> payload = new HashMap<>();
        payload.put("criteria", criteria != null ? criteria : Map.of());
        payload.put("config", config != null ? config : Map.of());

        Object employees = requestPayload != null ? requestPayload.get("employees") : null;
        if (employees != null) {
            payload.put("employees", employees);
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);

        ResponseEntity<JsonNode> response =
                restTemplate.postForEntity(mlApiUrl, request, JsonNode.class);

        return response.getBody();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getMap(Map<String, Object> payload, String key) {
        if (payload == null) {
            return Map.of();
        }
        Object value = payload.get(key);
        if (value instanceof Map<?, ?> mapValue) {
            return (Map<String, Object>) mapValue;
        }
        return Map.of();
    }
}
