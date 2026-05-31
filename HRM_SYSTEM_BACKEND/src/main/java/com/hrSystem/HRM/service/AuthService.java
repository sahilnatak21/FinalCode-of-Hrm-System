package com.hrSystem.HRM.service;

import com.hrSystem.HRM.entity.User;
import com.hrSystem.HRM.repository.UserRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
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

    public CreateUserResult createUser(String username, String password, String role) {
        if (isBlank(username) || isBlank(password) || isBlank(role)) {
            return new CreateUserResult(error("Username, password, and role are required."), HttpStatus.BAD_REQUEST);
        }

        String trimmedUsername = username.trim();
        if (trimmedUsername.length() < 3) {
            return new CreateUserResult(error("Username must be at least 3 characters."), HttpStatus.BAD_REQUEST);
        }

        String normalizedRole = role.trim().toUpperCase();
        if (!normalizedRole.equals("HR") && !normalizedRole.equals("EMPLOYEE")) {
            return new CreateUserResult(error("Role must be HR or EMPLOYEE."), HttpStatus.BAD_REQUEST);
        }

        if (userRepository.findByUsernameIgnoreCase(trimmedUsername).isPresent()) {
            return new CreateUserResult(error("Username '" + trimmedUsername + "' is already taken."), HttpStatus.CONFLICT);
        }

        User user = new User();
        user.setUsername(trimmedUsername);
        user.setPassword(passwordEncoder.encode(password));
        user.setRole(normalizedRole);
        User saved = userRepository.save(user);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", "User created successfully.");
        body.put("userId", saved.getId());
        body.put("username", saved.getUsername());
        body.put("role", saved.getRole());
        return new CreateUserResult(body, HttpStatus.CREATED);
    }

    public List<Map<String, Object>> getAllUsers() {
        return userRepository.findAll().stream()
                .map(u -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", u.getId());
                    m.put("username", u.getUsername());
                    m.put("role", u.getRole());
                    return m;
                })
                .toList();
    }

    public void deleteUser(Long id) {
        if (!userRepository.existsById(id)) {
            throw new IllegalArgumentException("User with id " + id + " not found.");
        }
        userRepository.deleteById(id);
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", message);
        return body;
    }

    public record AuthResult(Map<String, Object> body, HttpStatus status) {}
    public record CreateUserResult(Map<String, Object> body, HttpStatus status) {}
}
