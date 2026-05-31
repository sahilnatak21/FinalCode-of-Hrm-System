import React, { useEffect, useState } from 'react';
import { getEmployeeByUsername, updateEmployee } from '../utils/api';
import { toast } from '../utils/toast';
import './EmployeeDashboard.css';

const AVAILABILITY_OPTIONS = ['Available', 'Busy', 'On Leave', 'Unavailable'];
const AVATAR_COLORS = ['#4f8ef7', '#38d9a9', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b'];

const avatarColor = (name = '') => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const getInitials = (name = '') =>
  name.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const mkSkill = (name = '', score = 5) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name,
  score,
});

const EmployeeDashboard = ({ onLogout, authData }) => {
  const [activeTab,   setActiveTab]   = useState('profile');
  const [employee,    setEmployee]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);

  /* ── Profile form state ── */
  const [profileForm,    setProfileForm]    = useState({ name: '', availability: 'Available' });
  const [savingProfile,  setSavingProfile]  = useState(false);
  const [profileMsg,     setProfileMsg]     = useState({ text: '', ok: true });

  /* ── Skills form state ── */
  const [experience,   setExperience]   = useState(0);
  const [skillEntries, setSkillEntries] = useState([mkSkill()]);
  const [savingSkills, setSavingSkills] = useState(false);
  const [skillsMsg,    setSkillsMsg]    = useState({ text: '', ok: true });

  /* ── Load employee by username ── */
  useEffect(() => {
    const username = authData?.username;
    if (!username) { setLoading(false); setNotFound(true); return; }

    (async () => {
      try {
        const emp = await getEmployeeByUsername(username);
        setEmployee(emp);
        setProfileForm({ name: emp.name || '', availability: emp.availability || 'Available' });
        setExperience(emp.experience ?? 0);

        const scores = emp.skillScores || {};
        const entries = Object.entries(scores).map(([n, s]) => mkSkill(n, s));
        setSkillEntries(entries.length ? entries : [mkSkill()]);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [authData]);

  /* ── Profile save ── */
  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileMsg({ text: '', ok: true });
    if (!profileForm.name.trim()) { setProfileMsg({ text: 'Name cannot be empty.', ok: false }); return; }

    setSavingProfile(true);
    try {
      const updated = await updateEmployee(employee.id, {
        name:         profileForm.name.trim(),
        availability: profileForm.availability,
        department:   employee.department,
        role:         employee.role,
        skills:       employee.skills,
        experience:   employee.experience,
        skillLevel:   employee.skillLevel,
        category:     employee.category,
        status:       employee.status,
      });
      setEmployee((prev) => ({ ...prev, ...updated }));
      setProfileMsg({ text: 'Profile updated successfully.', ok: true });
      toast.success('Profile updated.');
    } catch (err) {
      setProfileMsg({ text: err.message || 'Failed to update profile.', ok: false });
    } finally {
      setSavingProfile(false);
    }
  };

  /* ── Skills save ── */
  const handleSkillsSave = async (e) => {
    e.preventDefault();
    setSkillsMsg({ text: '', ok: true });

    const skillScores = skillEntries.reduce((acc, entry) => {
      const n = entry.name.trim();
      if (n) acc[n] = Math.min(10, Math.max(0, Number(entry.score) || 0));
      return acc;
    }, {});

    setSavingSkills(true);
    try {
      const updated = await updateEmployee(employee.id, {
        name:         employee.name,
        department:   employee.department,
        role:         employee.role,
        availability: employee.availability,
        category:     employee.category,
        status:       employee.status,
        experience:   Number(experience) || 0,
        skills:       Object.keys(skillScores).join(', '),
        skillScores,
        skillLevel:
          Object.keys(skillScores).length
            ? Math.round(Object.values(skillScores).reduce((a, b) => a + b, 0) / Object.keys(skillScores).length)
            : employee.skillLevel || 1,
      });
      setEmployee((prev) => ({ ...prev, ...updated }));
      setSkillsMsg({ text: 'Experience & skills saved.', ok: true });
      toast.success('Skills updated.');
    } catch (err) {
      setSkillsMsg({ text: err.message || 'Failed to save skills.', ok: false });
    } finally {
      setSavingSkills(false);
    }
  };

  /* ── Skill entry helpers ── */
  const addSkill    = () => setSkillEntries((p) => [...p, mkSkill()]);
  const removeSkill = (id) => setSkillEntries((p) => p.length > 1 ? p.filter((s) => s.id !== id) : p);
  const updateSkill = (id, field, val) =>
    setSkillEntries((p) =>
      p.map((s) =>
        s.id === id
          ? { ...s, [field]: field === 'score' ? Math.min(10, Math.max(0, Number(val) || 0)) : val }
          : s
      )
    );

  /* ── Render states ── */
  if (loading) {
    return (
      <div className="ed-loading">
        <div className="ed-spinner" />
        <p>Loading your profile…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="ed-loading">
        <div className="ed-notfound-icon">👤</div>
        <p className="ed-notfound-text">No employee record linked to your account.</p>
        <p className="ed-notfound-sub">Ask your HR admin to create your employee profile.</p>
        <button className="ed-logout-plain" onClick={onLogout}>Sign Out</button>
      </div>
    );
  }

  return (
    <div className="ed-root">

      {/* ── Top Navbar ── */}
      <nav className="ed-nav">
        <div className="ed-nav-brand">
          <svg viewBox="0 0 32 32" fill="none" width="30" height="30">
            <rect width="32" height="32" rx="10" fill="url(#ed-lg)" />
            <defs>
              <linearGradient id="ed-lg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#4f8ef7" /><stop offset="1" stopColor="#38d9a9" />
              </linearGradient>
            </defs>
            <path d="M10 22l4-8 4 5 3-4 3 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="ed-nav-brand-name">Skillbase AI</span>
          <span className="ed-nav-brand-sub">Employee Portal</span>
        </div>

        <div className="ed-nav-right">
          <div className="ed-nav-avatar" style={{ background: avatarColor(employee.name) }}>
            {getInitials(employee.name)}
          </div>
          <div className="ed-nav-info">
            <span className="ed-nav-name">{employee.name}</span>
            <span className="ed-nav-role">{employee.role}</span>
          </div>
          <button className="ed-nav-logout" onClick={onLogout} title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="ed-main">

        {/* Page header */}
        <div className="ed-page-header">
          <div className="ed-hero-avatar" style={{ background: avatarColor(employee.name) }}>
            {getInitials(employee.name)}
          </div>
          <div>
            <h1 className="ed-page-title">{employee.name}</h1>
            <p className="ed-page-meta">
              {employee.employeeId} &nbsp;·&nbsp; {employee.department}
              &nbsp;·&nbsp;
              <span className={`ed-avail-dot ${employee.availability === 'Available' ? 'green' : 'orange'}`} />
              {employee.availability}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="ed-tabs">
          <button
            className={`ed-tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Profile
          </button>
          <button
            className={`ed-tab ${activeTab === 'skills' ? 'active' : ''}`}
            onClick={() => setActiveTab('skills')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Experience &amp; Skills
          </button>
        </div>

        {/* ── Profile Tab ── */}
        {activeTab === 'profile' && (
          <div className="ed-card">
            <form onSubmit={handleProfileSave} noValidate>

              {/* Read-only info row */}
              <div className="ed-info-grid">
                <div className="ed-info-item">
                  <span className="ed-info-label">Employee ID</span>
                  <span className="ed-info-value ed-mono">{employee.employeeId}</span>
                </div>
                <div className="ed-info-item">
                  <span className="ed-info-label">Username</span>
                  <span className="ed-info-value ed-mono">{employee.username || authData?.username || '—'}</span>
                </div>
                <div className="ed-info-item">
                  <span className="ed-info-label">Department</span>
                  <span className="ed-info-value">{employee.department}</span>
                </div>
                <div className="ed-info-item">
                  <span className="ed-info-label">Role</span>
                  <span className={`em-badge ${employee.role === 'HR' ? 'em-badge-hr' : 'em-badge-emp'}`}>
                    {employee.role}
                  </span>
                </div>
              </div>

              <div className="ed-divider" />

              {/* Editable fields */}
              <div className="ed-form-section-title">Editable Information</div>

              <div className="ed-form-row">
                <div className="ed-field">
                  <label htmlFor="ed-name">Full Name</label>
                  <input
                    id="ed-name"
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Your full name"
                  />
                </div>

                <div className="ed-field">
                  <label htmlFor="ed-avail">Availability</label>
                  <select
                    id="ed-avail"
                    value={profileForm.availability}
                    onChange={(e) => setProfileForm((p) => ({ ...p, availability: e.target.value }))}
                  >
                    {AVAILABILITY_OPTIONS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              {profileMsg.text && (
                <div className={`ed-msg ${profileMsg.ok ? 'ed-msg-ok' : 'ed-msg-err'}`}>
                  {profileMsg.text}
                </div>
              )}

              <div className="ed-form-actions">
                <button type="submit" className="ed-save-btn" disabled={savingProfile}>
                  {savingProfile ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Experience & Skills Tab ── */}
        {activeTab === 'skills' && (
          <div className="ed-card">
            <form onSubmit={handleSkillsSave} noValidate>

              <div className="ed-form-section-title">Experience</div>
              <div className="ed-field" style={{ maxWidth: 200 }}>
                <label htmlFor="ed-exp">Years of Experience</label>
                <input
                  id="ed-exp"
                  type="number"
                  min="0"
                  step="0.5"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder="e.g. 3"
                />
              </div>

              <div className="ed-divider" />

              <div className="ed-skills-header">
                <div>
                  <div className="ed-form-section-title" style={{ margin: 0 }}>Skills</div>
                  <p className="ed-skills-hint">Rate each skill from 0 (none) to 10 (expert).</p>
                </div>
                <button type="button" className="ed-add-skill-btn" onClick={addSkill}>
                  + Add Skill
                </button>
              </div>

              <div className="ed-skill-list">
                {skillEntries.map((entry) => (
                  <div className="ed-skill-row" key={entry.id}>
                    <input
                      type="text"
                      className="ed-skill-name"
                      value={entry.name}
                      onChange={(e) => updateSkill(entry.id, 'name', e.target.value)}
                      placeholder="Skill name (e.g. Java)"
                    />
                    <div className="ed-skill-score-wrap">
                      <input
                        type="number"
                        className="ed-skill-score"
                        min="0"
                        max="10"
                        value={entry.score}
                        onChange={(e) => updateSkill(entry.id, 'score', e.target.value)}
                      />
                      <span className="ed-score-label">/10</span>
                    </div>
                    <div className="ed-skill-bar-wrap">
                      <div
                        className="ed-skill-bar-fill"
                        style={{ width: `${(entry.score / 10) * 100}%` }}
                      />
                    </div>
                    <button
                      type="button"
                      className="ed-remove-skill"
                      onClick={() => removeSkill(entry.id)}
                      disabled={skillEntries.length === 1}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {skillsMsg.text && (
                <div className={`ed-msg ${skillsMsg.ok ? 'ed-msg-ok' : 'ed-msg-err'}`}>
                  {skillsMsg.text}
                </div>
              )}

              <div className="ed-form-actions">
                <button type="submit" className="ed-save-btn" disabled={savingSkills}>
                  {savingSkills ? 'Saving…' : 'Save Skills'}
                </button>
              </div>
            </form>
          </div>
        )}

      </main>
    </div>
  );
};

export default EmployeeDashboard;
