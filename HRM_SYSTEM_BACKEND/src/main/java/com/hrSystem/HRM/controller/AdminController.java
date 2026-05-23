package com.hrSystem.HRM.controller;

import com.hrSystem.HRM.entity.User;
import com.hrSystem.HRM.repository.UserRepository;
import com.hrSystem.HRM.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@CrossOrigin(origins = "*")
public class AdminController {

    private final UserRepository userRepository;
    private final AuthService authService;

    @Autowired
    public AdminController(UserRepository userRepository, AuthService authService) {
        this.userRepository = userRepository;
        this.authService = authService;
    }

    /**
     * Endpoint to create a new user with encrypted password
     * Used for user registration/creation
     */
    @PostMapping("/create-user")
    public ResponseEntity<Map<String, Object>> createUser(@RequestBody Map<String, String> payload) {
        String username = payload.get("username");
        String password = payload.get("password");
        String role = payload.get("role");

        Map<String, Object> response = new HashMap<>();

        if (username == null || username.trim().isEmpty() || 
            password == null || password.trim().isEmpty() || 
            role == null || role.trim().isEmpty()) {
            response.put("success", false);
            response.put("message", "Username, password, and role are required.");
            return ResponseEntity.badRequest().body(response);
        }

        if (userRepository.findByUsername(username.trim()).isPresent()) {
            response.put("success", false);
            response.put("message", "Username already exists.");
            return ResponseEntity.badRequest().body(response);
        }

        User user = new User();
        user.setUsername(username.trim());
        user.setPassword(authService.encodePassword(password));
        user.setRole(role.trim().toUpperCase());

        userRepository.save(user);

        response.put("success", true);
        response.put("message", "User created successfully.");
        response.put("username", user.getUsername());
        response.put("role", user.getRole());

        return ResponseEntity.ok(response);
    }

    /**
     * Endpoint to hash all existing plain-text passwords in the database
     * Use this ONCE to migrate existing users to hashed passwords
     */
    @PostMapping("/migrate-passwords")
    public ResponseEntity<Map<String, Object>> migratePasswords() {
        List<User> users = userRepository.findAll();
        int migratedCount = 0;

        for (User user : users) {
            // Check if password is already hashed (BCrypt hashes start with $2a$)
            if (user.getPassword() != null && !user.getPassword().startsWith("$2")) {
                user.setPassword(authService.encodePassword(user.getPassword()));
                userRepository.save(user);
                migratedCount++;
            }
        }

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "Password migration completed.");
        response.put("migratedCount", migratedCount);
        response.put("totalUsers", users.size());

        return ResponseEntity.ok(response);
    }
}
