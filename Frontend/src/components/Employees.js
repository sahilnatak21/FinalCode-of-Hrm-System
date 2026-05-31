import React, { useEffect, useState } from 'react';
import { getEmployees, createEmployee, deleteEmployee } from '../utils/api';
import { toast } from '../utils/toast';
import './Employees.css';

const DEPARTMENTS = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations', 'IT', 'Design', 'General'];
const ROLES = ['EMPLOYEE', 'HR'];

const EMPTY_FORM = {
  name: '',
  username: '',
  password: '',
  role: 'EMPLOYEE',
  department: 'Engineering',
};

const getInitials = (name = '') =>
  name.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const AVATAR_COLORS = ['#4f8ef7', '#38d9a9', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b'];
const avatarColor = (name = '') => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const EmployeeManagement = () => {
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [viewEmp,    setViewEmp]    = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [showPass,   setShowPass]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');
  const [search,     setSearch]     = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await getEmployees();
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openModal  = () => { setForm(EMPTY_FORM); setFormError(''); setShowPass(false); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setFormError(''); };

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim())              { setFormError('Full name is required.');                     return; }
    if (!form.username.trim())          { setFormError('Username is required.');                      return; }
    if (form.username.trim().length < 3){ setFormError('Username must be at least 3 characters.');    return; }
    if (!form.password)                 { setFormError('Password is required.');                      return; }
    if (form.password.length < 6)      { setFormError('Password must be at least 6 characters.');    return; }
    if (!form.department)               { setFormError('Please select a department.');                return; }

    setSubmitting(true);
    try {
      await createEmployee({
        name:         form.name.trim(),
        username:     form.username.trim(),
        password:     form.password,
        role:         form.role,
        department:   form.department,
        status:       'Present',
        category:     'Full-time',
        availability: 'Available',
      });
      toast.success(`Employee "${form.name.trim()}" created successfully.`);
      closeModal();
      load();
    } catch (err) {
      setFormError(err.message || 'Failed to create employee.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (emp) => {
    if (!window.confirm(`Delete "${emp.name}"? This cannot be undone.`)) return;
    try {
      await deleteEmployee(emp.id);
      toast.success(`"${emp.name}" deleted.`);
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
    } catch (err) {
      toast.error(err.message || 'Delete failed.');
    }
  };

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return (
      (e.name       || '').toLowerCase().includes(q) ||
      (e.username   || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q) ||
      (e.role       || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="em-page">

      {/* Header */}
      <div className="em-header">
        <div>
          <h1 className="em-title">Employee Management</h1>
          <p className="em-subtitle">{employees.length} employee{employees.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button className="em-add-btn" onClick={openModal}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Employee
        </button>
      </div>

      {/* Search */}
      <div className="em-toolbar">
        <div className="em-search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="em-search"
            placeholder="Search by name, username, department, role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="em-table-wrap">
        {loading ? (
          <div className="em-empty">Loading employees…</div>
        ) : filtered.length === 0 ? (
          <div className="em-empty">
            {search
              ? 'No employees match your search.'
              : 'No employees yet. Click "Add Employee" to get started.'}
          </div>
        ) : (
          <table className="em-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Employee</th>
                <th>Username</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, idx) => (
                <tr key={emp.id} className="em-row-clickable" onClick={() => setViewEmp(emp)}>
                  <td className="em-td-num">{idx + 1}</td>
                  <td>
                    <div className="em-name-cell">
                      <div className="em-avatar" style={{ background: avatarColor(emp.name) }}>
                        {getInitials(emp.name)}
                      </div>
                      <div>
                        <div className="em-name">{emp.name}</div>
                        <div className="em-empid">{emp.employeeId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="em-username">
                    {emp.username || <span className="em-na">—</span>}
                  </td>
                  <td>
                    <span className={`em-badge ${emp.role === 'HR' ? 'em-badge-hr' : 'em-badge-emp'}`}>
                      {emp.role}
                    </span>
                  </td>
                  <td>{emp.department}</td>
                  <td>
                    <span className={`em-badge ${emp.status === 'Present' ? 'em-badge-present' : 'em-badge-absent'}`}>
                      {emp.status || 'Present'}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="em-del-btn" onClick={() => handleDelete(emp)} title="Delete employee">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* View Employee Modal */}
      {viewEmp && (
        <div className="em-overlay" onClick={(e) => e.target === e.currentTarget && setViewEmp(null)}>
          <div className="em-modal em-view-modal">

            {/* Header */}
            <div className="em-view-header">
              <div className="em-view-avatar" style={{ background: avatarColor(viewEmp.name) }}>
                {getInitials(viewEmp.name)}
              </div>
              <div className="em-view-hero">
                <h2 className="em-view-name">{viewEmp.name}</h2>
                <p className="em-view-meta">{viewEmp.employeeId} · {viewEmp.department}</p>
              </div>
              <button className="em-modal-close" onClick={() => setViewEmp(null)} type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="em-view-body">

              {/* Info grid */}
              <div className="em-view-grid">
                {[
                  { label: 'Username',     value: viewEmp.username || '—', mono: true },
                  { label: 'Role',         value: viewEmp.role,            badge: true },
                  { label: 'Department',   value: viewEmp.department },
                  { label: 'Status',       value: viewEmp.status || 'Present', statusBadge: true },
                  { label: 'Availability', value: viewEmp.availability || '—' },
                  { label: 'Category',     value: viewEmp.category || '—' },
                ].map(({ label, value, mono, badge, statusBadge }) => (
                  <div className="em-view-item" key={label}>
                    <span className="em-view-label">{label}</span>
                    {badge ? (
                      <span className={`em-badge ${value === 'HR' ? 'em-badge-hr' : 'em-badge-emp'}`}>{value}</span>
                    ) : statusBadge ? (
                      <span className={`em-badge ${value === 'Present' ? 'em-badge-present' : 'em-badge-absent'}`}>{value}</span>
                    ) : (
                      <span className={`em-view-value ${mono ? 'em-mono' : ''}`}>{value}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="em-view-divider" />

              {/* Experience */}
              <div className="em-view-section">
                <div className="em-view-section-title">Experience</div>
                <div className="em-view-exp-row">
                  <div className="em-view-exp-circle">
                    <span className="em-view-exp-num">{viewEmp.experience ?? 0}</span>
                    <span className="em-view-exp-unit">yrs</span>
                  </div>
                  <div>
                    <p className="em-view-exp-label">Years of experience</p>
                    <p className="em-view-exp-sub">
                      Skill level: <strong>{viewEmp.skillLevel ?? 1}</strong> / 10 &nbsp;·&nbsp;
                      Performance: <strong>{viewEmp.performanceRating ?? 0}</strong> / 10
                    </p>
                  </div>
                </div>
              </div>

              {/* Skills */}
              {viewEmp.skills && (
                <>
                  <div className="em-view-divider" />
                  <div className="em-view-section">
                    <div className="em-view-section-title">Skills</div>
                    <div className="em-view-skills">
                      {viewEmp.skills.split(',').map((s) => s.trim()).filter(Boolean).map((skill) => (
                        <span className="em-skill-tag" key={skill}>{skill}</span>
                      ))}
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showModal && (
        <div className="em-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="em-modal">

            <div className="em-modal-header">
              <div>
                <h2 className="em-modal-title">Add Employee</h2>
                <p className="em-modal-sub">Create an account the employee can log in with</p>
              </div>
              <button className="em-modal-close" onClick={closeModal} type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form className="em-modal-form" onSubmit={handleSubmit} noValidate>

              <div className="em-field">
                <label htmlFor="em-name">Full Name</label>
                <input
                  id="em-name" name="name" type="text"
                  value={form.name} onChange={handleChange}
                  placeholder="e.g. John Doe"
                  autoFocus
                />
              </div>

              <div className="em-field">
                <label htmlFor="em-username">Username</label>
                <input
                  id="em-username" name="username" type="text"
                  value={form.username} onChange={handleChange}
                  placeholder="e.g. john_doe"
                  autoComplete="off"
                />
              </div>

              <div className="em-field">
                <label htmlFor="em-password">Password</label>
                <div className="em-pass-wrap">
                  <input
                    id="em-password" name="password"
                    type={showPass ? 'text' : 'password'}
                    value={form.password} onChange={handleChange}
                    placeholder="Min. 6 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="em-pass-toggle"
                    onClick={() => setShowPass((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="em-form-row">
                <div className="em-field">
                  <label htmlFor="em-role">Role</label>
                  <select id="em-role" name="role" value={form.role} onChange={handleChange}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                <div className="em-field">
                  <label htmlFor="em-dept">Department</label>
                  <select id="em-dept" name="department" value={form.department} onChange={handleChange}>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {formError && <div className="em-form-error">{formError}</div>}

              <div className="em-modal-actions">
                <button type="button" className="em-cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="em-submit-btn" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Employee'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeManagement;
