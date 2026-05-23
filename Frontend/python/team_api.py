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
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, silhouette_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

APP = FastAPI(title="HRM Team Formation ML API", version="1.0.0")
APP.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "team_config.json"
LOCAL_EMPLOYEE_CSV = BASE_DIR / "employees.csv"
EMPLOYEE_API_URL = "http://localhost:8080/api/employees"

DEFAULT_CONFIG = {
    "minClusters": 2,
    "maxClusters": 8,
    "randomState": 42,
    "kmeansNInit": 20,
    "scoreWeights": {
        "skillSimilarity": 0.5,
        "experience": 0.3,
        "salaryFit": 0.2,
    },
}

PRIORITY_WEIGHTS = {
    "critical": 1.0,
    "high": 0.82,
    "medium": 0.64,
    "low": 0.46,
}

SKILL_ALIASES = {
    "springboot": "spring boot",
    "spring_boot": "spring boot",
    "nodejs": "node js",
    "node.js": "node js",
    "reactjs": "react",
    "postgres": "postgresql",
}

FEATURE_NAMES = [
    "skill_level",
    "experience",
    "performance",
    "availability",
    "skill_match",
]

CLASSIFICATION_TARGET_FIELDS = [
    "actualTeam",
    "actualLabel",
    "target",
    "class",
    "department",
]


class TeamConfigRequest(BaseModel):
    scoreWeights: dict[str, float] | None = None
    minClusters: int | None = None
    maxClusters: int | None = None
    randomState: int | None = None
    kmeansNInit: int | None = None


class TeamGenerateRequest(BaseModel):
    criteria: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)


def read_config():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return DEFAULT_CONFIG


def write_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


def split_skills(skills_raw):
    if not skills_raw:
        return []
    if isinstance(skills_raw, list):
        return [str(s).strip().lower() for s in skills_raw if str(s).strip()]
    text = str(skills_raw).replace("|", ",").replace(";", ",")
    return [s.strip().lower() for s in text.split(",") if s.strip()]


def normalize_skill_name(value):
    normalized = (
        str(value or "")
        .strip()
        .lower()
        .replace(".", " ")
        .replace("-", " ")
        .replace("_", " ")
    )
    normalized = " ".join(part for part in normalized.split() if part)
    compact = normalized.replace(" ", "")
    return SKILL_ALIASES.get(compact, normalized)


def parse_skill_scores(raw_value, fallback_skills="", fallback_level=1):
    if isinstance(raw_value, dict):
        result = {}
        for key, value in raw_value.items():
            normalized = normalize_skill_name(key)
            if not normalized:
                continue
            result[normalized] = float(np.clip(float(value or 0), 0, 10))
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
                normalized = normalize_skill_name(skill_name)
                if not normalized:
                    continue
                try:
                    result[normalized] = float(np.clip(float(raw_score.strip() or 0), 0, 10))
                except ValueError:
                    result[normalized] = float(np.clip(float(fallback_level or 0), 0, 10))
            if result:
                return result

    return {
        normalize_skill_name(skill): float(np.clip(float(fallback_level or 0), 0, 10))
        for skill in split_skills(fallback_skills)
        if normalize_skill_name(skill)
    }


def score_within_range(value, min_score, max_score):
    score = float(value or 0)
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
        "skill": max(0.0, float((score_weights or {}).get("skill", 50) or 0)),
        "experience": max(0.0, float((score_weights or {}).get("experience", 25) or 0)),
        "performance": max(0.0, float((score_weights or {}).get("performance", 25) or 0)),
    }
    total = sum(numeric.values())
    if total <= 0:
        return {"skill": 50.0, "experience": 25.0, "performance": 25.0}
    return {key: (value / total) * 100.0 for key, value in numeric.items()}


def expand_required_skill_ranges(required_skill_ranges):
    expanded = []
    for item in required_skill_ranges or []:
        raw_name = item.get("name") or item.get("skill") or ""
        parts = [
            normalize_skill_name(part)
            for part in str(raw_name).replace("|", ",").replace(";", ",").split(",")
        ]
        parts = [part for part in parts if part]
        expanded.append(
            {
                **item,
                "name": str(raw_name).strip(),
                "skill": str(raw_name).strip(),
                "components": parts,
            }
        )
    return expanded


def build_coverage_aware_pool(ranked_members, required_skills, team_size):
    """
    Coverage-aware greedy selection.
    Guarantees at least 1 seat per required skill group (if candidates exist),
    then fills remaining seats by overall match score with an uncovered-skill boost.
    """
    def build_requirement_targets():
        if not required_skills:
            return {}
        total_weight = sum(float(item.get("priorityWeight") or 0.64) for item in required_skills) or 1.0
        base_targets = {}
        assigned = 0
        weighted = []

        for item in required_skills:
            # Guarantee at least 1 seat per skill group
            raw = max(1.0, (float(item.get("priorityWeight") or 0.64) / total_weight) * team_size)
            seats = max(1, math.floor(raw))
            base_targets[item["id"]] = seats
            assigned += seats
            weighted.append((item["id"], raw - seats))

        weighted.sort(key=lambda entry: entry[1], reverse=True)
        index = 0
        while assigned < team_size and weighted:
            current_id = weighted[index % len(weighted)][0]
            base_targets[current_id] += 1
            assigned += 1
            index += 1

        while assigned > team_size:
            reducible = sorted(
                ((req_id, count) for req_id, count in base_targets.items() if count > 1),
                key=lambda entry: entry[1],
                reverse=True,
            )
            if not reducible:
                break
            base_targets[reducible[0][0]] -= 1
            assigned -= 1

        return base_targets

    selected = []
    remaining = list(ranked_members)
    covered_requirements = set()
    requirement_targets = build_requirement_targets()
    requirement_counts = {item["id"]: 0 for item in required_skills}

    def get_requirement_fit(member, requirement_id):
        for item in member.get("teamFit", {}).get("skillBreakdown", []):
            if item.get("requirementId") == requirement_id:
                return float(item.get("fit") or 0)
        return 0.0

    def pick_best_for_requirement(requirement_id):
        best_index = -1
        best_score = float("-inf")
        for index, member in enumerate(remaining):
            fit = get_requirement_fit(member, requirement_id)
            # Accept any candidate with even partial fit (>0) for this requirement
            if fit <= 0:
                continue
            candidate_score = float(member.get("matchScore") or 0) + (fit * 30.0)
            if candidate_score > best_score:
                best_score = candidate_score
                best_index = index
        return best_index

    # Phase 1: fill per-requirement seat targets
    for requirement in required_skills:
        target = requirement_targets.get(requirement["id"], 0)
        while len(selected) < team_size and requirement_counts[requirement["id"]] < target and remaining:
            best_index = pick_best_for_requirement(requirement["id"])
            if best_index < 0:
                break
            chosen = remaining.pop(best_index)
            selected.append(chosen)
            requirement_counts[requirement["id"]] += 1
            if get_requirement_fit(chosen, requirement["id"]) >= 0.5:
                covered_requirements.add(requirement["id"])

    # Phase 2: fill remaining seats, boosting candidates that cover uncovered requirements
    while len(selected) < team_size and remaining:
        best_index = 0
        best_score = float("-inf")
        for index, member in enumerate(remaining):
            uncovered_boost = 0.0
            for requirement in required_skills:
                if requirement["id"] in covered_requirements:
                    continue
                breakdown_item = next(
                    (item for item in member.get("teamFit", {}).get("skillBreakdown", [])
                     if item.get("requirementId") == requirement["id"]),
                    None,
                )
                if breakdown_item and float(breakdown_item.get("fit") or 0) > 0:
                    uncovered_boost += float(breakdown_item.get("fit") or 0) * 15.0
            candidate_score = float(member.get("matchScore") or 0) + (uncovered_boost * 10.0)
            if candidate_score > best_score:
                best_score = candidate_score
                best_index = index

        chosen = remaining.pop(best_index)
        selected.append(chosen)
        for item in chosen.get("teamFit", {}).get("skillBreakdown", []):
            if float(item.get("fit") or 0) >= 0.5:
                covered_requirements.add(item["requirementId"])

    return selected


