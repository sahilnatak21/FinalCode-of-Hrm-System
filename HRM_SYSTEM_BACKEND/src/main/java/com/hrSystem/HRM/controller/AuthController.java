package com.hrSystem.HRM.controller;

import com.hrSystem.HRM.service.AuthService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService authService;

    @Autowired
    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(
            @RequestBody Map<String, String> payload,
            HttpSession session
    ) {
        String username = payload.get("username") != null ? payload.get("username") : payload.get("email");
        String password = payload.get("password");

        AuthService.AuthResult result = authService.login(username, password, session);
        return ResponseEntity.status(result.status()).body(result.body());
    }
}
