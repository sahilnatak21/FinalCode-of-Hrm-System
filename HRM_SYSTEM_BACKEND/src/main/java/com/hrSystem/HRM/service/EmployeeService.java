package com.hrSystem.HRM.service;

import com.hrSystem.HRM.dto.EmployeeRequestDTO;
import com.hrSystem.HRM.dto.EmployeeResponseDTO;
import com.hrSystem.HRM.entity.Employee;
import com.hrSystem.HRM.entity.User;
import com.hrSystem.HRM.exception.ResourceNotFoundException;
import com.hrSystem.HRM.exception.ValidationException;
import com.hrSystem.HRM.repository.EmployeeRepository;
import com.hrSystem.HRM.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@Transactional
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Autowired
    public EmployeeService(EmployeeRepository employeeRepository,
                           UserRepository userRepository,
                           PasswordEncoder passwordEncoder) {
        this.employeeRepository = employeeRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public EmployeeResponseDTO createEmployee(EmployeeRequestDTO requestDTO) {
        String normalizedEmployeeId = normalizeEmployeeId(requestDTO.getEmployeeId());

        if (normalizedEmployeeId != null && employeeRepository.existsByEmployeeId(normalizedEmployeeId)) {
            throw new ValidationException("Employee ID already exists: " + normalizedEmployeeId);
        }

        // If username provided, create a user account so the employee can login
        String username = null;
        if (isNotBlank(requestDTO.getUsername()) && isNotBlank(requestDTO.getPassword())) {
            username = requestDTO.getUsername().trim();

            if (userRepository.findByUsernameIgnoreCase(username).isPresent()) {
                throw new ValidationException("Username '" + username + "' is already taken.");
            }

            String systemRole = isNotBlank(requestDTO.getRole()) &&
                    requestDTO.getRole().trim().equalsIgnoreCase("HR") ? "HR" : "EMPLOYEE";

            User user = new User();
            user.setUsername(username);
            user.setPassword(passwordEncoder.encode(requestDTO.getPassword()));
            user.setRole(systemRole);
            userRepository.save(user);
        }

        requestDTO.setEmployeeId(normalizedEmployeeId);
        Employee employee = convertToEntity(requestDTO);
        employee.setUsername(username);
        Employee savedEmployee = employeeRepository.save(employee);

        if (savedEmployee.getEmployeeId() == null) {
            savedEmployee.setEmployeeId(generateEmployeeId(savedEmployee.getId()));
            savedEmployee = employeeRepository.save(savedEmployee);
        }

        return convertToDTO(savedEmployee);
    }

    public EmployeeResponseDTO getEmployeeById(Long id) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", id));
        return convertToDTO(employee);
    }

    public EmployeeResponseDTO getEmployeeByEmployeeId(String employeeId) {
        Employee employee = employeeRepository.findByEmployeeId(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", employeeId));
        return convertToDTO(employee);
    }

    public EmployeeResponseDTO getEmployeeByUsername(String username) {
        Employee employee = employeeRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("Employee with username", username));
        return convertToDTO(employee);
    }

    public List<EmployeeResponseDTO> getAllEmployees() {
        return employeeRepository.findAll().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    public EmployeeResponseDTO updateEmployee(Long id, EmployeeRequestDTO requestDTO) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", id));

        String normalizedEmployeeId = normalizeEmployeeId(requestDTO.getEmployeeId());

        if (normalizedEmployeeId != null && employeeRepository.existsByEmployeeIdAndIdNot(normalizedEmployeeId, id)) {
            throw new ValidationException("Employee ID already exists: " + normalizedEmployeeId);
        }

        requestDTO.setEmployeeId(normalizedEmployeeId);
        updateEmployeeFields(employee, requestDTO);
        Employee updatedEmployee = employeeRepository.save(employee);
        return convertToDTO(updatedEmployee);
    }

    public void deleteEmployee(Long id) {
        if (!employeeRepository.existsById(id)) {
            throw new ResourceNotFoundException("Employee", id);
        }
        employeeRepository.deleteById(id);
    }

    private Employee convertToEntity(EmployeeRequestDTO dto) {
        Employee employee = new Employee();
        employee.setEmployeeId(normalizeEmployeeId(dto.getEmployeeId()));
        employee.setName(resolveName(dto));
        employee.setDepartment(dto.getDepartment() != null ? dto.getDepartment() : "General");
        employee.setRole(dto.getRole() != null ? dto.getRole() : "EMPLOYEE");
        employee.setSkills(dto.getSkills());
        employee.setSkillLevel(dto.getSkillLevel() != null ? dto.getSkillLevel() : 1);
        employee.setExperience(dto.getExperience() != null ? dto.getExperience() : 0.0);
        employee.setCategory(dto.getCategory() != null ? dto.getCategory() : "Full-time");
        employee.setAvailability(dto.getAvailability() != null ? dto.getAvailability() : "Available");
        employee.setPerformanceRating(dto.getPerformanceRating() != null ? dto.getPerformanceRating() : 0.0);
        employee.setStatus(dto.getStatus() != null ? dto.getStatus() : "Present");
        return employee;
    }

    private EmployeeResponseDTO convertToDTO(Employee employee) {
        EmployeeResponseDTO dto = new EmployeeResponseDTO();
        dto.setId(employee.getId());
        dto.setEmployeeId(employee.getEmployeeId());
        dto.setUsername(employee.getUsername());
        dto.setName(employee.getName());
        dto.setDepartment(employee.getDepartment());
        dto.setRole(employee.getRole());
        dto.setSkills(employee.getSkills());
        dto.setSkillLevel(employee.getSkillLevel());
        dto.setExperience(employee.getExperience());
        dto.setCategory(employee.getCategory());
        dto.setAvailability(employee.getAvailability());
        dto.setPerformanceRating(employee.getPerformanceRating());
        dto.setStatus(employee.getStatus());
        dto.setCreatedAt(employee.getCreatedAt());
        dto.setUpdatedAt(employee.getUpdatedAt());
        return dto;
    }

    private void updateEmployeeFields(Employee employee, EmployeeRequestDTO dto) {
        if (dto.getEmployeeId() != null) employee.setEmployeeId(normalizeEmployeeId(dto.getEmployeeId()));
        String resolvedName = resolveName(dto);
        if (resolvedName != null) employee.setName(resolvedName);
        if (dto.getDepartment() != null) employee.setDepartment(dto.getDepartment());
        if (dto.getRole() != null) employee.setRole(dto.getRole());
        if (dto.getSkills() != null) employee.setSkills(dto.getSkills());
        if (dto.getSkillLevel() != null) employee.setSkillLevel(dto.getSkillLevel());
        if (dto.getExperience() != null) employee.setExperience(dto.getExperience());
        if (dto.getCategory() != null) employee.setCategory(dto.getCategory());
        if (dto.getAvailability() != null) employee.setAvailability(dto.getAvailability());
        if (dto.getPerformanceRating() != null) employee.setPerformanceRating(dto.getPerformanceRating());
        if (dto.getStatus() != null) employee.setStatus(dto.getStatus());
    }

    private boolean isNotBlank(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String normalizeEmployeeId(String employeeId) {
        if (employeeId == null) return null;
        String trimmed = employeeId.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String generateEmployeeId(Long id) {
        return String.format("EMP%03d", id);
    }

    private String resolveName(EmployeeRequestDTO dto) {
        if (dto.getName() != null && !dto.getName().trim().isEmpty()) {
            return dto.getName().trim();
        }
        String first = dto.getFirstName() != null ? dto.getFirstName().trim() : "";
        String last  = dto.getLastName()  != null ? dto.getLastName().trim()  : "";
        String full  = (first + " " + last).trim();
        return full.isEmpty() ? null : full;
    }
}
