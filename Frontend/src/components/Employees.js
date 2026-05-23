import React, { useEffect, useMemo, useState } from 'react';
import { createEmployee, getEmployees, updateEmployee } from '../utils/api';
import { buildSkillVocabulary, vectorizeSkillScores } from '../utils/vectorization';
import { toast } from '../utils/toast';

const createSkillEntry = (name = '', score = 5) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name,
  score,
});

const CandidateManagement = () => {
  const [candidates, setCandidates] = useState([]);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState({
    employeeId: '',
    name: '',
    role: '',
    department: 'General',
    skills: '',
    experience: '',
    performanceRating: '',
  });
  const [skillEntries, setSkillEntries] = useState([createSkillEntry()]);

  const loadCandidates = async () => {
    try {
      const data = await getEmployees();
      setCandidates(data);
    } catch (error) {
      console.error('Error loading candidates:', error);
      setCandidates([]);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, []);

  const skillVocabulary = useMemo(() => buildSkillVocabulary(candidates), [candidates]);

  const currentSkillScores = useMemo(
    () =>
      skillEntries.reduce((acc, entry) => {
        const name = String(entry.name || '').trim();
        if (!name) return acc;
        acc[name] = Number(entry.score || 0);
        return acc;
      }, {}),
    [skillEntries]
  );

  const currentVector = useMemo(
    () => vectorizeSkillScores(currentSkillScores, skillVocabulary),
    [currentSkillScores, skillVocabulary]
  );

  const resetForm = () => {
    setEditingId('');
    setForm({
      employeeId: '',
      name: '',
      role: '',
      department: 'General',
      skills: '',
      experience: '',
      performanceRating: '',
    });
    setSkillEntries([createSkillEntry()]);
  };

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
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
    if (!form.name || !form.role) {
      toast.error('Please fill Name and Role');
      return;
    }

    if (Object.keys(currentSkillScores).length === 0) {
      toast.error('Add at least one structured skill score');
      return;
    }

    try {
      const payload = {
        employeeId: form.employeeId || editingId || `CAND-${Date.now()}`,
        name: form.name,
        role: form.role,
        department: form.department || 'General',
        skills: form.skills || Object.keys(currentSkillScores).join(', '),
        skillScores: currentSkillScores,
        experience: Number(form.experience || 0),
        performanceRating: Number(form.performanceRating || 0),
        skillLevel:
          Object.values(currentSkillScores).reduce((sum, score) => sum + Number(score || 0), 0) /
            Math.max(1, Object.keys(currentSkillScores).length) || 1,
        availability: 'Available',
        category: 'Full-time',
        status: 'Present',
      };

      if (editingId) {
        await updateEmployee(editingId, payload);
        toast.success('Employee skill profile updated');
      } else {
        await createEmployee(payload);
        toast.success('Candidate added');
      }

      resetForm();
      await loadCandidates();
    } catch (error) {
      toast.error(`Failed to save candidate: ${error.message}`);
    }
  };

  return (
    <>
      <header className="header">
        <h1>Candidate Management</h1>
        <div className="user">Structured Skill Profiles</div>
      </header>

      <section className="hero-strip">
        <div className="hero-copy">
          <span className="eyebrow">Module 2</span>
          <h2>Capture skill data as key-value scores and convert it into vectors.</h2>
          <p>
            Employees can add or update their own skill scores, while the system builds a shared
            vocabulary for vectorized matching against project requirements.
          </p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span>Employees</span>
            <strong>{candidates.length}</strong>
          </div>
          <div className="hero-stat">
            <span>Vocabulary Size</span>
            <strong>{skillVocabulary.length}</strong>
          </div>
          <div className="hero-stat">
            <span>Vector Length</span>
            <strong>{currentVector.length}</strong>
          </div>
        </div>
      </section>

      <form className="employee-form" onSubmit={handleSubmit}>
        <h2>{editingId ? 'Update Employee Skill Profile' : 'Add Employee Skill Profile'}</h2>
        <div className="form-row">
          <div>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" value={form.name} onChange={handleChange} placeholder="Candidate name" />
          </div>
          <div>
            <label htmlFor="role">Role</label>
            <input id="role" name="role" value={form.role} onChange={handleChange} placeholder="Backend Engineer" />
          </div>
        </div>

        <div className="form-row">
          <div>
            <label htmlFor="department">Department</label>
            <input
              id="department"
              name="department"
              value={form.department}
              onChange={handleChange}
              placeholder="Engineering"
            />
          </div>
          <div>
            <label htmlFor="skills">Skill Summary</label>
            <input
              id="skills"
              name="skills"
              value={form.skills}
              onChange={handleChange}
              placeholder="Java, Spring Boot, MySQL"
            />
          </div>
        </div>

        <div className="form-row">
          <div>
            <label htmlFor="experience">Experience</label>
            <input
              id="experience"
              name="experience"
              type="number"
              min="0"
              step="0.5"
              value={form.experience}
              onChange={handleChange}
              placeholder="3"
            />
          </div>
          <div>
            <label htmlFor="performanceRating">Performance Rating</label>
            <input
              id="performanceRating"
              name="performanceRating"
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={form.performanceRating}
              onChange={handleChange}
              placeholder="8.4"
            />
          </div>
        </div>

        <div className="section-title-row compact">
          <div>
            <label>Skill Scores</label>
            <p className="helper-text">Store skills as key-value pairs so they can be vectorized later.</p>
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
          <button type="submit">{editingId ? 'Update Candidate' : 'Add Candidate'}</button>
          <button type="button" className="btn btn-neutral" onClick={resetForm}>
            Clear Form
          </button>
        </div>
      </form>

    </>
  );
};

export default CandidateManagement;
