const POOL_KEY = 'skillbase_candidate_pool';

export const getCandidates = () => {
  try {
    return JSON.parse(localStorage.getItem(POOL_KEY) || '[]');
  } catch {
    return [];
  }
};

export const addCandidate = (candidate) => {
  const pool = getCandidates();
  const id   = `CP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const entry = { ...candidate, poolId: id, savedAt: new Date().toISOString() };
  // Prevent duplicate by email
  const email = candidate.profile?.email || '';
  if (email && pool.some((c) => c.profile?.email === email)) {
    return null; // duplicate
  }
  pool.push(entry);
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
  return entry;
};

export const deleteCandidate = (poolId) => {
  const pool = getCandidates().filter((c) => c.poolId !== poolId);
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
  return pool;
};

export const clearCandidates = () => {
  localStorage.removeItem(POOL_KEY);
};

export const getCandidateCount = () => getCandidates().length;
