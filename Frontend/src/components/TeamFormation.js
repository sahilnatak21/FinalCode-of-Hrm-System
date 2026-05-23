import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateTeamWithAIStream, getEmployees, saveFormedTeam } from '../utils/api';
import { downloadCSV, parseCSV } from '../utils/csvParser';
import { normalizeEmployeeSkillProfile, normalizeSkillName } from '../utils/skillScores';
import { buildProjectResultsPath, saveGeneratedTeam } from '../utils/teamStorage';

const LOCAL_CONFIG_KEY = 'team_algorithm_config';

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical', weight: 1 },
  { value: 'high', label: 'High', weight: 0.82 },
  { value: 'medium', label: 'Medium', weight: 0.64 },
  { value: 'low', label: 'Low', weight: 0.46 },
];

const createSkillRequirement = (overrides = {}) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  minScore: 6,
  maxScore: 10,
  priority: 'high',
  ...overrides,
});

const getRequirementComponents = (value) =>
  String(value || '')
    .split(/[|,;]/)
    .map((name) => normalizeSkillName(name))
    .filter(Boolean);

const normalizeWeightSet = (weights) => {
  const numeric = Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
  );
  const total = Object.values(numeric).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return { skill: 50, experience: 25, performance: 25 };
  }
  return Object.fromEntries(
    Object.entries(numeric).map(([key, value]) => [key, Number(((value / total) * 100).toFixed(1))])
  );
};

const scoreWithinRange = (value, minScore, maxScore) => {
  const score = Number(value || 0);
  const min = Number(minScore || 0);
  const max = Math.max(min, Number(maxScore || min || 0));

  if (score >= min && score <= max) return 1;
  if (score > max) return Math.max(0.55, max / Math.max(score, 1));
  if (min <= 0) return Math.max(0, score / Math.max(max, 1));
  return Math.max(0, score / min);
};

const normalizeMetric = (value, maxValue) => {
  const safeMax = Math.max(1, Number(maxValue || 0));
  return Math.min(1, Math.max(0, Number(value || 0) / safeMax));
};

const validateProjectDataset = (employees, requiredSkills = []) => {
  const seen = new Set();
  const duplicateIds = [];
  const unavailable = [];
  const missingSkillProfiles = [];
  const invalidScores = [];
  const skillGaps = [];

  employees.forEach((employee, index) => {
    const id = String(employee.employeeId || employee.id || employee.name || `row-${index + 1}`).trim().toLowerCase();
    if (seen.has(id)) {
      duplicateIds.push(employee.employeeId || employee.id || employee.name || `Row ${index + 1}`);
    }
    seen.add(id);

    if (['on leave', 'unavailable'].includes(String(employee.availability || '').trim().toLowerCase())) {
      unavailable.push(employee.name || employee.employeeId || `Row ${index + 1}`);
    }

    const skillScores = employee.skillScores || {};
    if (Object.keys(skillScores).length === 0) {
      missingSkillProfiles.push(employee.name || employee.employeeId || `Row ${index + 1}`);
    }

    Object.entries(skillScores).forEach(([skill, score]) => {
      const numeric = Number(score);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
        invalidScores.push(`${employee.name || employee.employeeId || `Row ${index + 1}`}: ${skill}`);
      }
    });
  });

  requiredSkills.forEach((requirement) => {
    const hasCoverage = employees.some((employee) => {
      const skillScores = employee.skillScores || {};
      return requirement.components.some((component) => Number(skillScores[component] || 0) >= requirement.minScore);
    });
    if (!hasCoverage) {
      skillGaps.push(requirement.name);
    }
  });

  return {
    totalRows: employees.length,
    validRows: Math.max(0, employees.length - duplicateIds.length - missingSkillProfiles.length),
    duplicateIds,
    unavailable,
    missingSkillProfiles,
    invalidScores,
    skillGaps,
    ready: employees.length >= 2 && missingSkillProfiles.length === 0 && invalidScores.length === 0,
  };
};

