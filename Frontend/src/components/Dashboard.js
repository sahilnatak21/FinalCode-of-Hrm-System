import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getEmployees, getFormedTeams, subscribeToStats } from '../utils/api';
import { buildProjectResultsPath, getSavedTeams } from '../utils/teamStorage';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalCandidates: 0,
    clustersCreated: 0,
    teamsGenerated: 0,
    avgMatchScore: 0,
    totalProjectEmployees: 0,
  });
  const [savedProjects, setSavedProjects] = useState([]);
  const [topSkills, setTopSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  // Tracks whether the Python SSE stats stream is live
  const [streamLive, setStreamLive] = useState(false);

  useEffect(() => {
    // ── Initial full data load ──────────────────────────────────────────────
    const loadData = async () => {
      try {
        setLoading(true);
        const candidates = await getEmployees();
        const lastTeamRaw = localStorage.getItem('last_generated_team');
        const historyRaw = localStorage.getItem('team_generation_count');

        let clustersCreated = 0;
        if (lastTeamRaw) {
          const lastTeam = JSON.parse(lastTeamRaw);
          clustersCreated = Number(lastTeam?.kmeans?.selectedK || 0);
        }

        const projectTeams = await getFormedTeams().catch(() => getSavedTeams());
        setSavedProjects(projectTeams);
        const matchScores = projectTeams
          .map((project) => Number(project?.statistics?.avgMatchScore || 0))
          .filter((score) => score > 0);
        const skillCounts = {};
        projectTeams.forEach((project) => {
          (project?.selectionCriteria?.requiredSkills || []).forEach((skill) => {
            const name = skill.name || 'Skill';
            skillCounts[name] = (skillCounts[name] || 0) + 1;
          });
        });
        setTopSkills(
          Object.entries(skillCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }))
        );

        setStats({
          totalCandidates: candidates.length,
          clustersCreated,
          teamsGenerated: projectTeams.length || Number(historyRaw || 0),
          avgMatchScore: matchScores.length
            ? Number((matchScores.reduce((sum, score) => sum + score, 0) / matchScores.length).toFixed(1))
            : 0,
          totalProjectEmployees: projectTeams.reduce(
            (sum, project) => sum + Number(project?.datasetSource?.employeeCount || 0),
            0
          ),
        });
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // ── SSE subscription for live candidate/team counts ─────────────────────
    // Falls back to 4-second polling if the Python server is not running.
    let pollInterval = null;
    let es = null;

    try {
      es = subscribeToStats((data) => {
        setStreamLive(true);
        setStats((prev) => ({
          ...prev,
          totalCandidates: data.employeeCount ?? prev.totalCandidates,
          teamsGenerated: data.teamsGenerated ?? prev.teamsGenerated,
        }));
      });

      // If EventSource errors out (server offline), fall back to polling
      es.onerror = () => {
        setStreamLive(false);
        if (!pollInterval) {
          pollInterval = setInterval(loadData, 4000);
        }
      };
    } catch {
      // EventSource not supported or server unreachable — use polling
      pollInterval = setInterval(loadData, 4000);
    }

    return () => {
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  return (
    <>
      <header className="header">
        <div>
          <h1>Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: 2 }}>
            Welcome back — here's your workspace overview
          </p>
        </div>
        <div className="user">
          <span>🏢</span> AI Team Workspace
          {streamLive && (
            <span className="live-badge" title="Live updates active">
              <span className="live-dot" />
              LIVE
            </span>
          )}
        </div>
      </header>

      <div className="cards">
        <div className="card blue">
          <h3>👥 Total Candidates</h3>
          <p>{loading ? '—' : stats.totalCandidates}</p>
        </div>
        <div className="card green">
          <h3>🔵 Clusters Created</h3>
          <p>{loading ? '—' : stats.clustersCreated}</p>
        </div>
        <div className="card orange">
          <h3>⚡ Teams Generated</h3>
          <p>{loading ? '—' : stats.teamsGenerated}</p>
        </div>
        <div className="card blue">
          <h3>🎯 Avg Match Score</h3>
          <p>{loading ? '—' : `${stats.avgMatchScore}%`}</p>
        </div>
      </div>

      <section className="welcome">
        <h2>AI Candidate Intelligence</h2>
        <p>Manage candidate profiles, form optimal teams, and inspect selection logic in one flow.</p>
      </section>

      <section className="panel panel-strong">
        <div className="section-title-row">
          <div>
            <h2 className="formation-title">Workspace Overview</h2>
            <p className="helper-text">A single operational view for team generation, project storage, and candidate readiness.</p>
          </div>
        </div>
        <div className="info-grid">
          <div className="info-card">
            <span>Candidate Pool</span>
            <strong>{loading ? 'Loading...' : `${stats.totalCandidates} profiles available`}</strong>
          </div>
          <div className="info-card">
            <span>Saved Projects</span>
            <strong>{loading ? 'Loading...' : `${savedProjects.length} stored in workspace`}</strong>
          </div>
          <div className="info-card">
            <span>Generation Activity</span>
            <strong>{loading ? 'Loading...' : `${stats.teamsGenerated} runs completed`}</strong>
          </div>
          <div className="info-card">
            <span>Project CSV Records</span>
            <strong>{loading ? 'Loading...' : `${stats.totalProjectEmployees} records analyzed`}</strong>
          </div>
        </div>
      </section>

      <section className="panel panel-strong">
        <div className="section-title-row">
          <div>
            <h2 className="formation-title">Real-Time Skill Demand</h2>
            <p className="helper-text">Most requested skills across saved project runs.</p>
          </div>
        </div>
        {topSkills.length === 0 ? (
          <div className="empty-state">
            <h3>No skill demand yet</h3>
            <p>Generate project teams to populate this chart.</p>
          </div>
        ) : (
          <div className="bar-chart">
            {topSkills.map((skill) => {
              const maxCount = Math.max(...topSkills.map((item) => item.count), 1);
              return (
                <div className="bar-row" key={skill.name}>
                  <span className="bar-label">{skill.name}</span>
                  <div className="bar-track">
                    <span className="bar-fill match" style={{ width: `${(skill.count / maxCount) * 100}%` }} />
                  </div>
                  <strong>{skill.count}</strong>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel panel-strong">
        <div className="section-title-row">
          <div>
            <h2 className="formation-title">Saved Projects</h2>
            <p className="helper-text">Every generated team is stored here. Click a project name to open its full team details.</p>
          </div>
          <Link className="btn btn-neutral" to="/team">
            Generate New Team
          </Link>
        </div>

        {savedProjects.length === 0 ? (
          <div className="empty-state">
            <h3>No saved projects yet</h3>
            <p>Generate a project team and it will appear here automatically.</p>
          </div>
        ) : (
          <div className="project-list compact-project-list">
            {savedProjects.map((project) => (
              <Link
                key={project.savedTeamId || project.projectKey || project.projectId || project.projectName}
                className="project-list-card compact-project-card"
                to={buildProjectResultsPath(project)}
              >
                <div className="compact-project-main">
                  <span className="project-list-label">Project</span>
                  <h3>{project.projectName || 'Untitled Project'}</h3>
                  <span className="compact-project-id">{project.projectId || 'No project ID'}</span>
                  <span className="compact-project-id">
                    {project.datasetSource?.fileName || 'Project CSV'} · {Number(project.statistics?.avgMatchScore || 0).toFixed(1)}% match
                  </span>
                </div>
                <span className="compact-project-open">Open Details</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
};

export default Dashboard;
