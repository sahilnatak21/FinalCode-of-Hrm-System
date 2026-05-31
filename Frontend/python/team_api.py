"""
HRM Team Formation ML API  —  Improved Algorithm
=================================================
K-Means + Attention Scoring + Random Forest + Confusion Matrix + Explainable Output
"""

import asyncio
import csv
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import requests
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    silhouette_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

# ── App setup ────────────────────────────────────────────────────────────────

APP = FastAPI(title="HRM Team Formation ML API", version="2.0.0")
APP.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR            = Path(__file__).resolve().parent
CONFIG_FILE         = BASE_DIR / "team_config.json"
LOCAL_EMPLOYEE_CSV  = BASE_DIR / "employees.csv"
EMPLOYEE_API_URL    = "http://localhost:8080/api/employees"
RANDOM_STATE        = 42

# ── Constants ─────────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "minClusters": 2,
    "maxClusters": 8,
    "randomState": RANDOM_STATE,
    "kmeansNInit": 20,
    "scoreWeights": {
        "skillSimilarity": 0.5,
        "experience": 0.3,
        "salaryFit": 0.2,
    },
}

PRIORITY_WEIGHTS = {
    "critical": 1.00,
    "high":     0.82,
    "medium":   0.64,
    "low":      0.46,
}

SKILL_ALIASES = {
    "springboot":   "spring boot",
    "spring_boot":  "spring boot",
    "nodejs":       "node js",
    "node.js":      "node js",
    "reactjs":      "react",
    "postgres":     "postgresql",
    "ml":           "machine learning",
    "ai":           "artificial intelligence",
    "js":           "javascript",
    "ts":           "typescript",
    "k8s":          "kubernetes",
}

AVAILABILITY_MAP = {
    "available":   100.0,
    "busy":         60.0,
    "on leave":     10.0,
    "unavailable":   0.0,
}

LEADERSHIP_KEYWORDS = [
    "leadership", "lead", "manager", "management",
    "senior", "head", "director", "vp", "principal",
]

# Maps what a user might type in "Required Role" → employee role/dept/skill keywords to match
ROLE_DOMAIN_ALIASES: dict[str, list[str]] = {
    "web development":     ["frontend", "react", "angular", "vue", "javascript", "html", "css", "developer", "web"],
    "web developer":       ["frontend", "react", "angular", "vue", "javascript", "developer"],
    "frontend":            ["frontend", "react", "angular", "vue", "javascript", "typescript", "html", "css"],
    "frontend developer":  ["frontend", "react", "angular", "vue", "javascript", "developer"],
    "backend":             ["backend", "java", "python", "node", "spring", "django", "api", "database"],
    "backend developer":   ["backend", "java", "python", "node", "spring", "developer"],
    "full stack":          ["frontend", "backend", "react", "java", "python", "node", "developer"],
    "fullstack":           ["frontend", "backend", "react", "java", "python", "developer"],
    "full stack developer":["frontend", "backend", "react", "java", "python", "developer"],
    "software engineer":   ["engineering", "developer", "backend", "frontend", "java", "python"],
    "software developer":  ["engineering", "developer", "backend", "frontend"],
    "data scientist":      ["data science", "data", "machine learning", "python", "analytics"],
    "data science":        ["data science", "data", "machine learning", "python", "analytics", "statistics"],
    "ml engineer":         ["machine learning", "data science", "python", "tensorflow", "pytorch"],
    "machine learning":    ["machine learning", "data science", "python", "tensorflow", "pytorch", "ai"],
    "devops":              ["devops", "docker", "kubernetes", "aws", "cloud", "ci/cd", "jenkins"],
    "cloud":               ["aws", "azure", "gcp", "cloud", "devops", "terraform", "kubernetes"],
    "cloud engineer":      ["aws", "azure", "cloud", "docker", "kubernetes", "terraform"],
    "qa":                  ["qa", "testing", "selenium", "automation", "quality"],
    "quality assurance":   ["qa", "testing", "selenium", "automation", "quality"],
    "tester":              ["testing", "qa", "selenium", "cypress", "automation"],
    "project manager":     ["management", "leadership", "scrum", "agile", "planning"],
    "scrum master":        ["scrum", "agile", "management", "leadership", "planning"],
    "architect":           ["architecture", "leadership", "senior", "design", "engineering"],
    "security":            ["security", "network", "encryption", "penetration"],
    "mobile":              ["mobile", "android", "ios", "react native", "flutter"],
    "android":             ["android", "mobile", "kotlin", "java"],
    "ios":                 ["ios", "mobile", "swift", "objective-c"],
    "database":            ["database", "sql", "mysql", "postgresql", "mongodb", "dba"],
    "ui":                  ["frontend", "react", "ux design", "css", "html", "design"],
    "ux":                  ["ux design", "frontend", "design", "css", "user experience"],
    "designer":            ["design", "ux design", "frontend", "css", "figma"],
}

PROJECT_MGMT_KEYWORDS = [
    "project management", "project manager", "pm", "scrum",
    "agile", "kanban", "jira", "planning",
]

FEATURE_NAMES = [
    "skill_level", "experience", "performance",
    "availability", "skill_match",
]

CLASSIFICATION_TARGET_FIELDS = [
    "actualTeam", "actualLabel", "target", "class", "department",
]


# ── Pydantic models ───────────────────────────────────────────────────────────

class TeamConfigRequest(BaseModel):
    scoreWeights:  dict[str, float] | None = None
    minClusters:   int | None = None
    maxClusters:   int | None = None
    randomState:   int | None = None
    kmeansNInit:   int | None = None


class TeamGenerateRequest(BaseModel):
    criteria: dict[str, Any] = Field(default_factory=dict)
    config:   dict[str, Any] = Field(default_factory=dict)


# ── Config I/O ────────────────────────────────────────────────────────────────

def read_config():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return DEFAULT_CONFIG


def write_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


# ── Skill utilities ───────────────────────────────────────────────────────────

def split_skills(skills_raw):
    if not skills_raw:
        return []
    if isinstance(skills_raw, list):
        return [str(s).strip().lower() for s in skills_raw if str(s).strip()]
    text = str(skills_raw).replace("|", ",").replace(";", ",")
    return [s.strip().lower() for s in text.split(",") if s.strip()]


def normalize_skill_name(value):
    normalized = (
        str(value or "").strip().lower()
        .replace(".", " ").replace("-", " ").replace("_", " ")
    )
    normalized = " ".join(p for p in normalized.split() if p)
    compact = normalized.replace(" ", "")
    return SKILL_ALIASES.get(compact, normalized)


def parse_skill_scores(raw_value, fallback_skills="", fallback_level=1):
    if isinstance(raw_value, dict):
        result = {}
        for key, value in raw_value.items():
            n = normalize_skill_name(key)
            if n:
                result[n] = float(np.clip(float(value or 0), 0, 10))
        return result

    text = str(raw_value or "").strip()
    if text:
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parse_skill_scores(parsed, fallback_skills, fallback_level)
        except json.JSONDecodeError:
            result = {}
            for part in text.replace("|", ",").replace(";", ",").split(","):
                skill_name, _, raw_score = part.partition(":")
                n = normalize_skill_name(skill_name)
                if not n:
                    continue
                try:
                    result[n] = float(np.clip(float(raw_score.strip() or 0), 0, 10))
                except ValueError:
                    result[n] = float(np.clip(float(fallback_level or 0), 0, 10))
            if result:
                return result

    return {
        normalize_skill_name(skill): float(np.clip(float(fallback_level or 0), 0, 10))
        for skill in split_skills(fallback_skills)
        if normalize_skill_name(skill)
    }


# ── Scoring utilities ─────────────────────────────────────────────────────────

def score_within_range(value, min_score, max_score):
    score     = float(value or 0)
    min_score = float(min_score or 0)
    max_score = max(min_score, float(max_score or min_score or 0))
    if min_score <= score <= max_score:
        return 1.0
    if score > max_score:
        return max(0.55, max_score / max(score, 1.0))
    if min_score <= 0:
        return max(0.0, score / max(max_score, 1.0))
    return max(0.0, score / min_score)


def normalize_weight_map(score_weights):
    numeric = {
        "skill":       max(0.0, float((score_weights or {}).get("skill", 50) or 0)),
        "experience":  max(0.0, float((score_weights or {}).get("experience", 25) or 0)),
        "performance": max(0.0, float((score_weights or {}).get("performance", 25) or 0)),
    }
    total = sum(numeric.values())
    if total <= 0:
        return {"skill": 50.0, "experience": 25.0, "performance": 25.0}
    return {k: (v / total) * 100.0 for k, v in numeric.items()}


