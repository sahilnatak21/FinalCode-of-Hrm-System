const SKILL_ALIASES = {
  springboot: 'spring boot',
  spring_boot: 'spring boot',
  nodejs: 'node js',
  'node.js': 'node js',
  reactjs: 'react',
  mongodb: 'mongodb',
  mysql: 'mysql',
  postgresql: 'postgresql',
  postgres: 'postgresql',
  sql: 'sql',
  java: 'java',
  python: 'python',
};

const clampScore = (value, min = 0, max = 10) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
};

export const normalizeSkillName = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');
  const compact = normalized.replace(/\s+/g, '');
  return SKILL_ALIASES[compact] || normalized;
};

export const parseSkillScores = (rawValue, fallbackSkills = '', fallbackLevel = 1) => {
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return Object.entries(rawValue).reduce((acc, [key, value]) => {
      const normalizedKey = normalizeSkillName(key);
      if (!normalizedKey) return acc;
      acc[normalizedKey] = clampScore(value, 1, 10);
      return acc;
    }, {});
  }

  const text = String(rawValue || '').trim();
  if (text) {
    try {
      const parsed = JSON.parse(text);
      return parseSkillScores(parsed, fallbackSkills, fallbackLevel);
    } catch (error) {
      return text.split(/[|,;]/).reduce((acc, part) => {
        const [skill, score] = part.split(':');
        const normalizedKey = normalizeSkillName(skill);
        if (!normalizedKey) return acc;
        acc[normalizedKey] = clampScore(score, 1, 10);
        return acc;
      }, {});
    }
  }

  const fallback = String(fallbackSkills || '')
    .split(/[|,;]/)
    .map((skill) => normalizeSkillName(skill))
    .filter(Boolean);

  return fallback.reduce((acc, skill) => {
    acc[skill] = clampScore(fallbackLevel, 1, 10);
    return acc;
  }, {});
};

export const formatSkillScores = (skillScores) =>
  Object.entries(skillScores || {})
    .filter(([skill]) => normalizeSkillName(skill))
    .map(([skill, score]) => `${skill}:${clampScore(score, 1, 10)}`)
    .join(', ');

export const getSkillLabels = (skillScores) => Object.keys(skillScores || {});

export const getAverageSkillScore = (skillScores, fallbackLevel = 1) => {
  const values = Object.values(skillScores || {}).map((value) => clampScore(value, 1, 10));
  if (values.length === 0) return clampScore(fallbackLevel, 1, 10);
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
};

export const normalizeEmployeeSkillProfile = (employee = {}) => {
  const skillScores = parseSkillScores(employee.skillScores, employee.skills, employee.skillLevel);
  const skillNames = getSkillLabels(skillScores);

  return {
    ...employee,
    skillScores,
    skills: employee.skills || skillNames.join(', '),
    skillLevel: getAverageSkillScore(skillScores, employee.skillLevel || 1),
  };
};
