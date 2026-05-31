package com.hrSystem.HRM.repository;

import com.hrSystem.HRM.entity.Employee;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    Optional<Employee> findByEmployeeId(String employeeId);
    Optional<Employee> findByUsername(String username);

    boolean existsByEmployeeId(String employeeId);
    boolean existsByEmployeeIdAndIdNot(String employeeId, Long id);
}

