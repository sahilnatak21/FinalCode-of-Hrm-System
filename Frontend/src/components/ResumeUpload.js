import React, { useCallback, useEffect, useRef, useState } from 'react';
import { checkResumeApiHealth, createEmployee, extractResumesBatch } from '../utils/api';
import { toast } from '../utils/toast';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const ACCEPTED = ['.pdf', '.docx', '.doc', '.txt'];
const MAX_FILES = 20;
const MAX_MB = 10;

const fileIcon = (name = '') => {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf')  return '📄';
  if (ext === 'docx' || ext === 'doc') return '📝';
  return '📃';
};

const statusColor = (status) => {
  if (status === 'done')    return '#dcfce7';
  if (status === 'error')   return '#fee2e2';
  if (status === 'loading') return '#dbeafe';
  if (status === 'saved')   return '#f0fdf4';
  return '#f8fafc';
};

const statusText = (status) => {
  if (status === 'done')    return '✅ Extracted';
  if (status === 'error')   return '❌ Failed';
  if (status === 'loading') return '⏳ Processing…';
  if (status === 'saved')   return '💾 Added to Candidates';
  return '⏸ Pending';
};

/* ── SkillBar ─────────────────────────────────────────────────────────────── */
const SkillBar = ({ name, score }) => (
  <div className="resume-skill-row">
    <span className="resume-skill-name">{name}</span>
    <div className="member-bar-track">
      <div className="member-bar-fill skill" style={{ width: `${(score / 10) * 100}%` }} />
    </div>
    <span className="resume-skill-score">{score}/10</span>
  </div>
);

/* ── ProfileCard ──────────────────────────────────────────────────────────── */
const ProfileCard = ({ result, onSave, onEdit, saving }) => {
  const { profile } = result;
  const skills = Object.entries(profile.skillScores || {}).slice(0, 8);

  return (
    <article className="resume-profile-card" style={{ background: statusColor(result.status) }}>
      <div className="resume-profile-header">
        <div className="resume-profile-avatar">
          {(profile.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="resume-profile-meta">
          <h3>{profile.name || 'Unknown'}</h3>
          <span>{profile.role || 'Role not detected'}</span>
          <span>{profile.department || ''}</span>
        </div>
        <div className="resume-profile-status">
          <span className="chip info" style={{ fontSize: '0.7rem' }}>{statusText(result.status)}</span>
        </div>
      </div>

      <div className="resume-profile-stats">
        <div className="resume-stat"><span>Experience</span><strong>{profile.experience || 0} yrs</strong></div>
        <div className="resume-stat"><span>Skill Level</span><strong>{profile.skillLevel || 0}/10</strong></div>
        <div className="resume-stat"><span>Performance</span><strong>{profile.performanceRating || 0}/10</strong></div>
        <div className="resume-stat"><span>Skills Found</span><strong>{Object.keys(profile.skillScores || {}).length}</strong></div>
      </div>

      {profile.email && (
        <div className="resume-contact">
          <span>📧 {profile.email}</span>
          {profile.phone && <span>📞 {profile.phone}</span>}
        </div>
      )}

      {skills.length > 0 && (
        <div className="resume-skills-section">
          <p className="resume-skills-label">Detected Skills</p>
          {skills.map(([name, score]) => (
            <SkillBar key={name} name={name} score={score} />
          ))}
          {Object.keys(profile.skillScores || {}).length > 8 && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              +{Object.keys(profile.skillScores).length - 8} more skills detected
            </p>
          )}
        </div>
      )}

      {profile.education && (
        <p className="resume-education">🎓 {profile.education}</p>
      )}

      {result.status === 'done' && (
        <div className="resume-card-actions">
          <button
            type="button"
            className="btn btn-success"
            onClick={() => onSave(result)}
            disabled={saving}
          >
            {saving ? <><span className="loading-spinner" />Saving…</> : '+ Add to Candidates'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => onEdit(result)}>
            Edit Profile
          </button>
        </div>
      )}
      {result.status === 'saved' && (
        <p style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.875rem', marginTop: 10 }}>
          ✅ Successfully added to candidate pool
        </p>
      )}
      {result.status === 'error' && (
        <p style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 8 }}>
          {result.error || 'Extraction failed'}
        </p>
      )}
    </article>
  );
};

