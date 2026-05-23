import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AUTH_API_BASE_URL  = process.env.REACT_APP_AUTH_API_URL  || 'http://localhost:8080/api/auth';
const SETUP_API_BASE_URL = process.env.REACT_APP_SETUP_API_URL || 'http://localhost:8080/api/setup';

const attemptLogin = async (identifier, password) => {
  const response = await fetch(`${AUTH_API_BASE_URL}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: identifier, password }),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const FEATURES = [
  { icon: '🤖', title: 'AI Team Formation',    desc: 'K-Means + attention weighting builds optimal teams automatically.' },
  { icon: '📊', title: 'Skill Gap Analysis',   desc: 'Visualise coverage gaps across every project requirement.' },
  { icon: '⚡', title: 'Real-Time Pipeline',   desc: 'Watch the ML pipeline run step-by-step as it scores candidates.' },
  { icon: '🏆', title: 'Smart Leader Election', desc: 'Automatically elects the best-fit team lead from the pool.' },
];

const Login = ({ onLogin }) => {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please enter your username and password.'); return; }
    setIsLoading(true);
    try {
      let { response, payload } = await attemptLogin(email, password);
      if (response.status === 401) {
        await fetch(`${SETUP_API_BASE_URL}/initialize-users`, { method: 'POST', credentials: 'include' }).catch(() => null);
        const retry = await attemptLogin(email, password);
        response = retry.response;
        payload  = retry.payload;
      }
      if (!response.ok || payload?.success !== true) throw new Error(payload?.message || 'Invalid username or password.');
      onLogin({ username: payload.username || email, role: payload.role || '', token: payload.token || '', userId: payload.userId || '' });
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed.');
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
              <rect width="40" height="40" rx="12" fill="url(#ll)" />
              <defs>
                <linearGradient id="ll" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4f8ef7" /><stop offset="1" stopColor="#38d9a9" />
                </linearGradient>
              </defs>
              <path d="M12 28l5-10 5 6.5 4-5.5 4 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span className="login-logo-name">Skillbase AI</span>
          </div>
          <h2 className="login-left-title">Smarter teams,<br />built by AI.</h2>
          <p className="login-left-sub">An intelligent HRM platform that uses machine learning to form the right team for every project.</p>
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
            <h1>Welcome back</h1>
            <p>Sign in to your workspace</p>
          </div>

          <div className="login-field">
            <label htmlFor="email">Username</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. hr_admin"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <div className="login-pass-wrap">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
              <button type="button" className="login-pass-toggle" onClick={() => setShowPass((v) => !v)} tabIndex={-1}>
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && <div className="message error">{error}</div>}

          <button type="submit" className="login-submit" disabled={isLoading}>
            {isLoading ? <><span className="loading-spinner" />Signing in…</> : 'Sign In'}
          </button>

          <div className="login-hint">
            <span>HR Admin:</span> hr_admin &nbsp;·&nbsp; <span>Employee:</span> employee_user
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
