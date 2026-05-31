import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getFormedTeamByKey } from '../utils/api';
import { downloadCSV } from '../utils/csvParser';
import { formatSkillScores, normalizeEmployeeSkillProfile } from '../utils/skillScores';
import { getLastGeneratedTeam, getSavedTeamByProjectKey, saveGeneratedTeam } from '../utils/teamStorage';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const fmt = (v, decimals = 1) => Number(v || 0).toFixed(decimals);
const fmtPct = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`;
const scoreLabel = (v) => {
  const s = Number(v || 0);
  if (s >= 0.85) return { text: 'Excellent', cls: 'chip good' };
  if (s >= 0.65) return { text: 'Good',      cls: 'chip good' };
  if (s >= 0.45) return { text: 'Moderate',  cls: 'chip warn' };
  return { text: 'Low', cls: 'chip bad' };
};

const AVATAR_COLORS = [
  '#2563eb','#0d9488','#7c3aed','#d97706','#dc2626',
  '#059669','#db2777','#0891b2','#65a30d','#9333ea',
];
const avatarColor = (name = '') => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
const initials = (name = '') =>
  name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

/* ── MemberCard ───────────────────────────────────────────────────────────── */
const AVAIL_STYLES = {
  available:   { bg: '#f0fdf4', color: '#16a34a', dot: '#22c55e', label: 'Available'   },
  busy:        { bg: '#fefce8', color: '#ca8a04', dot: '#eab308', label: 'Busy'        },
  'on leave':  { bg: '#fff7ed', color: '#ea580c', dot: '#f97316', label: 'On Leave'    },
  unavailable: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444', label: 'Unavailable' },
};

const MemberCard = ({ member, requiredSkills }) => {
  const name = member.name || member['First Name'] || 'Employee';
  const color = avatarColor(name);
  const fit = member.teamFit || {};
  const skillMatch = Number(fit.skillMatch || 0);
  const expMatch   = Number(fit.experienceMatch || 0);
  const perfMatch  = Number(fit.performanceMatch || 0);
  const matchScore = Number(member.matchScore || 0);

  const availKey = String(member.availability || 'available').trim().toLowerCase();
  const avail    = AVAIL_STYLES[availKey] || AVAIL_STYLES['available'];

  return (
    <article className="member-card">
      {member.isLeader && <div className="member-leader-ribbon">👑 Team Leader</div>}
      <div className="member-card-top">
        <div className="member-avatar" style={{ background: color }}>{initials(name)}</div>
        <div className="member-card-info">
          <h3 className="member-name">{name}</h3>
          <span className="member-role">{member.role || member.department || 'Employee'}</span>
          <span className="member-dept">{member.department || ''}</span>
          {/* Availability badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginTop: 4, padding: '2px 8px', borderRadius: 99,
            background: avail.bg, color: avail.color,
            fontSize: '0.72rem', fontWeight: 600,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: avail.dot, flexShrink: 0 }} />
            {avail.label}
          </span>
        </div>
        <div className="member-match-badge" style={{ background: matchScore >= 70 ? '#dcfce7' : matchScore >= 45 ? '#fef3c7' : '#fee2e2', color: matchScore >= 70 ? '#166534' : matchScore >= 45 ? '#92400e' : '#991b1b' }}>
          {fmt(matchScore)}%
        </div>
      </div>

      <div className="member-stats-row">
        <div className="member-stat"><span>Experience</span><strong>{fmt(member.experience || 0, 0)} yrs</strong></div>
        <div className="member-stat"><span>Performance</span><strong>{fmt(member.performanceRating || member.score || 0)}/10</strong></div>
        <div className="member-stat"><span>Skill Level</span><strong>{fmt(member.skillLevel || 0)}/10</strong></div>
      </div>

      <div className="member-bars">
        <div className="member-bar-row">
          <span>Skill Fit</span>
          <div className="member-bar-track"><div className="member-bar-fill skill" style={{ width: `${Math.min(100, skillMatch)}%` }} /></div>
          <strong>{fmt(skillMatch)}%</strong>
        </div>
        <div className="member-bar-row">
          <span>Experience</span>
          <div className="member-bar-track"><div className="member-bar-fill exp" style={{ width: `${Math.min(100, expMatch)}%` }} /></div>
          <strong>{fmt(expMatch)}%</strong>
        </div>
        <div className="member-bar-row">
          <span>Performance</span>
          <div className="member-bar-track"><div className="member-bar-fill perf" style={{ width: `${Math.min(100, perfMatch)}%` }} /></div>
          <strong>{fmt(perfMatch)}%</strong>
        </div>
      </div>

      {Array.isArray(fit.matchedSkills) && fit.matchedSkills.length > 0 && (
        <div className="member-chip-row">
          {fit.matchedSkills.map((s) => <span key={s} className="chip skill-chip">{s}</span>)}
        </div>
      )}

      {Array.isArray(fit.skillBreakdown) && fit.skillBreakdown.length > 0 && (
        <div className="member-skill-breakdown">
          {fit.skillBreakdown.map((item) => (
            <div key={item.requirementId} className="skill-breakdown-row">
              <span className="skill-breakdown-name">{item.skill}</span>
              <div className="member-bar-track sm">
                <div className="member-bar-fill skill" style={{ width: `${Math.min(100, item.fit * 100)}%` }} />
              </div>
              <span className="skill-breakdown-score">{item.employeeScore}/10</span>
              <span className={`chip ${item.fit >= 0.8 ? 'good' : item.fit >= 0.5 ? 'warn' : 'bad'}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                {item.priority}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
};

