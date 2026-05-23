// API service for backend communication
import {
  getEmployees as getEmployeesLocal,
  addEmployee as addEmployeeLocal,
  addEmployees as addEmployeesLocal,
  deleteEmployee as deleteEmployeeLocal,
  saveEmployees as saveEmployeesLocal,
  updateEmployee as updateEmployeeLocal,
} from './storage';

const EMPLOYEE_API_BASE_URL =
  process.env.REACT_APP_EMPLOYEE_API_URL || 'http://localhost:8080/api/employees';
const TEAM_API_BASE_URL = process.env.REACT_APP_TEAM_API_URL || 'http://localhost:5000/api/team';
const ML_API_BASE_URL = process.env.REACT_APP_ML_API_URL || 'http://localhost:5000/api/ml';
const FORMED_TEAM_API_BASE_URL =
  process.env.REACT_APP_FORMED_TEAM_API_URL || 'http://localhost:8080/api/teams';
const RESUME_API_BASE_URL =
  process.env.REACT_APP_RESUME_API_URL || 'http://localhost:5001/api/resume';

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

const isNetworkError = (error) =>
  String(error?.message || '').toLowerCase().includes('failed to fetch') ||
  String(error?.message || '').toLowerCase().includes('networkerror');

const employeeKey = (emp) =>
  String(emp?.employeeId || emp?.id || `${emp?.name || ''}-${emp?.role || ''}` || '').toLowerCase();

const mergeEmployees = (primary = [], secondary = []) => {
  const merged = [];
  const seen = new Set();
  [...primary, ...secondary].forEach((emp) => {
    const key = employeeKey(emp);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(emp);
  });
  return merged;
};

// Employee APIs
export const getEmployees = async () => {
  try {
    const response = await fetch(EMPLOYEE_API_BASE_URL);
    const remote = await handleResponse(response);
    const local = getEmployeesLocal();
    const merged = mergeEmployees(remote, local);
    saveEmployeesLocal(merged);
    return merged;
  } catch (error) {
    if (isNetworkError(error)) {
      return getEmployeesLocal();
    }
    throw error;
  }
};

export const getEmployeeById = async (id) => {
  const response = await fetch(`${EMPLOYEE_API_BASE_URL}/${id}`);
  return handleResponse(response);
};

export const createEmployee = async (employeeData) => {
  try {
    const response = await fetch(EMPLOYEE_API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(employeeData),
    });
    const created = await handleResponse(response);
    const local = getEmployeesLocal();
    const merged = mergeEmployees([created], local);
    saveEmployeesLocal(merged);
    return created;
  } catch (error) {
    if (isNetworkError(error)) {
      return addEmployeeLocal(employeeData);
    }
    throw error;
  }
};

export const createEmployees = async (employeesList) => {
  try {
    const results = await Promise.allSettled(employeesList.map((emp) => createEmployee(emp)));
    const successful = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failed = results.filter((r) => r.status === 'rejected');

    if (failed.length > 0 && successful.length === 0) {
      const firstError = failed[0]?.reason?.message || 'Unable to create employees.';
      throw new Error(firstError);
    }

    if (failed.length > 0 && successful.length > 0) {
      console.warn(`${failed.length} employees failed to create`);
    }

    return successful;
  } catch (error) {
    if (isNetworkError(error)) {
      return addEmployeesLocal(employeesList);
    }
    throw error;
  }
};

export const updateEmployee = async (id, employeeData) => {
  try {
    const response = await fetch(`${EMPLOYEE_API_BASE_URL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(employeeData),
    });
    return handleResponse(response);
  } catch (error) {
    if (isNetworkError(error)) {
      const updated = updateEmployeeLocal(id, employeeData);
      return updated.find((emp) => emp.id === id || emp.employeeId === id) || { ...employeeData, id };
    }
    throw error;
  }
};

export const deleteEmployee = async (id) => {
  try {
    const response = await fetch(`${EMPLOYEE_API_BASE_URL}/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }
    deleteEmployeeLocal(id);
    return true;
  } catch (error) {
    if (isNetworkError(error)) {
      deleteEmployeeLocal(id);
      return true;
    }
    throw error;
  }
};