const buildCoverageAwareTeam = (rankedMembers, requiredSkills, teamSize) => {
  const buildRequirementTargets = () => {
    if (requiredSkills.length === 0) return {};
    const weighted = requiredSkills.map((requirement) => ({
      id: requirement.id,
      weight: PRIORITY_OPTIONS.find((option) => option.value === requirement.priority)?.weight || 0.64,
    }));
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;
    const baseTargets = {};
    let assignedSeats = 0;

    weighted.forEach((item) => {
      const rawSeats = (item.weight / totalWeight) * teamSize;
      const seats = Math.max(1, Math.floor(rawSeats));
      baseTargets[item.id] = seats;
      assignedSeats += seats;
    });

    const byRemainder = weighted
      .map((item) => ({
        id: item.id,
        remainder: ((item.weight / totalWeight) * teamSize) - baseTargets[item.id],
      }))
      .sort((a, b) => b.remainder - a.remainder);

    let index = 0;
    while (assignedSeats < teamSize && byRemainder.length > 0) {
      const current = byRemainder[index % byRemainder.length];
      baseTargets[current.id] += 1;
      assignedSeats += 1;
      index += 1;
    }

    while (assignedSeats > teamSize) {
      const reducible = Object.entries(baseTargets)
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1]);
      if (reducible.length === 0) break;
      baseTargets[reducible[0][0]] -= 1;
      assignedSeats -= 1;
    }

    return baseTargets;
  };

  const selected = [];
  const remaining = [...rankedMembers];
  const coveredRequirements = new Set();
  const requirementTargets = buildRequirementTargets();
  const requirementCounts = Object.fromEntries(requiredSkills.map((requirement) => [requirement.id, 0]));

  const getRequirementFit = (member, requirementId) =>
    Number(
      (member.teamFit?.skillBreakdown || []).find((item) => item.requirementId === requirementId)?.fit || 0
    );

  const pickBestForRequirement = (requirementId) => {
    let bestIndex = -1;
    let bestScore = -Infinity;

    remaining.forEach((member, index) => {
      const fit = getRequirementFit(member, requirementId);
      if (fit <= 0) return;
      const candidateScore = Number(member.matchScore || 0) + fit * 30;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestIndex = index;
      }
    });

    return bestIndex;
  };

  requiredSkills.forEach((requirement) => {
    const target = requirementTargets[requirement.id] || 0;
    while (
      selected.length < teamSize &&
      requirementCounts[requirement.id] < target &&
      remaining.length > 0
    ) {
      const bestIndex = pickBestForRequirement(requirement.id);
      if (bestIndex < 0) break;
      const [chosen] = remaining.splice(bestIndex, 1);
      selected.push(chosen);
      requirementCounts[requirement.id] += 1;
      if (getRequirementFit(chosen, requirement.id) >= 0.7) {
        coveredRequirements.add(requirement.id);
      }
    }
  });

  while (selected.length < teamSize && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    remaining.forEach((member, index) => {
      let uncoveredBoost = 0;

      requiredSkills.forEach((requirement) => {
        if (coveredRequirements.has(requirement.id)) return;
        const item = (member.teamFit?.skillBreakdown || []).find(
          (breakdown) => breakdown.requirementId === requirement.id
        );
        if (item && item.fit > 0) {
          uncoveredBoost += item.fit * 10;
        }
      });

      const candidateScore = Number(member.matchScore || 0) + uncoveredBoost * 8;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestIndex = index;
      }
    });

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);

    (chosen.teamFit?.skillBreakdown || []).forEach((item) => {
      if (item.fit >= 0.7) {
        coveredRequirements.add(item.requirementId);
      }
    });
  }

  return selected;
};

