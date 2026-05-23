import React, { useRef, useState } from 'react';
import { createEmployees, getEmployees } from '../utils/api';
import { downloadCSV, parseCSV } from '../utils/csvParser';
import { toast } from '../utils/toast';

const REQUIRED_HEADERS = [
  'Employee ID',
  'Name',
  'Skills',
  'Skill Scores',
  'Skill Level',
  'Experience (years)',
  'Category',
  'Availability',
  'Performance Rating',
  'Department',
  'Role',
];

const normalizeHeader = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const HEADER_ALIASES = {
  'employee id': 'Employee ID',
  employee_id: 'Employee ID',
  employeeid: 'Employee ID',
  id: 'Employee ID',
  name: 'Name',
  skills: 'Skills',
  'skill scores': 'Skill Scores',
  skill_scores: 'Skill Scores',
  skillscore: 'Skill Scores',
  'skill level': 'Skill Level',
  skill_level: 'Skill Level',
  skilllevel: 'Skill Level',
  level: 'Skill Level',
  experience: 'Experience (years)',
  'experience (years)': 'Experience (years)',
  years: 'Experience (years)',
  category: 'Category',
  availability: 'Availability',
  'performance rating': 'Performance Rating',
  performance_rating: 'Performance Rating',
  performancerating: 'Performance Rating',
  rating: 'Performance Rating',
  department: 'Department',
  role: 'Role',
};

const validateHeaderFormat = (headerLine) => {
  const actualHeaders = headerLine.split(',').map((h) => h.trim());
  const normalizedActual = actualHeaders.map((header) => normalizeHeader(header));
  const canonicalActual = normalizedActual.map((header) => HEADER_ALIASES[header] || null);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !canonicalActual.includes(header));
  const invalidHeaders = actualHeaders.filter((header, index) => !canonicalActual[index]);

  if (missingHeaders.length > 0 || invalidHeaders.length > 0) {
    const parts = [];
    if (invalidHeaders.length > 0) {
      parts.push(`Invalid column name(s): ${invalidHeaders.join(', ')}`);
    }
    if (missingHeaders.length > 0) {
      parts.push(`Missing required column(s): ${missingHeaders.join(', ')}`);
    }
    parts.push(`Expected columns: ${REQUIRED_HEADERS.join(', ')}`);
    return parts.join('. ');
  }

  if (actualHeaders.length !== REQUIRED_HEADERS.length) {
    return `Invalid column count. Expected ${REQUIRED_HEADERS.length} columns but got ${actualHeaders.length}. Expected columns: ${REQUIRED_HEADERS.join(', ')}`;
  }

  return '';
};

const CandidateImport = () => {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleDownloadTemplate = () => {
    const templateRows = [
      REQUIRED_HEADERS.join(','),
      'EMP001,John Doe,"React,Node.js,SQL","React:8, Node.js:7, SQL:6",8,4,Full-time,Available,8.6,Engineering,Frontend Developer',
      'EMP002,Jane Smith,"Python,ML,Statistics","Python:9, ML:8, Statistics:9",9,5,Full-time,Available,9.1,Data,ML Engineer',
    ];
    downloadCSV(templateRows.join('\n'), 'candidate_import_template.csv');
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file only.');
      setMessage('');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = String(e.target?.result || '');
        const lines = content.split('\n').filter((line) => line.trim());
        if (lines.length < 2) {
          throw new Error('CSV must contain header and at least one data row.');
        }

        const headerError = validateHeaderFormat(lines[0]);
        if (headerError) {
          throw new Error(headerError);
        }

        const candidates = parseCSV(content);
        if (candidates.length === 0) {
          throw new Error('No valid candidate records found in CSV.');
        }

        const before = await getEmployees();
        const existingIds = new Set(
          before
            .map((emp) => String(emp?.employeeId || emp?.id || '').toLowerCase())
            .filter(Boolean)
        );

        const seenInFile = new Set();
        const deduped = candidates.filter((candidate) => {
          const candidateId = String(candidate?.employeeId || '').toLowerCase();
          if (!candidateId) return true;
          if (seenInFile.has(candidateId)) return false;
          seenInFile.add(candidateId);
          return !existingIds.has(candidateId);
        });

        if (deduped.length === 0) {
          setMessage('All candidates in the file already exist. Nothing to import.');
          toast.success('All candidates already exist. Nothing imported.');
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          return;
        }

        const created = await createEmployees(deduped);
        const after = await getEmployees();
        const createdCount = Math.max(created.length, after.length - before.length);
        if (createdCount <= 0) {
          throw new Error('Candidates were not saved. Please check employee backend connection.');
        }
        const skipped = candidates.length - deduped.length;
        const successText =
          skipped > 0
            ? `Imported ${createdCount} candidate(s). Skipped ${skipped} duplicate(s).`
            : `Imported ${createdCount} candidate(s) successfully.`;
        setMessage(successText);
        toast.success(successText);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (uploadError) {
        const errText = uploadError.message || 'Import failed.';
        setError(errText);
        toast.error(errText);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setLoading(false);
      setError('Failed to read the selected file.');
    };

    reader.readAsText(file);
  };

  return (
    <>
      <header className="header">
        <h1>Candidate Import</h1>
        <div className="user">Admin User</div>
      </header>

      <section className="hero-strip">
        <div className="hero-copy">
          <span className="eyebrow">Bulk Import</span>
          <h2>Upload structured employee records in one pass.</h2>
          <p>
            Validate the CSV format, avoid duplicates, and push clean candidate profiles into the
            same skill-based workspace used for team generation.
          </p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span>Required Columns</span>
            <strong>{REQUIRED_HEADERS.length}</strong>
          </div>
          <div className="hero-stat">
            <span>Accepted Format</span>
            <strong>CSV</strong>
          </div>
          <div className="hero-stat">
            <span>Duplicate Check</span>
            <strong>Enabled</strong>
          </div>
        </div>
      </section>

      <section className="config-grid">
        <article className="panel panel-strong">
          <h2>CSV Upload</h2>
          <p>Import candidates using the exact format shown on the right panel.</p>
          <div className="import-actions compact">
            <input
              ref={fileInputRef}
              className="input-control"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={loading}
            />
            <button type="button" className="btn btn-neutral" onClick={handleDownloadTemplate}>
              Download Template
            </button>
          </div>
          {loading && <div className="message success">Uploading and validating CSV...</div>}
          {message && <div className="message success">{message}</div>}
          {error && <div className="message error">{error}</div>}
        </article>

        <article className="panel panel-strong">
          <h2>Required Format</h2>
          <p>Headers can use common aliases, but these are the canonical column names:</p>
          <div className="format-list">
            {REQUIRED_HEADERS.map((header, index) => (
              <div className="format-item" key={header}>
                <span>{index + 1}.</span>
                <strong>{header}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
};

export default CandidateImport;
