// Utility functions for localStorage management
import { formatSkillScores, normalizeEmployeeSkillProfile } from './skillScores';

const saveEmployeesInternal = (employees) => {
  try {
    localStorage.setItem('employees', JSON.stringify(employees));
  } catch (error) {
    console.error('Error saving employees to localStorage:', error);
  }
};

export const getEmployees = () => {
  try {
    const employees = localStorage.getItem('employees');
    const parsed = employees ? JSON.parse(employees) : [];
    
    // Migrate old data format (add IDs if missing)
    let needsMigration = false;
    const migrated = parsed.map((emp, index) => {
      const normalized = normalizeEmployeeSkillProfile(emp);
      if (!emp.id) {
        needsMigration = true;
        return {
          ...normalized,
          id: emp.name + '_' + index + '_' + Date.now(),
          status: emp.status || 'Present',
        };
      }
      if (JSON.stringify(emp.skillScores || {}) !== JSON.stringify(normalized.skillScores || {})) {
        needsMigration = true;
      }
      return {
        ...normalized,
        status: emp.status || 'Present',
      };
    });
    
    // Save migrated data if migration occurred
    if (needsMigration) {
      saveEmployeesInternal(migrated);
    }
    
    return migrated;
  } catch (error) {
    console.error('Error reading employees from localStorage:', error);
    return [];
  }
};

export const saveEmployees = (employees) => {
  saveEmployeesInternal(employees);
};

export const addEmployee = (employee) => {
  const employees = getEmployees();
  const newEmployee = {
    ...normalizeEmployeeSkillProfile(employee),
    id: employee.employeeId || employee.id || Date.now().toString(),
    employeeId: employee.employeeId || employee.id || Date.now().toString(),
    status: employee.status || 'Present',
    createdAt: new Date().toISOString(),
    // Ensure all new fields have defaults
    skills: employee.skills || formatSkillScores(normalizeEmployeeSkillProfile(employee).skillScores),
    skillLevel: normalizeEmployeeSkillProfile(employee).skillLevel || 1,
    experience: employee.experience || 0,
    category: employee.category || 'Full-time',
      availability: employee.availability || 'Available',
      performanceRating: employee.performanceRating || 0,
      salary: employee.salary || 0,
      skillScores: normalizeEmployeeSkillProfile(employee).skillScores,
  };
  employees.push(newEmployee);
  saveEmployees(employees);
  return newEmployee;
};

export const addEmployees = (employeesList) => {
  const existingEmployees = getEmployees();
  const newEmployees = employeesList.map(emp => {
    const normalized = normalizeEmployeeSkillProfile(emp);
    return {
      ...normalized,
      id: emp.employeeId || emp.id || Date.now().toString() + '_' + Math.random(),
      employeeId: emp.employeeId || emp.id || Date.now().toString() + '_' + Math.random(),
      status: emp.status || 'Present',
      createdAt: new Date().toISOString(),
      skills: normalized.skills || formatSkillScores(normalized.skillScores),
      skillLevel: normalized.skillLevel || 1,
      experience: emp.experience || 0,
      category: emp.category || 'Full-time',
      availability: emp.availability || 'Available',
      performanceRating: emp.performanceRating || 0,
      salary: emp.salary || 0,
      skillScores: normalized.skillScores,
    };
  });
  
  const allEmployees = [...existingEmployees, ...newEmployees];
  saveEmployees(allEmployees);
  return newEmployees;
};

export const deleteEmployee = (id) => {
  const employees = getEmployees();
  const filtered = employees.filter(emp => emp.id !== id);
  saveEmployees(filtered);
  return filtered;
};

export const updateEmployeeStatus = (id, status) => {
  const employees = getEmployees();
  const updated = employees.map(emp =>
    emp.id === id ? { ...emp, status } : emp
  );
  saveEmployees(updated);
  return updated;
};

export const updateEmployee = (id, employeeData) => {
  const employees = getEmployees();
  const updatedEmployee = normalizeEmployeeSkillProfile(employeeData);
  const updated = employees.map((emp) =>
    emp.id === id || emp.employeeId === id
      ? {
          ...emp,
          ...updatedEmployee,
          skills: updatedEmployee.skills || formatSkillScores(updatedEmployee.skillScores),
          skillScores: updatedEmployee.skillScores,
          skillLevel: updatedEmployee.skillLevel || emp.skillLevel || 1,
        }
      : emp
  );
  saveEmployees(updated);
  return updated;
};