def normalize(values, default=0.0):
    arr = np.array(values, dtype=float)
    if len(arr) == 0:
        return arr
    min_v, max_v = float(np.min(arr)), float(np.max(arr))
    if math.isclose(min_v, max_v):
        return np.full_like(arr, default if default > 0 else 1.0)
    return (arr - min_v) / (max_v - min_v)


def availability_score_raw(raw):
    key = str(raw or "").strip().lower()
    return AVAILABILITY_MAP.get(key, 50.0) / 100.0


def cosine_similarity(a, b):
    a_norm = np.linalg.norm(a)
    b_norm = np.linalg.norm(b)
    if a_norm == 0 or b_norm == 0:
        return 0.0
    return float(np.dot(a, b) / (a_norm * b_norm))


# ── Required skill expansion ──────────────────────────────────────────────────

def expand_required_skill_ranges(required_skill_ranges):
    expanded = []
    for item in required_skill_ranges or []:
        raw_name = item.get("name") or item.get("skill") or ""
        parts = [
            normalize_skill_name(p)
            for p in str(raw_name).replace("|", ",").replace(";", ",").split(",")
        ]
        parts = [p for p in parts if p]
        expanded.append({**item, "name": str(raw_name).strip(), "skill": str(raw_name).strip(), "components": parts})
    return expanded


# ════════════════════════════════════════════════════════════════════════════════
# 1. DATA PREPROCESSING
# ════════════════════════════════════════════════════════════════════════════════

def preprocess_employee(emp):
    """Clean, normalize, and standardize a single employee record."""
    # Normalize skill names to lowercase
    raw_scores = parse_skill_scores(
        emp.get("skillScores"), emp.get("skills"), emp.get("skillLevel") or 1
    )

    # Convert skill scores to 0-10 scale (clip)
    clean_scores = {
        normalize_skill_name(k): float(np.clip(float(v or 0), 0, 10))
        for k, v in raw_scores.items()
        if normalize_skill_name(k)
    }

    # Convert experience and performanceRating to numeric
    experience = float(emp.get("experience") or 0)
    performance = float(emp.get("performanceRating") or emp.get("score") or 0)
    performance = float(np.clip(performance, 0, 10))

    # Standardize availability value
    raw_avail = str(emp.get("availability") or "Available").strip().lower()
    avail_map = {
        "available":   "Available",
        "busy":        "Busy",
        "on leave":    "On Leave",
        "onleave":     "On Leave",
        "on_leave":    "On Leave",
        "unavailable": "Unavailable",
    }
    availability = avail_map.get(raw_avail, "Available")

    # Encode role and department as lowercase strings
    role       = str(emp.get("role") or "").strip().lower()
    department = str(emp.get("department") or "General").strip().lower()

    avg_skill_level = (
        sum(clean_scores.values()) / len(clean_scores) if clean_scores else float(emp.get("skillLevel") or 1)
    )
    avg_skill_level = float(np.clip(avg_skill_level, 0, 10))

    return {
        **emp,
        "skillScores":     clean_scores,
        "skills":          emp.get("skills") or ", ".join(clean_scores.keys()),
        "skillLevel":      round(avg_skill_level, 4),
        "experience":      round(experience, 4),
        "performanceRating": round(performance, 4),
        "availability":    availability,
        "_role_lower":     role,
        "_dept_lower":     department,
    }


# ════════════════════════════════════════════════════════════════════════════════
# 2. FEATURE ENGINEERING — all scores 0–100
# ════════════════════════════════════════════════════════════════════════════════

def compute_attention_skill_score(skill_scores, required_skills):
    """
    attentionSkillScore = sum(employeeSkillScore * skillAttentionWeight) / max_possible * 100
    skillAttentionWeight is based on priority, then softmax-normalized across required skills.
    """
    if not required_skills:
        avg = sum(skill_scores.values()) / max(1, len(skill_scores)) if skill_scores else 0.0
        return float(np.clip(avg * 10.0, 0.0, 100.0))

    raw_weights = np.array([
        PRIORITY_WEIGHTS.get(req.get("priority", "medium"), 0.64)
        for req in required_skills
    ], dtype=float)
    # Softmax-normalize
    exp_w = np.exp(raw_weights - np.max(raw_weights))
    attention_weights = exp_w / np.sum(exp_w)

    weighted_sum = 0.0
    details = []
    for req, w in zip(required_skills, attention_weights):
        comp_scores = [float(skill_scores.get(c, 0.0)) for c in req.get("components", [])]
        emp_score = sum(comp_scores) / max(1, len(comp_scores))
        contribution = (emp_score / 10.0) * float(w) * 100.0
        weighted_sum += contribution
        details.append({
            "requiredSkill":   req["name"],
            "employeeScore":   round(emp_score, 2),
            "attentionWeight": round(float(w), 6),
            "weightedContribution": round(contribution, 4),
            "isMissing":       emp_score == 0.0,
        })

    return float(np.clip(weighted_sum, 0.0, 100.0)), details


def compute_all_candidate_scores(emp, required_skills, required_roles, max_exp, max_perf):
    """
    Compute all 9 feature-engineering scores (0–100) and finalCandidateScore.
    Returns a dict of scores + attentionDetails.
    """
    skill_scores = emp.get("skillScores", {})

    # ── averageSkillScore (0–100)
    avg_skill = (sum(skill_scores.values()) / max(1, len(skill_scores))) * 10.0 if skill_scores else 0.0
    avg_skill = float(np.clip(avg_skill, 0.0, 100.0))

    # ── attentionSkillScore (0–100)
    attn_result = compute_attention_skill_score(skill_scores, required_skills)
    if isinstance(attn_result, tuple):
        attention_skill_score, attention_details = attn_result
    else:
        attention_skill_score = attn_result
        attention_details = []

    # ── experienceScore (0–100)
    exp = float(emp.get("experience") or 0)
    experience_score = float(np.clip((exp / max(max_exp, 1.0)) * 100.0, 0.0, 100.0))

    # ── performanceScore (0–100)
    perf = float(emp.get("performanceRating") or 0)
    performance_score = float(np.clip((perf / 10.0) * 100.0, 0.0, 100.0))

    # ── availabilityScore (0–100)
    avail_str = str(emp.get("availability") or "Available").lower()
    availability_score = AVAILABILITY_MAP.get(avail_str, 50.0)

    # ── roleMatchScore (0–100)
    if required_roles:
        role_text  = str(emp.get("_role_lower") or emp.get("role") or "").lower()
        dept_text  = str(emp.get("_dept_lower") or emp.get("department") or "").lower()
        skills_txt = str(emp.get("skills") or "").lower()
        if any(r in role_text or r in dept_text for r in required_roles):
            role_match_score = 100.0
        elif any(r in skills_txt for r in required_roles):
            role_match_score = 60.0
        else:
            role_match_score = 0.0
    else:
        role_match_score = 50.0  # neutral — no role filter

    # ── leadershipScore (0–100)
    role_str = str(emp.get("_role_lower") or emp.get("role") or "").lower()
    leadership_score = 0.0
    for kw in LEADERSHIP_KEYWORDS:
        if kw in role_str:
            leadership_score = 80.0
            break
    leadership_from_skills = max(
        float(skill_scores.get("leadership", 0.0)),
        float(skill_scores.get("lead", 0.0)),
        float(skill_scores.get("management", 0.0)),
    ) * 10.0
    leadership_score = float(np.clip(max(leadership_score, leadership_from_skills), 0.0, 100.0))

    # ── project management score helper (used in leader calc)
    pm_score_raw = max(
        float(skill_scores.get("project management", 0.0)),
        float(skill_scores.get("scrum", 0.0)),
        float(skill_scores.get("agile", 0.0)),
    ) * 10.0
    pm_from_role = 0.0
    for kw in PROJECT_MGMT_KEYWORDS:
        if kw in role_str:
            pm_from_role = 70.0
            break
    project_mgmt_score = float(np.clip(max(pm_score_raw, pm_from_role), 0.0, 100.0))

    # ── skillCoverageScore (0–100)
    if required_skills:
        covered = sum(
            1 for req in required_skills
            if any(float(skill_scores.get(c, 0)) > 0 for c in req.get("components", []))
        )
        skill_coverage_score = (covered / len(required_skills)) * 100.0
    else:
        skill_coverage_score = float(np.clip(avg_skill, 0.0, 100.0))

    # ── finalCandidateScore (0–100)
    if required_roles:
        final_score = (
            0.45 * attention_skill_score
            + 0.20 * experience_score
            + 0.15 * performance_score
            + 0.10 * availability_score
            + 0.10 * role_match_score
        )
    else:
        final_score = (
            0.50 * attention_skill_score
            + 0.20 * experience_score
            + 0.20 * performance_score
            + 0.10 * availability_score
        )
    final_score = float(np.clip(final_score, 0.0, 100.0))

    return {
        "averageSkillScore":    round(avg_skill, 2),
        "attentionSkillScore":  round(attention_skill_score, 2),
        "experienceScore":      round(experience_score, 2),
        "performanceScore":     round(performance_score, 2),
        "availabilityScore":    round(availability_score, 2),
        "roleMatchScore":       round(role_match_score, 2),
        "leadershipScore":      round(leadership_score, 2),
        "projectMgmtScore":     round(project_mgmt_score, 2),
        "skillCoverageScore":   round(skill_coverage_score, 2),
        "finalCandidateScore":  round(final_score, 2),
        "attentionDetails":     attention_details,
    }


