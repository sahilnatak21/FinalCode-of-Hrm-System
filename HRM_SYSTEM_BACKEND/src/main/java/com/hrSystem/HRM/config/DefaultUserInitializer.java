package com.hrSystem.HRM.config;

import com.hrSystem.HRM.entity.User;
import com.hrSystem.HRM.repository.UserRepository;
import com.hrSystem.HRM.service.AuthService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DefaultUserInitializer {

    @Bean
    public CommandLineRunner initializeDefaultUsers(UserRepository userRepository, AuthService authService) {
        return args -> {
            createUserIfMissing(userRepository, authService, "hr_admin", "HRPassword@123", "HR");
            createUserIfMissing(userRepository, authService, "employee_user", "EmpPassword@123", "EMPLOYEE");
        };
    }

    private void createUserIfMissing(
        UserRepository userRepository,
        AuthService authService,
        String username,
        String password,
        String role
    ) {
        if (userRepository.findByUsernameIgnoreCase(username).isPresent()) {
            return;
        }

        User user = new User();
        user.setUsername(username);
        user.setPassword(authService.encodePassword(password));
        user.setRole(role);
        userRepository.save(user);
    }
}