def cosine_similarity(a, b):
    a_norm = np.linalg.norm(a)
    b_norm = np.linalg.norm(b)
    if a_norm == 0 or b_norm == 0:
        return 0.0
    return float(np.dot(a, b) / (a_norm * b_norm))


def first_present_target_field(rows):
    for field in CLASSIFICATION_TARGET_FIELDS:
        if any(str(row.get(field, "")).strip() for row in rows):
            return field
    return None


def build_classification_metrics(rows, labels):
    """Build JSON-safe classification diagnostics for K-Means output."""
    target_field = first_present_target_field(rows)
    if target_field is None:
        return {
            "available": False,
            "reason": "No actual label field found. Add actualTeam, actualLabel, target, or class to enable metrics.",
        }

    y_true = [str(row.get(target_field) or "Unknown") for row in rows]
    cluster_to_label = {}
    labels_arr = np.array(labels)

    for cluster_id in sorted(np.unique(labels_arr)):
        values = [y_true[index] for index in np.where(labels_arr == cluster_id)[0]]
        if values:
            cluster_to_label[int(cluster_id)] = max(set(values), key=values.count)
        else:
            cluster_to_label[int(cluster_id)] = f"Cluster {cluster_id}"

    y_pred = [cluster_to_label.get(int(label), f"Cluster {int(label)}") for label in labels]
    label_names = sorted(set(y_true).union(set(y_pred)))
    matrix = confusion_matrix(y_true, y_pred, labels=label_names)

    return {
        "available": True,
        "targetField": target_field,
        "note": (
            "Using department as a reference label because no explicit target field was supplied."
            if target_field == "department"
            else "Clusters are mapped to their majority actual label before scoring."
        ),
        "accuracyScore": round(float(accuracy_score(y_true, y_pred)), 6),
        "labels": label_names,
        "confusionMatrix": matrix.astype(int).tolist(),
        "classificationReport": classification_report(
            y_true,
            y_pred,
            labels=label_names,
            zero_division=0,
            output_dict=True,
        ),
        "clusterToLabel": {str(key): value for key, value in cluster_to_label.items()},
    }


def build_random_forest_evaluation(rows, feature_matrix, random_state=42):
    """Train the Word-file Random Forest model and return JSON-safe metrics."""
    target_field = first_present_target_field(rows)
    if target_field is None:
        return {
            "available": False,
            "reason": "No label field found. Add actualTeam, actualLabel, target, or class to train Random Forest.",
        }

    y = np.array([str(row.get(target_field) or "Unknown") for row in rows], dtype=object)
    label_names, counts = np.unique(y, return_counts=True)
    if len(label_names) < 2:
        return {
            "available": False,
            "reason": "Random Forest needs at least two label classes.",
        }

    stratify = y if int(np.min(counts)) >= 2 else None
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            feature_matrix,
            y,
            test_size=0.2,
            random_state=int(random_state),
            stratify=stratify,
        )
        model = RandomForestClassifier(n_estimators=100, random_state=int(random_state))
        model.fit(X_train, y_train)
        predictions = model.predict(X_test)
    except ValueError as exc:
        return {
            "available": False,
            "reason": f"Random Forest evaluation could not run: {str(exc)}",
        }

    labels = sorted(set(y_test).union(set(predictions)))
    matrix = confusion_matrix(y_test, predictions, labels=labels)

    return {
        "available": True,
        "modelName": "Random Forest Classifier",
        "targetField": target_field,
        "note": (
            "Using department as the reference label because no explicit target field was supplied."
            if target_field == "department"
            else "Trained on employee features and evaluated on a 20% test split."
        ),
        "trainSize": int(len(y_train)),
        "testSize": int(len(y_test)),
        "accuracyScore": round(float(accuracy_score(y_test, predictions)), 6),
        "labels": labels,
        "confusionMatrix": matrix.astype(int).tolist(),
        "classificationReport": classification_report(
            y_test,
            predictions,
            labels=labels,
            zero_division=0,
            output_dict=True,
        ),
    }


def availability_score(raw):
    mapping = {
        "available": 1.0,
        "busy": 0.6,
        "on leave": 0.1,
        "unavailable": 0.0,
    }
    return mapping.get(str(raw or "").strip().lower(), 0.5)


def normalize(values, default=0.0):
    arr = np.array(values, dtype=float)
    if len(arr) == 0:
        return arr
    min_v = float(np.min(arr))
    max_v = float(np.max(arr))
    if math.isclose(min_v, max_v):
        return np.full_like(arr, default if default > 0 else 1.0)
    return (arr - min_v) / (max_v - min_v)


def compute_attention_weights(feature_matrix):
    """Compute feature attention weights using provisional-cluster separability."""
    if feature_matrix.shape[0] < 3:
        return np.full(feature_matrix.shape[1], 1.0 / feature_matrix.shape[1])

    probe_k = min(4, max(2, feature_matrix.shape[0] - 1))
    probe_model = KMeans(n_clusters=probe_k, random_state=42, n_init=10)
    probe_labels = probe_model.fit_predict(feature_matrix)

    fisher_scores = []
    for col_idx in range(feature_matrix.shape[1]):
        column = feature_matrix[:, col_idx]
        global_mean = np.mean(column)
        between_var = 0.0
        within_var = 0.0

        for cluster_id in np.unique(probe_labels):
            cluster_values = column[probe_labels == cluster_id]
            if len(cluster_values) == 0:
                continue
            cluster_mean = np.mean(cluster_values)
            between_var += len(cluster_values) * ((cluster_mean - global_mean) ** 2)
            within_var += np.sum((cluster_values - cluster_mean) ** 2)

        fisher_scores.append(float(between_var / (within_var + 1e-6)))

    fisher_scores = np.array(fisher_scores, dtype=float)
    fisher_scores = np.log1p(np.clip(fisher_scores, 0, np.percentile(fisher_scores, 95)))
    fisher_norm = (fisher_scores - np.mean(fisher_scores)) / (np.std(fisher_scores) + 1e-9)
    exp_scores = np.exp(fisher_norm)
    return exp_scores / np.sum(exp_scores)


def apply_attention_to_skills(skill_matrix, project_requirement_vector):
    """Compute employee-level attention from skill similarity to project requirements."""
    similarities = np.array(
        [cosine_similarity(skill_matrix[i], project_requirement_vector) for i in range(skill_matrix.shape[0])],
        dtype=float,
    )
    scaled = 3 * (similarities - similarities.mean()) / (similarities.std() + 1e-9)
    exp_similarities = np.exp(scaled)
    attention_weights = exp_similarities / np.sum(exp_similarities)
    weighted_skills = skill_matrix * attention_weights.reshape(-1, 1)
    return attention_weights, weighted_skills, similarities


def fetch_employees():
    try:
        response = requests.get(EMPLOYEE_API_URL, timeout=5)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError("Employees API returned invalid response.")
        if len(data) > 0:
            return data
    except Exception:
        pass

    return load_employees_from_local_csv()


def normalize_employee_record(emp):
    skill_scores = parse_skill_scores(emp.get("skillScores"), emp.get("skills"), emp.get("skillLevel") or 1)
    normalized = {
        **emp,
        "skillScores": skill_scores,
        "skills": emp.get("skills") or ", ".join(skill_scores.keys()),
        "skillLevel": float(emp.get("skillLevel") or (sum(skill_scores.values()) / max(1, len(skill_scores))) or 1),
        "experience": float(emp.get("experience") or 0),
        "performanceRating": float(emp.get("performanceRating") or emp.get("score") or 0),
        "salary": float(emp.get("salary") or emp.get("cost") or 0),
        "availability": emp.get("availability") or "Available",
    }
    return normalized


def parse_experience_from_start_date(value):
    if not value:
        return 0.0
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            start = datetime.strptime(str(value).strip(), fmt)
            years = max(0, datetime.now().year - start.year)
            return float(years)
        except ValueError:
            continue
    return 0.0