/* ── EditModal ────────────────────────────────────────────────────────────── */
const EditModal = ({ result, onClose, onConfirm }) => {
  const [profile, setProfile] = useState({ ...result.profile });
  const [skillInput, setSkillInput] = useState(
    Object.entries(result.profile.skillScores || {})
      .map(([k, v]) => `${k}:${v}`)
      .join(', ')
  );

  const set = (field, value) => setProfile((p) => ({ ...p, [field]: value }));

  const handleSave = () => {
    // Parse skill input back to object
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
    <div className="resume-modal-overlay" onClick={onClose}>
      <div className="resume-modal" onClick={(e) => e.stopPropagation()}>
        <div className="resume-modal-header">
          <h2>Edit Extracted Profile</h2>
          <button type="button" className="btn btn-outline" onClick={onClose}>✕</button>
        </div>
        <div className="resume-modal-body">
          <div className="form-row">
            <div><label>Full Name</label><input value={profile.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
            <div><label>Employee ID</label><input value={profile.employeeId || ''} onChange={(e) => set('employeeId', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div><label>Role</label><input value={profile.role || ''} onChange={(e) => set('role', e.target.value)} /></div>
            <div><label>Department</label><input value={profile.department || ''} onChange={(e) => set('department', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div><label>Experience (years)</label><input type="number" min="0" value={profile.experience || 0} onChange={(e) => set('experience', parseFloat(e.target.value) || 0)} /></div>
            <div><label>Performance Rating (0-10)</label><input type="number" min="0" max="10" step="0.1" value={profile.performanceRating || 0} onChange={(e) => set('performanceRating', parseFloat(e.target.value) || 0)} /></div>
          </div>
          <div className="form-row">
            <div><label>Skill Level (0-10)</label><input type="number" min="0" max="10" step="0.1" value={profile.skillLevel || 0} onChange={(e) => set('skillLevel', parseFloat(e.target.value) || 0)} /></div>
            <div>
              <label>Availability</label>
              <select value={profile.availability || 'Available'} onChange={(e) => set('availability', e.target.value)}>
                {['Available','Busy','On Leave','Unavailable'].map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label>Skill Scores (format: SkillName:Score, ...)</label>
            <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="Python:8, React:7, SQL:6" />
            <p className="helper-text">Separate skills with commas. Score must be 0-10.</p>
          </div>
          <div className="form-row">
            <div><label>Email</label><input value={profile.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
            <div><label>Phone</label><input value={profile.phone || ''} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>
        </div>
        <div className="resume-modal-footer">
          <button type="button" className="btn btn-neutral" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-success" onClick={handleSave}>Save & Add to Candidates</button>
        </div>
      </div>
    </div>
  );
};

/* ── Main ResumeUpload component ──────────────────────────────────────────── */
const ResumeUpload = () => {
  const [apiStatus, setApiStatus]   = useState('checking'); // checking | online | offline
  const [files, setFiles]           = useState([]);         // { id, file, status, profile, error }
  const [processing, setProcessing] = useState(false);
  const [savingId, setSavingId]     = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [dragOver, setDragOver]     = useState(false);
  const inputRef = useRef(null);

  // Check if resume API is running
  useEffect(() => {
    checkResumeApiHealth().then((res) => {
      setApiStatus(res.status === 'ok' ? 'online' : 'offline');
    });
  }, []);

  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming).filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return ACCEPTED.includes(ext) && f.size <= MAX_MB * 1024 * 1024;
    });
    if (valid.length === 0) {
      toast.error('No valid files. Use PDF, DOCX, or TXT under 10 MB.');
      return;
    }
    const entries = valid.slice(0, MAX_FILES - files.length).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      status: 'pending',
      profile: null,
      error: null,
    }));
    setFiles((prev) => [...prev, ...entries]);
  }, [files.length]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const processAll = async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;
    if (apiStatus !== 'online') {
      toast.error('Resume extraction service is offline. Start resume_api.py on port 5001.');
      return;
    }

    setProcessing(true);
    // Mark all pending as loading
    setFiles((prev) => prev.map((f) => f.status === 'pending' ? { ...f, status: 'loading' } : f));

    try {
      const rawFiles = pending.map((f) => f.file);
      const batchResult = await extractResumesBatch(rawFiles);

      setFiles((prev) => prev.map((entry) => {
        if (entry.status !== 'loading') return entry;
        const match = batchResult.results.find((r) => r.filename === entry.file.name);
        if (!match) return { ...entry, status: 'error', error: 'No result returned' };
        if (match.success) return { ...entry, status: 'done', profile: match.profile };
        return { ...entry, status: 'error', error: match.error || 'Extraction failed' };
      }));

      toast.success(`Extracted ${batchResult.successful}/${batchResult.total} resumes`);
    } catch (err) {
      setFiles((prev) => prev.map((f) => f.status === 'loading' ? { ...f, status: 'error', error: err.message } : f));
      toast.error('Batch extraction failed: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const saveProfile = async (result) => {
    setSavingId(result.id);
    try {
      await createEmployee(result.profile);
      setFiles((prev) => prev.map((f) => f.id === result.id ? { ...f, status: 'saved' } : f));
      toast.success(`${result.profile.name} added to candidates`);
    } catch (err) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSavingId(null);
    }
  };

  const saveAll = async () => {
    const toSave = files.filter((f) => f.status === 'done');
    for (const result of toSave) {
      await saveProfile(result);
    }
  };

  const handleEditConfirm = async (updated) => {
    setEditTarget(null);
    setFiles((prev) => prev.map((f) => f.id === updated.id ? updated : f));
    await saveProfile(updated);
  };

  const doneCount  = files.filter((f) => f.status === 'done').length;
  const savedCount = files.filter((f) => f.status === 'saved').length;
  const errCount   = files.filter((f) => f.status === 'error').length;

  return (
    <>
      <header className="header">
        <div>
          <h1>Resume Extraction</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: 2 }}>
            Upload PDF or DOCX resumes — AI extracts skills, experience, and role automatically
          </p>
        </div>
        <div className="header-actions">
          <span className={`chip ${apiStatus === 'online' ? 'good' : apiStatus === 'offline' ? 'bad' : 'warn'}`}>
            {apiStatus === 'online' ? '🟢 API Online' : apiStatus === 'offline' ? '🔴 API Offline' : '⏳ Checking…'}
          </span>
        </div>
      </header>

      {apiStatus === 'offline' && (
        <div className="message error">
          Resume extraction service is not running. Start it with: <strong>python resume_api.py</strong> (port 5001)
        </div>
      )}

      {/* ── Stats strip ── */}
      <div className="cards">
        <div className="card blue"><h3>📁 Files Queued</h3><p>{files.length}</p></div>
        <div className="card green"><h3>✅ Extracted</h3><p>{doneCount + savedCount}</p></div>
        <div className="card orange"><h3>💾 Added to Pool</h3><p>{savedCount}</p></div>
        <div className="card blue"><h3>❌ Failed</h3><p>{errCount}</p></div>
      </div>

      {/* ── Drop zone ── */}
      <section
        className={`resume-dropzone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" onChange={handleFileInput} style={{ display: 'none' }} />
        <div className="resume-dropzone-icon">📂</div>
        <h3>Drop resumes here or click to browse</h3>
        <p>Supports PDF, DOCX, TXT · Max {MAX_MB} MB per file · Up to {MAX_FILES} files</p>
      </section>

      {/* ── File queue ── */}
      {files.length > 0 && (
        <section className="panel panel-strong">
          <div className="section-title-row">
            <div>
              <h2 className="formation-title">Upload Queue</h2>
              <p className="helper-text">{files.length} file(s) — {files.filter((f) => f.status === 'pending').length} pending</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {doneCount > 0 && (
                <button type="button" className="btn btn-success" onClick={saveAll} disabled={processing}>
                  💾 Save All ({doneCount})
                </button>
              )}
              <button type="button" className="btn" onClick={processAll} disabled={processing || files.filter((f) => f.status === 'pending').length === 0}>
                {processing ? <><span className="loading-spinner" />Extracting…</> : `⚡ Extract All (${files.filter((f) => f.status === 'pending').length})`}
              </button>
              <button type="button" className="btn btn-neutral" onClick={() => setFiles([])}>Clear All</button>
            </div>
          </div>

          <div className="resume-file-list">
            {files.map((entry) => (
              <div key={entry.id} className="resume-file-row" style={{ background: statusColor(entry.status) }}>
                <span className="resume-file-icon">{fileIcon(entry.file.name)}</span>
                <div className="resume-file-info">
                  <strong>{entry.file.name}</strong>
                  <span>{(entry.file.size / 1024).toFixed(1)} KB</span>
                </div>
                <span className="chip info" style={{ fontSize: '0.7rem' }}>{statusText(entry.status)}</span>
                {entry.status === 'pending' && (
                  <button type="button" className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => removeFile(entry.id)}>Remove</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Extracted profiles ── */}
      {files.some((f) => f.status === 'done' || f.status === 'saved') && (
        <section className="panel panel-strong">
          <div className="section-title-row">
            <div><h2 className="formation-title">Extracted Profiles</h2><p className="helper-text">Review, edit, and add candidates to the pool.</p></div>
          </div>
          <div className="resume-profiles-grid">
            {files.filter((f) => f.status === 'done' || f.status === 'saved').map((result) => (
              <ProfileCard
                key={result.id}
                result={result}
                onSave={saveProfile}
                onEdit={(r) => setEditTarget(r)}
                saving={savingId === result.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Edit modal ── */}
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
