import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AUTH_API_BASE_URL = process.env.REACT_APP_AUTH_API_URL || 'http://localhost:8080/api/auth';
const AUTH_KEY = 'skillbase_auth_user';

const ROLES = ['EMPLOYEE', 'HR'];

const FEATURES = [
  { icon: '👤', title: 'HR Admin',      desc: 'Full access — manage employees, form teams, and view all analytics.' },
  { icon: '🧑‍💼', title: 'Employee',     desc: 'Standard access — view assigned teams, attendance, and own profile.' },
  { icon: '🔐', title: 'Secure Login',  desc: 'BCrypt-hashed passwords with role-based access control.' },
  { icon: '⚡', title: 'Instant Access', desc: 'New accounts are active immediately after creation.' },
];

const CreateUser = () => {
  const navigate = useNavigate();
  const isLoggedIn = Boolean(localStorage.getItem(AUTH_KEY));

  const [username,        setUsername]        = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role,            setRole]            = useState('EMPLOYEE');
  const [showPass,        setShowPass]        = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [error,           setError]           = useState('');
  const [success,         setSuccess]         = useState('');
  const [isLoading,       setIsLoading]       = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res  = await fetch(`${AUTH_API_BASE_URL}/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || 'Failed to create user.');
      setSuccess(`User "${data.username}" (${data.role}) created successfully. Redirecting to login…`);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left panel — branding */}
      <div className="login-left">
        <div className="login-left-inner">
          <div className="login-logo-wrap">
            <svg viewBox="0 0 40 40" fill="none" width="40" height="40">
              <rect width="40" height="40" rx="12" fill="url(#cu-ll)" />
              <defs>
                <linearGradient id="cu-ll" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4f8ef7" /><stop offset="1" stopColor="#38d9a9" />
                </linearGradient>
              </defs>
              <path d="M12 28l5-10 5 6.5 4-5.5 4 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span className="login-logo-name">Skillbase AI</span>
          </div>
          <h2 className="login-left-title">Manage your<br />team access.</h2>
          <p className="login-left-sub">Create HR or Employee accounts with role-based access control.</p>
          <div className="login-features">
            {FEATURES.map((f) => (
              <div className="login-feature" key={f.title}>
                <span className="login-feature-icon">{f.icon}</span>
                <div>
                  <strong>{f.title}</strong>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="login-right">
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-card-header">
            <span className="login-badge">HR Management System</span>
            <h1>Create New User</h1>
            <p>Add a new HR admin or employee account</p>
          </div>

          <div className="login-field">
            <label htmlFor="cu-username">Username</label>
            <input
              id="cu-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. john_doe"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label htmlFor="cu-role">Role</label>
            <select
              id="cu-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.9rem',
                border: '1.5px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '0.95rem',
                background: '#fff',
                color: '#1a202c',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="login-field">
            <label htmlFor="cu-password">Password</label>
            <div className="login-pass-wrap">
              <input
                id="cu-password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
              />
              <button type="button" className="login-pass-toggle" onClick={() => setShowPass((v) => !v)} tabIndex={-1}>
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="cu-confirm">Confirm Password</label>
            <div className="login-pass-wrap">
              <input
                id="cu-confirm"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
              <button type="button" className="login-pass-toggle" onClick={() => setShowConfirm((v) => !v)} tabIndex={-1}>
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error   && <div className="message error">{error}</div>}
          {success && (
            <div className="message" style={{ color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.7rem 1rem', fontSize: '0.9rem' }}>
              {success}
            </div>
          )}

          <button type="submit" className="login-submit" disabled={isLoading}>
            {isLoading ? <><span className="loading-spinner" />Creating…</> : 'Create User'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.88rem', color: '#64748b' }}>
              Already have an account?&nbsp;
            </span>
            <button
              type="button"
              onClick={() => navigate(isLoggedIn ? '/' : '/login')}
              style={{ background: 'none', border: 'none', color: '#4f8ef7', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, padding: 0 }}
            >
              {isLoggedIn ? 'Go to Dashboard' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateUser;