const TeamFormation = () => {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [totalTeamSize, setTotalTeamSize] = useState(5);
  const [projectStartDate, setProjectStartDate] = useState('');
  const [projectEndDate, setProjectEndDate] = useState('');
  const [requiredRole, setRequiredRole] = useState('');
  const [skillRequirements, setSkillRequirements] = useState([
    createSkillRequirement({ name: 'Java', minScore: 5, maxScore: 10, priority: 'critical' }),
    createSkillRequirement({ name: 'Communication', minScore: 8, maxScore: 10, priority: 'high' }),
  ]);
  const [weights, setWeights] = useState({ skill: 50, experience: 25, performance: 25 });
  const [candidateCount, setCandidateCount] = useState(0);
  const [projectEmployees, setProjectEmployees] = useState([]);
  const [projectCsvName, setProjectCsvName] = useState('');
  const [csvValidation, setCsvValidation] = useState(null);
  const [csvMessage, setCsvMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Real-time progress state
  const [mlProgress, setMlProgress] = useState(null); // { step, total, label, pct }
  const streamAbortRef = useRef(null);

  useEffect(() => {
    const loadCandidates = async () => {
      try {
        const candidates = await getEmployees();
        setCandidateCount(candidates.length);
      } catch (loadError) {
        setCandidateCount(0);
      }
    };
    loadCandidates();
  }, []);

  const normalizedWeights = useMemo(() => normalizeWeightSet(weights), [weights]);

  const activeSkillRequirements = useMemo(
    () =>
      skillRequirements
        .map((skill) => {
          const name = String(skill.name || '').trim();
          const components = getRequirementComponents(name);
          return {
            ...skill,
            name,
            components,
            minScore: Number(skill.minScore || 0),
            maxScore: Number(skill.maxScore || 0),
          };
        })
        .filter((skill) => skill.name && skill.components.length > 0),
    [skillRequirements]
  );

  const previewText = useMemo(() => {
    const topSkills = activeSkillRequirements
      .slice(0, 3)
      .map((skill) => `${skill.name} ${skill.minScore}-${skill.maxScore}`)
      .join(' | ');
    return topSkills || 'No required skills defined yet';
  }, [activeSkillRequirements]);

  const liveValidation = useMemo(
    () => (projectEmployees.length ? validateProjectDataset(projectEmployees, activeSkillRequirements) : csvValidation),
    [activeSkillRequirements, csvValidation, projectEmployees]
  );

  const updateSkillRequirement = (id, field, value) => {
    setSkillRequirements((prev) =>
      prev.map((skill) =>
        skill.id === id
          ? {
              ...skill,
              [field]: field === 'minScore' || field === 'maxScore' ? Number(value) || 0 : value,
            }
          : skill
      )
    );
  };

  const addSkillRequirement = () => {
    setSkillRequirements((prev) => [...prev, createSkillRequirement()]);
  };

  const removeSkillRequirement = (id) => {
    setSkillRequirements((prev) => (prev.length > 1 ? prev.filter((skill) => skill.id !== id) : prev));
  };

  const updateWeight = (field, value) => {
    setWeights((prev) => ({ ...prev, [field]: Math.max(0, Number(value) || 0) }));
  };

  const handleDownloadProjectTemplate = () => {
    const templateRows = [
      'Employee ID,Name,Skills,Skill Scores,Skill Level,Experience (years),Category,Availability,Performance Rating,Salary,Department,Role,Actual Label,Available From,Available Until',
      'PRJEMP001,Asha Rao,"Java,Spring Boot,SQL,Communication","Java:9, Spring Boot:8, SQL:7, Communication:8",8,5,Full-time,Available,8.9,95000,Engineering,Backend Developer,A,2026-06-01,2026-12-31',
      'PRJEMP002,Ravi Kumar,"React,JavaScript,Communication","React:8, JavaScript:8, Communication:7",7,3,Full-time,Available,7.8,78000,Engineering,Frontend Developer,B,2026-06-01,2026-10-31',
      'PRJEMP003,Mina Shah,"Python,ML,Analytics","Python:9, ML:8, Analytics:9",9,6,Full-time,Available,9.2,110000,Data,ML Engineer,A,2026-06-15,2026-12-31',
    ];
    downloadCSV(templateRows.join('\n'), 'project_employee_dataset_template.csv');
  };

  const handleProjectCsvUpload = (event) => {
    const file = event.target.files?.[0];
    setError('');
    setCsvMessage('');

    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setProjectEmployees([]);
      setProjectCsvName('');
      setCsvValidation(null);
      setError('Please upload a CSV file for this project.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const csvText = String(loadEvent.target?.result || '');
        const parsedEmployees = parseCSV(csvText).map(normalizeEmployeeSkillProfile);
        if (parsedEmployees.length < 2) {
          throw new Error('Project CSV must contain at least two valid employees for K-Means.');
        }
        const validation = validateProjectDataset(parsedEmployees, activeSkillRequirements);
        setProjectEmployees(parsedEmployees);
        setProjectCsvName(file.name);
        setCsvValidation(validation);
        setCsvMessage(`Loaded ${parsedEmployees.length} employee records from ${file.name}. Review the validation report before generating.`);
      } catch (csvError) {
        setProjectEmployees([]);
        setProjectCsvName('');
        setCsvValidation(null);
        setError(csvError.message || 'Could not read this project CSV.');
      }
    };
    reader.onerror = () => {
      setProjectEmployees([]);
      setProjectCsvName('');
      setCsvValidation(null);
      setError('Could not read this project CSV.');
    };
    reader.readAsText(file);
  };

  const fallbackGenerateTeam = async () => {
    const employees = projectEmployees.map(normalizeEmployeeSkillProfile);
    if (employees.length === 0) {
      throw new Error('Upload a project CSV before generating the team.');
    }

    const roleText = String(requiredRole || '').trim().toLowerCase();
    const eligibleEmployees = roleText
      ? employees.filter((employee) => {
          const employeeRole = String(employee.role || '').toLowerCase();
          const employeeDepartment = String(employee.department || '').toLowerCase();
          return employeeRole.includes(roleText) || employeeDepartment.includes(roleText);
        })
      : employees;

    if (eligibleEmployees.length === 0) {
      throw new Error(`No employees match the requested role or department: ${requiredRole}`);
    }

    const maxExperience = Math.max(...eligibleEmployees.map((employee) => Number(employee.experience || 0)), 1);
    const maxPerformance = Math.max(
      ...eligibleEmployees.map((employee) => Number(employee.performanceRating || employee.score || 0)),
      1
    );

    const rankedMembers = eligibleEmployees
      .map((employee) => {
        const skillScores = employee.skillScores || {};
        const skillBreakdown = activeSkillRequirements.map((requirement) => {
          const requirementWeight =
            PRIORITY_OPTIONS.find((option) => option.value === requirement.priority)?.weight || 0.64;
          const componentScores = requirement.components.map((component) => Number(skillScores[component] || 0));
          const componentFits = componentScores.map((score) =>
            scoreWithinRange(score, requirement.minScore, requirement.maxScore)
          );
          const employeeSkillScore =
            componentScores.length > 0
              ? componentScores.reduce((sum, score) => sum + score, 0) / componentScores.length
              : 0;
          const fit =
            componentFits.length > 0
              ? componentFits.reduce((sum, score) => sum + score, 0) / componentFits.length
              : 0;
          return {
            requirementId: requirement.id,
            skill: requirement.name,
            components: requirement.components,
            priority: requirement.priority,
            requiredRange: `${requirement.minScore}-${requirement.maxScore}`,
            employeeScore: Number(employeeSkillScore.toFixed(2)),
            fit,
            weightedFit: fit * requirementWeight,
          };
        });

        const weightedSkillTotal = skillBreakdown.reduce((sum, item) => sum + item.weightedFit, 0);
        const weightedSkillMax = skillBreakdown.reduce((sum, item) => {
          const requirementWeight =
            PRIORITY_OPTIONS.find((option) => option.value === item.priority)?.weight || 0.64;
          return sum + requirementWeight;
        }, 0);
        const skillMatch = weightedSkillMax > 0 ? weightedSkillTotal / weightedSkillMax : 0.5;
        const experienceMatch = normalizeMetric(employee.experience, maxExperience);
        const performanceMatch = normalizeMetric(employee.performanceRating || employee.score, maxPerformance);

        let finalScore =
          skillMatch * normalizedWeights.skill +
          experienceMatch * normalizedWeights.experience +
          performanceMatch * normalizedWeights.performance;

        const budgetLimit = 0;
        if (budgetLimit > 0 && Number(employee.salary || 0) > 0) {
          const idealPerSeat = budgetLimit / Math.max(1, Number(totalTeamSize || 1));
          if (Number(employee.salary || 0) > idealPerSeat) {
            finalScore *= Math.max(0.62, idealPerSeat / Number(employee.salary || 1));
          }
        }

        if (activeSkillRequirements.length > 0 && skillMatch < 0.2) {
          finalScore *= 0.2;
        } else if (activeSkillRequirements.length > 0 && skillMatch < 0.4) {
          finalScore *= 0.55;
        }

        const matchedSkills = skillBreakdown
          .filter((item) => item.fit >= 0.8)
          .map((item) => `${item.skill} (${item.employeeScore}/10)`);

        return {
          ...employee,
          matchScore: Number(finalScore.toFixed(2)),
          teamFit: {
            skillMatch: Number((skillMatch * 100).toFixed(1)),
            experienceMatch: Number((experienceMatch * 100).toFixed(1)),
            performanceMatch: Number((performanceMatch * 100).toFixed(1)),
            budgetFit: 100,
            matchedSkills,
            skillBreakdown,
          },
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore);

    const selectedMembers = buildCoverageAwareTeam(
      rankedMembers,
      activeSkillRequirements,
      Math.min(Number(totalTeamSize || 0), rankedMembers.length)
    );
    const selectedKeys = new Set(
      selectedMembers.map((member) => String(member.employeeId || member.id || `${member.name}-${member.role}`).toLowerCase())
    );
    const backupCandidates = rankedMembers
      .filter((member) => !selectedKeys.has(String(member.employeeId || member.id || `${member.name}-${member.role}`).toLowerCase()))
      .slice(0, 5)
      .map((member) => ({
        ...member,
        backupReason: 'Next best available fit if a selected member becomes unavailable.',
      }));
    const avg = (values) =>
      values.length ? Number((values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length).toFixed(2)) : 0;
    const selectedSalary = selectedMembers.reduce((sum, member) => sum + Number(member.salary || 0), 0);
    const alternateTeams = [0, 1, 2]
      .map((offset) => {
        const rotated = rankedMembers.slice(offset).concat(rankedMembers.slice(0, offset));
        const members = buildCoverageAwareTeam(
          rotated,
          activeSkillRequirements,
          Math.min(Number(totalTeamSize || 0), rotated.length)
        );
        const cost = members.reduce((sum, member) => sum + Number(member.salary || 0), 0);
        return {
          name: offset === 0 ? 'Recommended Team' : `Alternative ${offset}`,
          avgMatchScore: avg(members.map((member) => member.matchScore)),
          avgExperience: avg(members.map((member) => member.experience)),
          totalCost: cost,
          overBudget: false,
          members: members.map((member) => member.name || member.employeeId || 'Employee'),
        };
      })
      .filter((teamOption, index, list) => list.findIndex((item) => item.members.join('|') === teamOption.members.join('|')) === index);
    const maxSelectedExperience = Math.max(...selectedMembers.map((member) => Number(member.experience || 0)), 1);
    const maxSelectedPerformance = Math.max(
      ...selectedMembers.map((member) => Number(member.performanceRating || member.score || 0)),
      1
    );
    const leader = selectedMembers
      .map((member) => {
        const leaderScore =
          (Number(member.experience || 0) / maxSelectedExperience) * 40 +
          (Number(member.performanceRating || member.score || 0) / maxSelectedPerformance) * 30 +
          (Number(member.teamFit?.skillMatch || 0) / 100) * 30;
        return {
          ...member,
          leaderScore: Number(leaderScore.toFixed(2)),
          leaderReason: 'Highest weighted blend of experience, performance, and project skill fit.',
        };
      })
      .sort((a, b) => b.leaderScore - a.leaderScore)[0] || null;
    const leaderKey = leader ? String(leader.employeeId || leader.id || `${leader.name}-${leader.role}`).toLowerCase() : '';
    selectedMembers.forEach((member) => {
      const memberKey = String(member.employeeId || member.id || `${member.name}-${member.role}`).toLowerCase();
      member.isLeader = Boolean(leaderKey && memberKey === leaderKey);
      if (member.isLeader) {
        member.leaderScore = leader.leaderScore;
      }
    });
    return {
      teamName: projectName || 'Project Team',
      projectName: projectName || 'Untitled Project',
      projectId: projectId || 'AUTO-PROJECT',
      projectPriority: 'Custom',
      algorithm: 'frontend-flexible-project-ranking',
      datasetSource: {
        type: 'projectCsv',
        fileName: projectCsvName,
        employeeCount: employees.length,
        validRows: liveValidation?.validRows || employees.length,
      },
      numberOfTeams: 1,
      totalTeamSize: Number(totalTeamSize),
      selectionCriteria: {
        requiredRole: requiredRole.trim(),
        scoreWeights: normalizedWeights,
        requiredSkills: activeSkillRequirements,
        projectStartDate,
        projectEndDate,
      },
      statistics: {
        avgExperience: avg(selectedMembers.map((member) => member.experience)),
        avgSkillLevel: avg(selectedMembers.map((member) => member.skillLevel || 0)),
        avgPerformance: avg(selectedMembers.map((member) => member.performanceRating || member.score || 0)),
        avgMatchScore: avg(selectedMembers.map((member) => member.matchScore)),
        totalMembers: selectedMembers.length,
        estimatedCost: selectedSalary,
        budgetRemaining: null,
      },
      teams: [
        {
          teamName: projectName || 'Project Team',
          members: selectedMembers,
        },
      ],
      members: selectedMembers,
      leader: leader ? { ...leader, isLeader: true } : null,
      backupCandidates,
      alternateTeams,
      csvValidation: liveValidation,
    };
  };

  const generateTeam = async (e) => {
    e.preventDefault();
    setError('');

    if (!projectName.trim()) {
      setError('Project Name is required.');
      return;
    }

    if (!projectId.trim()) {
      setError('Project ID is required.');
      return;
    }

    if (!totalTeamSize || totalTeamSize < 1) {
      setError('Total Team Size must be at least 1.');
      return;
    }

    if (projectEmployees.length < 2) {
      setError('Upload a project-specific CSV with at least two valid employees before generating a team.');
      return;
    }

    if (liveValidation && !liveValidation.ready) {
      setError('Please fix the CSV validation issues before generating.');
      return;
    }

    if (activeSkillRequirements.length === 0) {
      setError('Add at least one required skill with a valid name.');
      return;
    }

    const hasInvalidRange = activeSkillRequirements.some(
      (skill) => skill.minScore < 0 || skill.maxScore > 10 || skill.minScore > skill.maxScore
    );
    if (hasInvalidRange) {
      setError('Skill score ranges must stay within 0-10 and the minimum cannot exceed the maximum.');
      return;
    }

    setLoading(true);
    setMlProgress({ step: 0, total: 10, label: 'Connecting to ML server…', pct: 0 });

    // Cancel any previous in-flight stream
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
    }

    try {
      const employees = projectEmployees.map(normalizeEmployeeSkillProfile);
      if (!employees.length) {
        throw new Error('No employees available in the project CSV.');
      }

      const storedConfig = localStorage.getItem(LOCAL_CONFIG_KEY);
      const payload = {
        criteria: {
          teamName: projectName.trim(),
          projectName: projectName.trim(),
          projectId: projectId.trim(),
          projectPriority: 'Custom',
          teamSize: Number(totalTeamSize),
          totalTeamSize: Number(totalTeamSize),
          primarySkills: activeSkillRequirements.map((skill) => skill.name).join(','),
          secondarySkills: activeSkillRequirements.map((skill) => `${skill.name}:${skill.priority}`).join(','),
          requiredRole: requiredRole.trim(),
          numberOfTeams: 1,
          requiredSkillRanges: activeSkillRequirements,
          scoreWeights: normalizedWeights,
          datasetSource: 'projectCsv',
          datasetFileName: projectCsvName,
          projectStartDate,
          projectEndDate,
        },
        config: storedConfig ? JSON.parse(storedConfig) : null,
        employees,
      };

      const handleResult = async (team) => {
        try {
          const enrichedTeam = {
            ...team,
            projectName: team.projectName || projectName.trim(),
            projectId: team.projectId || projectId.trim(),
            totalTeamSize: team.totalTeamSize || Number(totalTeamSize),
            datasetSource: team.datasetSource || {
              type: 'projectCsv',
              fileName: projectCsvName,
              employeeCount: employees.length,
              validRows: liveValidation?.validRows || employees.length,
            },
            selectionCriteria: team.selectionCriteria || {
              requiredRole: requiredRole.trim(),
              scoreWeights: normalizedWeights,
              requiredSkills: activeSkillRequirements,
              projectStartDate,
              projectEndDate,
            },
            csvValidation: team.csvValidation || liveValidation,
          };

          const localTeam = saveGeneratedTeam(enrichedTeam);
          const savedTeam = await saveFormedTeam(localTeam).catch(() => localTeam);
          const displayTeam = saveGeneratedTeam({
            ...localTeam,
            ...savedTeam,
            classificationMetrics: savedTeam.classificationMetrics || localTeam.classificationMetrics,
            randomForestEvaluation: savedTeam.randomForestEvaluation || localTeam.randomForestEvaluation,
          });
          const generationCount = Number(localStorage.getItem('team_generation_count') || 0) + 1;
          localStorage.setItem('team_generation_count', String(generationCount));
          setMlProgress({ step: 10, total: 10, label: 'Team ready!', pct: 100 });
          setTimeout(() => {
            setLoading(false);
            setMlProgress(null);
            navigate(buildProjectResultsPath(displayTeam), { state: { team: displayTeam } });
          }, 600);
        } catch (saveError) {
          setError(saveError?.message || 'Failed to save team.');
          setLoading(false);
          setMlProgress(null);
        }
      };

      const handleError = async (message) => {
        // SSE stream failed — fall back to the JS algorithm
        try {
          setMlProgress({ step: 1, total: 10, label: 'ML server unavailable — using local algorithm…', pct: 10 });
          const team = await fallbackGenerateTeam();
          await handleResult(team);
        } catch (fallbackError) {
          setError(fallbackError?.message || message || 'Team generation failed.');
          setLoading(false);
          setMlProgress(null);
        }
      };

      streamAbortRef.current = generateTeamWithAIStream(payload, {
        onProgress: (progress) => setMlProgress(progress),
        onResult: handleResult,
        onError: handleError,
      });
    } catch (generationError) {
      setError(generationError?.message || 'Team generation failed.');
      setLoading(false);
      setMlProgress(null);
    }
  };

  return (
    <>
      <header className="header">
        <h1>Project Team Definition</h1>
        <div className="user">Admin User</div>
      </header>

      {error && <div className="message error">{error}</div>}

      <form onSubmit={generateTeam}>
        <section className="hero-strip">
          <div className="hero-copy">
            <span className="eyebrow">AI Team Builder</span>
            <h2>Define project needs, tune priorities, and generate a balanced team.</h2>
            <p>
              Use flexible skill bundles, score ranges, and weighted factors so the Python backend can
              build a more accurate K-Means plus attention based team.
            </p>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <span>CSV Employees</span>
              <strong>{projectEmployees.length}</strong>
            </div>
            <div className="hero-stat">
              <span>Required Skill Groups</span>
              <strong>{activeSkillRequirements.length}</strong>
            </div>
            <div className="hero-stat">
              <span>Target Team Size</span>
              <strong>{totalTeamSize}</strong>
            </div>
          </div>
        </section>

        <section className="formation-layout">
          <article className="panel panel-strong">
            <h2 className="formation-title">Project Setup</h2>

            <div className="form-row">
              <div>
                <label htmlFor="projectName">Project Name</label>
                <input
                  id="projectName"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Skillbase Hiring Sprint"
                />
              </div>
              <div>
                <label htmlFor="projectId">Project ID</label>
                <input
                  id="projectId"
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="PRJ-2026-001"
                />
              </div>
            </div>

            <label htmlFor="totalTeamSize">Total Team Size</label>
            <div className="inline-field">
              <input
                id="totalTeamSize"
                type="number"
                min="1"
                max="50"
                value={totalTeamSize}
                onChange={(e) => setTotalTeamSize(Number(e.target.value))}
              />
              <span>Members</span>
            </div>
            <p className="helper-text">Top-ranked employees will be selected into one project team.</p>

            <div className="form-row">
              <div>
                <label htmlFor="projectStartDate">Start Date</label>
                <input
                  id="projectStartDate"
                  type="date"
                  value={projectStartDate}
                  onChange={(e) => setProjectStartDate(e.target.value)}
                />
              </div>
            </div>

            <label htmlFor="projectEndDate">End Date</label>
            <input
              id="projectEndDate"
              type="date"
              value={projectEndDate}
              onChange={(e) => setProjectEndDate(e.target.value)}
            />

            <label htmlFor="requiredRole">Preferred Role / Department</label>
            <input
              id="requiredRole"
              type="text"
              placeholder="Optional filter: Backend, QA, Engineering"
              value={requiredRole}
              onChange={(e) => setRequiredRole(e.target.value)}
            />
            <p className="helper-text">Use this to narrow the pool before score-based matching runs.</p>

            <label htmlFor="projectCsv">Project Employee CSV</label>
            <div className="project-csv-upload">
              <input
                id="projectCsv"
                type="file"
                accept=".csv"
                onChange={handleProjectCsvUpload}
              />
              <button type="button" className="btn btn-neutral" onClick={handleDownloadProjectTemplate}>
                Download CSV Template
              </button>
            </div>
            <p className="helper-text">
              Each project uses its own CSV dataset. The model will form the team only from this file.
            </p>
            {csvMessage && <div className="message success">{csvMessage}</div>}
            {liveValidation && (
              <div className="csv-validation-panel">
                <h3>CSV Validation Report</h3>
                <div className="validation-grid">
                  <span>Total rows: <strong>{liveValidation.totalRows}</strong></span>
                  <span>Valid rows: <strong>{liveValidation.validRows}</strong></span>
                  <span>Unavailable: <strong>{liveValidation.unavailable.length}</strong></span>
                  <span>Skill gaps: <strong>{liveValidation.skillGaps.length}</strong></span>
                </div>
                {(liveValidation.duplicateIds.length > 0 ||
                  liveValidation.missingSkillProfiles.length > 0 ||
                  liveValidation.invalidScores.length > 0 ||
                  liveValidation.skillGaps.length > 0) && (
                  <div className="validation-issues">
                    {liveValidation.duplicateIds.length > 0 && <p>Duplicate IDs: {liveValidation.duplicateIds.join(', ')}</p>}
                    {liveValidation.missingSkillProfiles.length > 0 && <p>Missing skill profiles: {liveValidation.missingSkillProfiles.join(', ')}</p>}
                    {liveValidation.invalidScores.length > 0 && <p>Invalid skill scores: {liveValidation.invalidScores.join(', ')}</p>}
                    {liveValidation.skillGaps.length > 0 && <p>Missing required coverage: {liveValidation.skillGaps.join(', ')}</p>}
                  </div>
                )}
              </div>
            )}

            <div className="config-preview">
              <h3>Project Snapshot</h3>
              <p>Project: {projectName.trim() || 'Not named yet'}</p>
              <p>ID: {projectId.trim() || 'Not assigned yet'}</p>
              <p>Team Size: {totalTeamSize}</p>
              <p>Project CSV: {projectCsvName || 'Not uploaded yet'}</p>
              <p>CSV Employees: {projectEmployees.length}</p>
              <p>Workspace Employees: {candidateCount}</p>
              <p>Skill Targets: {previewText}</p>
            </div>
          </article>

          <article className="panel panel-strong">
            <h2 className="formation-title">Scoring Weights</h2>
            <p className="helper-text">Balance how much the system values skill fit, experience, and performance.</p>

            <div className="weight-grid">
              <label className="weight-card" htmlFor="weightSkill">
                <span>Skill Score</span>
                <input
                  id="weightSkill"
                  type="number"
                  min="0"
                  value={weights.skill}
                  onChange={(e) => updateWeight('skill', e.target.value)}
                />
                <strong>{normalizedWeights.skill}%</strong>
              </label>

              <label className="weight-card" htmlFor="weightExperience">
                <span>Experience</span>
                <input
                  id="weightExperience"
                  type="number"
                  min="0"
                  value={weights.experience}
                  onChange={(e) => updateWeight('experience', e.target.value)}
                />
                <strong>{normalizedWeights.experience}%</strong>
              </label>

              <label className="weight-card" htmlFor="weightPerformance">
                <span>Performance</span>
                <input
                  id="weightPerformance"
                  type="number"
                  min="0"
                  value={weights.performance}
                  onChange={(e) => updateWeight('performance', e.target.value)}
                />
                <strong>{normalizedWeights.performance}%</strong>
              </label>
            </div>
          </article>
        </section>

        <section className="panel panel-strong">
          <div className="section-title-row">
            <div>
              <h2 className="formation-title">Required Skills</h2>
              <p className="helper-text">Define flexible skills, score ranges, and priorities for this project.</p>
            </div>
            <button type="button" className="btn btn-neutral" onClick={addSkillRequirement}>
              Add Skill
            </button>
          </div>

          <div className="skill-requirement-list">
            {skillRequirements.map((skill, index) => (
              <div className="skill-requirement-card" key={skill.id}>
                <div className="skill-requirement-header">
                  <strong>Skill {index + 1}</strong>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => removeSkillRequirement(skill.id)}
                    disabled={skillRequirements.length === 1}
                  >
                    Remove
                  </button>
                </div>

                <div className="skill-requirement-grid">
                  <div>
                    <label htmlFor={`skill-name-${skill.id}`}>Skill Name</label>
                    <input
                      id={`skill-name-${skill.id}`}
                      type="text"
                      value={skill.name}
                      onChange={(e) => updateSkillRequirement(skill.id, 'name', e.target.value)}
                      placeholder="Java, CSS, Communication, MongoDB"
                    />
                  </div>
                  <div>
                    <label htmlFor={`skill-priority-${skill.id}`}>Priority</label>
                    <select
                      id={`skill-priority-${skill.id}`}
                      value={skill.priority}
                      onChange={(e) => updateSkillRequirement(skill.id, 'priority', e.target.value)}
                    >
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`skill-min-${skill.id}`}>Minimum Score</label>
                    <input
                      id={`skill-min-${skill.id}`}
                      type="number"
                      min="0"
                      max="10"
                      value={skill.minScore}
                      onChange={(e) => updateSkillRequirement(skill.id, 'minScore', e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor={`skill-max-${skill.id}`}>Maximum Score</label>
                    <input
                      id={`skill-max-${skill.id}`}
                      type="number"
                      min="0"
                      max="10"
                      value={skill.maxScore}
                      onChange={(e) => updateSkillRequirement(skill.id, 'maxScore', e.target.value)}
                    />
                  </div>
                </div>
                {skill.name && (
                  <div className="bundle-preview">
                    <span>Bundle Preview</span>
                    <strong>{getRequirementComponents(skill.name).join(' + ') || skill.name}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="formation-action">
          <button type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="loading-spinner" />
                {mlProgress ? mlProgress.label : 'Generating project team...'}
              </>
            ) : (
              'Generate Team'
            )}
          </button>
        </div>

        {/* ── Real-time ML progress bar ── */}
        {loading && mlProgress && (
          <section className="panel panel-strong ml-progress-panel">
            <div className="ml-progress-header">
              <h3 className="ml-progress-title">AI Pipeline Running</h3>
              <span className="ml-progress-pct">{mlProgress.pct}%</span>
            </div>
            <div className="ml-progress-track">
              <div
                className="ml-progress-fill"
                style={{ width: `${mlProgress.pct}%` }}
              />
            </div>
            <p className="ml-progress-label">{mlProgress.label}</p>
            <div className="ml-progress-steps">
              {Array.from({ length: mlProgress.total }, (_, i) => (
                <div
                  key={i}
                  className={`ml-step-dot ${
                    i < mlProgress.step ? 'done' : i === mlProgress.step - 1 ? 'active' : ''
                  }`}
                  title={`Step ${i + 1}`}
                />
              ))}
            </div>
          </section>
        )}
      </form>
    </>
  );
};

export default TeamFormation;
