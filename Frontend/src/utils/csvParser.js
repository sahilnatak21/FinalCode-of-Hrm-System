// CSV parsing utility
import { formatSkillScores, normalizeEmployeeSkillProfile } from './skillScores';

const ROLE_SKILL_MAP = {
  backend: ['backend', 'java', 'sql'],
  frontend: ['frontend', 'react', 'javascript'],
  'software engineer': ['backend', 'frontend', 'testing'],
  java: ['java', 'backend', 'sql'],
  qa: ['testing', 'quality assurance', 'communication'],
  devops: ['devops', 'cloud', 'automation'],
  database: ['database', 'sql', 'data management'],
  data: ['analytics', 'python', 'sql'],
  analyst: ['analytics', 'communication', 'reporting'],
  security: ['security', 'network security', 'risk analysis'],
  ui: ['ux design', 'frontend', 'communication'],
  ux: ['ux design', 'frontend', 'communication'],
  support: ['support', 'communication', 'troubleshooting'],
  hr: ['hr', 'communication', 'people management'],
  coordinator: ['project management', 'communication', 'planning'],
  administrator: ['infrastructure', 'support', 'security'],
};

const deriveSkillsFromRole = (role = '', department = '') => {
  const text = `${role} ${department}`.toLowerCase();
  const matched = Object.entries(ROLE_SKILL_MAP)
    .filter(([keyword]) => text.includes(keyword))
    .flatMap(([, skills]) => skills);
  const fallback = [role, department].filter(Boolean);
  return [...new Set(matched.length ? matched : fallback)].join(', ');
};

const looksLikeFilledEmployeeDatasetRow = (employee) =>
  employee.skillScores &&
  typeof employee.skillScores === 'string' &&
  !employee.skillScores.includes(':') &&
  Number(employee.experience || 0) > 1000 &&
  !employee.role &&
  !employee.department;

export const parseCSV = (csvText) => {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header and one data row');
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  
  // Expected headers mapping
  const headerMap = {
    'employee_id': 'employeeId',
    'employeeid': 'employeeId',
    'id': 'employeeId',
    'name': 'name',
    'skills': 'skills',
    'skill_scores': 'skillScores',
    'skillscore': 'skillScores',
    'skill_scores_json': 'skillScores',
    'skill_level': 'skillLevel',
    'skilllevel': 'skillLevel',
    'level': 'skillLevel',
    'experience': 'experience',
    'experience_(years)': 'experience',
    'years': 'experience',
    'category': 'category',
    'availability': 'availability',
    'performance_rating': 'performanceRating',
    'performancerating': 'performanceRating',
    'rating': 'performanceRating',
    'department': 'department',
    'role': 'role',
    'salary': 'salary',
    'cost': 'salary',
    'hourly_rate': 'hourlyRate',
    'hourlyrate': 'hourlyRate',
    'available_from': 'availableFrom',
    'availablefrom': 'availableFrom',
    'available_until': 'availableUntil',
    'availableuntil': 'availableUntil',
    'actual_label': 'actualLabel',
    'actuallabel': 'actualLabel',
    'actual_team': 'actualTeam',
    'actualteam': 'actualTeam',
    'target': 'target',
    'class': 'class',
    'label': 'actualLabel',
  };

  // Map headers to standard field names
  const mappedHeaders = headers.map(h => headerMap[h] || h);

  // Parse data rows
  const employees = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const employee = {};
    mappedHeaders.forEach((mappedHeader, index) => {
      if (mappedHeader && values[index] !== undefined) {
        const value = values[index].trim();
        
        // Handle numeric fields
        if (mappedHeader === 'experience') {
          employee._rawExperience = value;
          employee[mappedHeader] = value ? parseFloat(value) || 0 : 0;
        } else if (
          mappedHeader === 'performanceRating' ||
          mappedHeader === 'salary' ||
          mappedHeader === 'hourlyRate'
        ) {
          employee[mappedHeader] = value ? parseFloat(value) || 0 : 0;
        } else if (mappedHeader === 'skillLevel') {
          employee._rawSkillLevel = value;
          employee[mappedHeader] = value ? parseInt(value) || 1 : 1;
        } else {
          employee[mappedHeader] = value || '';
        }
      }
    });

    // Set defaults for missing fields
    if (!employee.name) continue; // Skip rows without name

    if (looksLikeFilledEmployeeDatasetRow(employee)) {
      const originalRole = employee.skills || 'Employee';
      const originalDepartment = employee.skillScores || 'General';
      const originalLocation = employee._rawSkillLevel || '';
      const originalSalary = Number(employee.experience || 0);

      employee.role = originalRole;
      employee.department = originalDepartment;
      employee.location = originalLocation;
      employee.salary = originalSalary;
      employee.experience = 2;
      employee.performanceRating = 7;
      employee.skillLevel = 6;
      employee.availability = 'Available';
      employee.category = 'Full-time';
      employee.skills = deriveSkillsFromRole(originalRole, originalDepartment);
      employee.skillScores = '';
      employee.actualLabel = originalDepartment;
    }
    
    employee.department = employee.department || 'General';
    employee.role = employee.role || 'Employee';
    employee.status = employee.status || 'Present';
    employee.availability = employee.availability || 'Available';
    employee.category = employee.category || 'Full-time';
    employee.skills = employee.skills || '';
    employee.skillLevel = employee.skillLevel || 1;
    employee.experience = employee.experience || 0;
    employee.performanceRating = employee.performanceRating || 0;
    employee.salary = employee.salary || 0;

    const normalized = normalizeEmployeeSkillProfile(employee);
    employees.push({
      ...normalized,
      skills: normalized.skills || formatSkillScores(normalized.skillScores),
    });
  }

  return employees;
};

// Parse a CSV line handling quoted values
const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current);
  return values;
};

export const exportToCSV = (employees) => {
  const headers = [
    'Employee ID',
    'Name',
    'Department',
    'Role',
    'Skills',
    'Skill Scores',
    'Skill Level',
    'Experience (years)',
    'Category',
    'Availability',
    'Performance Rating',
    'Salary',
    'Status'
  ];

  const rows = employees.map(emp => [
    emp.employeeId || emp.id || '',
    emp.name || '',
    emp.department || '',
    emp.role || '',
    emp.skills || '',
    formatSkillScores(emp.skillScores),
    emp.skillLevel || '',
    emp.experience || 0,
    emp.category || '',
    emp.availability || '',
    emp.performanceRating || 0,
    emp.salary || 0,
    emp.status || 'Present'
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
};

export const downloadCSV = (csvContent, filename = 'employees.csv') => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

