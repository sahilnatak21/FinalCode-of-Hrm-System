import { normalizeSkillName, parseSkillScores } from './skillScores';

export const buildSkillVocabulary = (employees = [], requirements = []) => {
  const vocab = new Set();

  employees.forEach((employee) => {
    const skillScores = parseSkillScores(employee.skillScores, employee.skills, employee.skillLevel);
    Object.keys(skillScores).forEach((skill) => vocab.add(normalizeSkillName(skill)));
  });

  requirements.forEach((requirement) => {
    String(requirement?.name || '')
      .split(/[|,;]/)
      .map((name) => normalizeSkillName(name))
      .filter(Boolean)
      .forEach((skill) => vocab.add(skill));
  });

  return Array.from(vocab);
};

export const vectorizeSkillScores = (skillScores, vocabulary = []) => {
  const parsed = parseSkillScores(skillScores);
  return vocabulary.map((skill) => Number(parsed[normalizeSkillName(skill)] || 0));
};

export const vectorToKeyValue = (vector = [], vocabulary = []) =>
  vocabulary.reduce((acc, skill, index) => {
    acc[skill] = Number(vector[index] || 0);
    return acc;
  }, {});