# ════════════════════════════════════════════════════════════════════════════════
# 3. K-MEANS CLUSTERING
# ════════════════════════════════════════════════════════════════════════════════

def select_kmeans_k(feature_matrix, min_k, max_k, random_state, n_init):
    """
    Choose k by silhouette score.
    Fallback: k = min(5, max(2, sqrt(n_employees))).
    """
    n = feature_matrix.shape[0]
    if n < 3:
        return 1

    sqrt_k = max(2, min(5, int(round(math.sqrt(n)))))
    lower  = max(2, min_k)
    upper  = min(max_k, n - 1)
    if lower > upper:
        return min(sqrt_k, n)

    best_k, best_score = lower, -1.0
    for k in range(lower, upper + 1):
        model  = KMeans(n_clusters=k, random_state=random_state, n_init=n_init)
        labels = model.fit_predict(feature_matrix)
        if len(set(labels)) < 2:
            continue
        score = silhouette_score(feature_matrix, labels)
        if score > best_score:
            best_score = score
            best_k     = k

    return best_k


def build_cluster_summary(employees, labels):
    """Return per-cluster statistics."""
    unique_labels = sorted(set(int(l) for l in labels))
    summary = []
    for cid in unique_labels:
        idxs = [i for i, l in enumerate(labels) if int(l) == cid]
        members = [employees[i] for i in idxs]
        summary.append({
            "clusterId":       cid,
            "size":            len(members),
            "memberNames":     [m.get("name") or m.get("employeeId") or f"Emp{i}" for i, m in zip(idxs, members)],
            "avgExperience":   round(float(np.mean([float(m.get("experience") or 0) for m in members])), 2),
            "avgPerformance":  round(float(np.mean([float(m.get("performanceRating") or 0) for m in members])), 2),
            "avgSkillLevel":   round(float(np.mean([float(m.get("skillLevel") or 1) for m in members])), 2),
            "departments":     list({str(m.get("department") or "General") for m in members}),
        })
    return summary


# ════════════════════════════════════════════════════════════════════════════════
# 4. ATTENTION-BASED SCORING (feature-level)
# ════════════════════════════════════════════════════════════════════════════════

def compute_attention_weights(feature_matrix):
    """Fisher score-based attention weights for feature columns."""
    if feature_matrix.shape[0] < 3:
        return np.full(feature_matrix.shape[1], 1.0 / feature_matrix.shape[1])

    probe_k     = min(4, max(2, feature_matrix.shape[0] - 1))
    probe_model = KMeans(n_clusters=probe_k, random_state=RANDOM_STATE, n_init=10)
    probe_labels = probe_model.fit_predict(feature_matrix)

    fisher_scores = []
    for col_idx in range(feature_matrix.shape[1]):
        col          = feature_matrix[:, col_idx]
        global_mean  = np.mean(col)
        between_var  = 0.0
        within_var   = 0.0
        for cid in np.unique(probe_labels):
            cv = col[probe_labels == cid]
            if len(cv) == 0:
                continue
            cm = np.mean(cv)
            between_var += len(cv) * ((cm - global_mean) ** 2)
            within_var  += np.sum((cv - cm) ** 2)
        fisher_scores.append(float(between_var / (within_var + 1e-6)))

    fs  = np.array(fisher_scores, dtype=float)
    fs  = np.log1p(np.clip(fs, 0, np.percentile(fs, 95)))
    fsn = (fs - np.mean(fs)) / (np.std(fs) + 1e-9)
    exp_fs = np.exp(fsn)
    return exp_fs / np.sum(exp_fs)


def apply_attention_to_skills(skill_matrix, project_requirement_vector):
    """Compute employee-level softmax attention from skill similarity to project needs."""
    similarities = np.array(
        [cosine_similarity(skill_matrix[i], project_requirement_vector) for i in range(skill_matrix.shape[0])],
        dtype=float,
    )
    scaled       = 3.0 * (similarities - similarities.mean()) / (similarities.std() + 1e-9)
    exp_s        = np.exp(scaled)
    attention    = exp_s / np.sum(exp_s)
    weighted     = skill_matrix * attention.reshape(-1, 1)
    return attention, weighted, similarities


# ════════════════════════════════════════════════════════════════════════════════
# 5. RANDOM FOREST EVALUATION (with pseudo-labels)
# ════════════════════════════════════════════════════════════════════════════════

def first_present_target_field(rows):
    for field in CLASSIFICATION_TARGET_FIELDS:
        if any(str(row.get(field, "")).strip() for row in rows):
            return field
    return None


def build_random_forest_evaluation(rows, feature_matrix, final_scores, random_state=RANDOM_STATE):
    """
    Train a RandomForestClassifier.
    Uses real labels if available; otherwise generates pseudo-labels from finalCandidateScore:
      >= 75  → Suitable
      >= 50  → Maybe Suitable
      <  50  → Not Suitable
    """
    if feature_matrix.shape[0] < 6:
        return {
            "available":  False,
            "reason":     f"Dataset too small ({feature_matrix.shape[0]} records). Need at least 6 employees for Random Forest evaluation.",
            "modelName":  "Random Forest Classifier",
            "pseudoLabelUsed": False,
        }

    target_field    = first_present_target_field(rows)
    pseudo_label_used = target_field is None

    if pseudo_label_used:
        y = np.array([
            "Suitable"       if s >= 75 else
            "Maybe Suitable" if s >= 50 else
            "Not Suitable"
            for s in final_scores
        ], dtype=object)
        label_note = (
            "Random Forest evaluation is based on pseudo-labels generated from candidate "
            "suitability rules: Suitable (≥75), Maybe Suitable (≥50), Not Suitable (<50)."
        )
    else:
        y          = np.array([str(row.get(target_field) or "Unknown") for row in rows], dtype=object)
        label_note = f"Trained on real labels from column '{target_field}'. Evaluated on 20% test split."

    label_names, counts = np.unique(y, return_counts=True)
    if len(label_names) < 2:
        return {
            "available":  False,
            "reason":     "Random Forest needs at least two label classes.",
            "pseudoLabelUsed": pseudo_label_used,
        }

    stratify = y if int(np.min(counts)) >= 2 else None
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            feature_matrix, y, test_size=0.2, random_state=random_state, stratify=stratify,
        )
        model = RandomForestClassifier(
            n_estimators=100, random_state=random_state, max_depth=8, min_samples_split=2,
        )
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
    except ValueError as exc:
        return {"available": False, "reason": f"Random Forest could not run: {str(exc)}", "pseudoLabelUsed": pseudo_label_used}

    labels    = sorted(set(y_test).union(set(y_pred)))
    matrix    = confusion_matrix(y_test, y_pred, labels=labels)
    avg       = "weighted" if len(labels) > 2 else "binary" if len(labels) == 2 else "macro"
    pos_label = labels[-1] if len(labels) == 2 else None

    precision = precision_score(y_test, y_pred, average=avg, labels=labels, zero_division=0,
                                pos_label=pos_label if avg == "binary" else labels[0])
    recall    = recall_score(y_test, y_pred, average=avg, labels=labels, zero_division=0,
                             pos_label=pos_label if avg == "binary" else labels[0])
    f1        = f1_score(y_test, y_pred, average=avg, labels=labels, zero_division=0,
                         pos_label=pos_label if avg == "binary" else labels[0])

    # Feature importance
    importances = model.feature_importances_.tolist()
    feature_importance = [
        {"feature": FEATURE_NAMES[i] if i < len(FEATURE_NAMES) else f"feature_{i}",
         "importance": round(float(v), 6)}
        for i, v in enumerate(importances)
    ]
    feature_importance.sort(key=lambda x: x["importance"], reverse=True)

    # Confusion matrix interpretation
    cm_interpretation = _interpret_confusion_matrix(labels, matrix)

    return {
        "available":        True,
        "modelName":        "Random Forest Classifier",
        "pseudoLabelUsed":  pseudo_label_used,
        "note":             label_note,
        "trainSize":        int(len(y_train)),
        "testSize":         int(len(y_test)),
        "accuracyScore":    round(float(accuracy_score(y_test, y_pred)), 6),
        "precision":        round(float(precision), 6),
        "recall":           round(float(recall), 6),
        "f1Score":          round(float(f1), 6),
        "labels":           labels,
        "confusionMatrix":  matrix.astype(int).tolist(),
        "cmInterpretation": cm_interpretation,
        "classificationReport": classification_report(
            y_test, y_pred, labels=labels, zero_division=0, output_dict=True,
        ),
        "featureImportance": feature_importance,
        "targetField":      target_field or "pseudo_label",
    }


