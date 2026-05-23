import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createEmployee, createEmployees } from '../utils/api';
import { parseCSV, downloadCSV } from '../utils/csvParser';
import { formatSkillScores, parseSkillScores } from '../utils/skillScores';
import { toast } from '../utils/toast';

const createSkillEntry = (name = '', score = 5) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name,
  score,
});

const AddEmployee = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    employeeId: '',
    name: '',
    department: '',
    role: '',
    skills: '',
    skillLevel: 1,
    experience: 0,
    category: 'Full-time',
    availability: 'Available',
    performanceRating: 0,
    skillScores: '',
  });
  const [skillEntries, setSkillEntries] = useState([createSkillEntry()]);

  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [csvError, setCsvError] = useState('');
  const [csvSuccess, setCsvSuccess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations', 'IT', 'Design'];
  const categories = ['Full-time', 'Part-time', 'Contract', 'Intern', 'Freelance'];
  const availabilityOptions = ['Available', 'Busy', 'On Leave', 'Unavailable'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === 'skillLevel' || name === 'experience' || name === 'performanceRating'
          ? parseFloat(value) || 0
          : value,
    }));
  };

  const updateSkillEntry = (id, field, value) => {
    setSkillEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, [field]: field === 'score' ? Math.min(10, Math.max(0, Number(value) || 0)) : value }
          : entry
      )
    );
  };

  const addSkillEntry = () => {
    setSkillEntries((prev) => [...prev, createSkillEntry()]);
  };

  const removeSkillEntry = (id) => {
    setSkillEntries((prev) => (prev.length > 1 ? prev.filter((entry) => entry.id !== id) : prev));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!formData.name || !formData.department || !formData.role) {
      setError('Please fill in required fields (Name, Department, Role)');
      setLoading(false);
      return;
    }

    try {
      const structuredSkillScores = skillEntries.reduce((acc, entry) => {
        const skillName = String(entry.name || '').trim();
        if (!skillName) return acc;
        acc[skillName] = Number(entry.score || 0);
        return acc;
      }, {});

      await createEmployee({
        ...formData,
        skillScores: structuredSkillScores,
        skills: formData.skills || Object.keys(structuredSkillScores).join(', '),
      });
      toast.success('Employee added successfully');
      setShowSuccess(true);
      setSuccessMessage('Employee added successfully. Redirecting to employee list...');
      setFormData({
        employeeId: '',
        name: '',
        department: '',
        role: '',
        skills: '',
        skillLevel: 1,
        experience: 0,
        category: 'Full-time',
        availability: 'Available',
        performanceRating: 0,
        skillScores: '',
      });
      setSkillEntries([createSkillEntry()]);

      setTimeout(() => {
        setShowSuccess(false);
        navigate('/employees');
      }, 2000);
    } catch (submitError) {
      const errorMsg = submitError.message || 'Failed to add employee. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
      console.error('Error adding employee:', submitError);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setCsvError('Please upload a CSV file');
      setCsvSuccess('');
      return;
    }

    setCsvError('');
    setCsvSuccess('');
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csvText = event.target.result;
        const employees = parseCSV(csvText);

        if (employees.length === 0) {
          setCsvError('No valid employee data found in CSV file');
          setLoading(false);
          return;
        }

        const created = await createEmployees(employees);
        const successMsg = `Successfully imported ${created.length} employee(s)`;
        setCsvSuccess(successMsg);
        toast.success(successMsg);

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        setTimeout(() => navigate('/employees'), 2000);
      } catch (uploadError) {
        const errorMsg = `Error importing CSV: ${uploadError.message}`;
        setCsvError(errorMsg);
        toast.error(errorMsg);
        console.error('Error importing CSV:', uploadError);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setCsvError('Error reading file');
      setLoading(false);
    };

    reader.readAsText(file);
  };

  return (
    <>
      <header className="header">
        <h1>Add New Employee</h1>
        <div className="user">Admin Portal</div>
      </header>

      <section className="hero-strip">
        <div className="hero-copy">
          <span className="eyebrow">Employee Intake</span>
          <h2>Add structured talent data manually or import from CSV.</h2>
          <p>
            Keep employee profiles consistent with the rest of the platform by capturing named skills,
            ratings, experience, and availability in one standardized workflow.
          </p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span>Input Modes</span>
            <strong>Manual + CSV</strong>
          </div>
          <div className="hero-stat">
            <span>Skill Scores</span>
            <strong>0-10 scale</strong>
          </div>
          <div className="hero-stat">
            <span>Status</span>
            <strong>{loading ? 'Saving...' : 'Ready'}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Import Employee Data (CSV)</h2>
        <p>
          Expected columns: Employee ID, Name, Skills, Skill Scores, Skill Level, Experience
          (years), Category, Availability, Performance Rating, Department, Role.
        </p>
        <div className="table-toolbar" style={{ padding: '12px 0 0', borderBottom: 'none' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="input-control"
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              const template =
                'Employee ID,Name,Skills,Skill Scores,Skill Level,Experience (years),Category,Availability,Performance Rating,Department,Role\nEMP001,John Doe,"JavaScript,React,Node.js","JavaScript:8, React:9, Node.js:7",8,5,Full-time,Available,8.5,Engineering,Software Engineer\nEMP002,Jane Smith,"Python,Django,SQL","Python:9, Django:8, SQL:7",8,3,Full-time,Available,7.8,Engineering,Backend Developer';
              downloadCSV(template, 'employee_template.csv');
            }}
          >
            Download Template
          </button>
        </div>

        {csvError && <div className="message error">{csvError}</div>}
        {csvSuccess && <div className="message success">{csvSuccess}</div>}
      </section>

      <div className="divider-label">Or add one employee manually</div>

      {showSuccess && <div className="success-message">{successMessage}</div>}
      {error && <div className="message error">{error}</div>}

      <form className="employee-form" onSubmit={handleSubmit}>
        <h2>Add Employee Manually</h2>
        <div className="surface-note">
          Use structured skill scores wherever possible. These values directly influence matching,
          ranking, and team formation quality across the application.
        </div>

        <label htmlFor="employeeId">Employee ID</label>
        <input
          type="text"
          id="employeeId"
          name="employeeId"
          value={formData.employeeId}
          onChange={handleChange}
          placeholder="Optional"
        />

        <div className="form-row">
          <div>
            <label htmlFor="name">Full Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label htmlFor="department">Department *</label>
            <select
              id="department"
              name="department"
              value={formData.department}
              onChange={handleChange}
              required
            >
              <option value="">Select Department</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label htmlFor="role">Role *</label>
        <input type="text" id="role" name="role" value={formData.role} onChange={handleChange} required />

        <label htmlFor="skills">Skills</label>
        <input
          type="text"
          id="skills"
          name="skills"
          value={formData.skills}
          onChange={handleChange}
          placeholder="Comma-separated skills"
        />
        <p className="helper-text">Optional free-text summary. Structured scores below are used for matching.</p>

        <div className="section-title-row compact">
          <div>
            <label>Skill Scores</label>
            <p className="helper-text">Add named skills and a 0-10 score for each employee.</p>
          </div>
          <button type="button" className="btn btn-neutral" onClick={addSkillEntry}>
            Add Skill
          </button>
        </div>

        <div className="skill-entry-list">
          {skillEntries.map((entry) => (
            <div className="skill-entry-row" key={entry.id}>
              <input
                type="text"
                value={entry.name}
                onChange={(e) => updateSkillEntry(entry.id, 'name', e.target.value)}
                placeholder="Skill name"
              />
              <input
                type="number"
                min="0"
                max="10"
                value={entry.score}
                onChange={(e) => updateSkillEntry(entry.id, 'score', e.target.value)}
                placeholder="Score"
              />
              <button type="button" className="btn btn-danger" onClick={() => removeSkillEntry(entry.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="form-row">
          <div>
            <label htmlFor="skillLevel">Skill Level (1-10)</label>
            <input
              type="number"
              id="skillLevel"
              name="skillLevel"
              value={formData.skillLevel}
              onChange={handleChange}
              min="1"
              max="10"
            />
          </div>
          <div>
            <label htmlFor="experience">Experience (years)</label>
            <input
              type="number"
              id="experience"
              name="experience"
              value={formData.experience}
              onChange={handleChange}
              min="0"
              step="0.5"
            />
          </div>
        </div>

        <div className="form-row">
          <div>
            <label htmlFor="category">Category</label>
            <select id="category" name="category" value={formData.category} onChange={handleChange}>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="availability">Availability</label>
            <select
              id="availability"
              name="availability"
              value={formData.availability}
              onChange={handleChange}
            >
              {availabilityOptions.map((avail) => (
                <option key={avail} value={avail}>
                  {avail}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label htmlFor="performanceRating">Performance Rating (0-10)</label>
        <input
          type="number"
          id="performanceRating"
          name="performanceRating"
          value={formData.performanceRating}
          onChange={handleChange}
          min="0"
          max="10"
          step="0.1"
        />
        <p className="helper-text">
          Structured Skill Scores Preview: {formatSkillScores(parseSkillScores(skillEntries.reduce((acc, entry) => {
            if (String(entry.name || '').trim()) {
              acc[entry.name] = entry.score;
            }
            return acc;
          }, {}))) || 'No skill scores added yet'}
        </p>

        <button type="submit" disabled={loading}>
          {loading ? (
            <>
              <span className="loading-spinner" />
              Saving...
            </>
          ) : (
            'Add Employee'
          )}
        </button>
      </form>
    </>
  );
};

export default AddEmployee;
