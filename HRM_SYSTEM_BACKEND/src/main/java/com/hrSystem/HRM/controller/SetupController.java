package com.hrSystem.HRM.controller;

import com.hrSystem.HRM.entity.User;
import com.hrSystem.HRM.repository.UserRepository;
import com.hrSystem.HRM.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/setup")
@CrossOrigin(origins = "*")
public class SetupController {

    private final UserRepository userRepository;
    private final AuthService authService;
    private final PasswordEncoder passwordEncoder;

    @Autowired
    public SetupController(UserRepository userRepository, AuthService authService, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.authService = authService;
        this.passwordEncoder = passwordEncoder;
    }

    @PostMapping("/initialize-users")
    public ResponseEntity<Map<String, Object>> initializeUsers() {
        Map<String, Object> response = new LinkedHashMap<>();

        try {
            boolean hrUpdated = createOrRepairDefaultUser("hr_admin", "HRPassword@123", "HR");
            boolean employeeUpdated = createOrRepairDefaultUser("employee_user", "EmpPassword@123", "EMPLOYEE");

            response.put("success", true);
            response.put("message", hrUpdated || employeeUpdated
                ? "Default users initialized or repaired successfully"
                : "Users already initialized");
            response.put("hr_login", "hr_admin");
            response.put("hr_password", "HRPassword@123");
            response.put("employee_login", "employee_user");
            response.put("employee_password", "EmpPassword@123");
            response.put("note", "Please change these default passwords in production");

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error initializing users: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    private boolean createOrRepairDefaultUser(String username, String password, String role) {
        Optional<User> existingUser = userRepository.findByUsernameIgnoreCase(username);
        if (existingUser.isEmpty()) {
            User newUser = new User();
            newUser.setUsername(username);
            newUser.setPassword(authService.encodePassword(password));
            newUser.setRole(role);
            userRepository.save(newUser);
            return true;
        }

        User user = existingUser.get();
        boolean updated = false;

        if (!passwordMatches(password, user.getPassword())) {
            user.setPassword(authService.encodePassword(password));
            updated = true;
        }

        if (!role.equalsIgnoreCase(user.getRole())) {
            user.setRole(role);
            updated = true;
        }

        if (updated) {
            userRepository.save(user);
        }

        return updated;
    }

    private boolean passwordMatches(String rawPassword, String storedPassword) {
        if (storedPassword == null || storedPassword.isBlank()) {
            return false;
        }
        if (storedPassword.startsWith("$2")) {
            return passwordEncoder.matches(rawPassword, storedPassword);
        }
        return storedPassword.equals(rawPassword);
    }
}