# ════════════════════════════════════════════════════════════════════════════════
# 6. CONFUSION MATRIX (standalone, from K-Means labels)
# ════════════════════════════════════════════════════════════════════════════════

def _interpret_confusion_matrix(labels, matrix):
    """Return a human-readable interpretation of the confusion matrix."""
    total    = int(matrix.sum()) or 1
    correct  = int(np.trace(matrix))
    accuracy = round(correct / total * 100, 2)
    rows = []
    for i, lbl in enumerate(labels):
        tp = int(matrix[i, i])
        fp = int(matrix[:, i].sum()) - tp
        fn = int(matrix[i, :].sum()) - tp
        rows.append({
            "label":         lbl,
            "truePositive":  tp,
            "falsePositive": fp,
            "falseNegative": fn,
            "precision":     round(tp / max(1, tp + fp), 4),
            "recall":        round(tp / max(1, tp + fn), 4),
        })
    return {
        "labels":      labels,
        "matrix":      matrix.astype(int).tolist(),
        "accuracy":    accuracy,
        "totalSamples": total,
        "perClass":    rows,
        "explanation": (
            f"Diagonal values show correct predictions per class. "
            f"Off-diagonal values are misclassifications. "
            f"Overall accuracy: {accuracy}% ({correct}/{total} correct)."
        ),
    }


def build_classification_metrics(rows, labels_arr):
    """Build confusion matrix from K-Means cluster labels."""
    target_field = first_present_target_field(rows)
    if target_field is None:
        return {
            "available": False,
            "reason":    "No actual label field. Add actualTeam, actualLabel, target, or class to enable metrics.",
        }

    y_true = [str(row.get(target_field) or "Unknown") for row in rows]
    labels_np = np.array(labels_arr)
    cluster_to_label = {}
    for cid in sorted(np.unique(labels_np)):
        vals = [y_true[i] for i in np.where(labels_np == cid)[0]]
        cluster_to_label[int(cid)] = max(set(vals), key=vals.count) if vals else f"Cluster {cid}"

    y_pred      = [cluster_to_label.get(int(l), f"Cluster {int(l)}") for l in labels_arr]
    label_names = sorted(set(y_true).union(set(y_pred)))
    matrix      = confusion_matrix(y_true, y_pred, labels=label_names)

    return {
        "available":          True,
        "targetField":        target_field,
        "accuracyScore":      round(float(accuracy_score(y_true, y_pred)), 6),
        "labels":             label_names,
        "confusionMatrix":    matrix.astype(int).tolist(),
        "cmInterpretation":   _interpret_confusion_matrix(label_names, matrix),
        "classificationReport": classification_report(
            y_true, y_pred, labels=label_names, zero_division=0, output_dict=True,
        ),
        "clusterToLabel":     {str(k): v for k, v in cluster_to_label.items()},
        "note": (
            "Clusters mapped to their majority actual label before scoring."
            if target_field != "department"
            else "Using department as reference label (no explicit target field supplied)."
        ),
    }


# ════════════════════════════════════════════════════════════════════════════════
# 7. TEAM FORMATION WITH CLUSTER DIVERSITY
# ════════════════════════════════════════════════════════════════════════════════

def compute_cluster_diversity_score(members):
    """0–100: higher = more clusters represented."""
    if not members:
        return 0.0
    clusters = {m.get("clusterId", 0) for m in members}
    return round(min(100.0, (len(clusters) / max(1, len(members))) * 100.0 * math.sqrt(len(clusters))), 2)


def build_coverage_aware_pool(ranked_members, required_skills, team_size):
    """
    Greedy coverage-aware selection with cluster diversity tie-breaking.
    Phase 1: guarantee ≥1 candidate per required skill group.
    Phase 2: fill remaining seats, boosting uncovered skills and cluster diversity.
    """
    if not required_skills:
        return ranked_members[:team_size]

    total_weight = sum(float(r.get("priorityWeight") or 0.64) for r in required_skills) or 1.0
    req_targets  = {}
    assigned     = 0
    remainders   = []
    for req in required_skills:
        raw    = max(1.0, (float(req.get("priorityWeight") or 0.64) / total_weight) * team_size)
        seats  = max(1, math.floor(raw))
        req_targets[req["id"]] = seats
        assigned += seats
        remainders.append((req["id"], raw - seats))

    remainders.sort(key=lambda x: x[1], reverse=True)
    i = 0
    while assigned < team_size and remainders:
        req_targets[remainders[i % len(remainders)][0]] += 1
        assigned += 1
        i += 1
    while assigned > team_size:
        reducible = sorted(
            ((rid, cnt) for rid, cnt in req_targets.items() if cnt > 1),
            key=lambda x: x[1], reverse=True,
        )
        if not reducible:
            break
        req_targets[reducible[0][0]] -= 1
        assigned -= 1

    def get_fit(member, req_id):
        for item in member.get("teamFit", {}).get("skillBreakdown", []):
            if item.get("requirementId") == req_id:
                return float(item.get("fit") or 0)
        return 0.0

    selected           = []
    remaining          = list(ranked_members)
    covered_req_ids    = set()
    req_counts         = {req["id"]: 0 for req in required_skills}
    selected_clusters  = set()

    # Phase 1 — fill per-requirement targets
    for req in required_skills:
        target = req_targets.get(req["id"], 0)
        while len(selected) < team_size and req_counts[req["id"]] < target and remaining:
            best_idx, best_score = -1, float("-inf")
            for idx, m in enumerate(remaining):
                fit   = get_fit(m, req["id"])
                if fit <= 0:
                    continue
                # Slight bonus for new cluster
                div_bonus = 5.0 if int(m.get("clusterId", -1)) not in selected_clusters else 0.0
                cand_score = float(m.get("finalCandidateScore") or m.get("matchScore") or 0) + fit * 30.0 + div_bonus
                if cand_score > best_score:
                    best_score, best_idx = cand_score, idx
            if best_idx < 0:
                break
            chosen = remaining.pop(best_idx)
            selected.append(chosen)
            selected_clusters.add(int(chosen.get("clusterId", -1)))
            req_counts[req["id"]] += 1
            if get_fit(chosen, req["id"]) >= 0.5:
                covered_req_ids.add(req["id"])

    # Phase 2 — fill remaining seats
    while len(selected) < team_size and remaining:
        best_idx, best_score = 0, float("-inf")
        for idx, m in enumerate(remaining):
            uncov_boost = sum(
                float(next(
                    (item.get("fit") or 0 for item in m.get("teamFit", {}).get("skillBreakdown", [])
                     if item.get("requirementId") == req["id"]),
                    0,
                )) * 15.0
                for req in required_skills if req["id"] not in covered_req_ids
            )
            div_bonus  = 8.0 if int(m.get("clusterId", -1)) not in selected_clusters else 0.0
            cand_score = float(m.get("finalCandidateScore") or m.get("matchScore") or 0) + uncov_boost + div_bonus
            if cand_score > best_score:
                best_score, best_idx = cand_score, idx

        chosen = remaining.pop(best_idx)
        selected.append(chosen)
        selected_clusters.add(int(chosen.get("clusterId", -1)))
        for item in chosen.get("teamFit", {}).get("skillBreakdown", []):
            if float(item.get("fit") or 0) >= 0.5:
                covered_req_ids.add(item["requirementId"])

    return selected


# ════════════════════════════════════════════════════════════════════════════════
# 8. TEAM LEADER SELECTION
# ════════════════════════════════════════════════════════════════════════════════

