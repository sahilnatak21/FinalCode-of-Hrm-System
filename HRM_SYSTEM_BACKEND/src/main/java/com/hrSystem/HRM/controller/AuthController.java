package com.hrSystem.HRM.controller;

import com.hrSystem.HRM.service.AuthService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
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

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, String> payload) {
        String username = payload.get("username");
        String password = payload.get("password");
        String role     = payload.get("role");

        AuthService.CreateUserResult result = authService.createUser(username, password, role);
        return ResponseEntity.status(result.status()).body(result.body());
    }

    @GetMapping("/users")
    public ResponseEntity<Map<String, Object>> listUsers() {
        List<Map<String, Object>> users = authService.getAllUsers();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("users", users);
        return ResponseEntity.ok(body);
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<Map<String, Object>> deleteUser(@PathVariable Long id) {
        Map<String, Object> body = new LinkedHashMap<>();
        try {
            authService.deleteUser(id);
            body.put("success", true);
            body.put("message", "User deleted successfully.");
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            body.put("success", false);
            body.put("message", e.getMessage());
            return ResponseEntity.status(404).body(body);
        }
    }
}
