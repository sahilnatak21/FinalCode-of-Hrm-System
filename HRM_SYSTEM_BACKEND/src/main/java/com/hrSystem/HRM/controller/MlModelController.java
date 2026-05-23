package com.hrSystem.HRM.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.hrSystem.HRM.service.MlModelService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/ml")
@CrossOrigin(origins = "*")
public class MlModelController {

    private final MlModelService mlModelService;

    @Autowired
    public MlModelController(MlModelService mlModelService) {
        this.mlModelService = mlModelService;
    }

    @PostMapping("/team-formation")
    public ResponseEntity<JsonNode> generateTeam(@RequestBody Map<String, Object> payload) {
        JsonNode result = mlModelService.generateTeam(payload);
        return ResponseEntity.ok(result);
    }
}