def compute_leader_score(member, max_exp, max_perf):
    """
    leaderScore = 0.35*experienceScore + 0.25*performanceScore
                + 0.20*leadershipSkillScore + 0.10*projectMgmtScore + 0.10*finalCandidateScore
    """
    exp_score   = float(member.get("experienceScore") or 0)
    perf_score  = float(member.get("performanceScore") or 0)
    lead_score  = float(member.get("leadershipScore") or 0)
    pm_score    = float(member.get("projectMgmtScore") or 0)
    final_score = float(member.get("finalCandidateScore") or 0)

    # Fallback if engineered scores not present
    if exp_score == 0 and max_exp > 0:
        exp_score = min(100.0, (float(member.get("experience") or 0) / max_exp) * 100.0)
    if perf_score == 0:
        perf_score = (float(member.get("performanceRating") or 0) / 10.0) * 100.0

    score = (
        0.35 * exp_score
        + 0.25 * perf_score
        + 0.20 * lead_score
        + 0.10 * pm_score
        + 0.10 * final_score
    )
    return round(float(score), 4)


# ════════════════════════════════════════════════════════════════════════════════
# 9. BACKUP CANDIDATE SELECTION
# ════════════════════════════════════════════════════════════════════════════════

def select_backup_candidates(all_ranked, selected_keys, required_skills, n=5):
    """
    For each required skill, find the best non-selected candidates.
    Prefer same/similar role, ranked by finalCandidateScore + skill similarity.
    """
    backups      = []
    seen_keys    = set(selected_keys)

    for candidate in all_ranked:
        ckey = str(
            candidate.get("employeeId") or candidate.get("id") or
            f"{candidate.get('name')}-{candidate.get('role')}"
        ).lower()
        if ckey in seen_keys:
            continue

        skill_scores = candidate.get("skillScores", {})
        matched_req_skills = [
            req["name"]
            for req in required_skills
            if any(float(skill_scores.get(c, 0)) > 0 for c in req.get("components", []))
        ]

        backups.append({
            **candidate,
            "backupReason": (
                f"Covers: {', '.join(matched_req_skills)}" if matched_req_skills
                else "General high-scoring candidate available as fallback."
            ),
            "matchedRequiredSkills": matched_req_skills,
        })
        seen_keys.add(ckey)

        if len(backups) >= n:
            break

    return backups


# ════════════════════════════════════════════════════════════════════════════════
# 10. SKILL GAP ANALYSIS
# ════════════════════════════════════════════════════════════════════════════════

def compute_skill_gap_analysis(members, required_skills):
    """
    Compare required skills with selected team skills.
    Returns: skill, requiredPriority, bestScore, coverageStatus, trainingSuggestion.
    """
    team_skills: dict[str, float] = {}
    for m in members:
        for skill, score in m.get("skillScores", {}).items():
            team_skills[skill] = max(team_skills.get(skill, 0.0), float(score))

    gaps = []
    for req in required_skills:
        best_score = 0.0
        best_skill = req["name"]
        for comp in req.get("components", []):
            score = team_skills.get(comp, 0.0)
            if score > best_score:
                best_score = score
                best_skill = comp

        min_req = float(req.get("minScore", 0))
        if best_score >= max(min_req, 5.0):
            status     = "Covered"
            suggestion = f"{req['name']} is well covered by the team."
        elif best_score > 0:
            status     = "Partially Covered"
            gap        = round(max(min_req, 5.0) - best_score, 1)
            suggestion = (
                f"Team's best score for '{req['name']}' is {best_score:.1f}/10. "
                f"Consider skill training to close the {gap}-point gap."
            )
        else:
            status     = "Missing"
            suggestion = (
                f"No team member has '{req['name']}' skill. "
                f"Consider hiring or onboarding someone with this skill (priority: {req.get('priority','medium')})."
            )

        gaps.append({
            "skill":              req["name"],
            "requiredPriority":   req.get("priority", "medium"),
            "requiredMinScore":   round(min_req, 1),
            "bestTeamScore":      round(best_score, 2),
            "coverageStatus":     status,
            "trainingSuggestion": suggestion,
        })

    covered_count  = sum(1 for g in gaps if g["coverageStatus"] == "Covered")
    total_required = len(gaps)
    coverage_pct   = round((covered_count / max(1, total_required)) * 100.0, 2)

    return {"gaps": gaps, "coveragePercent": coverage_pct, "totalRequired": total_required, "coveredCount": covered_count}


# ════════════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ════════════════════════════════════════════════════════════════════════════════

def parse_experience_from_start_date(value):
    if not value:
        return 0.0
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            start = datetime.strptime(str(value).strip(), fmt)
            return float(max(0, datetime.now().year - start.year))
        except ValueError:
            continue
    return 0.0


def fetch_employees():
    try:
        response = requests.get(EMPLOYEE_API_URL, timeout=5)
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list) and data:
            return data
    except Exception:
        pass
    return load_employees_from_local_csv()


def normalize_employee_record(emp):
    return preprocess_employee(emp)


