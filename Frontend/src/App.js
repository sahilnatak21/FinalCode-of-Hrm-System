import React, { useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Employees from './components/Employees';
import AddEmployee from './components/AddEmployee';
import Attendance from './components/Attendance';
import TeamFormation from './components/TeamFormation';
import TeamResults from './components/TeamResults';
import Login from './components/Login';
import CandidateImport from './components/CandidateImport';
import ResumeUpload from './components/ResumeUpload';
import './App.css';

const AUTH_KEY = 'skillbase_auth_user';

function AppContent({ isAuthenticated, onLogout, onLogin }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={onLogin} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentPath={location.pathname}
        onLogout={onLogout}
      />
      <div className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <button
          className={`mobile-menu-toggle ${sidebarOpen ? 'active' : ''}`}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
        <div className="main-content-wrapper">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/candidates" element={<Employees />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/add-employee" element={<AddEmployee />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/candidate-import" element={<CandidateImport />} />
            <Route path="/resume-upload" element={<ResumeUpload />} />
            <Route path="/team" element={<TeamFormation />} />
            <Route path="/results" element={<TeamResults />} />
            <Route path="/results/:projectKey" element={<TeamResults />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [authUser, setAuthUser] = useState(() => localStorage.getItem(AUTH_KEY) || '');

  const isAuthenticated = useMemo(() => Boolean(authUser), [authUser]);

  const handleLogin = (session) => {
    const authSession = JSON.stringify({
      ...session,
      loggedInAt: new Date().toISOString(),
    });
    localStorage.setItem(AUTH_KEY, authSession);
    setAuthUser(authSession);
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    setAuthUser('');
  };

  return (
    <Router>
      <AppContent isAuthenticated={isAuthenticated} onLogout={handleLogout} onLogin={handleLogin} />
    </Router>
  );
}

export default App;