def load_employees_from_local_csv():
    if not LOCAL_EMPLOYEE_CSV.exists():
        raise FileNotFoundError(
            "No employee source available. Start employee backend on :8080 or keep python/employees.csv."
        )

    employees = []
    with open(LOCAL_EMPLOYEE_CSV, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            team = (row.get("Team") or "General").strip() or "General"
            name = (row.get("First Name") or f"Candidate {i + 1}").strip()
            salary = float(row.get("Salary") or 0)
            bonus = float(row.get("Bonus %") or 0)
            experience = parse_experience_from_start_date(row.get("Start Date"))
            senior_raw = str(row.get("Senior Management") or "").strip().lower()
            is_senior = senior_raw == "true"

            skills = [team.lower()]
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

            employees.append(
                {
                    "id": f"csv_{i + 1}",
                    "employeeId": f"CSV{i + 1:04d}",
                    "name": name,
                    "department": team,
                    "role": role,
                    "skills": ", ".join(dict.fromkeys(skills)),
                    "skillScores": {
                        normalize_skill_name(skill): float(skill_level) for skill in dict.fromkeys(skills)
                    },
                    "skillLevel": skill_level,
                    "experience": experience,
                    "category": "Full-time",
                    "availability": "Available",
                    "performanceRating": performance,
                    "salary": salary,
                    "status": "Present",
                }
            )

    return employees


def select_kmeans_k(feature_matrix, min_k, max_k, random_state, n_init):
    n_samples = feature_matrix.shape[0]
    if n_samples < 3:
        return 1

    lower = max(2, min_k)
    upper = min(max_k, n_samples - 1)
    if lower > upper:
        return 2 if n_samples >= 2 else 1

    best_k = lower
    best_score = -1.0

    for k in range(lower, upper + 1):
        model = KMeans(n_clusters=k, random_state=random_state, n_init=n_init)
        labels = model.fit_predict(feature_matrix)
        if len(set(labels)) < 2:
            continue
        score = silhouette_score(feature_matrix, labels)
        if score > best_score:
            best_score = score
            best_k = k

    return best_k


@APP.get("/api/team/config")
def get_config():
    return read_config()


@APP.post("/api/team/config")
def save_config(payload: TeamConfigRequest):
    payload_dict = payload.model_dump(exclude_none=True)
    merged = {**read_config(), **payload_dict}
    merged["scoreWeights"] = {
        **DEFAULT_CONFIG["scoreWeights"],
        **(payload_dict.get("scoreWeights") or {}),
    }
    write_config(merged)
    return {"success": True, "config": merged}


def _generate_team(payload: dict[str, Any]):
    try:
        criteria = payload.get("criteria") or {}
        config = {**read_config(), **(payload.get("config") or {})}
        config["scoreWeights"] = {**DEFAULT_CONFIG["scoreWeights"], **(config.get("scoreWeights") or {})}

        team_size = int(criteria.get("teamSize") or 4)
        number_of_teams = int(criteria.get("numberOfTeams") or 2)
        if number_of_teams < 1:
            number_of_teams = 1
        required_skill_ranges = expand_required_skill_ranges(criteria.get("requiredSkillRanges") or [])
        normalized_required_skills = []
        for item in required_skill_ranges:
            components = item.get("components") or []
            if not components:
                continue
            normalized_required_skills.append(
                {
                    "id": str(item.get("id") or f'req-{len(normalized_required_skills) + 1}'),
                    "name": str(item.get("name") or item.get("skill") or "").strip(),
                    "components": components,
                    "minScore": float(item.get("minScore") or item.get("min_score") or 0),
                    "maxScore": float(item.get("maxScore") or item.get("max_score") or 10),
                    "priority": str(item.get("priority") or "medium").strip().lower(),
                    "priorityWeight": PRIORITY_WEIGHTS.get(
                        str(item.get("priority") or "medium").strip().lower(),
                        PRIORITY_WEIGHTS["medium"],
                    ),
                }
            )

        if not normalized_required_skills:
            primary_skills = split_skills(criteria.get("primarySkills"))
            normalized_required_skills = [
                {
                    "id": f'req-{index + 1}',
                    "name": normalize_skill_name(skill),
                    "components": [normalize_skill_name(skill)],
                    "minScore": 1.0,
                    "maxScore": 10.0,
                    "priority": "high",
                    "priorityWeight": PRIORITY_WEIGHTS["high"],
                }
                for index, skill in enumerate(primary_skills)
                if normalize_skill_name(skill)
            ]

        min_experience = float(criteria.get("minExperience") or 0)
        required_role = str(criteria.get("requiredRole") or "").strip().lower()
        score_weights = normalize_weight_map(criteria.get("scoreWeights") or {})
        project_budget = float(criteria.get("projectBudget") or criteria.get("budget") or 0)

        payload_employees = payload.get("employees")
        employees = (
            [normalize_employee_record(emp) for emp in payload_employees]
            if isinstance(payload_employees, list) and payload_employees
            else [normalize_employee_record(emp) for emp in fetch_employees()]
        )
        if not employees:
            raise HTTPException(status_code=400, detail="No employees available.")

        # Multi-role filter: split on comma/pipe so "Software Engineer, QA Engineer"
        # keeps both domains in the eligible pool.
        required_roles = [
            r.strip() for r in required_role.replace("|", ",").split(",") if r.strip()
        ]

        eligible = []
        for emp in employees:
            exp = float(emp.get("experience") or 0)
            availability = str(emp.get("availability") or "Available")
            if availability.lower() in {"on leave", "unavailable"}:
                continue
            if exp < min_experience:
                continue
            if required_roles:
                role_text = str(emp.get("role") or "").strip().lower()
                dept_text = str(emp.get("department") or "").strip().lower()
                skills_text = str(emp.get("skills") or "").strip().lower()
                # Employee passes if ANY of the required roles matches their role/dept/skills
                if not any(
                    r in role_text or r in dept_text or r in skills_text
                    for r in required_roles
                ):
                    continue
            eligible.append(emp)

        if len(eligible) < 2:
            role_hint = f" for role '{required_role}'" if required_role else ""
            raise HTTPException(
                status_code=400,
                detail=f"Not enough eligible employees{role_hint} to run K-Means.",
            )

        if team_size > len(eligible):
            team_size = len(eligible)

        feature_rows = []
        experiences = []
        performances = []
        raw_skill_matches = []
        enriched_eligible = []
        skill_matrix_rows = []

        skill_vocab = []
        for requirement in normalized_required_skills:
            for component in requirement["components"]:
                if component not in skill_vocab:
                    skill_vocab.append(component)
        for emp in eligible:
            parsed_scores = parse_skill_scores(emp.get("skillScores"), emp.get("skills"), emp.get("skillLevel") or 1)
            for skill_name in parsed_scores.keys():
                if skill_name not in skill_vocab:
                    skill_vocab.append(skill_name)

        project_requirement_vector = np.zeros(len(skill_vocab), dtype=float)
        total_priority_weight = max(sum(item["priorityWeight"] for item in normalized_required_skills), 1e-9)
        for requirement in normalized_required_skills:
            target_strength = max(requirement["minScore"], requirement["maxScore"]) / 10.0
            bundle_weight = requirement["priorityWeight"] / total_priority_weight
            component_weight = bundle_weight / max(1, len(requirement["components"]))
            for component in requirement["components"]:
                if component in skill_vocab:
                    project_requirement_vector[skill_vocab.index(component)] = component_weight * max(target_strength, 0.1)

        for emp in eligible:
            skill_scores = parse_skill_scores(emp.get("skillScores"), emp.get("skills"), emp.get("skillLevel") or 1)
            exp = float(emp.get("experience") or 0)
            experiences.append(exp)
            perf = float(emp.get("performanceRating") or 0)
            performances.append(perf)
            avail = availability_score(emp.get("availability"))
            skill_level = float(emp.get("skillLevel") or 1)

            skill_breakdown = []
            weighted_total = 0.0
            weighted_max = 0.0
            for requirement in normalized_required_skills:
                component_scores = [float(skill_scores.get(component, 0.0)) for component in requirement["components"]]
                component_fits = [
                    score_within_range(score, requirement["minScore"], requirement["maxScore"])
                    for score in component_scores
                ]
                employee_score = (
                    sum(component_scores) / len(component_scores) if component_scores else 0.0
                )
                fit = sum(component_fits) / len(component_fits) if component_fits else 0.0
                weighted_fit = fit * requirement["priorityWeight"]
                weighted_total += weighted_fit
                weighted_max += requirement["priorityWeight"]
                skill_breakdown.append(
                    {
                        "requirementId": requirement["id"],
                        "skill": requirement["name"],
                        "components": requirement["components"],
                        "priority": requirement["priority"],
                        "requiredRange": f'{requirement["minScore"]:.0f}-{requirement["maxScore"]:.0f}',
                        "employeeScore": round(employee_score, 2),
                        "fit": round(fit, 4),
                        "weightedFit": round(weighted_fit, 4),
                    }
                )

            skill_match = weighted_total / weighted_max if weighted_max > 0 else 0.5
            raw_skill_matches.append(skill_match)
            skill_matrix_rows.append([float(skill_scores.get(skill_name, 0.0)) / 10.0 for skill_name in skill_vocab])
            enriched_eligible.append(
                {
                    **emp,
                    "skillScores": skill_scores,
                    "skillVector": [float(skill_scores.get(skill_name, 0.0)) / 10.0 for skill_name in skill_vocab],
                    "_skillMatch": skill_match,
                    "_skillBreakdown": skill_breakdown,
                }
            )

            feature_rows.append([skill_level, exp, perf, avail, skill_match])

        feature_matrix = np.array(feature_rows, dtype=float)
        scaler = StandardScaler()
        scaled_features = scaler.fit_transform(feature_matrix)
        feature_attention = compute_attention_weights(scaled_features)
        weighted_features = scaled_features * feature_attention

        skill_matrix = np.array(skill_matrix_rows, dtype=float) if skill_matrix_rows else np.zeros((0, len(skill_vocab)))
        if len(skill_vocab) == 0:
            employee_attention = np.full(len(eligible), 1.0 / max(1, len(eligible)))
            weighted_skills = skill_matrix
            skill_similarities = np.zeros(len(eligible), dtype=float)
        else:
            employee_attention, weighted_skills, skill_similarities = apply_attention_to_skills(
                skill_matrix,
                project_requirement_vector,
            )
        combined_skill_signal = (0.55 * np.array(raw_skill_matches, dtype=float)) + (0.45 * skill_similarities)

        best_k = select_kmeans_k(
            weighted_features,
            int(config.get("minClusters", 2)),
            int(config.get("maxClusters", 8)),
            int(config.get("randomState", 42)),
            int(config.get("kmeansNInit", 20)),
        )

        kmeans = KMeans(
            n_clusters=best_k,
            random_state=int(config.get("randomState", 42)),
            n_init=int(config.get("kmeansNInit", 20)),
        )
        labels = kmeans.fit_predict(weighted_features)
        classification_metrics = build_classification_metrics(eligible, labels)
        random_forest_evaluation = build_random_forest_evaluation(
            eligible,
            weighted_features,
            int(config.get("randomState", 42)),
        )

        cluster_attention = {}
        for cluster_id in np.unique(labels):
            idx = np.where(labels == cluster_id)[0]
            cluster_attention[int(cluster_id)] = float(np.mean(np.array(combined_skill_signal)[idx]))
        best_cluster = max(cluster_attention, key=cluster_attention.get)

        # ── Multi-domain fix: include ALL clusters that have at least one
        # candidate covering each required skill group.  This prevents the
        # algorithm from discarding an entire domain (e.g. QA engineers) just
        # because they landed in a different K-Means cluster than the
        # software engineers.
        required_component_sets = [
            set(req["components"]) for req in normalized_required_skills
        ]

        def cluster_covers_requirement(cluster_id, req_components):
            """Return True if any member in this cluster has fit > 0 for the requirement."""
            for i in np.where(labels == cluster_id)[0]:
                skill_scores = parse_skill_scores(
                    enriched_eligible[i].get("skillScores"),
                    enriched_eligible[i].get("skills"),
                    enriched_eligible[i].get("skillLevel") or 1,
                )
                for comp in req_components:
                    if float(skill_scores.get(comp, 0)) > 0:
                        return True
            return False

        # Start with the best cluster, then add any cluster needed to cover
        # a requirement that the best cluster alone cannot cover.
        selected_clusters = {best_cluster}
        for req in normalized_required_skills:
            req_comps = set(req["components"])
            best_covers = cluster_covers_requirement(best_cluster, req_comps)
            if not best_covers:
                # Find the cluster with the highest average skill signal that
                # does cover this requirement
                for cid in sorted(cluster_attention, key=cluster_attention.get, reverse=True):
                    if cluster_covers_requirement(cid, req_comps):
                        selected_clusters.add(cid)
                        break

        selected_idx = []
        for cid in selected_clusters:
            selected_idx.extend(np.where(labels == cid)[0].tolist())

        # Fallback: if still not enough candidates, use everyone
        if len(selected_idx) < team_size * number_of_teams:
            selected_idx = list(range(len(eligible)))

        exp_norm = normalize(experiences)
        perf_norm = normalize(performances)
        skill_norm = normalize(combined_skill_signal, default=0.5)
        attention_norm = normalize(employee_attention, default=0.5)

        ranked = []
        for i in selected_idx:
            score = (
                (score_weights["skill"] / 100.0) * skill_norm[i]
                + (score_weights["experience"] / 100.0) * exp_norm[i]
                + (score_weights["performance"] / 100.0) * perf_norm[i]
            )
            score = (0.8 * score) + (0.2 * attention_norm[i])
            if project_budget > 0 and float(enriched_eligible[i].get("salary") or 0) > 0:
                ideal_per_seat = project_budget / max(1, total_required if "total_required" in locals() else team_size)
                salary = float(enriched_eligible[i].get("salary") or 0)
                if salary > ideal_per_seat:
                    score *= max(0.62, ideal_per_seat / max(salary, 1.0))
            if normalized_required_skills and enriched_eligible[i]["_skillMatch"] < 0.2:
                score *= 0.2
            elif normalized_required_skills and enriched_eligible[i]["_skillMatch"] < 0.4:
                score *= 0.55
            matched_skills = [
                f'{item["skill"]} ({item["employeeScore"]}/10)'
                for item in enriched_eligible[i]["_skillBreakdown"]
                if item["fit"] >= 0.8
            ]
            enriched = {
                **enriched_eligible[i],
                "matchScore": round(float(score) * 100, 2),
                "clusterId": int(labels[i]),
                "attentionWeight": round(float(employee_attention[i]), 6),
                "teamFit": {
                    "skillMatch": round(float(combined_skill_signal[i]) * 100, 2),
                    "experienceMatch": round(float(exp_norm[i]) * 100, 2),
                    "performanceMatch": round(float(perf_norm[i]) * 100, 2),
                    "budgetFit": round(
                        min(
                            100.0,
                            (project_budget / max(1, team_size)) / max(1.0, float(enriched_eligible[i].get("salary") or 1)) * 100.0
                        ) if project_budget > 0 else 100.0,
                        2,
                    ),
                    "matchedSkills": matched_skills,
                    "skillBreakdown": enriched_eligible[i]["_skillBreakdown"],
                },
            }
            enriched.pop("_skillMatch", None)
            enriched.pop("_skillBreakdown", None)
            ranked.append(enriched)

        ranked.sort(key=lambda x: x["matchScore"], reverse=True)

        # Deduplicate by stable key for dynamic CSV inputs
        unique_ranked = []
        seen_keys = set()
        for row in ranked:
            key = str(row.get("employeeId") or row.get("id") or f"{row.get('name')}-{row.get('role')}").lower()
            if key in seen_keys:
                continue
            seen_keys.add(key)
            unique_ranked.append(row)

        if len(unique_ranked) == 0:
            raise HTTPException(
                status_code=400,
                detail="No candidates available after deduplication.",
            )

        total_required = team_size * number_of_teams
        pool = build_coverage_aware_pool(
            unique_ranked,
            normalized_required_skills,
            min(total_required, len(unique_ranked)),
        )
        selected_keys = {
            str(member.get("employeeId") or member.get("id") or f"{member.get('name')}-{member.get('role')}").lower()
            for member in pool
        }
        backup_candidates = []
        for member in unique_ranked:
            member_key = str(member.get("employeeId") or member.get("id") or f"{member.get('name')}-{member.get('role')}").lower()
            if member_key in selected_keys:
                continue
            backup_candidates.append(
                {
                    **member,
                    "backupReason": "Next best available fit if a selected member becomes unavailable.",
                }
            )
            if len(backup_candidates) >= 5:
                break
        if len(backup_candidates) < 5:
            seen_backup_keys = {
                str(member.get("employeeId") or member.get("id") or f"{member.get('name')}-{member.get('role')}").lower()
                for member in backup_candidates
            }
            for i, candidate in enumerate(enriched_eligible):
                candidate_key = str(candidate.get("employeeId") or candidate.get("id") or f"{candidate.get('name')}-{candidate.get('role')}").lower()
                if candidate_key in selected_keys or candidate_key in seen_backup_keys:
                    continue
                backup_candidates.append(
                    {
                        **candidate,
                        "matchScore": round(float(skill_norm[i]) * 100, 2),
                        "clusterId": int(labels[i]),
                        "teamFit": {
                            "skillMatch": round(float(combined_skill_signal[i]) * 100, 2),
                            "experienceMatch": round(float(exp_norm[i]) * 100, 2),
                            "performanceMatch": round(float(perf_norm[i]) * 100, 2),
                            "matchedSkills": [],
                            "skillBreakdown": candidate.get("_skillBreakdown", []),
                        },
                        "backupReason": "Useful fallback from another K-Means cluster if the recommended team changes.",
                    }
                )
                seen_backup_keys.add(candidate_key)
                if len(backup_candidates) >= 5:
                    break

        def avg(values):
            return round(float(np.mean(values)), 2) if values else 0.0

        alternate_teams = []
        seen_team_signatures = set()
        for offset in range(min(3, len(unique_ranked))):
            rotated = unique_ranked[offset:] + unique_ranked[:offset]
            option_members = build_coverage_aware_pool(
                rotated,
                normalized_required_skills,
                min(total_required, len(rotated)),
            )
            signature = "|".join(
                str(member.get("employeeId") or member.get("id") or member.get("name") or "")
                for member in option_members
            )
            if signature in seen_team_signatures:
                continue
            seen_team_signatures.add(signature)
            option_cost = sum(float(member.get("salary") or 0) for member in option_members)
            alternate_teams.append(
                {
                    "name": "Recommended Team" if offset == 0 else f"Alternative {offset}",
                    "avgMatchScore": avg([float(member.get("matchScore") or 0) for member in option_members]),
                    "avgExperience": avg([float(member.get("experience") or 0) for member in option_members]),
                    "totalCost": round(option_cost, 2),
                    "overBudget": project_budget > 0 and option_cost > project_budget,
                    "members": [member.get("name") or member.get("employeeId") or "Employee" for member in option_members],
                }
            )

        # Build teams dynamically in round-robin (balanced distribution)
        teams = [{"teamName": f"Team {i + 1}", "members": []} for i in range(number_of_teams)]
        for idx, member in enumerate(pool):
            teams[idx % number_of_teams]["members"].append(member)

        members = [m for t in teams for m in t["members"]]
        max_member_exp = max([float(m.get("experience") or 0) for m in members] or [1.0])
        max_member_perf = max([float(m.get("performanceRating") or 0) for m in members] or [1.0])
        max_member_exp = max(max_member_exp, 1.0)
        max_member_perf = max(max_member_perf, 1.0)
        leader_candidates = []
        for member in members:
            leader_score = (
                0.4 * (float(member.get("experience") or 0) / max_member_exp)
            )
            leader_score += (
                0.3 * (float(member.get("performanceRating") or 0) / max_member_perf)
            )
            leader_score += 0.3 * (float(member.get("teamFit", {}).get("skillMatch") or 0) / 100.0)
            leader_candidates.append((leader_score, member))

        leader = None
        if leader_candidates:
            leader_score, leader_member = max(leader_candidates, key=lambda item: item[0])
            leader_key = str(
                leader_member.get("employeeId")
                or leader_member.get("id")
                or f"{leader_member.get('name')}-{leader_member.get('role')}"
            ).lower()
            for member in members:
                member_key = str(
                    member.get("employeeId")
                    or member.get("id")
                    or f"{member.get('name')}-{member.get('role')}"
                ).lower()
                member["isLeader"] = member_key == leader_key
                if member["isLeader"]:
                    member["leaderScore"] = round(float(leader_score) * 100, 2)
            leader = {
                **leader_member,
                "isLeader": True,
                "leaderScore": round(float(leader_score) * 100, 2),
                "leaderReason": "Highest weighted blend of experience, performance, and project skill fit.",
            }

        avg_exp = round(float(np.mean([float(m.get("experience") or 0) for m in members])), 2)
        avg_skill = round(float(np.mean([float(m.get("skillLevel") or 1) for m in members])), 2)
        avg_perf = round(float(np.mean([float(m.get("performanceRating") or 0) for m in members])), 2)
        avg_match = round(float(np.mean([float(m.get("matchScore") or 0) for m in members])), 2)
        estimated_cost = round(sum(float(m.get("salary") or 0) for m in members), 2)

        return {
            "teamName": criteria.get("teamName"),
            "projectName": criteria.get("projectName"),
            "projectId": criteria.get("projectId"),
            "projectPriority": criteria.get("projectPriority", "Medium"),
            "algorithm": "python-kmeans-attention-skill-matching",
            "datasetSource": {
                "type": criteria.get("datasetSource") or (
                    "payload" if isinstance(payload_employees, list) and payload_employees else "dataset"
                ),
                "fileName": criteria.get("datasetFileName") or "",
                "employeeCount": len(employees),
                "eligibleEmployeeCount": len(eligible),
            },
            "numberOfTeams": number_of_teams,
            "totalTeamSize": team_size,
            "selectionCriteria": {
                "requiredRole": criteria.get("requiredRole", ""),
                "scoreWeights": {
                    "skill": round(score_weights["skill"], 1),
                    "experience": round(score_weights["experience"], 1),
                    "performance": round(score_weights["performance"], 1),
                },
                "projectBudget": project_budget,
                "projectStartDate": criteria.get("projectStartDate") or "",
                "projectEndDate": criteria.get("projectEndDate") or "",
                "requiredSkills": [
                    {
                        "name": item["name"],
                        "minScore": item["minScore"],
                        "maxScore": item["maxScore"],
                        "priority": item["priority"],
                    }
                    for item in normalized_required_skills
                ],
            },
            "vectorization": {
                "skillVocabulary": skill_vocab,
                "projectRequirementVector": [round(float(value), 6) for value in project_requirement_vector.tolist()],
                "employeeCount": len(eligible),
                "datasetSource": "payload" if isinstance(payload_employees, list) and payload_employees else "dataset",
            },
            "kmeans": {
                "selectedK": int(best_k),
                "minK": int(config.get("minClusters", 2)),
                "maxK": int(config.get("maxClusters", 8)),
                "selectedCluster": int(best_cluster),
                "featureAttention": {
                    FEATURE_NAMES[index]: round(float(weight), 6)
                    for index, weight in enumerate(feature_attention)
                },
            },
            "classificationMetrics": classification_metrics,
            "randomForestEvaluation": random_forest_evaluation,
            "statistics": {
                "avgExperience": avg_exp,
                "avgSkillLevel": avg_skill,
                "avgPerformance": avg_perf,
                "avgMatchScore": avg_match,
                "totalMembers": len(members),
                "estimatedCost": estimated_cost,
                "budgetRemaining": round(project_budget - estimated_cost, 2) if project_budget > 0 else None,
            },
            "teams": teams,
            "members": members,
            "leader": leader,
            "backupCandidates": backup_candidates,
            "alternateTeams": alternate_teams,
            "csvValidation": {
                "totalRows": len(employees),
                "validRows": len(employees),
                "unavailable": [
                    emp.get("name") or emp.get("employeeId")
                    for emp in employees
                    if str(emp.get("availability") or "").strip().lower() in {"on leave", "unavailable"}
                ],
                "skillGaps": [],
            },
        }
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(
            status_code=500,
            detail=f"Team generation failed in Python API: {str(ex)}",
        ) from ex


@APP.post("/api/team/generate")
def generate_team(payload: TeamGenerateRequest):
    return _generate_team(payload.model_dump())


@APP.post("/api/ml/team-formation")
def ml_team_formation(payload: TeamGenerateRequest):
    """
    Alias endpoint for Spring Boot backend.
    Use this endpoint when your Java service calls the Python ML model.
    """
    return _generate_team(payload.model_dump())


@APP.get("/api/team/health")
def health():
    return {"status": "ok"}


@APP.get("/api/team/stats")
def team_stats():
    """Live stats endpoint for the React dashboard SSE feed."""
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
            teams_count = 0

    return {
        "employeeCount": employee_count,
        "teamsGenerated": teams_count,
        "timestamp": datetime.now().isoformat(),
    }


@APP.get("/api/team/stats/stream")
async def stats_stream():
    """
    Server-Sent Events stream for live dashboard stats.
    The React dashboard subscribes to this and gets a push every 3 seconds
    instead of polling.
    """
    async def event_generator():
        while True:
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
                    teams_count = 0

            payload = json.dumps({
                "employeeCount": employee_count,
                "teamsGenerated": teams_count,
                "timestamp": datetime.now().isoformat(),
            })
            yield f"data: {payload}\n\n"
            await asyncio.sleep(3)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


def _sse_event(event: str, data: Any) -> str:
    """Format a single SSE message."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@APP.post("/api/ml/team-formation/stream")
async def ml_team_formation_stream(request: Request):
    """
    Streaming SSE version of /api/ml/team-formation.
    Emits progress events at each ML pipeline stage so the React UI can
    show a live step-by-step progress bar instead of a blocking spinner.

    Event types emitted:
      progress  – { step, total, label, pct }
      result    – the full team JSON (same shape as the regular endpoint)
      error     – { message }
    """
    body = await request.json()

    async def generate():
        STEPS = [
            "Validating employees",
            "Building skill vocabulary",
            "Computing feature matrix",
            "Scaling features",
            "Computing attention weights",
            "Running K-Means clustering",
            "Scoring candidates",
            "Selecting team (coverage-aware)",
            "Evaluating with Random Forest",
            "Finalising result",
        ]
        total = len(STEPS)

        def progress(index: int):
            return _sse_event("progress", {
                "step": index + 1,
                "total": total,
                "label": STEPS[index],
                "pct": round(((index + 1) / total) * 100),
            })

        try:
            criteria = body.get("criteria") or {}
            config = {**read_config(), **(body.get("config") or {})}
            config["scoreWeights"] = {**DEFAULT_CONFIG["scoreWeights"], **(config.get("scoreWeights") or {})}

            team_size = int(criteria.get("teamSize") or 4)
            number_of_teams = int(criteria.get("numberOfTeams") or 1)
            if number_of_teams < 1:
                number_of_teams = 1
            required_skill_ranges = expand_required_skill_ranges(criteria.get("requiredSkillRanges") or [])
            normalized_required_skills = []
            for item in required_skill_ranges:
                components = item.get("components") or []
                if not components:
                    continue
                normalized_required_skills.append({
                    "id": str(item.get("id") or f'req-{len(normalized_required_skills) + 1}'),
                    "name": str(item.get("name") or item.get("skill") or "").strip(),
                    "components": components,
                    "minScore": float(item.get("minScore") or 0),
                    "maxScore": float(item.get("maxScore") or 10),
                    "priority": str(item.get("priority") or "medium").strip().lower(),
                    "priorityWeight": PRIORITY_WEIGHTS.get(
                        str(item.get("priority") or "medium").strip().lower(),
                        PRIORITY_WEIGHTS["medium"],
                    ),
                })

            if not normalized_required_skills:
                primary_skills = split_skills(criteria.get("primarySkills"))
                normalized_required_skills = [
                    {
                        "id": f'req-{i + 1}',
                        "name": normalize_skill_name(s),
                        "components": [normalize_skill_name(s)],
                        "minScore": 1.0,
                        "maxScore": 10.0,
                        "priority": "high",
                        "priorityWeight": PRIORITY_WEIGHTS["high"],
                    }
                    for i, s in enumerate(primary_skills)
                    if normalize_skill_name(s)
                ]

            min_experience = float(criteria.get("minExperience") or 0)
            required_role = str(criteria.get("requiredRole") or "").strip().lower()
            score_weights = normalize_weight_map(criteria.get("scoreWeights") or {})
            project_budget = float(criteria.get("projectBudget") or criteria.get("budget") or 0)

            # ── Step 1: Validate employees ──────────────────────────────────
            yield progress(0)
            await asyncio.sleep(0)

            payload_employees = body.get("employees")
            employees = (
                [normalize_employee_record(emp) for emp in payload_employees]
                if isinstance(payload_employees, list) and payload_employees
                else [normalize_employee_record(emp) for emp in fetch_employees()]
            )
            if not employees:
                yield _sse_event("error", {"message": "No employees available."})
                return

            eligible = []
            for emp in employees:
                exp = float(emp.get("experience") or 0)
                availability = str(emp.get("availability") or "Available")
                if availability.lower() in {"on leave", "unavailable"}:
                    continue
                if exp < min_experience:
                    continue
                if required_role:
                    role_text = str(emp.get("role") or "").strip().lower()
                    dept_text = str(emp.get("department") or "").strip().lower()
                    if required_role not in role_text and required_role not in dept_text:
                        continue
                eligible.append(emp)

            if len(eligible) < 2:
                role_hint = f" for role '{required_role}'" if required_role else ""
                yield _sse_event("error", {
                    "message": f"Not enough eligible employees{role_hint} to run K-Means."
                })
                return

            if team_size > len(eligible):
                team_size = len(eligible)

            # ── Step 2: Build skill vocabulary ─────────────────────────────
            yield progress(1)
            await asyncio.sleep(0)

            skill_vocab = []
            for requirement in normalized_required_skills:
                for component in requirement["components"]:
                    if component not in skill_vocab:
                        skill_vocab.append(component)
            for emp in eligible:
                parsed_scores = parse_skill_scores(emp.get("skillScores"), emp.get("skills"), emp.get("skillLevel") or 1)
                for skill_name in parsed_scores.keys():
                    if skill_name not in skill_vocab:
                        skill_vocab.append(skill_name)

            project_requirement_vector = np.zeros(len(skill_vocab), dtype=float)
            total_priority_weight = max(sum(item["priorityWeight"] for item in normalized_required_skills), 1e-9)
            for requirement in normalized_required_skills:
                target_strength = max(requirement["minScore"], requirement["maxScore"]) / 10.0
                bundle_weight = requirement["priorityWeight"] / total_priority_weight
                component_weight = bundle_weight / max(1, len(requirement["components"]))
                for component in requirement["components"]:
                    if component in skill_vocab:
                        project_requirement_vector[skill_vocab.index(component)] = component_weight * max(target_strength, 0.1)

            # ── Step 3: Compute feature matrix ─────────────────────────────
            yield progress(2)
            await asyncio.sleep(0)

            feature_rows = []
            experiences = []
            performances = []
            raw_skill_matches = []
            enriched_eligible = []
            skill_matrix_rows = []

            for emp in eligible:
                skill_scores = parse_skill_scores(emp.get("skillScores"), emp.get("skills"), emp.get("skillLevel") or 1)
                exp = float(emp.get("experience") or 0)
                experiences.append(exp)
                perf = float(emp.get("performanceRating") or 0)
                performances.append(perf)
                avail = availability_score(emp.get("availability"))
                skill_level = float(emp.get("skillLevel") or 1)

                skill_breakdown = []
                weighted_total = 0.0
                weighted_max = 0.0
                for requirement in normalized_required_skills:
                    component_scores = [float(skill_scores.get(c, 0.0)) for c in requirement["components"]]
                    component_fits = [
                        score_within_range(s, requirement["minScore"], requirement["maxScore"])
                        for s in component_scores
                    ]
                    employee_score = sum(component_scores) / len(component_scores) if component_scores else 0.0
                    fit = sum(component_fits) / len(component_fits) if component_fits else 0.0
                    weighted_fit = fit * requirement["priorityWeight"]
                    weighted_total += weighted_fit
                    weighted_max += requirement["priorityWeight"]
                    skill_breakdown.append({
                        "requirementId": requirement["id"],
                        "skill": requirement["name"],
                        "components": requirement["components"],
                        "priority": requirement["priority"],
                        "requiredRange": f'{requirement["minScore"]:.0f}-{requirement["maxScore"]:.0f}',
                        "employeeScore": round(employee_score, 2),
                        "fit": round(fit, 4),
                        "weightedFit": round(weighted_fit, 4),
                    })

                skill_match = weighted_total / weighted_max if weighted_max > 0 else 0.5
                raw_skill_matches.append(skill_match)
                skill_matrix_rows.append([float(skill_scores.get(sn, 0.0)) / 10.0 for sn in skill_vocab])
                enriched_eligible.append({
                    **emp,
                    "skillScores": skill_scores,
                    "skillVector": [float(skill_scores.get(sn, 0.0)) / 10.0 for sn in skill_vocab],
                    "_skillMatch": skill_match,
                    "_skillBreakdown": skill_breakdown,
                })
                feature_rows.append([skill_level, exp, perf, avail, skill_match])

            feature_matrix = np.array(feature_rows, dtype=float)

            # ── Step 4: Scale features ──────────────────────────────────────
            yield progress(3)
            await asyncio.sleep(0)

            scaler = StandardScaler()
            scaled_features = scaler.fit_transform(feature_matrix)

            # ── Step 5: Compute attention weights ──────────────────────────
            yield progress(4)
            await asyncio.sleep(0)

            feature_attention = compute_attention_weights(scaled_features)
            weighted_features = scaled_features * feature_attention

            skill_matrix = np.array(skill_matrix_rows, dtype=float) if skill_matrix_rows else np.zeros((0, len(skill_vocab)))
            if len(skill_vocab) == 0:
                employee_attention = np.full(len(eligible), 1.0 / max(1, len(eligible)))
                weighted_skills = skill_matrix
                skill_similarities = np.zeros(len(eligible), dtype=float)
            else:
                employee_attention, weighted_skills, skill_similarities = apply_attention_to_skills(
                    skill_matrix, project_requirement_vector
                )
            combined_skill_signal = (0.55 * np.array(raw_skill_matches, dtype=float)) + (0.45 * skill_similarities)

            # ── Step 6: K-Means clustering ─────────────────────────────────
            yield progress(5)
            await asyncio.sleep(0)

            best_k = select_kmeans_k(
                weighted_features,
                int(config.get("minClusters", 2)),
                int(config.get("maxClusters", 8)),
                int(config.get("randomState", 42)),
                int(config.get("kmeansNInit", 20)),
            )
            kmeans = KMeans(
                n_clusters=best_k,
                random_state=int(config.get("randomState", 42)),
                n_init=int(config.get("kmeansNInit", 20)),
            )
            labels = kmeans.fit_predict(weighted_features)
            classification_metrics = build_classification_metrics(eligible, labels)

            # ── Step 7: Score candidates ───────────────────────────────────
            yield progress(6)
            await asyncio.sleep(0)

            cluster_attention = {}
            for cluster_id in np.unique(labels):
                idx = np.where(labels == cluster_id)[0]
                cluster_attention[int(cluster_id)] = float(np.mean(np.array(combined_skill_signal)[idx]))
            best_cluster = max(cluster_attention, key=cluster_attention.get)

            selected_idx = np.where(labels == best_cluster)[0].tolist()
            if len(selected_idx) < team_size * number_of_teams:
                selected_idx = list(range(len(eligible)))

            exp_norm = normalize(experiences)
            perf_norm = normalize(performances)
            skill_norm = normalize(combined_skill_signal, default=0.5)
            attention_norm = normalize(employee_attention, default=0.5)

            ranked = []
            for i in selected_idx:
                score = (
                    (score_weights["skill"] / 100.0) * skill_norm[i]
                    + (score_weights["experience"] / 100.0) * exp_norm[i]
                    + (score_weights["performance"] / 100.0) * perf_norm[i]
                )
                score = (0.8 * score) + (0.2 * attention_norm[i])
                if project_budget > 0 and float(enriched_eligible[i].get("salary") or 0) > 0:
                    ideal_per_seat = project_budget / max(1, team_size)
                    salary = float(enriched_eligible[i].get("salary") or 0)
                    if salary > ideal_per_seat:
                        score *= max(0.62, ideal_per_seat / max(salary, 1.0))
                if normalized_required_skills and enriched_eligible[i]["_skillMatch"] < 0.2:
                    score *= 0.2
                elif normalized_required_skills and enriched_eligible[i]["_skillMatch"] < 0.4:
                    score *= 0.55
                matched_skills = [
                    f'{item["skill"]} ({item["employeeScore"]}/10)'
                    for item in enriched_eligible[i]["_skillBreakdown"]
                    if item["fit"] >= 0.8
                ]
                enriched = {
                    **enriched_eligible[i],
                    "matchScore": round(float(score) * 100, 2),
                    "clusterId": int(labels[i]),
                    "attentionWeight": round(float(employee_attention[i]), 6),
                    "teamFit": {
                        "skillMatch": round(float(combined_skill_signal[i]) * 100, 2),
                        "experienceMatch": round(float(exp_norm[i]) * 100, 2),
                        "performanceMatch": round(float(perf_norm[i]) * 100, 2),
                        "budgetFit": round(
                            min(100.0, (project_budget / max(1, team_size)) / max(1.0, float(enriched_eligible[i].get("salary") or 1)) * 100.0)
                            if project_budget > 0 else 100.0,
                            2,
                        ),
                        "matchedSkills": matched_skills,
                        "skillBreakdown": enriched_eligible[i]["_skillBreakdown"],
                    },
                }
                enriched.pop("_skillMatch", None)
                enriched.pop("_skillBreakdown", None)
                ranked.append(enriched)

            ranked.sort(key=lambda x: x["matchScore"], reverse=True)
            unique_ranked = []
            seen_keys = set()
            for row in ranked:
                key = str(row.get("employeeId") or row.get("id") or f"{row.get('name')}-{row.get('role')}").lower()
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                unique_ranked.append(row)

            if not unique_ranked:
                yield _sse_event("error", {"message": "No candidates available after deduplication."})
                return

            # ── Step 8: Coverage-aware team selection ──────────────────────
            yield progress(7)
            await asyncio.sleep(0)

            total_required = team_size * number_of_teams
            pool = build_coverage_aware_pool(
                unique_ranked, normalized_required_skills, min(total_required, len(unique_ranked))
            )
            selected_keys = {
                str(m.get("employeeId") or m.get("id") or f"{m.get('name')}-{m.get('role')}").lower()
                for m in pool
            }

            backup_candidates = []
            for member in unique_ranked:
                mk = str(member.get("employeeId") or member.get("id") or f"{member.get('name')}-{member.get('role')}").lower()
                if mk in selected_keys:
                    continue
                backup_candidates.append({**member, "backupReason": "Next best available fit if a selected member becomes unavailable."})
                if len(backup_candidates) >= 5:
                    break

            if len(backup_candidates) < 5:
                seen_bk = {str(m.get("employeeId") or m.get("id") or f"{m.get('name')}-{m.get('role')}").lower() for m in backup_candidates}
                for i, candidate in enumerate(enriched_eligible):
                    ck = str(candidate.get("employeeId") or candidate.get("id") or f"{candidate.get('name')}-{candidate.get('role')}").lower()
                    if ck in selected_keys or ck in seen_bk:
                        continue
                    backup_candidates.append({
                        **candidate,
                        "matchScore": round(float(skill_norm[i]) * 100, 2),
                        "clusterId": int(labels[i]),
                        "teamFit": {
                            "skillMatch": round(float(combined_skill_signal[i]) * 100, 2),
                            "experienceMatch": round(float(exp_norm[i]) * 100, 2),
                            "performanceMatch": round(float(perf_norm[i]) * 100, 2),
                            "matchedSkills": [],
                            "skillBreakdown": candidate.get("_skillBreakdown", []),
                        },
                        "backupReason": "Useful fallback from another K-Means cluster if the recommended team changes.",
                    })
                    seen_bk.add(ck)
                    if len(backup_candidates) >= 5:
                        break

            alternate_teams = []
            seen_sigs = set()
            for offset in range(min(3, len(unique_ranked))):
                rotated = unique_ranked[offset:] + unique_ranked[:offset]
                opt_members = build_coverage_aware_pool(rotated, normalized_required_skills, min(total_required, len(rotated)))
                sig = "|".join(str(m.get("employeeId") or m.get("id") or m.get("name") or "") for m in opt_members)
                if sig in seen_sigs:
                    continue
                seen_sigs.add(sig)
                opt_cost = sum(float(m.get("salary") or 0) for m in opt_members)
                alternate_teams.append({
                    "name": "Recommended Team" if offset == 0 else f"Alternative {offset}",
                    "avgMatchScore": round(float(np.mean([float(m.get("matchScore") or 0) for m in opt_members])), 2) if opt_members else 0.0,
                    "avgExperience": round(float(np.mean([float(m.get("experience") or 0) for m in opt_members])), 2) if opt_members else 0.0,
                    "totalCost": round(opt_cost, 2),
                    "overBudget": project_budget > 0 and opt_cost > project_budget,
                    "members": [m.get("name") or m.get("employeeId") or "Employee" for m in opt_members],
                })

            teams = [{"teamName": f"Team {i + 1}", "members": []} for i in range(number_of_teams)]
            for idx, member in enumerate(pool):
                teams[idx % number_of_teams]["members"].append(member)

            members = [m for t in teams for m in t["members"]]
            max_exp = max([float(m.get("experience") or 0) for m in members] or [1.0])
            max_perf = max([float(m.get("performanceRating") or 0) for m in members] or [1.0])
            max_exp = max(max_exp, 1.0)
            max_perf = max(max_perf, 1.0)

            leader_candidates = []
            for member in members:
                ls = (
                    0.4 * (float(member.get("experience") or 0) / max_exp)
                    + 0.3 * (float(member.get("performanceRating") or 0) / max_perf)
                    + 0.3 * (float(member.get("teamFit", {}).get("skillMatch") or 0) / 100.0)
                )
                leader_candidates.append((ls, member))

            leader = None
            if leader_candidates:
                leader_score, leader_member = max(leader_candidates, key=lambda x: x[0])
                leader_key = str(leader_member.get("employeeId") or leader_member.get("id") or f"{leader_member.get('name')}-{leader_member.get('role')}").lower()
                for member in members:
                    mk = str(member.get("employeeId") or member.get("id") or f"{member.get('name')}-{member.get('role')}").lower()
                    member["isLeader"] = mk == leader_key
                    if member["isLeader"]:
                        member["leaderScore"] = round(float(leader_score) * 100, 2)
                leader = {
                    **leader_member,
                    "isLeader": True,
                    "leaderScore": round(float(leader_score) * 100, 2),
                    "leaderReason": "Highest weighted blend of experience, performance, and project skill fit.",
                }

            # ── Step 9: Random Forest evaluation ──────────────────────────
            yield progress(8)
            await asyncio.sleep(0)

            random_forest_evaluation = build_random_forest_evaluation(
                eligible, weighted_features, int(config.get("randomState", 42))
            )

            # ── Step 10: Finalise result ───────────────────────────────────
            yield progress(9)
            await asyncio.sleep(0)

            def avg(values):
                return round(float(np.mean(values)), 2) if values else 0.0

            estimated_cost = round(sum(float(m.get("salary") or 0) for m in members), 2)

            result = {
                "teamName": criteria.get("teamName"),
                "projectName": criteria.get("projectName"),
                "projectId": criteria.get("projectId"),
                "projectPriority": criteria.get("projectPriority", "Medium"),
                "algorithm": "python-kmeans-attention-skill-matching",
                "datasetSource": {
                    "type": criteria.get("datasetSource") or ("payload" if isinstance(payload_employees, list) and payload_employees else "dataset"),
                    "fileName": criteria.get("datasetFileName") or "",
                    "employeeCount": len(employees),
                    "eligibleEmployeeCount": len(eligible),
                },
                "numberOfTeams": number_of_teams,
                "totalTeamSize": team_size,
                "selectionCriteria": {
                    "requiredRole": criteria.get("requiredRole", ""),
                    "scoreWeights": {
                        "skill": round(score_weights["skill"], 1),
                        "experience": round(score_weights["experience"], 1),
                        "performance": round(score_weights["performance"], 1),
                    },
                    "projectBudget": project_budget,
                    "projectStartDate": criteria.get("projectStartDate") or "",
                    "projectEndDate": criteria.get("projectEndDate") or "",
                    "requiredSkills": [
                        {"name": item["name"], "minScore": item["minScore"], "maxScore": item["maxScore"], "priority": item["priority"]}
                        for item in normalized_required_skills
                    ],
                },
                "vectorization": {
                    "skillVocabulary": skill_vocab,
                    "projectRequirementVector": [round(float(v), 6) for v in project_requirement_vector.tolist()],
                    "employeeCount": len(eligible),
                    "datasetSource": "payload" if isinstance(payload_employees, list) and payload_employees else "dataset",
                },
                "kmeans": {
                    "selectedK": int(best_k),
                    "minK": int(config.get("minClusters", 2)),
                    "maxK": int(config.get("maxClusters", 8)),
                    "selectedCluster": int(best_cluster),
                    "featureAttention": {
                        FEATURE_NAMES[i]: round(float(w), 6) for i, w in enumerate(feature_attention)
                    },
                },
                "classificationMetrics": classification_metrics,
                "randomForestEvaluation": random_forest_evaluation,
                "statistics": {
                    "avgExperience": avg([float(m.get("experience") or 0) for m in members]),
                    "avgSkillLevel": avg([float(m.get("skillLevel") or 1) for m in members]),
                    "avgPerformance": avg([float(m.get("performanceRating") or 0) for m in members]),
                    "avgMatchScore": avg([float(m.get("matchScore") or 0) for m in members]),
                    "totalMembers": len(members),
                    "estimatedCost": estimated_cost,
                    "budgetRemaining": round(project_budget - estimated_cost, 2) if project_budget > 0 else None,
                },
                "teams": teams,
                "members": members,
                "leader": leader,
                "backupCandidates": backup_candidates,
                "alternateTeams": alternate_teams,
                "csvValidation": {
                    "totalRows": len(employees),
                    "validRows": len(employees),
                    "unavailable": [
                        emp.get("name") or emp.get("employeeId")
                        for emp in employees
                        if str(emp.get("availability") or "").strip().lower() in {"on leave", "unavailable"}
                    ],
                    "skillGaps": [],
                },
            }

            yield _sse_event("result", result)

        except Exception as ex:
            yield _sse_event("error", {"message": f"Team generation failed: {str(ex)}"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    uvicorn.run("team_api:APP", host="0.0.0.0", port=5000, reload=True)