def load_employees_from_local_csv():
    if not LOCAL_EMPLOYEE_CSV.exists():
        raise FileNotFoundError(
            "No employee source available. Start employee backend on :8080 or keep python/employees.csv."
        )
    employees = []
    with open(LOCAL_EMPLOYEE_CSV, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            team       = (row.get("Team") or "General").strip() or "General"
            name       = (row.get("First Name") or f"Candidate {i + 1}").strip()
            salary     = float(row.get("Salary") or 0)
            bonus      = float(row.get("Bonus %") or 0)
            experience = parse_experience_from_start_date(row.get("Start Date"))
            is_senior  = str(row.get("Senior Management") or "").strip().lower() == "true"
            skills     = [team.lower()]
            if team.lower() in {"marketing", "finance"}:
                skills.extend(["analytics", "communication"])
            elif team.lower() in {"engineering", "it", "development"}:
                skills.extend(["backend", "testing", "devops"])
            else:
                skills.extend(["problem solving", "collaboration"])
            role = f"{team} Specialist"
            if is_senior:
                role = f"Senior {team} Lead"
                skills.append("leadership")
            skill_level = max(1, min(10, int(round((bonus / 2.0) + 3))))
            performance = max(0.0, min(10.0, round(bonus / 2.0, 2)))
            employees.append({
                "id":              f"csv_{i + 1}",
                "employeeId":      f"CSV{i + 1:04d}",
                "name":            name,
                "department":      team,
                "role":            role,
                "skills":          ", ".join(dict.fromkeys(skills)),
                "skillScores":     {normalize_skill_name(s): float(skill_level) for s in dict.fromkeys(skills)},
                "skillLevel":      skill_level,
                "experience":      experience,
                "category":        "Full-time",
                "availability":    "Available",
                "performanceRating": performance,
                "salary":          salary,
                "status":          "Present",
            })
    return employees


# ════════════════════════════════════════════════════════════════════════════════
# MAIN TEAM GENERATION
# ════════════════════════════════════════════════════════════════════════════════

def _generate_team(payload: dict[str, Any]):
    try:
        criteria = payload.get("criteria") or {}
        config   = {**read_config(), **(payload.get("config") or {})}
        config["scoreWeights"] = {**DEFAULT_CONFIG["scoreWeights"], **(config.get("scoreWeights") or {})}

        team_size       = max(1, int(criteria.get("teamSize") or 4))
        number_of_teams = max(1, int(criteria.get("numberOfTeams") or 1))
        project_budget  = float(criteria.get("projectBudget") or criteria.get("budget") or 0)
        min_experience  = float(criteria.get("minExperience") or 0)
        required_role   = str(criteria.get("requiredRole") or "").strip().lower()
        score_weights   = normalize_weight_map(criteria.get("scoreWeights") or {})

        # ── Parse required skills ──────────────────────────────────────────────
        required_skill_ranges = expand_required_skill_ranges(criteria.get("requiredSkillRanges") or [])
        normalized_required_skills = []
        for item in required_skill_ranges:
            components = item.get("components") or []
            if not components:
                continue
            normalized_required_skills.append({
                "id":             str(item.get("id") or f"req-{len(normalized_required_skills) + 1}"),
                "name":           str(item.get("name") or item.get("skill") or "").strip(),
                "components":     components,
                "minScore":       float(item.get("minScore") or item.get("min_score") or 0),
                "maxScore":       float(item.get("maxScore") or item.get("max_score") or 10),
                "priority":       str(item.get("priority") or "medium").strip().lower(),
                "priorityWeight": PRIORITY_WEIGHTS.get(
                    str(item.get("priority") or "medium").strip().lower(), PRIORITY_WEIGHTS["medium"]
                ),
            })

        if not normalized_required_skills:
            for idx, skill in enumerate(split_skills(criteria.get("primarySkills"))):
                n = normalize_skill_name(skill)
                if n:
                    normalized_required_skills.append({
                        "id": f"req-{idx + 1}", "name": n, "components": [n],
                        "minScore": 1.0, "maxScore": 10.0, "priority": "high",
                        "priorityWeight": PRIORITY_WEIGHTS["high"],
                    })

        # ── Load & preprocess employees ────────────────────────────────────────
        raw_employees = payload.get("employees")
        employees = (
            [preprocess_employee(e) for e in raw_employees]
            if isinstance(raw_employees, list) and raw_employees
            else [preprocess_employee(e) for e in fetch_employees()]
        )
        if not employees:
            raise HTTPException(status_code=400, detail="No employees available.")

        # ── Filter eligible (exclude On Leave / Unavailable) ───────────────────
        required_roles = [r.strip() for r in required_role.replace("|", ",").split(",") if r.strip()]

        # Expand role aliases: "web development" → ["frontend","react","developer", ...]
        expanded_role_keywords: list[str] = []
        for r in required_roles:
            expanded_role_keywords.append(r)                          # full phrase
            expanded_role_keywords.extend(r.split())                  # individual words
            for alias_key, alias_vals in ROLE_DOMAIN_ALIASES.items():
                if alias_key in r or r in alias_key:
                    expanded_role_keywords.extend(alias_vals)
        # Also try direct lookup by the full phrase
        for r in required_roles:
            if r in ROLE_DOMAIN_ALIASES:
                expanded_role_keywords.extend(ROLE_DOMAIN_ALIASES[r])
        expanded_role_keywords = list({kw for kw in expanded_role_keywords if len(kw) >= 2})

        def _emp_matches_role(emp) -> bool:
            """True when at least one expanded keyword appears in role/dept/skills."""
            role_txt  = str(emp.get("_role_lower") or emp.get("role") or "").lower()
            dept_txt  = str(emp.get("_dept_lower") or emp.get("department") or "").lower()
            skill_txt = str(emp.get("skills") or "").lower()
            haystack  = f"{role_txt} {dept_txt} {skill_txt}"
            return any(kw in haystack for kw in expanded_role_keywords)

        eligible, excluded = [], []
        for emp in employees:
            avail = str(emp.get("availability") or "Available")
            if avail.lower() in {"on leave", "unavailable"}:
                excluded.append(emp.get("name") or emp.get("employeeId"))
                continue
            if float(emp.get("experience") or 0) < min_experience:
                continue
            if required_roles and not _emp_matches_role(emp):
                continue
            eligible.append(emp)

        # ── Graceful fallback: if role filter is too strict, relax it ──────────
        role_filter_relaxed = False
        if required_roles and len(eligible) < max(2, team_size):
            role_filter_relaxed = True
            eligible = []
            for emp in employees:
                avail = str(emp.get("availability") or "Available")
                if avail.lower() in {"on leave", "unavailable"}:
                    if (emp.get("name") or emp.get("employeeId")) not in excluded:
                        excluded.append(emp.get("name") or emp.get("employeeId"))
                    continue
                if float(emp.get("experience") or 0) < min_experience:
                    continue
                eligible.append(emp)

        if len(eligible) < 2:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough eligible employees (only {len(eligible)} available after filtering). Try lowering minExperience or check that employees are not all On Leave/Unavailable.",
            )

        if team_size > len(eligible):
            team_size = len(eligible)

        # ── Build skill vocabulary & project requirement vector ────────────────
        skill_vocab: list[str] = []
        for req in normalized_required_skills:
            for c in req["components"]:
                if c not in skill_vocab:
                    skill_vocab.append(c)
        for emp in eligible:
            for skill in emp.get("skillScores", {}).keys():
                if skill not in skill_vocab:
                    skill_vocab.append(skill)

        project_req_vector = np.zeros(len(skill_vocab), dtype=float)
        total_pw = max(sum(r["priorityWeight"] for r in normalized_required_skills), 1e-9)
        for req in normalized_required_skills:
            strength = max(req["minScore"], req["maxScore"]) / 10.0
            bw       = req["priorityWeight"] / total_pw
            cw       = bw / max(1, len(req["components"]))
            for comp in req["components"]:
                if comp in skill_vocab:
                    project_req_vector[skill_vocab.index(comp)] = cw * max(strength, 0.1)

        # ── Feature matrix ─────────────────────────────────────────────────────
        max_exp  = max((float(e.get("experience") or 0) for e in eligible), default=1.0) or 1.0
        max_perf = max((float(e.get("performanceRating") or 0) for e in eligible), default=1.0) or 1.0

        feature_rows, skill_matrix_rows = [], []
        enriched_eligible = []

        for emp in eligible:
            skill_scores = emp.get("skillScores", {})
            exp    = float(emp.get("experience") or 0)
            perf   = float(emp.get("performanceRating") or 0)
            avail  = availability_score_raw(emp.get("availability"))
            sl     = float(emp.get("skillLevel") or 1)

            # Skill breakdown per requirement
            skill_breakdown, weighted_total, weighted_max = [], 0.0, 0.0
            for req in normalized_required_skills:
                comp_scores = [float(skill_scores.get(c, 0.0)) for c in req["components"]]
                comp_fits   = [score_within_range(s, req["minScore"], req["maxScore"]) for s in comp_scores]
                emp_score   = sum(comp_scores) / max(1, len(comp_scores))
                fit         = sum(comp_fits) / max(1, len(comp_fits))
                wfit        = fit * req["priorityWeight"]
                weighted_total += wfit
                weighted_max   += req["priorityWeight"]
                skill_breakdown.append({
                    "requirementId":  req["id"],
                    "skill":          req["name"],
                    "components":     req["components"],
                    "priority":       req["priority"],
                    "requiredRange":  f'{req["minScore"]:.0f}-{req["maxScore"]:.0f}',
                    "employeeScore":  round(emp_score, 2),
                    "fit":            round(fit, 4),
                    "weightedFit":    round(wfit, 4),
                })

            skill_match = weighted_total / weighted_max if weighted_max > 0 else 0.5
            skill_vec   = [float(skill_scores.get(s, 0.0)) / 10.0 for s in skill_vocab]
            skill_matrix_rows.append(skill_vec)

            # All engineered scores
            scores = compute_all_candidate_scores(emp, normalized_required_skills, required_roles, max_exp, max_perf)

            enriched_eligible.append({
                **emp,
                **scores,
                "_skillMatch":     skill_match,
                "_skillBreakdown": skill_breakdown,
                "_skillVector":    skill_vec,
            })
            feature_rows.append([sl, exp, perf, avail, skill_match])

        feature_matrix = np.array(feature_rows, dtype=float)
        scaler         = StandardScaler()
        scaled_features = scaler.fit_transform(feature_matrix)
        feature_attention = compute_attention_weights(scaled_features)
        weighted_features = scaled_features * feature_attention

        skill_matrix = np.array(skill_matrix_rows, dtype=float)
        if len(skill_vocab) > 0:
            emp_attention, weighted_skills, skill_similarities = apply_attention_to_skills(
                skill_matrix, project_req_vector,
            )
        else:
            emp_attention     = np.full(len(eligible), 1.0 / max(1, len(eligible)))
            weighted_skills   = skill_matrix
            skill_similarities = np.zeros(len(eligible))

        combined_skill_signal = (
            0.55 * np.array([e["_skillMatch"] for e in enriched_eligible], dtype=float)
            + 0.45 * skill_similarities
        )

        final_scores = np.array([e["finalCandidateScore"] for e in enriched_eligible], dtype=float)

        # ── K-Means clustering ─────────────────────────────────────────────────
        rs    = int(config.get("randomState", RANDOM_STATE))
        n_init = int(config.get("kmeansNInit", 20))
        best_k = select_kmeans_k(
            weighted_features,
            int(config.get("minClusters", 2)),
            int(config.get("maxClusters", 8)),
            rs, n_init,
        )

        kmeans = KMeans(n_clusters=best_k, random_state=rs, n_init=n_init)
        labels = kmeans.fit_predict(weighted_features)

        sil_score = -1.0
        if len(set(labels)) >= 2:
            try:
                sil_score = round(float(silhouette_score(weighted_features, labels)), 6)
            except Exception:
                pass

        cluster_summary = build_cluster_summary(enriched_eligible, labels)

        # Cluster attention signal
        cluster_attention = {
            int(cid): float(np.mean(combined_skill_signal[labels == cid]))
            for cid in np.unique(labels)
        }
        best_cluster = max(cluster_attention, key=cluster_attention.get)

        # Include clusters needed to cover all required skills
        def cluster_covers(cid, components):
            for i in np.where(labels == cid)[0]:
                ss = enriched_eligible[i].get("skillScores", {})
                if any(float(ss.get(c, 0)) > 0 for c in components):
                    return True
            return False

        selected_clusters = {best_cluster}
        for req in normalized_required_skills:
            if not cluster_covers(best_cluster, req["components"]):
                for cid in sorted(cluster_attention, key=cluster_attention.get, reverse=True):
                    if cluster_covers(cid, req["components"]):
                        selected_clusters.add(cid)
                        break

        selected_idx = [i for cid in selected_clusters for i in np.where(labels == cid)[0].tolist()]
        if len(selected_idx) < team_size * number_of_teams:
            selected_idx = list(range(len(eligible)))

        # ── Classification & RF evaluation ────────────────────────────────────
        classification_metrics  = build_classification_metrics(enriched_eligible, labels)
        random_forest_evaluation = build_random_forest_evaluation(
            enriched_eligible, weighted_features, final_scores.tolist(), rs
        )

        # ── Rank candidates ────────────────────────────────────────────────────
        exp_norm    = normalize([enriched_eligible[i].get("experienceScore", 0) for i in range(len(eligible))])
        perf_norm   = normalize([enriched_eligible[i].get("performanceScore", 0) for i in range(len(eligible))])
        skill_norm  = normalize(combined_skill_signal, default=0.5)
        attn_norm   = normalize(emp_attention, default=0.5)
        final_norm  = normalize(final_scores, default=0.5)

        ranked = []
        for i in selected_idx:
            e    = enriched_eligible[i]
            score = float(e.get("finalCandidateScore", 0))

            # Salary penalty
            if project_budget > 0 and float(e.get("salary") or 0) > 0:
                ideal  = project_budget / max(1, team_size)
                salary = float(e.get("salary") or 0)
                if salary > ideal:
                    score *= max(0.62, ideal / max(salary, 1.0))

            # Penalize very low skill match
            if normalized_required_skills:
                sm = e.get("_skillMatch", 0)
                if sm < 0.2:
                    score *= 0.20
                elif sm < 0.4:
                    score *= 0.55

            matched_skills = [
                f'{item["skill"]} ({item["employeeScore"]}/10)'
                for item in e.get("_skillBreakdown", [])
                if item.get("fit", 0) >= 0.8
            ]
            missing_skills = [
                item["skill"]
                for item in e.get("_skillBreakdown", [])
                if item.get("fit", 0) == 0
            ]

            # ── 11. Explainable output per member ──
            attention_contributions = e.get("attentionDetails", [])

            ranked.append({
                **{k: v for k, v in e.items() if not k.startswith("_")},
                "matchScore":          round(float(score), 2),
                "clusterId":           int(labels[i]),
                "attentionWeight":     round(float(emp_attention[i]), 6),
                "teamFit": {
                    "skillMatch":       round(float(combined_skill_signal[i]) * 100, 2),
                    "experienceMatch":  round(float(exp_norm[i]) * 100, 2),
                    "performanceMatch": round(float(perf_norm[i]) * 100, 2),
                    "budgetFit":        round(
                        min(100.0, (project_budget / max(1, team_size)) /
                            max(1.0, float(e.get("salary") or 1)) * 100.0)
                        if project_budget > 0 else 100.0, 2
                    ),
                    "matchedSkills":    matched_skills,
                    "missingSkills":    missing_skills,
                    "skillBreakdown":   e.get("_skillBreakdown", []),
                },
                "explanation": {
                    "clusterLabel":            int(labels[i]),
                    "finalCandidateScore":      round(float(e.get("finalCandidateScore", 0)), 2),
                    "attentionSkillScore":      round(float(e.get("attentionSkillScore", 0)), 2),
                    "experienceScore":          round(float(e.get("experienceScore", 0)), 2),
                    "performanceScore":         round(float(e.get("performanceScore", 0)), 2),
                    "availabilityScore":        round(float(e.get("availabilityScore", 0)), 2),
                    "roleMatchScore":           round(float(e.get("roleMatchScore", 0)), 2),
                    "leadershipScore":          round(float(e.get("leadershipScore", 0)), 2),
                    "skillCoverageScore":       round(float(e.get("skillCoverageScore", 0)), 2),
                    "matchedSkills":            matched_skills,
                    "missingSkills":            missing_skills,
                    "attentionContributions":   attention_contributions,
                    "reasonSelected": (
                        f"Score {round(float(e.get('finalCandidateScore', 0)), 1)}/100 — "
                        f"Attention: {round(float(e.get('attentionSkillScore', 0)), 1)}, "
                        f"Exp: {round(float(e.get('experienceScore', 0)), 1)}, "
                        f"Perf: {round(float(e.get('performanceScore', 0)), 1)}, "
                        f"Cluster {int(labels[i])}."
                    ),
                },
            })

        ranked.sort(key=lambda x: x["matchScore"], reverse=True)

        # Deduplicate
        unique_ranked, seen_keys = [], set()
        for row in ranked:
            key = str(row.get("employeeId") or row.get("id") or f"{row.get('name')}-{row.get('role')}").lower()
            if key in seen_keys:
                continue
            seen_keys.add(key)
            unique_ranked.append(row)

        if not unique_ranked:
            raise HTTPException(status_code=400, detail="No candidates after deduplication.")

        total_required = team_size * number_of_teams
        pool = build_coverage_aware_pool(
            unique_ranked, normalized_required_skills, min(total_required, len(unique_ranked))
        )

        # ── Teams ──────────────────────────────────────────────────────────────
        teams = [{"teamName": f"Team {i + 1}", "members": []} for i in range(number_of_teams)]
        for idx, member in enumerate(pool):
            teams[idx % number_of_teams]["members"].append(member)

        all_members = [m for t in teams for m in t["members"]]

        # ── 8. Leader selection ────────────────────────────────────────────────
        leader = None
        if all_members:
            max_m_exp  = max((float(m.get("experience") or 0) for m in all_members), default=1.0) or 1.0
            max_m_perf = max((float(m.get("performanceRating") or 0) for m in all_members), default=1.0) or 1.0
            leader_candidates = [
                (compute_leader_score(m, max_m_exp, max_m_perf), m)
                for m in all_members
            ]
            best_leader_score, best_leader = max(leader_candidates, key=lambda x: x[0])
            leader_key = str(best_leader.get("employeeId") or best_leader.get("id") or
                             f"{best_leader.get('name')}-{best_leader.get('role')}").lower()
            for m in all_members:
                mk = str(m.get("employeeId") or m.get("id") or f"{m.get('name')}-{m.get('role')}").lower()
                m["isLeader"] = (mk == leader_key)
                if m["isLeader"]:
                    m["leaderScore"] = round(best_leader_score, 2)
            leader = {
                **best_leader,
                "isLeader":    True,
                "leaderScore": round(best_leader_score, 2),
                "leaderReason": (
                    f"Selected based on leaderScore formula: "
                    f"35% experience ({round(float(best_leader.get('experienceScore', 0)), 1)}) + "
                    f"25% performance ({round(float(best_leader.get('performanceScore', 0)), 1)}) + "
                    f"20% leadership ({round(float(best_leader.get('leadershipScore', 0)), 1)}) + "
                    f"10% project management + 10% candidateScore."
                ),
            }

        # ── 9. Backup candidates ───────────────────────────────────────────────
        selected_keys_set = {
            str(m.get("employeeId") or m.get("id") or f"{m.get('name')}-{m.get('role')}").lower()
            for m in pool
        }
        backup_candidates = select_backup_candidates(
            unique_ranked, selected_keys_set, normalized_required_skills, n=5
        )

        # ── 10. Skill gap analysis ─────────────────────────────────────────────
        skill_gap = compute_skill_gap_analysis(all_members, normalized_required_skills)

        # ── Alternate teams ────────────────────────────────────────────────────
        alternate_teams, seen_sigs = [], set()
        for offset in range(min(3, len(unique_ranked))):
            rotated    = unique_ranked[offset:] + unique_ranked[:offset]
            opt_members = build_coverage_aware_pool(rotated, normalized_required_skills, min(total_required, len(rotated)))
            sig = "|".join(str(m.get("employeeId") or m.get("id") or m.get("name") or "") for m in opt_members)
            if sig in seen_sigs:
                continue
            seen_sigs.add(sig)
            opt_cost = sum(float(m.get("salary") or 0) for m in opt_members)
            alternate_teams.append({
                "name":          "Recommended Team" if offset == 0 else f"Alternative {offset}",
                "avgMatchScore": round(float(np.mean([float(m.get("matchScore") or 0) for m in opt_members])), 2),
                "avgExperience": round(float(np.mean([float(m.get("experience") or 0) for m in opt_members])), 2),
                "totalCost":     round(opt_cost, 2),
                "overBudget":    project_budget > 0 and opt_cost > project_budget,
                "members":       [m.get("name") or m.get("employeeId") or "Employee" for m in opt_members],
            })

        # ── 12. Summary statistics ─────────────────────────────────────────────
        cluster_diversity_score = compute_cluster_diversity_score(all_members)
        avg_exp     = round(float(np.mean([float(m.get("experience") or 0) for m in all_members])), 2)
        avg_skill   = round(float(np.mean([float(m.get("skillLevel") or 1) for m in all_members])), 2)
        avg_perf    = round(float(np.mean([float(m.get("performanceRating") or 0) for m in all_members])), 2)
        avg_match   = round(float(np.mean([float(m.get("matchScore") or 0) for m in all_members])), 2)
        avg_final   = round(float(np.mean([float(m.get("finalCandidateScore") or 0) for m in all_members])), 2)
        est_cost    = round(sum(float(m.get("salary") or 0) for m in all_members), 2)

        return {
            "teamName":        criteria.get("teamName"),
            "projectName":     criteria.get("projectName"),
            "projectId":       criteria.get("projectId"),
            "projectPriority": criteria.get("projectPriority", "Medium"),
            "algorithm":       "kmeans-attention-rf-explainable-v2",

            "datasetSource": {
                "type":                criteria.get("datasetSource") or (
                    "payload" if isinstance(raw_employees, list) and raw_employees else "dataset"
                ),
                "fileName":            criteria.get("datasetFileName") or "",
                "employeeCount":       len(employees),
                "eligibleEmployeeCount": len(eligible),
                "excludedEmployees":   excluded,
                "roleFilterRelaxed":   role_filter_relaxed,
                "roleFilterNote": (
                    f"Role filter '{required_role}' did not match enough employees. "
                    f"All {len(eligible)} available employees were used instead. "
                    f"Team was formed using skill-based matching only."
                ) if role_filter_relaxed else None,
            },

            "numberOfTeams":  number_of_teams,
            "totalTeamSize":  team_size,

            "selectionCriteria": {
                "requiredRole":     criteria.get("requiredRole", ""),
                "scoreWeights":     {k: round(v, 1) for k, v in score_weights.items()},
                "projectBudget":    project_budget,
                "minExperience":    min_experience,
                "projectStartDate": criteria.get("projectStartDate") or "",
                "projectEndDate":   criteria.get("projectEndDate") or "",
                "requiredSkills":   [
                    {"name": r["name"], "minScore": r["minScore"], "maxScore": r["maxScore"], "priority": r["priority"]}
                    for r in normalized_required_skills
                ],
            },

            # ── K-Means metrics ──
            "kmeans": {
                "selectedK":      int(best_k),
                "minK":           int(config.get("minClusters", 2)),
                "maxK":           int(config.get("maxClusters", 8)),
                "silhouetteScore": sil_score,
                "selectedClusters": sorted(list(selected_clusters)),
                "bestCluster":    int(best_cluster),
                "clusterDistribution": {str(k): int(np.sum(labels == k)) for k in np.unique(labels)},
                "clusterSummary": cluster_summary,
                "featureAttention": {
                    FEATURE_NAMES[i]: round(float(w), 6) for i, w in enumerate(feature_attention)
                },
            },

            "vectorization": {
                "skillVocabulary":          skill_vocab,
                "projectRequirementVector": [round(float(v), 6) for v in project_req_vector.tolist()],
                "employeeCount":            len(eligible),
            },

            # ── Classification & RF ──
            "classificationMetrics":  classification_metrics,
            "randomForestEvaluation": random_forest_evaluation,

            # ── Team results ──
            "statistics": {
                "avgExperience":       avg_exp,
                "avgSkillLevel":       avg_skill,
                "avgPerformance":      avg_perf,
                "avgMatchScore":       avg_match,
                "avgFinalCandidateScore": avg_final,
                "totalMembers":        len(all_members),
                "estimatedCost":       est_cost,
                "budgetRemaining":     round(project_budget - est_cost, 2) if project_budget > 0 else None,
                "clusterDiversityScore": cluster_diversity_score,
            },

            "skillGapAnalysis": skill_gap,
            "teams":            teams,
            "members":          all_members,
            "leader":           leader,
            "backupCandidates": backup_candidates,
            "alternateTeams":   alternate_teams,

            "csvValidation": {
                "totalRows":   len(employees),
                "validRows":   len(eligible),
                "unavailable": excluded,
                "skillGaps":   skill_gap.get("gaps", []),
            },
        }

    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Team generation failed: {str(ex)}") from ex


