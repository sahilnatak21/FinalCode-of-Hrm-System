import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkResumeApiHealth, extractAndMatch, parseJD } from '../utils/api';
import { addCandidate } from '../utils/candidateStorage';
import { toast } from '../utils/toast';

const ACCEPTED  = ['.pdf', '.docx', '.doc', '.txt'];
const MAX_FILES = 20;
const MAX_MB    = 10;

const fileIcon = (name = '') => {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf')  return '📄';
  if (ext === 'docx' || ext === 'doc') return '📝';
  return '📃';
};

const matchColor = (score) => {
  if (score >= 85) return { bg: '#f0fdf4', border: '#86efac', badge: '#16a34a', label: '#16a34a' };
  if (score >= 70) return { bg: '#f0f9ff', border: '#7dd3fc', badge: '#0369a1', label: '#0369a1' };
  if (score >= 50) return { bg: '#fffbeb', border: '#fcd34d', badge: '#b45309', label: '#b45309' };
  return            { bg: '#fff5f5', border: '#fca5a5', badge: '#b91c1c', label: '#b91c1c' };
};

const ScoreBar = ({ label, score, color = '#4f8ef7', showPct = true }) => (
  <div style={{ marginBottom: 6 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 3, color: '#374151' }}>
      <span>{label}</span>
      {showPct && <strong style={{ color }}>{Math.round(score)}%</strong>}
    </div>
    <div style={{ height: 7, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, score)}%`, background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
    </div>
  </div>
);

// ── JD Summary Card ───────────────────────────────────────────────────────────
const JDSummaryCard = ({ jd, onClear }) => (
  <div style={{ background: '#f0f9ff', border: '1.5px solid #7dd3fc', borderRadius: 14, padding: '1.25rem 1.5rem', marginTop: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
      <div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>JD Parsed</span>
        <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
          {jd.jobTitle || jd.requiredRole || 'Job Description'}
        </h3>
      </div>
      <button onClick={onClear} style={{ background: 'none', border: '1px solid #bae6fd', borderRadius: 7, padding: '3px 10px', color: '#0369a1', fontSize: '0.78rem', cursor: 'pointer' }}>
        Clear JD
      </button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
      {[
        { label: 'Required Role',    value: jd.requiredRole || '—' },
        { label: 'Min Experience',   value: jd.minimumExperience ? `${jd.minimumExperience} yrs` : 'Not specified' },
        { label: 'Skills Required',  value: `${jd.totalSkillsRequired || jd.requiredSkills?.length || 0} skills` },
        { label: 'Education',        value: jd.educationRequirement ? jd.educationRequirement.slice(0, 40) + '…' : 'Not specified' },
      ].map(({ label, value }) => (
        <div key={label} style={{ background: '#fff', borderRadius: 9, padding: '8px 12px', border: '1px solid #e0f2fe' }}>
          <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{value}</div>
        </div>
      ))}
    </div>

    {jd.prioritySkills?.length > 0 && (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>Priority Skills</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {jd.prioritySkills.slice(0, 10).map((s) => (
            <span key={s} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 99, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>{s}</span>
          ))}
          {jd.prioritySkills.length > 10 && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>+{jd.prioritySkills.length - 10} more</span>}
        </div>
      </div>
    )}

    {jd.softSkills?.length > 0 && (
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', marginBottom: 5 }}>Soft Skills</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {jd.softSkills.slice(0, 8).map((s) => (
            <span key={s} style={{ background: '#f0fdf4', color: '#166534', borderRadius: 99, padding: '2px 9px', fontSize: '0.72rem', border: '1px solid #bbf7d0' }}>{s}</span>
          ))}
        </div>
      </div>
    )}
  </div>
);

// ── Candidate Match Card ──────────────────────────────────────────────────────
const CandidateCard = ({ result, onSave, onEdit, saving, hasJD }) => {
  const [expanded, setExpanded] = useState(false);
  const { profile, matchAnalysis: ma } = result;
  const colors = ma ? matchColor(ma.finalJDMatchScore) : { bg: '#f8fafc', border: '#e2e8f0', badge: '#64748b', label: '#64748b' };

  const avail = String(profile.availability || 'Available').toLowerCase();
  const availStyle = avail === 'available'
    ? { bg: '#f0fdf4', color: '#16a34a', dot: '#22c55e' }
    : avail === 'busy'
    ? { bg: '#fefce8', color: '#ca8a04', dot: '#eab308' }
    : { bg: '#fff7ed', color: '#ea580c', dot: '#f97316' };

  return (
    <article style={{ background: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: 16, padding: '1.25rem', position: 'relative', transition: 'box-shadow 0.15s' }}>

      {/* Rank badge */}
      {ma?.rank && (
        <div style={{ position: 'absolute', top: 12, left: 12, width: 28, height: 28, borderRadius: '50%', background: colors.badge, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>
          #{ma.rank}
        </div>
      )}

      {/* Shortlist label */}
      {ma?.shortlistLabel && (
        <div style={{ position: 'absolute', top: 12, right: 12, background: colors.badge, color: '#fff', borderRadius: 99, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700 }}>
          {ma.shortlistLabel}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: ma?.rank ? 8 : 0, marginBottom: 12 }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: `hsl(${(profile.name || 'A').charCodeAt(0) * 30 % 360}, 55%, 55%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0 }}>
          {(profile.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.name || 'Unknown'}</h3>
          <div style={{ fontSize: '0.8rem', color: '#475569' }}>{profile.role || 'Role not detected'} · {profile.department || ''}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {/* Availability */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: availStyle.bg, color: availStyle.color, borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 600 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: availStyle.dot }} />
              {profile.availability || 'Available'}
            </span>
            {profile.experience > 0 && (
              <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem' }}>{profile.experience} yrs exp</span>
            )}
          </div>
        </div>
        {/* JD match score circle */}
        {ma && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.badge, lineHeight: 1 }}>{Math.round(ma.finalJDMatchScore)}%</div>
            <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: 1 }}>JD Match</div>
          </div>
        )}
      </div>

      {/* Contact */}
      {(profile.email || profile.phone) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, fontSize: '0.78rem', color: '#475569' }}>
          {profile.email && <span>📧 {profile.email}</span>}
          {profile.phone && <span>📞 {profile.phone}</span>}
          {profile.location && <span>📍 {profile.location}</span>}
        </div>
      )}

      {/* JD Match breakdown */}
      {ma && hasJD && (
        <div style={{ marginBottom: 12 }}>
          <ScoreBar label="Skill Match"       score={ma.skillMatchScore}       color="#4f8ef7" />
          <ScoreBar label="Experience Match"  score={ma.experienceMatchScore}  color="#38d9a9" />
          <ScoreBar label="Role Match"        score={ma.roleMatchScore}        color="#a855f7" />
          <ScoreBar label="Education Match"   score={ma.educationMatchScore}   color="#f59e0b" />
        </div>
      )}

      {/* Skill tags */}
      {ma && (
        <div style={{ marginBottom: 10 }}>
          {ma.strongSkills?.length > 0 && (
            <div style={{ marginBottom: 5 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#16a34a', marginRight: 5 }}>✅ Strong:</span>
              {ma.strongSkills.slice(0, 4).map((s) => (
                <span key={s} style={{ background: '#dcfce7', color: '#166534', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', marginRight: 4 }}>{s}</span>
              ))}
            </div>
          )}
          {ma.partialMatchedSkills?.length > 0 && (
            <div style={{ marginBottom: 5 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#d97706', marginRight: 5 }}>⚠️ Partial:</span>
              {ma.partialMatchedSkills.slice(0, 3).map((s) => (
                <span key={s} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', marginRight: 4 }}>{s}</span>
              ))}
            </div>
          )}
          {ma.missingSkills?.length > 0 && (
            <div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#dc2626', marginRight: 5 }}>❌ Missing:</span>
              {ma.missingSkills.slice(0, 3).map((s) => (
                <span key={s} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', marginRight: 4 }}>{s}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reason for ranking */}
      {ma?.reasonForRanking && (
        <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '6px 10px', fontSize: '0.75rem', color: '#374151', fontStyle: 'italic', marginBottom: 10 }}>
          💡 {ma.reasonForRanking}
        </div>
      )}

      {/* Expand/collapse */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{ background: 'none', border: 'none', color: '#4f8ef7', fontSize: '0.78rem', cursor: 'pointer', padding: 0, marginBottom: 8, fontWeight: 600 }}
      >
        {expanded ? '▲ Hide details' : '▼ Show skills & profile'}
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
          {/* Skill bars */}
          {Object.keys(profile.skillScores || {}).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Detected Skills</div>
              {Object.entries(profile.skillScores || {}).slice(0, 8).map(([name, score]) => (
                <div key={name} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 40px', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: '0.78rem', color: '#374151' }}>{name}</span>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(score / 10) * 100}%`, background: '#4f8ef7', borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'right' }}>{score}/10</span>
                </div>
              ))}
            </div>
          )}

          {/* Certifications & Education */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {profile.education && (
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: 3 }}>EDUCATION</div>
                <div style={{ fontSize: '0.78rem', color: '#374151' }}>🎓 {profile.education.slice(0, 80)}</div>
              </div>
            )}
            {profile.certifications?.length > 0 && (
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: 3 }}>CERTIFICATIONS</div>
                {profile.certifications.slice(0, 3).map((c, i) => (
                  <div key={i} style={{ fontSize: '0.75rem', color: '#374151' }}>🏅 {c.slice(0, 60)}</div>
                ))}
              </div>
            )}
          </div>

          {/* Links */}
          {Object.keys(profile.links || {}).length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {profile.links.linkedin && <a href={profile.links.linkedin} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#0369a1' }}>🔗 LinkedIn</a>}
              {profile.links.github   && <a href={profile.links.github}   target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#0369a1' }}>🐙 GitHub</a>}
              {profile.links.portfolio && <a href={profile.links.portfolio} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#0369a1' }}>🌐 Portfolio</a>}
            </div>
          )}

          {/* Quality indicators */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.72rem', color: '#64748b' }}>
            <span>Extraction confidence: <strong style={{ color: '#374151' }}>{profile.extractionConfidence || 0}%</strong></span>
            <span>Resume quality: <strong style={{ color: '#374151' }}>{profile.resumeQualityScore || 0}%</strong></span>
          </div>

          {profile.missingImportantFields?.length > 0 && (
            <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#ea580c' }}>
              ⚠️ Missing fields: {profile.missingImportantFields.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {result.status !== 'saved' ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={() => onSave(result)}
            disabled={saving}
            style={{ flex: 1, background: 'linear-gradient(135deg, #4f8ef7, #38d9a9)', border: 'none', borderRadius: 9, padding: '0.5rem', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : '+ Save to Candidate Pool'}
          </button>
          <button
            onClick={() => onEdit(result)}
            style={{ padding: '0.5rem 0.9rem', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.82rem', color: '#475569', cursor: 'pointer', fontWeight: 500 }}
          >
            Edit
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10, color: '#16a34a', fontWeight: 700, fontSize: '0.85rem' }}>✅ Added to candidate pool</div>
      )}
    </article>
  );
};

// ── Edit Modal ────────────────────────────────────────────────────────────────
const EditModal = ({ result, onClose, onConfirm }) => {
  const [profile, setProfile] = useState({ ...result.profile });
  const [skillInput, setSkillInput] = useState(
    Object.entries(result.profile.skillScores || {}).map(([k, v]) => `${k}:${v}`).join(', ')
  );
  const set = (field, val) => setProfile((p) => ({ ...p, [field]: val }));

  const handleSave = () => {
    const skillScores = {};
    skillInput.split(',').forEach((part) => {
      const [name, score] = part.split(':');
      const n = (name || '').trim();
      const s = parseFloat((score || '').trim());
      if (n && !isNaN(s)) skillScores[n] = Math.min(10, Math.max(0, s));
    });
    onConfirm({ ...result, profile: { ...profile, skillScores, skills: Object.keys(skillScores).join(', ') } });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Edit Extracted Profile</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-row">
            <div><label>Full Name</label><input value={profile.name||''} onChange={(e)=>set('name',e.target.value)} /></div>
            <div><label>Email</label><input value={profile.email||''} onChange={(e)=>set('email',e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div><label>Role</label><input value={profile.role||''} onChange={(e)=>set('role',e.target.value)} /></div>
            <div><label>Department</label><input value={profile.department||''} onChange={(e)=>set('department',e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div><label>Experience (yrs)</label><input type="number" min="0" value={profile.experience||0} onChange={(e)=>set('experience',parseFloat(e.target.value)||0)} /></div>
            <div><label>Performance (0-10)</label><input type="number" min="0" max="10" step="0.1" value={profile.performanceRating||0} onChange={(e)=>set('performanceRating',parseFloat(e.target.value)||0)} /></div>
          </div>
          <div className="form-row">
            <div><label>Phone</label><input value={profile.phone||''} onChange={(e)=>set('phone',e.target.value)} /></div>
            <div><label>Availability</label>
              <select value={profile.availability||'Available'} onChange={(e)=>set('availability',e.target.value)}>
                {['Available','Busy','On Leave','Unavailable'].map((a)=><option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label>Skill Scores (SkillName:Score, ...)</label>
            <input value={skillInput} onChange={(e)=>setSkillInput(e.target.value)} placeholder="Python:8, React:7, SQL:6" />
            <p className="helper-text">Comma-separated. Score 0–10.</p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 9, padding: '0.55rem 1.25rem', cursor: 'pointer', color: '#475569' }}>Cancel</button>
          <button onClick={handleSave} style={{ background: 'linear-gradient(135deg, #4f8ef7, #38d9a9)', border: 'none', borderRadius: 9, padding: '0.55rem 1.5rem', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save & Add</button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ResumeUpload = () => {
  const [apiStatus,   setApiStatus]   = useState('checking');
  const [jdText,      setJdText]      = useState('');
  const [jdFile,      setJdFile]      = useState(null);
  const [jd,          setJd]          = useState(null);
  const [jdParsing,   setJdParsing]   = useState(false);
  const [files,       setFiles]       = useState([]);
  const [results,     setResults]     = useState([]);
  const [processing,  setProcessing]  = useState(false);
  const [savingId,    setSavingId]    = useState(null);
  const [editTarget,  setEditTarget]  = useState(null);
  const [dragOver,    setDragOver]    = useState(false);
  const [jdTab,       setJdTab]       = useState('paste'); // 'paste' | 'upload'
  const resumeRef = useRef(null);
  const jdFileRef = useRef(null);

  useEffect(() => {
    checkResumeApiHealth().then((res) => setApiStatus(res.status === 'ok' ? 'online' : 'offline'));
  }, []);

  // ── JD handlers ──
  const handleParseJD = async () => {
    if (!jdText.trim() && !jdFile) { toast.error('Paste JD text or upload a JD file first.'); return; }
    if (apiStatus !== 'online')    { toast.error('Resume API is offline. Start resume_api.py on port 5001.'); return; }
    setJdParsing(true);
    try {
      const res = await parseJD(jdText.trim() || null, jdFile || null);
      setJd(res.jobDescription);
      toast.success(`JD parsed: ${res.jobDescription.totalSkillsRequired || 0} skills, ${res.jobDescription.minimumExperience || 0} yrs exp`);
    } catch (err) {
      toast.error('JD parsing failed: ' + err.message);
    } finally {
      setJdParsing(false);
    }
  };

  // ── Resume file handlers ──
  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming).filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return ACCEPTED.includes(ext) && f.size <= MAX_MB * 1024 * 1024;
    });
    if (!valid.length) { toast.error('No valid files. Use PDF, DOCX, or TXT under 10 MB.'); return; }
    setFiles((prev) => [...prev, ...valid.slice(0, MAX_FILES - prev.length)]);
  }, []);

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); };
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  // ── Extract + Match ──
  const processAll = async () => {
    if (!files.length) { toast.error('Add at least one resume file.'); return; }
    if (apiStatus !== 'online') { toast.error('Resume API is offline. Start resume_api.py on port 5001.'); return; }

    setProcessing(true);
    setResults([]);
    try {
      const res = await extractAndMatch(files, jdText.trim() || null, jdFile || null);
      if (res.jobDescription && !jd) setJd(res.jobDescription);
      const withStatus = (res.results || []).map((r) => ({ ...r, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, status: r.success ? 'done' : 'error' }));
      setResults(withStatus);
      toast.success(`Extracted ${res.successful}/${res.total} resumes${res.hasJD ? ' with JD matching' : ''}`);
    } catch (err) {
      toast.error('Extraction failed: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const saveCandidate = (result) => {
    setSavingId(result.id);
    const entry = addCandidate({ profile: result.profile, matchAnalysis: result.matchAnalysis, filename: result.filename });
    if (!entry) {
      toast.error(`${result.profile?.name || 'Candidate'} is already in the pool (duplicate email).`);
      setSavingId(null);
      return;
    }
    setResults((prev) => prev.map((r) => r.id === result.id ? { ...r, status: 'saved' } : r));
    toast.success(`${result.profile.name} added to candidate pool`);
    setSavingId(null);
  };

  const saveAll = () => {
    results.filter((r) => r.status === 'done').forEach(saveCandidate);
  };

  const handleEditConfirm = (updated) => {
    setEditTarget(null);
    setResults((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    saveCandidate(updated);
  };

  const doneCount  = results.filter((r) => r.status === 'done').length;
  const savedCount = results.filter((r) => r.status === 'saved').length;
  const errCount   = results.filter((r) => r.status === 'error').length;

  return (
    <>
      <header className="header">
        <div>
          <h1>Resume Extraction &amp; JD Matching</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
            Parse a Job Description → Upload resumes → AI extracts, matches, and ranks candidates
          </p>
        </div>
        <span className={`chip ${apiStatus === 'online' ? 'good' : apiStatus === 'offline' ? 'bad' : 'warn'}`}>
          {apiStatus === 'online' ? '🟢 API Online' : apiStatus === 'offline' ? '🔴 API Offline' : '⏳ Checking…'}
        </span>
      </header>

      {apiStatus === 'offline' && (
        <div className="message error">Resume API not running. Start with: <strong>python resume_api.py</strong> (port 5001)</div>
      )}

      {/* ── Stats ── */}
      <div className="cards">
        <div className="card blue"><h3>📋 JD Status</h3><p>{jd ? 'Loaded ✓' : 'Not set'}</p></div>
        <div className="card blue"><h3>📁 Resumes</h3><p>{files.length}</p></div>
        <div className="card green"><h3>✅ Extracted</h3><p>{doneCount + savedCount}</p></div>
        <div className="card orange">
          <h3>💾 Saved to Pool</h3>
          <p>{savedCount}</p>
          {savedCount > 0 && (
            <Link to="/candidate-pool" style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, display: 'block', marginTop: 4 }}>
              View Pool →
            </Link>
          )}
        </div>
      </div>

      {/* ── Step 1: Job Description ── */}
      <section className="panel panel-strong">
        <div className="section-title-row">
          <div>
            <h2 className="formation-title">Step 1 — Job Description</h2>
            <p className="helper-text">Paste JD text or upload a JD file. Used to rank and match candidates.</p>
          </div>
          {jd && <span className="chip good">✅ JD Loaded</span>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {['paste', 'upload'].map((tab) => (
            <button
              key={tab}
              onClick={() => setJdTab(tab)}
              style={{ background: jdTab === tab ? '#4f8ef7' : '#f1f5f9', color: jdTab === tab ? '#fff' : '#475569', border: 'none', borderRadius: 8, padding: '0.4rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
            >
              {tab === 'paste' ? '📝 Paste Text' : '📂 Upload File'}
            </button>
          ))}
        </div>

        {jdTab === 'paste' ? (
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the full Job Description here…&#10;&#10;Example:&#10;We are hiring a Senior Backend Developer with 3+ years of experience in Java, Spring Boot, MySQL. Strong knowledge of REST APIs, Docker, and Microservices required. Good to have: Kubernetes, AWS."
            rows={7}
            style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.88rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
          />
        ) : (
          <div>
            <input
              ref={jdFileRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.[0]) setJdFile(e.target.files[0]); }}
            />
            <div
              onClick={() => jdFileRef.current?.click()}
              style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', color: '#64748b', fontSize: '0.88rem' }}
            >
              {jdFile ? `📄 ${jdFile.name}` : 'Click to upload JD file (PDF, DOCX, TXT)'}
            </div>
            {jdFile && <button onClick={() => setJdFile(null)} style={{ marginTop: 8, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>Remove file</button>}
          </div>
        )}

        <button
          onClick={handleParseJD}
          disabled={jdParsing || (!jdText.trim() && !jdFile)}
          style={{ marginTop: 12, background: 'linear-gradient(135deg, #4f8ef7, #38d9a9)', border: 'none', borderRadius: 10, padding: '0.6rem 1.5rem', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', opacity: jdParsing ? 0.7 : 1 }}
        >
          {jdParsing ? '⏳ Parsing JD…' : '🔍 Parse Job Description'}
        </button>

        {jd && <JDSummaryCard jd={jd} onClear={() => { setJd(null); setJdText(''); setJdFile(null); }} />}
      </section>

      {/* ── Step 2: Upload Resumes ── */}
      <section className="panel panel-strong">
        <div className="section-title-row">
          <div>
            <h2 className="formation-title">Step 2 — Upload Resumes</h2>
            <p className="helper-text">PDF, DOCX, or TXT · max {MAX_MB} MB · up to {MAX_FILES} files</p>
          </div>
        </div>

        <div
          className={`resume-dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => resumeRef.current?.click()}
        >
          <input ref={resumeRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
          <div className="resume-dropzone-icon">📂</div>
          <h3>Drop resumes here or click to browse</h3>
          <p>Supports PDF, DOCX, TXT</p>
        </div>

        {files.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="resume-file-list">
              {files.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="resume-file-row">
                  <span className="resume-file-icon">{fileIcon(file.name)}</span>
                  <div className="resume-file-info"><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB</span></div>
                  <button onClick={() => removeFile(idx)} style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, color: '#ef4444', fontSize: '0.75rem', padding: '2px 8px', cursor: 'pointer' }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Step 3: Extract & Match ── */}
      <section className="panel panel-strong">
        <div className="section-title-row">
          <div>
            <h2 className="formation-title">Step 3 — Extract &amp; Match</h2>
            <p className="helper-text">{jd ? '✅ JD loaded — candidates will be scored and ranked' : '⚠️ No JD — candidates will be extracted without ranking'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {doneCount > 0 && (
              <button onClick={saveAll} disabled={processing} style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 9, padding: '0.5rem 1.1rem', color: '#16a34a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                💾 Save All ({doneCount})
              </button>
            )}
            <button
              onClick={processAll}
              disabled={processing || !files.length}
              style={{ background: 'linear-gradient(135deg, #4f8ef7, #38d9a9)', border: 'none', borderRadius: 9, padding: '0.5rem 1.5rem', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', opacity: (processing || !files.length) ? 0.6 : 1 }}
            >
              {processing ? <><span className="loading-spinner" />Extracting…</> : `⚡ Extract${jd ? ' & Match' : ''} (${files.length})`}
            </button>
            {results.length > 0 && (
              <button onClick={() => { setResults([]); setFiles([]); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: 9, padding: '0.5rem 1rem', color: '#64748b', fontWeight: 500, fontSize: '0.85rem', cursor: 'pointer' }}>Clear</button>
            )}
          </div>
        </div>
      </section>

      {/* ── Results ── */}
      {results.length > 0 && (
        <section className="panel panel-strong">
          <div className="section-title-row">
            <div>
              <h2 className="formation-title">
                {jd ? '🏆 Ranked Candidates' : '📋 Extracted Profiles'}
              </h2>
              <p className="helper-text">
                {results.filter((r) => r.success).length} candidates · {savedCount} saved
                {jd ? ` · sorted by JD match score` : ''}
              </p>
            </div>
          </div>

          {/* Error results */}
          {results.filter((r) => !r.success).map((r, i) => (
            <div key={i} style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: '0.7rem 1rem', marginBottom: 8, fontSize: '0.82rem', color: '#dc2626' }}>
              ❌ <strong>{r.filename}</strong>: {r.error}
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginTop: 12 }}>
            {results.filter((r) => r.success).map((result) => (
              <CandidateCard
                key={result.id}
                result={result}
                onSave={saveCandidate}
                onEdit={(r) => setEditTarget(r)}
                saving={savingId === result.id}
                hasJD={!!jd}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Edit Modal ── */}
      {editTarget && (
        <EditModal
          result={editTarget}
          onClose={() => setEditTarget(null)}
          onConfirm={handleEditConfirm}
        />
      )}
    </>
  );
};

export default ResumeUpload;