/* ── TeamResults ──────────────────────────────────────────────────────────── */
const TeamResults = () => {
  const location  = useLocation();
  const { projectKey } = useParams();
  const fromState = location.state?.team || null;
  const [remoteTeam,   setRemoteTeam]   = useState(null);
  const [loadingTeam,  setLoadingTeam]  = useState(false);

  useEffect(() => {
    let active = true;
    if (!projectKey || fromState) return;
    setLoadingTeam(true);
    getFormedTeamByKey(projectKey)
      .then((r) => { if (active) setRemoteTeam(r); })
      .catch(() => { if (active) setRemoteTeam(null); })
      .finally(() => { if (active) setLoadingTeam(false); });
    return () => { active = false; };
  }, [fromState, projectKey]);

  const team = useMemo(() => {
    if (fromState)   return saveGeneratedTeam(fromState);
    if (remoteTeam)  return saveGeneratedTeam(remoteTeam);
    if (projectKey)  return getSavedTeamByProjectKey(projectKey);
    return getLastGeneratedTeam() || null;
  }, [fromState, projectKey, remoteTeam]);

  const teams = useMemo(() => {
    if (!team) return [];
    if (Array.isArray(team.teams) && team.teams.length > 0)
      return team.teams.map((g) => ({ ...g, members: (g.members || []).map(normalizeEmployeeSkillProfile) }));
    const members = Array.isArray(team.members) ? team.members.map(normalizeEmployeeSkillProfile) : [];
    return members.length ? [{ teamName: team.teamName || 'Project Team', members }] : [];
  }, [team]);

  const allMembers      = useMemo(() => teams.flatMap((g) => g.members || []), [teams]);
  const requiredSkills  = useMemo(() => team?.selectionCriteria?.requiredSkills || [], [team]);
  const scoreWeights    = useMemo(() => team?.selectionCriteria?.scoreWeights || {}, [team]);
  const classMetrics    = team?.classificationMetrics || null;
  const rfEval          = team?.randomForestEvaluation || null;
  const backupCandidates = useMemo(() => (team?.backupCandidates || []).map(normalizeEmployeeSkillProfile), [team]);
  const alternateTeams  = team?.alternateTeams || [];
  const csvValidation   = team?.csvValidation || null;

  const leader = useMemo(() => {
    if (!team) return null;
    if (team.leader) return normalizeEmployeeSkillProfile(team.leader);
    return allMembers.find((m) => m.isLeader) || null;
  }, [team, allMembers]);

  /* ── multi-team comparison ── */
  const isMultiTeam = teams.length > 1;

  const teamStats = useMemo(() => {
    if (!isMultiTeam) return [];
    return teams.map((group) => {
      const members = group.members || [];
      const avg = (fn) => members.length ? members.reduce((s, m) => s + Number(fn(m) || 0), 0) / members.length : 0;
      const skillCoverage = requiredSkills.map((sk) => {
        const fits = members.map((m) => {
          const bd = (m.teamFit?.skillBreakdown || []).find((i) => i.skill === sk.name || i.requirementId === sk.id);
          return Number(bd?.fit || 0) * 100;
        });
        return { name: sk.name, priority: sk.priority, coverage: fits.length ? fits.reduce((s, v) => s + v, 0) / fits.length : 0 };
      });
      const leader = members.find((m) => m.isLeader) || members[0] || null;
      return {
        teamName:      group.teamName,
        size:          members.length,
        avgMatch:      avg((m) => m.matchScore || 0),
        avgExperience: avg((m) => m.experience || 0),
        avgPerformance:avg((m) => m.performanceRating || m.score || 0),
        avgSkillLevel: avg((m) => m.skillLevel || 0),
        avgFinalScore: avg((m) => m.finalCandidateScore || m.matchScore || 0),
        leaderName:    leader ? (leader.name || 'N/A') : 'N/A',
        leaderScore:   leader ? Number(leader.leaderScore || 0) : 0,
        skillCoverage,
        members,
      };
    });
  }, [teams, isMultiTeam, requiredSkills]);

  // Which team wins each metric
  const winners = useMemo(() => {
    if (!teamStats.length) return {};
    const bestIdx = (fn) => {
      let best = -1, bestVal = -Infinity;
      teamStats.forEach((t, i) => { const v = fn(t); if (v > bestVal) { bestVal = v; best = i; } });
      return best;
    };
    return {
      avgMatch:       bestIdx((t) => t.avgMatch),
      avgExperience:  bestIdx((t) => t.avgExperience),
      avgPerformance: bestIdx((t) => t.avgPerformance),
      avgSkillLevel:  bestIdx((t) => t.avgSkillLevel),
      avgFinalScore:  bestIdx((t) => t.avgFinalScore),
    };
  }, [teamStats]);

  const TEAM_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#dc2626'];

  /* chart data */
  const chartData = useMemo(() => {
    const avg = (arr) => arr.length ? arr.reduce((s, v) => s + Number(v || 0), 0) / arr.length : 0;
    const memberScores = allMembers
      .map((m) => ({ name: m.name || 'Employee', match: Number(m.matchScore || 0), isLeader: !!m.isLeader }))
      .sort((a, b) => b.match - a.match).slice(0, 10);
    const skillCoverage = requiredSkills.map((sk) => {
      const fits = allMembers.map((m) => {
        const bd = (m.teamFit?.skillBreakdown || []).find((i) => i.skill === sk.name || i.requirementId === sk.id);
        return Number(bd?.fit || 0) * 100;
      });
      return { name: sk.name, coverage: avg(fits), priority: sk.priority };
    });
    const depts = allMembers.reduce((acc, m) => { const k = m.department || 'Other'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    return { memberScores, skillCoverage, departments: Object.entries(depts).map(([name, count]) => ({ name, count })) };
  }, [allMembers, requiredSkills]);

  /* report rows */
  const reportRows = useMemo(() => {
    const r = classMetrics?.classificationReport || {};
    return Object.entries(r).filter(([l, v]) => typeof v === 'object' && !['macro avg','weighted avg'].includes(l))
      .map(([label, v]) => ({ label, precision: Number(v.precision||0), recall: Number(v.recall||0), f1: Number(v['f1-score']||0), support: Number(v.support||0) }));
  }, [classMetrics]);

  const rfRows = useMemo(() => {
    const r = rfEval?.classificationReport || {};
    return Object.entries(r).filter(([l, v]) => typeof v === 'object' && !['macro avg','weighted avg'].includes(l))
      .map(([label, v]) => ({ label, precision: Number(v.precision||0), recall: Number(v.recall||0), f1: Number(v['f1-score']||0), support: Number(v.support||0) }));
  }, [rfEval]);

  const exportCsv = () => {
    const rows = ['Name,Role,Department,Experience,Performance,Match,Skill Fit,Leader',
      ...allMembers.map((m) => [m.name||'',m.role||'',m.department||'',m.experience||0,m.performanceRating||0,m.matchScore||0,m.teamFit?.skillMatch||0,m.isLeader?'Yes':'No']
        .map((c) => `"${String(c).replace(/"/g,'""')}"`).join(','))];
    downloadCSV(rows.join('\n'), `${team?.projectId||'team'}_team.csv`);
  };

  if (loadingTeam && !team) return (
    <div className="result-box"><div className="empty-state"><h3>Loading team results…</h3></div></div>
  );
  if (!team) return (
    <>
      <header className="header"><h1>Team Results</h1><Link className="btn btn-neutral" to="/team">Back</Link></header>
      <div className="result-box"><div className="empty-state"><h3>No results yet</h3><p>Generate a team first from the Team Formation page.</p></div></div>
    </>
  );

  return (
    <>
      <header className="header">
        <div>
          <h1>{team.projectName || 'Team Results'}</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'0.8125rem', marginTop:2 }}>
            Project ID: {team.projectId || 'N/A'} · {new Date(team.savedAt || Date.now()).toLocaleString()}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-neutral" onClick={exportCsv}>Export CSV</button>
          <button type="button" className="btn btn-neutral" onClick={() => window.print()}>Print</button>
          <Link className="btn btn-neutral" to="/team">New Team</Link>
        </div>
      </header>

      {/* ── KPI strip ── */}
      <div className="cards">
        <div className="card blue">
          <h3>🎯 Avg Match Score</h3>
          <p>{fmt(team.statistics?.avgMatchScore)}%</p>
        </div>
        <div className="card green">
          <h3>👥 Members Selected</h3>
          <p>{team.statistics?.totalMembers || 0}</p>
        </div>
        <div className="card orange">
          <h3>⭐ Avg Performance</h3>
          <p>{fmt(team.statistics?.avgPerformance)}/10</p>
        </div>
        <div className="card blue">
          <h3>🕐 Avg Experience</h3>
          <p>{fmt(team.statistics?.avgExperience)} yrs</p>
        </div>
      </div>

      {/* ── Charts ── */}
      <section className="panel panel-strong">
        <div className="section-title-row">
          <div><h2 className="formation-title">Visual Analytics</h2><p className="helper-text">Match ranking, skill coverage, and department distribution.</p></div>
        </div>
        <div className="chart-grid">
          <article className="chart-panel wide">
            <h3>Member Match Ranking</h3>
            <div className="bar-chart">
              {chartData.memberScores.map((item) => (
                <div className="bar-row" key={item.name}>
                  <span className="bar-label">{item.name}{item.isLeader ? ' 👑' : ''}</span>
                  <div className="bar-track"><span className="bar-fill match" style={{ width: `${Math.min(100, item.match)}%` }} /></div>
                  <strong>{fmt(item.match)}%</strong>
                </div>
              ))}
            </div>
          </article>

          {chartData.skillCoverage.length > 0 && (
            <article className="chart-panel">
              <h3>Required Skill Coverage</h3>
              <div className="coverage-list">
                {chartData.skillCoverage.map((sk) => (
                  <div className="coverage-item" key={sk.name}>
                    <div><strong>{sk.name}</strong><span>{sk.priority}</span></div>
                    <div className="coverage-meter"><span style={{ width: `${Math.min(100, sk.coverage)}%` }} /></div>
                    <em>{fmt(sk.coverage)}%</em>
                  </div>
                ))}
              </div>
            </article>
          )}

          <article className="chart-panel">
            <h3>Department Mix</h3>
            <div className="department-chart">
              {chartData.departments.map((item, i) => {
                const max = Math.max(...chartData.departments.map((d) => d.count), 1);
                return (
                  <div className="department-bar" key={item.name}>
                    <div className={`department-column tone-${(i % 4) + 1}`} style={{ height: `${Math.max(18, (item.count / max) * 120)}px` }}>
                      <strong>{item.count}</strong>
                    </div>
                    <span>{item.name}</span>
                  </div>
                );
              })}
            </div>
          </article>

          {/* ML model quality rings */}
          <article className="chart-panel">
            <h3>Model Quality</h3>
            <div className="score-rings">
              {[
                { label: 'Avg Match', value: Number(team.statistics?.avgMatchScore || 0) },
                classMetrics?.available ? { label: 'K-Means Acc', value: Number(classMetrics.accuracyScore || 0) * 100 } : null,
                rfEval?.available ? { label: 'RF Accuracy', value: Number(rfEval.accuracyScore || 0) * 100 } : null,
              ].filter(Boolean).map((item) => {
                const r = 42, c = 2 * Math.PI * r;
                const offset = c - (Math.min(100, item.value) / 100) * c;
                return (
                  <div className="score-ring" key={item.label}>
                    <svg viewBox="0 0 110 110"><circle className="ring-bg" cx="55" cy="55" r={r} /><circle className="ring-value" cx="55" cy="55" r={r} strokeDasharray={c} strokeDashoffset={offset} /></svg>
                    <strong>{fmt(item.value)}%</strong>
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </section>

      {/* ── Summary panels ── */}
      <div className="result-summary-grid">
        <article className="summary-panel">
          <h3>Required Skills</h3>
          {requiredSkills.length === 0 ? <p>No skill requirements saved.</p> : (
            <div className="summary-chip-list">
              {requiredSkills.map((sk) => (
                <span className="chip skill-chip" key={sk.name}>{sk.name} {sk.minScore}–{sk.maxScore} <em style={{opacity:.7}}>({sk.priority})</em></span>
              ))}
            </div>
          )}
        </article>
        <article className="summary-panel">
          <h3>Scoring Weights</h3>
          <div className="summary-stats">
            <span>Skill: {scoreWeights.skill || 0}%</span>
            <span>Experience: {scoreWeights.experience || 0}%</span>
            <span>Performance: {scoreWeights.performance || 0}%</span>
          </div>
          <p style={{marginTop:8}}>Role filter: {team.selectionCriteria?.requiredRole || 'Any'}</p>
        </article>
        <article className="summary-panel">
          <h3>Team Leader</h3>
          {leader ? (
            <>
              <div className="leader-summary">
                <strong>{leader.name || leader['First Name']}</strong>
                <span>{fmt(leader.leaderScore || 0)} pts</span>
              </div>
              <p>{leader.leaderReason || 'Highest blend of experience, performance, and skill fit.'}</p>
            </>
          ) : <p>No leader data available.</p>}
        </article>
        <article className="summary-panel">
          <h3>Dataset</h3>
          <div className="summary-stats">
            <span>{team.datasetSource?.fileName || 'CSV'}</span>
            <span>{team.datasetSource?.employeeCount || 0} records</span>
            <span>{team.datasetSource?.eligibleEmployeeCount || 0} eligible</span>
          </div>
          {csvValidation && (
            <div className="summary-stats" style={{marginTop:8}}>
              <span>{csvValidation.totalRows} rows</span>
              <span>{csvValidation.validRows} valid</span>
              <span>{(csvValidation.unavailable||[]).length} unavailable</span>
            </div>
          )}
        </article>
      </div>

      {/* ── Alternate teams ── */}
      {alternateTeams.length > 0 && (
        <section className="panel panel-strong">
          <div className="section-title-row"><div><h2 className="formation-title">Team Variants</h2><p className="helper-text">Recommended and alternative team compositions.</p></div></div>
          <div className="comparison-grid">
            {alternateTeams.map((opt) => (
              <article className="comparison-card" key={opt.name}>
                <div className="comparison-top">
                  <h3>{opt.name}</h3>
                  <span className="chip info">{fmt(opt.avgMatchScore)}% match</span>
                </div>
                <div className="summary-stats">
                  <span>Match: {fmt(opt.avgMatchScore)}%</span>
                  <span>Exp: {fmt(opt.avgExperience)} yrs</span>
                </div>
                <p style={{marginTop:8, fontSize:'0.8125rem', color:'var(--text-muted)'}}>{(opt.members||[]).join(', ')}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── Backup candidates ── */}
      {backupCandidates.length > 0 && (
        <section className="panel panel-strong">
          <div className="section-title-row"><div><h2 className="formation-title">Backup Candidates</h2><p className="helper-text">Next best available if a selected member becomes unavailable.</p></div></div>
          <div className="backup-grid">
            {backupCandidates.map((m) => (
              <article className="backup-card" key={m.employeeId || m.id || m.name}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                  <div className="member-avatar sm" style={{background: avatarColor(m.name||'')}}>{initials(m.name||'')}</div>
                  <div><strong>{m.name||'Employee'}</strong><br/><span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>{m.role||m.department||''}</span></div>
                </div>
                <em>{fmt(m.matchScore)}% match · {fmt(m.experience||0,0)} yrs exp</em>
                <p>{m.backupReason||'Available as replacement.'}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── K-Means classification metrics ── */}
      {classMetrics && (
        <section className="panel panel-strong">
          <div className="section-title-row">
            <div><h2 className="formation-title">K-Means Classification Check</h2><p className="helper-text">How well the generated clusters match known employee categories.</p></div>
            {classMetrics.available && (
              <div className="evaluation-score">
                <span>Accuracy</span>
                <strong>{fmtPct(classMetrics.accuracyScore)}</strong>
                <em>{scoreLabel(classMetrics.accuracyScore).text}</em>
              </div>
            )}
          </div>
          {!classMetrics.available ? (
            <div className="evaluation-empty">Add <strong>actualTeam</strong>, <strong>actualLabel</strong>, <strong>target</strong>, or <strong>class</strong> column to your CSV to enable this check.</div>
          ) : (
            <>
              <p className="evaluation-note">{classMetrics.note}</p>
              <div className="evaluation-grid">
                <article className="summary-panel">
                  <h3>Cluster → Category Mapping</h3>
                  <div className="cluster-map-list">
                    {Object.entries(classMetrics.clusterToLabel||{}).map(([k,v]) => (
                      <span key={k}>Group {Number(k)+1} → <strong>{v}</strong></span>
                    ))}
                  </div>
                </article>
                <article className="summary-panel">
                  <h3>Interpretation</h3>
                  <p>Higher accuracy means the K-Means grouping aligns closely with the known employee categories in your data.</p>
                </article>
              </div>
              <div className="table-scroll">
                <h3>Confusion Matrix</h3>
                <table className="metrics-table">
                  <thead><tr><th>Actual \ Predicted</th>{(classMetrics.labels||[]).map((l) => <th key={l}>{l}</th>)}</tr></thead>
                  <tbody>{(classMetrics.confusionMatrix||[]).map((row,ri) => (
                    <tr key={ri}><th>{classMetrics.labels?.[ri]||`L${ri+1}`}</th>{row.map((v,ci) => <td key={ci}>{v}</td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="table-scroll">
                <h3>Per-Class Report</h3>
                <table className="metrics-table compact">
                  <thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th><th>Support</th></tr></thead>
                  <tbody>{reportRows.map((r) => (
                    <tr key={r.label}><th>{r.label}</th><td>{fmtPct(r.precision)}</td><td>{fmtPct(r.recall)}</td><td>{fmtPct(r.f1)}</td><td>{r.support}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Random Forest evaluation ── */}
      {rfEval && (
        <section className="panel panel-strong">
          <div className="section-title-row">
            <div><h2 className="formation-title">Random Forest Evaluation</h2><p className="helper-text">Supervised ML check trained on employee features.</p></div>
            {rfEval.available && (
              <div className="evaluation-score">
                <span>Accuracy</span>
                <strong>{fmtPct(rfEval.accuracyScore)}</strong>
                <em>{scoreLabel(rfEval.accuracyScore).text}</em>
              </div>
            )}
          </div>
          {!rfEval.available ? (
            <div className="evaluation-empty">Add a label column to enable Random Forest evaluation.</div>
          ) : (
            <>
              <div className="evaluation-grid">
                <article className="summary-panel">
                  <h3>Test Setup</h3>
                  <div className="cluster-map-list">
                    <span>Model: <strong>{rfEval.modelName||'Random Forest'}</strong></span>
                    <span>Trained on: <strong>{rfEval.trainSize}</strong> records</span>
                    <span>Tested on: <strong>{rfEval.testSize}</strong> records</span>
                    <span>Target field: <strong>{rfEval.targetField}</strong></span>
                  </div>
                </article>
                <article className="summary-panel">
                  <h3>What This Means</h3>
                  <p>{rfEval.note || 'Trained on employee features and evaluated on a held-out test split.'}</p>
                </article>
              </div>
              <div className="table-scroll">
                <h3>Prediction Summary</h3>
                <table className="metrics-table compact">
                  <thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th><th>Support</th></tr></thead>
                  <tbody>{rfRows.map((r) => (
                    <tr key={r.label}><th>{r.label}</th><td>{fmtPct(r.precision)}</td><td>{fmtPct(r.recall)}</td><td>{fmtPct(r.f1)}</td><td>{r.support}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Multi-team comparison ── */}
      {isMultiTeam && teamStats.length > 0 && (
        <section className="panel panel-strong" style={{ marginTop: 20 }}>
          <div className="section-title-row">
            <div>
              <h2 className="formation-title">Team Comparison</h2>
              <p className="helper-text">{teams.length} teams formed for the same project — compare metrics side by side.</p>
            </div>
            <span className="chip info">{teams.length} teams</span>
          </div>

          {/* ── Metric comparison table ── */}
          <div className="table-scroll" style={{ marginBottom: 24 }}>
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {teamStats.map((t, i) => (
                    <th key={t.teamName} style={{ color: TEAM_COLORS[i % TEAM_COLORS.length] }}>
                      {t.teamName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'avgMatch',       label: 'Avg Match Score', fmt: (v) => `${fmt(v)}%` },
                  { key: 'avgFinalScore',  label: 'Avg Candidate Score', fmt: (v) => `${fmt(v)}%` },
                  { key: 'avgExperience',  label: 'Avg Experience', fmt: (v) => `${fmt(v)} yrs` },
                  { key: 'avgPerformance', label: 'Avg Performance', fmt: (v) => `${fmt(v)}/10` },
                  { key: 'avgSkillLevel',  label: 'Avg Skill Level', fmt: (v) => `${fmt(v)}/10` },
                ].map(({ key, label, fmt: fmtFn }) => (
                  <tr key={key}>
                    <th>{label}</th>
                    {teamStats.map((t, i) => {
                      const isWinner = winners[key] === i;
                      return (
                        <td key={t.teamName} style={{ fontWeight: isWinner ? 700 : 400, color: isWinner ? TEAM_COLORS[i % TEAM_COLORS.length] : undefined }}>
                          {fmtFn(t[key])}
                          {isWinner && <span style={{ marginLeft: 6, fontSize: '0.75rem' }}>★</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th>Team Size</th>
                  {teamStats.map((t) => <td key={t.teamName}>{t.size} members</td>)}
                </tr>
                <tr>
                  <th>Team Leader</th>
                  {teamStats.map((t, i) => (
                    <td key={t.teamName} style={{ color: TEAM_COLORS[i % TEAM_COLORS.length], fontWeight: 600 }}>
                      {t.leaderName}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Visual bar comparison ── */}
          <div className="comparison-bars-section">
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
              Score Comparison
            </h3>
            {[
              { label: 'Avg Match Score',     key: 'avgMatch',       max: 100 },
              { label: 'Avg Experience (×10)', key: 'avgExperience',  max: 15 },
              { label: 'Avg Performance',      key: 'avgPerformance', max: 10 },
            ].map(({ label, key, max }) => (
              <div key={key} className="cmp-bar-group">
                <div className="cmp-bar-label">{label}</div>
                {teamStats.map((t, i) => (
                  <div className="cmp-bar-row" key={t.teamName}>
                    <span className="cmp-bar-name" style={{ color: TEAM_COLORS[i % TEAM_COLORS.length] }}>
                      {t.teamName}
                    </span>
                    <div className="cmp-bar-track">
                      <div
                        className="cmp-bar-fill"
                        style={{
                          width: `${Math.min(100, (t[key] / max) * 100)}%`,
                          background: TEAM_COLORS[i % TEAM_COLORS.length],
                        }}
                      />
                    </div>
                    <strong className="cmp-bar-val">
                      {key === 'avgMatch' ? `${fmt(t[key])}%` : key === 'avgExperience' ? `${fmt(t[key])} yrs` : `${fmt(t[key])}/10`}
                    </strong>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* ── Skill coverage comparison ── */}
          {requiredSkills.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
                Skill Coverage per Team
              </h3>
              {requiredSkills.map((sk) => (
                <div key={sk.name} className="cmp-skill-group">
                  <div className="cmp-skill-name">
                    {sk.name}
                    <span className={`chip ${sk.priority === 'critical' ? 'bad' : sk.priority === 'high' ? 'warn' : 'info'}`} style={{ marginLeft: 8, fontSize: '0.65rem' }}>
                      {sk.priority}
                    </span>
                  </div>
                  {teamStats.map((t, i) => {
                    const cov = t.skillCoverage.find((s) => s.name === sk.name)?.coverage ?? 0;
                    return (
                      <div className="cmp-bar-row" key={t.teamName}>
                        <span className="cmp-bar-name" style={{ color: TEAM_COLORS[i % TEAM_COLORS.length] }}>{t.teamName}</span>
                        <div className="cmp-bar-track">
                          <div className="cmp-bar-fill" style={{ width: `${Math.min(100, cov)}%`, background: TEAM_COLORS[i % TEAM_COLORS.length] }} />
                        </div>
                        <strong className="cmp-bar-val">{fmt(cov)}%</strong>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── Recommended team banner ── */}
          {(() => {
            const bestIdx = winners.avgFinalScore ?? winners.avgMatch ?? 0;
            const best = teamStats[bestIdx];
            if (!best) return null;
            return (
              <div className="recommended-team-banner" style={{ marginTop: 24, background: `${TEAM_COLORS[bestIdx % TEAM_COLORS.length]}15`, border: `2px solid ${TEAM_COLORS[bestIdx % TEAM_COLORS.length]}`, borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '1.5rem' }}>🏆</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: TEAM_COLORS[bestIdx % TEAM_COLORS.length] }}>
                      Recommended: {best.teamName}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Highest average candidate score ({fmt(best.avgFinalScore)}%) · Leader: {best.leaderName} · {best.size} members
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* ── Team member cards ── */}
      {teams.map((group, gi) => (
        <section key={`${group.teamName}-${gi}`} className="panel panel-strong" style={{marginTop:20}}>
          <div className="section-title-row">
            <div><h2 className="formation-title">{group.teamName}</h2><p className="helper-text">{group.members.length} members selected by the AI pipeline</p></div>
            <span className="chip info">{group.members.length} members</span>
          </div>
          <div className="member-grid">
            {group.members.map((member, idx) => (
              <MemberCard key={member.employeeId || member.id || idx} member={member} requiredSkills={requiredSkills} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
};

export default TeamResults;