# ── API Endpoints ─────────────────────────────────────────────────────────────

@APP.get("/api/team/config")
def get_config():
    return read_config()


@APP.post("/api/team/config")
def save_config(payload: TeamConfigRequest):
    merged = {**read_config(), **payload.model_dump(exclude_none=True)}
    merged["scoreWeights"] = {**DEFAULT_CONFIG["scoreWeights"], **(payload.scoreWeights or {})}
    write_config(merged)
    return {"success": True, "config": merged}


@APP.post("/api/team/generate")
def generate_team(payload: TeamGenerateRequest):
    return _generate_team(payload.model_dump())


@APP.post("/api/ml/team-formation")
def ml_team_formation(payload: TeamGenerateRequest):
    """Alias endpoint consumed by the Spring Boot backend."""
    return _generate_team(payload.model_dump())


@APP.get("/api/team/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@APP.get("/api/team/stats")
def team_stats():
    try:
        employees = fetch_employees()
        employee_count = len(employees)
    except Exception:
        employee_count = 0
    saved_teams_file = BASE_DIR / "saved_teams.json"
    teams_count = 0
    if saved_teams_file.exists():
        try:
            with open(saved_teams_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                teams_count = len(data) if isinstance(data, list) else 0
        except Exception:
            pass
    return {"employeeCount": employee_count, "teamsGenerated": teams_count, "timestamp": datetime.now().isoformat()}


@APP.get("/api/team/stats/stream")
async def stats_stream(request: Request):
    async def generate():
        while True:
            if await request.is_disconnected():
                break
            try:
                employees = fetch_employees()
                employee_count = len(employees)
            except Exception:
                employee_count = 0
            saved_teams_file = BASE_DIR / "saved_teams.json"
            teams_count = 0
            if saved_teams_file.exists():
                try:
                    with open(saved_teams_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        teams_count = len(data) if isinstance(data, list) else 0
                except Exception:
                    pass
            payload = json.dumps({
                "employeeCount": employee_count,
                "teamsGenerated": teams_count,
                "timestamp": datetime.now().isoformat(),
            })
            yield f"data: {payload}\n\n"
            await asyncio.sleep(10)
    return StreamingResponse(generate(), media_type="text/event-stream")


@APP.post("/api/ml/team-formation/stream")
async def ml_team_formation_stream(payload: TeamGenerateRequest, request: Request):
    """Streaming SSE endpoint that emits progress events then a final result."""
    steps = [
        (5,  "Loading and preprocessing employee data"),
        (15, "Building skill vocabulary and feature matrix"),
        (30, "Running K-Means clustering"),
        (50, "Computing attention-based candidate scores"),
        (65, "Training Random Forest and generating confusion matrix"),
        (80, "Selecting team with cluster diversity"),
        (90, "Computing skill gap analysis and backup candidates"),
        (95, "Building explainable team output"),
    ]

    async def generate():
        total = len(steps)
        for idx, (pct, label) in enumerate(steps):
            if await request.is_disconnected():
                return
            event_data = json.dumps({"step": idx + 1, "total": total, "label": label, "pct": pct})
            yield f"event: progress\ndata: {event_data}\n\n"
            await asyncio.sleep(0.08)

        try:
            result = _generate_team(payload.model_dump())
            yield f"event: result\ndata: {json.dumps(result)}\n\n"
        except HTTPException as exc:
            yield f"event: error\ndata: {json.dumps({'message': exc.detail})}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


if __name__ == "__main__":
    uvicorn.run("team_api:APP", host="0.0.0.0", port=5000, reload=True)
