package com.hrSystem.HRM.service;

import com.hrSystem.HRM.entity.User;
import com.hrSystem.HRM.repository.UserRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Autowired
    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public AuthResult login(String username, String password, HttpSession session) {
        if (isBlank(username) || isBlank(password)) {
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("success", false);
            response.put("message", "Email/username and password are required.");
            return new AuthResult(response, HttpStatus.BAD_REQUEST);
        }

        String normalizedUsername = username.trim();
        Optional<User> userOptional = findLoginUser(normalizedUsername);
        if (userOptional.isEmpty()) {
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("success", false);
            response.put("message", "Invalid username or password.");
            return new AuthResult(response, HttpStatus.UNAUTHORIZED);
        }

        User user = userOptional.get();
        if (!passwordMatches(password, user)) {
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("success", false);
            response.put("message", "Invalid username or password.");
            return new AuthResult(response, HttpStatus.UNAUTHORIZED);
        }

        String token = UUID.randomUUID().toString();
        session.setAttribute("auth_token", token);
        session.setAttribute("user_id", user.getId());
        session.setAttribute("username", user.getUsername());
        session.setAttribute("user_role", user.getRole());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("message", "Login successful.");
        response.put("role", user.getRole());
        response.put("token", token);
        response.put("username", user.getUsername());
        response.put("userId", user.getId());

        return new AuthResult(response, HttpStatus.OK);
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    public String encodePassword(String password) {
        return passwordEncoder.encode(password);
    }

    private Optional<User> findLoginUser(String identifier) {
        Optional<User> directMatch = userRepository.findByUsernameIgnoreCase(identifier);
        if (directMatch.isPresent()) {
            return directMatch;
        }

        int atIndex = identifier.indexOf('@');
        if (atIndex > 0) {
            String localPart = identifier.substring(0, atIndex).trim();
            if (!localPart.isEmpty()) {
                return userRepository.findByUsernameIgnoreCase(localPart);
            }
        }

        return Optional.empty();
    }

    private boolean passwordMatches(String rawPassword, User user) {
        String storedPassword = user.getPassword();
        if (isBlank(storedPassword)) {
            return false;
        }

        if (storedPassword.startsWith("$2")) {
            return passwordEncoder.matches(rawPassword, storedPassword);
        }

        boolean matches = storedPassword.equals(rawPassword);
        if (matches) {
            user.setPassword(passwordEncoder.encode(rawPassword));
            userRepository.save(user);
        }
        return matches;
    }

    public record AuthResult(Map<String, Object> body, HttpStatus status) {
    }
}
