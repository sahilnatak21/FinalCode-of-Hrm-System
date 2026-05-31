import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteCandidate, getCandidates, clearCandidates } from '../utils/candidateStorage';
import { downloadCSV } from '../utils/csvParser';
import { toast } from '../utils/toast';

const LABEL_STYLE = {
  'Excellent Match': { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
  'Good Match':      { bg: '#f0f9ff', color: '#0369a1', border: '#7dd3fc' },
  'Needs Review':    { bg: '#fffbeb', color: '#b45309', border: '#fcd34d' },
  'Not Suitable':    { bg: '#fff5f5', color: '#b91c1c', border: '#fca5a5' },
  'No JD Match':     { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
};

const AVATAR_COLORS = ['#4f8ef7','#38d9a9','#f97316','#a855f7','#ec4899','#14b8a6','#f59e0b'];
const avatarBg = (name = '') => AVATAR_COLORS[(name.charCodeAt(0) || 65) % AVATAR_COLORS.length];
const initials = (name = '') => name.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const fmt = (v, d = 1) => Number(v || 0).toFixed(d);

const ScoreBar = ({ score, color = '#4f8ef7' }) => (
  <div style={{ height: 5, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginTop: 3 }}>
    <div style={{ height: '100%', width: `${Math.min(100, score || 0)}%`, background: color, borderRadius: 99 }} />
  </div>
);

// ── Detail Modal ──────────────────────────────────────────────────────────────
const DetailModal = ({ candidate, onClose, onDelete }) => {
  const { profile, matchAnalysis: ma } = candidate;
  const label = ma?.shortlistLabel || 'No JD Match';
  const ls = LABEL_STYLE[label] || LABEL_STYLE['No JD Match'];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '1.5rem 1.5rem 1.25rem', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: avatarBg(profile.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.2rem', flexShrink: 0 }}>
            {initials(profile.name)}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 2px', fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>{profile.name || 'Unknown'}</h2>
            <div style={{ fontSize: '0.85rem', color: '#475569' }}>{profile.role} · {profile.department}</div>
            <span style={{ display: 'inline-block', marginTop: 4, background: ls.bg, color: ls.color, border: `1px solid ${ls.border}`, borderRadius: 99, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700 }}>{label}</span>
          </div>
          {ma && (
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: ls.color, lineHeight: 1 }}>{Math.round(ma.finalJDMatchScore)}%</div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>JD Match</div>
            </div>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem' }}>
          {/* Contact info */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: '0.82rem', color: '#475569' }}>
            {profile.email    && <span>📧 {profile.email}</span>}
            {profile.phone    && <span>📞 {profile.phone}</span>}
            {profile.location && <span>📍 {profile.location}</span>}
            {profile.links?.linkedin  && <a href={profile.links.linkedin}  target="_blank" rel="noreferrer" style={{ color: '#0369a1' }}>🔗 LinkedIn</a>}
            {profile.links?.github    && <a href={profile.links.github}    target="_blank" rel="noreferrer" style={{ color: '#0369a1' }}>🐙 GitHub</a>}
            {profile.links?.portfolio && <a href={profile.links.portfolio} target="_blank" rel="noreferrer" style={{ color: '#0369a1' }}>🌐 Portfolio</a>}
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Experience', value: `${profile.experience || 0} yrs` },
              { label: 'Skill Level', value: `${profile.skillLevel || 0}/10` },
              { label: 'Performance', value: `${profile.performanceRating || 0}/10` },
              { label: 'Skills Found', value: Object.keys(profile.skillScores || {}).length },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* JD Match breakdown */}
          {ma && (
            <div style={{ marginBottom: 16, background: '#f8fafc', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>JD Match Breakdown</div>
              {[
                { label: 'Skill Match',       score: ma.skillMatchScore,       color: '#4f8ef7' },
                { label: 'Experience Match',  score: ma.experienceMatchScore,  color: '#38d9a9' },
                { label: 'Role Match',        score: ma.roleMatchScore,        color: '#a855f7' },
                { label: 'Education Match',   score: ma.educationMatchScore,   color: '#f59e0b' },
              ].map(({ label, score, color }) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 45px', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <span style={{ fontSize: '0.8rem', color: '#374151' }}>{label}</span>
                  <div style={{ height: 8, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, score || 0)}%`, background: color, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#374151', textAlign: 'right', fontWeight: 600 }}>{Math.round(score || 0)}%</span>
                </div>
              ))}

              {/* Skill tags */}
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ma.strongSkills?.length > 0 && (
                  <div><span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#16a34a', marginRight: 5 }}>✅ Strong:</span>
                    {ma.strongSkills.map((s) => <span key={s} style={{ background: '#dcfce7', color: '#166534', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', marginRight: 4 }}>{s}</span>)}
                  </div>
                )}
                {ma.partialMatchedSkills?.length > 0 && (
                  <div><span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#d97706', marginRight: 5 }}>⚠️ Partial:</span>
                    {ma.partialMatchedSkills.map((s) => <span key={s} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', marginRight: 4 }}>{s}</span>)}
                  </div>
                )}
                {ma.missingSkills?.length > 0 && (
                  <div><span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#dc2626', marginRight: 5 }}>❌ Missing:</span>
                    {ma.missingSkills.map((s) => <span key={s} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', marginRight: 4 }}>{s}</span>)}
                  </div>
                )}
              </div>

              {ma.reasonForRanking && (
                <div style={{ marginTop: 10, background: 'rgba(79,142,247,0.07)', borderRadius: 8, padding: '7px 10px', fontSize: '0.75rem', color: '#374151', fontStyle: 'italic' }}>
                  💡 {ma.reasonForRanking}
                </div>
              )}
            </div>
          )}

          {/* Skills */}
          {Object.keys(profile.skillScores || {}).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Skills</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {Object.entries(profile.skillScores).map(([skill, score]) => (
                  <span key={skill} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 99, padding: '2px 10px', fontSize: '0.75rem', color: '#374151' }}>
                    {skill} <strong style={{ color: '#4f8ef7' }}>{score}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Education & Certs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {profile.education && (
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: 5 }}>EDUCATION</div>
                <div style={{ fontSize: '0.8rem', color: '#374151' }}>🎓 {profile.education.slice(0, 100)}</div>
              </div>
            )}
            {profile.certifications?.length > 0 && (
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: 5 }}>CERTIFICATIONS</div>
                {profile.certifications.slice(0, 3).map((c, i) => (
                  <div key={i} style={{ fontSize: '0.78rem', color: '#374151' }}>🏅 {c.slice(0, 60)}</div>
                ))}
              </div>
            )}
          </div>

          {/* Meta */}
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <span>Source: {candidate.filename}</span>
            <span>Saved: {new Date(candidate.savedAt).toLocaleDateString()}</span>
            {profile.extractionConfidence && <span>Extraction confidence: {profile.extractionConfidence}%</span>}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={() => { onDelete(candidate.poolId); onClose(); }}
            style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 9, padding: '0.5rem 1.1rem', color: '#dc2626', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            🗑 Remove from Pool
          </button>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 9, padding: '0.5rem 1.25rem', color: '#475569', fontWeight: 500, fontSize: '0.85rem', cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const CandidatePool = () => {
  const [candidates, setCandidates] = useState(() => getCandidates());
  const [search,     setSearch]     = useState('');
  const [filterLabel, setFilterLabel] = useState('All');
  const [sortBy,     setSortBy]     = useState('savedAt');
  const [selected,   setSelected]   = useState(null);

  const reload = () => setCandidates(getCandidates());

  const handleDelete = (poolId) => {
    if (!window.confirm('Remove this candidate from the pool?')) return;
    deleteCandidate(poolId);
    reload();
    toast.success('Candidate removed');
  };

  const handleClearAll = () => {
    if (!window.confirm('Clear all candidates from the pool? This cannot be undone.')) return;
    clearCandidates();
    reload();
    toast.success('Candidate pool cleared');
  };

  const handleExport = () => {
    if (!candidates.length) { toast.error('No candidates to export'); return; }
    const headers = 'Name,Email,Phone,Role,Department,Experience,Skill Level,Performance,JD Match Score,Shortlist Label,Skills,Certifications,Education,Saved At';
    const rows = candidates.map((c) => {
      const p = c.profile || {};
      const ma = c.matchAnalysis || {};
      return [
        p.name || '', p.email || '', p.phone || '', p.role || '', p.department || '',
        p.experience || 0, p.skillLevel || 0, p.performanceRating || 0,
        ma.finalJDMatchScore || '', ma.shortlistLabel || '',
        Object.keys(p.skillScores || {}).join('; '),
        (p.certifications || []).join('; '),
        p.education || '',
        c.savedAt ? new Date(c.savedAt).toLocaleDateString() : '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    downloadCSV([headers, ...rows].join('\n'), `candidate_pool_${Date.now()}.csv`);
    toast.success(`Exported ${candidates.length} candidates`);
  };

  const filtered = useMemo(() => {
    let list = [...candidates];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        const p = c.profile || {};
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.role || '').toLowerCase().includes(q) ||
          (p.department || '').toLowerCase().includes(q) ||
          (p.email || '').toLowerCase().includes(q) ||
          Object.keys(p.skillScores || {}).some((s) => s.includes(q))
        );
      });
    }
    if (filterLabel !== 'All') {
      list = list.filter((c) => (c.matchAnalysis?.shortlistLabel || 'No JD Match') === filterLabel);
    }
    if (sortBy === 'matchScore') {
      list.sort((a, b) => (b.matchAnalysis?.finalJDMatchScore || 0) - (a.matchAnalysis?.finalJDMatchScore || 0));
    } else if (sortBy === 'experience') {
      list.sort((a, b) => (b.profile?.experience || 0) - (a.profile?.experience || 0));
    } else if (sortBy === 'name') {
      list.sort((a, b) => (a.profile?.name || '').localeCompare(b.profile?.name || ''));
    } else {
      list.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    }
    return list;
  }, [candidates, search, filterLabel, sortBy]);

  const labelCounts = useMemo(() => {
    const counts = { 'Excellent Match': 0, 'Good Match': 0, 'Needs Review': 0, 'Not Suitable': 0, 'No JD Match': 0 };
    candidates.forEach((c) => {
      const l = c.matchAnalysis?.shortlistLabel || 'No JD Match';
      counts[l] = (counts[l] || 0) + 1;
    });
    return counts;
  }, [candidates]);

  return (
    <>
      <header className="header">
        <div>
          <h1>Candidate Pool</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
            Extracted candidates from resumes · not linked to employee accounts
          </p>
        </div>
        <div className="header-actions">
          <Link to="/resume-upload" className="btn btn-neutral">+ Extract Resumes</Link>
          {candidates.length > 0 && (
            <>
              <button className="btn btn-neutral" onClick={handleExport}>Export CSV</button>
              <button className="btn btn-danger" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }} onClick={handleClearAll}>Clear All</button>
            </>
          )}
        </div>
      </header>

      {/* ── KPI Strip ── */}
      <div className="cards">
        <div className="card blue"><h3>👥 Total Candidates</h3><p>{candidates.length}</p></div>
        <div className="card green"><h3>🏆 Excellent Match</h3><p>{labelCounts['Excellent Match']}</p></div>
        <div className="card blue"><h3>✅ Good Match</h3><p>{labelCounts['Good Match']}</p></div>
        <div className="card orange"><h3>🔍 Needs Review</h3><p>{labelCounts['Needs Review']}</p></div>
      </div>

      {candidates.length === 0 ? (
        <section className="panel panel-strong">
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text)' }}>No candidates yet</h3>
            <p style={{ marginBottom: '1.25rem' }}>Upload and extract resumes to build your candidate pool.</p>
            <Link to="/resume-upload" className="btn">Go to Resume Extraction</Link>
          </div>
        </section>
      ) : (
        <section className="panel panel-strong">

          {/* ── Toolbar ── */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0.45rem 0.9rem', flex: '1 1 220px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, role, skill…"
                style={{ border: 'none', outline: 'none', fontSize: '0.88rem', background: 'transparent', width: '100%' }}
              />
            </div>

            <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)}
              style={{ padding: '0.45rem 0.8rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.85rem', background: '#fff', color: '#374151', cursor: 'pointer' }}>
              <option value="All">All Labels</option>
              {['Excellent Match','Good Match','Needs Review','Not Suitable','No JD Match'].map((l) => (
                <option key={l} value={l}>{l} ({labelCounts[l] || 0})</option>
              ))}
            </select>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: '0.45rem 0.8rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.85rem', background: '#fff', color: '#374151', cursor: 'pointer' }}>
              <option value="savedAt">Sort: Recent</option>
              <option value="matchScore">Sort: JD Match</option>
              <option value="experience">Sort: Experience</option>
              <option value="name">Sort: Name</option>
            </select>

            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{filtered.length} shown</span>
          </div>

          {/* ── Filter label chips ── */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {['All', 'Excellent Match', 'Good Match', 'Needs Review', 'Not Suitable', 'No JD Match'].map((l) => {
              const ls = LABEL_STYLE[l] || { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
              const active = filterLabel === l;
              return (
                <button key={l} onClick={() => setFilterLabel(l)}
                  style={{ background: active ? ls.color : ls.bg, color: active ? '#fff' : ls.color, border: `1.5px solid ${ls.border}`, borderRadius: 99, padding: '3px 12px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' }}>
                  {l}{l !== 'All' && ` (${labelCounts[l] || 0})`}
                </button>
              );
            })}
          </div>

          {/* ── Candidate Table ── */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No candidates match the current filter.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['#', 'Candidate', 'Role', 'Experience', 'Skills', 'JD Match', 'Label', 'Actions'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((candidate, idx) => {
                    const p  = candidate.profile || {};
                    const ma = candidate.matchAnalysis;
                    const label = ma?.shortlistLabel || 'No JD Match';
                    const ls = LABEL_STYLE[label] || LABEL_STYLE['No JD Match'];
                    return (
                      <tr key={candidate.poolId} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#fafbff'}
                        onMouseLeave={(e) => e.currentTarget.style.background = ''}
                        onClick={() => setSelected(candidate)}>
                        <td style={{ padding: '0.85rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarBg(p.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>
                              {initials(p.name)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name || '—'}</div>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{p.email || ''}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 500, color: '#374151' }}>{p.role || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{p.department}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#374151' }}>
                          {fmt(p.experience, 0)} yrs
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {Object.keys(p.skillScores || {}).slice(0, 3).map((s) => (
                              <span key={s} style={{ background: '#f1f5f9', color: '#475569', borderRadius: 99, padding: '1px 7px', fontSize: '0.68rem' }}>{s}</span>
                            ))}
                            {Object.keys(p.skillScores || {}).length > 3 && (
                              <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>+{Object.keys(p.skillScores).length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {ma ? (
                            <div style={{ minWidth: 80 }}>
                              <div style={{ fontWeight: 700, color: ls.color, fontSize: '0.95rem' }}>{Math.round(ma.finalJDMatchScore)}%</div>
                              <ScoreBar score={ma.finalJDMatchScore} color={ls.color} />
                            </div>
                          ) : <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>—</span>}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ background: ls.bg, color: ls.color, border: `1px solid ${ls.border}`, borderRadius: 99, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {label}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDelete(candidate.poolId)}
                            style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 7, color: '#ef4444', fontSize: '0.75rem', padding: '3px 8px', cursor: 'pointer' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Detail Modal ── */}
      {selected && (
        <DetailModal
          candidate={selected}
          onClose={() => setSelected(null)}
          onDelete={(poolId) => { handleDelete(poolId); setSelected(null); }}
        />
      )}
    </>
  );
};

export default CandidatePool;