// Team configuration + generation APIs (Python service)
export const getTeamConfig = async () => {
  const response = await fetch(`${TEAM_API_BASE_URL}/config`);
  return handleResponse(response);
};

export const saveTeamConfig = async (configData) => {
  const response = await fetch(`${TEAM_API_BASE_URL}/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(configData),
  });
  return handleResponse(response);
};

export const generateTeamWithAI = async (payload) => {
  const response = await fetch(`${ML_API_BASE_URL}/team-formation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const saveFormedTeam = async (teamPayload) => {
  const response = await fetch(FORMED_TEAM_API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(teamPayload),
  });
  return handleResponse(response);
};

export const getFormedTeams = async () => {
  const response = await fetch(FORMED_TEAM_API_BASE_URL);
  return handleResponse(response);
};

export const getFormedTeamByKey = async (key) => {
  const response = await fetch(`${FORMED_TEAM_API_BASE_URL}/${encodeURIComponent(key)}`);
  return handleResponse(response);
};

/**
 * generateTeamWithAIStream — SSE streaming version of generateTeamWithAI.
 *
 * Calls the Python /api/ml/team-formation/stream endpoint and fires callbacks
 * as each Server-Sent Event arrives.
 *
 * @param {object} payload  - Same payload shape as generateTeamWithAI
 * @param {object} handlers
 *   onProgress({ step, total, label, pct }) — called for each pipeline stage
 *   onResult(teamData)                       — called once with the final team
 *   onError(message)                         — called on error events or fetch failure
 * @returns {AbortController}  Call .abort() to cancel mid-stream
 */
export const generateTeamWithAIStream = (payload, { onProgress, onResult, onError }) => {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${ML_API_BASE_URL}/team-formation/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        onError?.(err.message || `HTTP error ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline which separates SSE messages
        const messages = buffer.split('\n\n');
        // Keep the last (possibly incomplete) message in the buffer
        buffer = messages.pop();

        for (const message of messages) {
          if (!message.trim()) continue;
          let eventType = 'message';
          let dataLine = '';

          for (const line of message.split('\n')) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataLine = line.slice(6);
            }
          }

          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine);
            if (eventType === 'progress') {
              onProgress?.(data);
            } else if (eventType === 'result') {
              onResult?.(data);
            } else if (eventType === 'error') {
              onError?.(data.message || 'Unknown error from ML server');
            }
          } catch {
            // malformed JSON — skip
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError?.(err.message || 'Stream connection failed');
      }
    }
  })();

  return controller;
};

/**
 * subscribeToStats — SSE subscription for live dashboard stats from the Python server.
 *
 * @param {function} onData({ employeeCount, teamsGenerated, timestamp })
 * @returns {EventSource}  Call .close() to unsubscribe
 */
export const subscribeToStats = (onData) => {
  const es = new EventSource(`${TEAM_API_BASE_URL}/stats/stream`);
  es.onmessage = (event) => {
    try {
      onData(JSON.parse(event.data));
    } catch {
      // ignore parse errors
    }
  };
  es.onerror = () => {
    // EventSource auto-reconnects; nothing to do here
  };
  return es;
};

// ── Resume Extraction APIs ────────────────────────────────────────────────────

/**
 * extractResume — upload a single resume file and get back a structured profile.
 * @param {File} file
 * @returns {Promise<{ success, profile, skillsFound, rawTextLength }>}
 */
export const extractResume = async (file) => {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${RESUME_API_BASE_URL}/extract`, {
    method: 'POST',
    body: form,
  });
  return handleResponse(response);
};

/**
 * extractResumesBatch — upload multiple resume files at once.
 * @param {File[]} files
 * @returns {Promise<{ total, successful, failed, results[] }>}
 */
export const extractResumesBatch = async (files) => {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  const response = await fetch(`${RESUME_API_BASE_URL}/extract-batch`, {
    method: 'POST',
    body: form,
  });
  return handleResponse(response);
};

/**
 * checkResumeApiHealth — check if the resume extraction service is running.
 */
export const checkResumeApiHealth = async () => {
  try {
    const response = await fetch(`${RESUME_API_BASE_URL}/health`);
    return handleResponse(response);
  } catch {
    return { status: 'offline' };
  }
};
