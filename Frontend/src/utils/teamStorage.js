const TEAM_HISTORY_KEY = 'saved_project_teams';
const LAST_GENERATED_TEAM_KEY = 'last_generated_team';

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
};

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const createSavedTeamId = (team, timestamp, seed = '') => {
  const base = slugify(team?.projectId || team?.projectName || team?.teamName || 'project') || 'project';
  const compactTime = String(timestamp || '')
    .replace(/[^0-9]/g, '')
    .slice(0, 14);
  return `${base}-${compactTime}-${seed || Math.random().toString(36).slice(2, 8)}`;
};

const normalizeSavedTeamRecord = (team, index = 0) => {
  const savedAt = team?.savedAt || team?.updatedAt || new Date().toISOString();
  const projectId = String(team?.projectId || '').trim();
  const projectName = String(team?.projectName || team?.teamName || 'Untitled Project').trim();
  const savedTeamId =
    String(team?.savedTeamId || '').trim() || createSavedTeamId(team, savedAt, String(index).padStart(2, '0'));

  return {
    ...team,
    projectId: projectId || `PROJECT-${savedAt}`,
    projectName,
    projectKey: team?.projectKey || slugify(projectId || projectName || savedAt) || 'project',
    savedTeamId,
    savedAt,
    updatedAt: team?.updatedAt || savedAt,
  };
};

export const getSavedTeams = () => {
  const savedTeams = safeJsonParse(localStorage.getItem(TEAM_HISTORY_KEY), []);
  return Array.isArray(savedTeams)
    ? savedTeams
        .map((team, index) => normalizeSavedTeamRecord(team, index))
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.savedAt || 0).getTime() - new Date(a.updatedAt || a.savedAt || 0).getTime()
        )
    : [];
};

export const getSavedTeamByProjectKey = (projectKey) => {
  if (!projectKey) return null;
  const normalizedKey = decodeURIComponent(String(projectKey).trim());
  return (
    getSavedTeams().find(
      (team) =>
        team.savedTeamId === normalizedKey ||
        team.projectKey === normalizedKey ||
        team.projectId === normalizedKey ||
        team.projectName === normalizedKey
    ) || null
  );
};

export const saveGeneratedTeam = (team) => {
  const timestamp = new Date().toISOString();
  const normalizedTeam = normalizeSavedTeamRecord(
    {
      ...team,
      savedAt: timestamp,
      updatedAt: timestamp,
    },
    Date.now()
  );

  const existingTeams = getSavedTeams();
  const nextTeams = [normalizedTeam, ...existingTeams];

  localStorage.setItem(TEAM_HISTORY_KEY, JSON.stringify(nextTeams));
  localStorage.setItem(LAST_GENERATED_TEAM_KEY, JSON.stringify(normalizedTeam));
  return normalizedTeam;
};

export const getLastGeneratedTeam = () => {
  const team = safeJsonParse(localStorage.getItem(LAST_GENERATED_TEAM_KEY), null);
  return team ? normalizeSavedTeamRecord(team) : null;
};

export const buildProjectResultsPath = (team) => {
  const routeKey = String(team?.savedTeamId || team?.projectKey || team?.projectId || team?.projectName || '').trim();
  return routeKey ? `/results/${encodeURIComponent(routeKey)}` : '/results';
};
