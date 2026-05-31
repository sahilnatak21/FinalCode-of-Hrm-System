package com.hrSystem.HRM.controller;

import com.hrSystem.HRM.dto.EmployeeRequestDTO;
import com.hrSystem.HRM.dto.EmployeeResponseDTO;
import com.hrSystem.HRM.service.EmployeeService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/api/employees", "/api/candidates"})
@CrossOrigin(origins = "*")
public class EmployeeController {

    private final EmployeeService employeeService;

    @Autowired
    public EmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @PostMapping
    public ResponseEntity<EmployeeResponseDTO> createEmployee(@Valid @RequestBody EmployeeRequestDTO requestDTO) {
        EmployeeResponseDTO responseDTO = employeeService.createEmployee(requestDTO);
        return new ResponseEntity<>(responseDTO, HttpStatus.CREATED);
    }

    @GetMapping("/{id}")
    public ResponseEntity<EmployeeResponseDTO> getEmployeeById(@PathVariable Long id) {
        EmployeeResponseDTO responseDTO = employeeService.getEmployeeById(id);
        return ResponseEntity.ok(responseDTO);
    }

    @GetMapping("/employee-id/{employeeId}")
    public ResponseEntity<EmployeeResponseDTO> getEmployeeByEmployeeId(@PathVariable String employeeId) {
        EmployeeResponseDTO responseDTO = employeeService.getEmployeeByEmployeeId(employeeId);
        return ResponseEntity.ok(responseDTO);
    }

    @GetMapping("/username/{username}")
    public ResponseEntity<EmployeeResponseDTO> getEmployeeByUsername(@PathVariable String username) {
        EmployeeResponseDTO responseDTO = employeeService.getEmployeeByUsername(username);
        return ResponseEntity.ok(responseDTO);
    }

    @GetMapping
    public ResponseEntity<List<EmployeeResponseDTO>> getAllEmployees() {
        List<EmployeeResponseDTO> employees = employeeService.getAllEmployees();
        return ResponseEntity.ok(employees);
    }

    @PutMapping("/{id}")
    public ResponseEntity<EmployeeResponseDTO> updateEmployee(
            @PathVariable Long id,
            @Valid @RequestBody EmployeeRequestDTO requestDTO) {
        EmployeeResponseDTO responseDTO = employeeService.updateEmployee(id, requestDTO);
        return ResponseEntity.ok(responseDTO);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEmployee(@PathVariable Long id) {
        employeeService.deleteEmployee(id);
        return ResponseEntity.noContent().build();
    }
}

