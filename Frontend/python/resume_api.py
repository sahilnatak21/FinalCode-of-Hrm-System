"""
Resume Extraction + JD Matching API  —  port 5001
=================================================
Extracts structured candidate profiles from PDF/DOCX/TXT resumes,
parses Job Descriptions, and ranks candidates by JD match score.

Dependencies:
    pip install fastapi uvicorn python-multipart pdfplumber python-docx
    pip install spacy && python -m spacy download en_core_web_sm
"""

import io
import json
import re
import uuid
import datetime
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# ── Optional heavy deps ───────────────────────────────────────────────────────
try:
    import pdfplumber
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

try:
    from docx import Document as DocxDocument
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

try:
    import spacy
    _nlp = spacy.load("en_core_web_sm")
    SPACY_AVAILABLE = True
except Exception:
    SPACY_AVAILABLE = False
    _nlp = None

# ── App ───────────────────────────────────────────────────────────────────────
APP = FastAPI(title="HRM Resume Extraction & JD Matching API", version="2.0.0")
APP.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════════════════
# KNOWLEDGE BASE
# ══════════════════════════════════════════════════════════════════════════════

# Canonical skill → list of aliases (all lowercase)
SKILL_ALIASES: dict[str, list[str]] = {
    "python":           ["python", "python3", "python 3", "py"],
    "java":             ["java", "java 8", "java 11", "java 17", "core java"],
    "javascript":       ["javascript", "js", "es6", "es2015", "es2016", "ecmascript"],
    "typescript":       ["typescript", "ts"],
    "c++":              ["c++", "cpp", "c plus plus"],
    "c#":               ["c#", "csharp", "c sharp", ".net", "dotnet"],
    "go":               ["golang", "go lang", "go programming"],
    "rust":             ["rust"],
    "kotlin":           ["kotlin"],
    "swift":            ["swift"],
    "php":              ["php"],
    "ruby":             ["ruby", "ruby on rails", "rails", "ror"],
    "scala":            ["scala"],
    "r":                [" r ", "r programming", "rstudio", "r language"],
    "react":            ["react", "reactjs", "react.js", "react native", "react js"],
    "angular":          ["angular", "angularjs", "angular js", "angular 2+"],
    "vue":              ["vue", "vuejs", "vue.js", "vue js"],
    "node js":          ["node", "nodejs", "node.js", "node js", "express", "expressjs"],
    "spring boot":      ["spring boot", "spring", "springboot", "spring-boot", "spring framework"],
    "django":           ["django", "django rest"],
    "flask":            ["flask", "flask api"],
    "fastapi":          ["fastapi", "fast api"],
    "next js":          ["next.js", "nextjs", "next js"],
    "sql":              ["sql", "mysql", "mariadb", "t-sql", "pl/sql"],
    "postgresql":       ["postgresql", "postgres", "psql", "pg"],
    "mongodb":          ["mongodb", "mongo", "mongoose"],
    "redis":            ["redis", "redis cache"],
    "elasticsearch":    ["elasticsearch", "elastic search", "elk"],
    "oracle":           ["oracle", "oracle db", "oracle database"],
    "sqlite":           ["sqlite", "sqlite3"],
    "cassandra":        ["cassandra", "apache cassandra"],
    "aws":              ["aws", "amazon web services", "ec2", "s3", "lambda", "rds", "cloudformation"],
    "azure":            ["azure", "microsoft azure", "azure devops"],
    "gcp":              ["gcp", "google cloud", "google cloud platform", "bigquery"],
    "docker":           ["docker", "dockerfile", "docker compose", "containerization"],
    "kubernetes":       ["kubernetes", "k8s", "kubectl", "helm"],
    "terraform":        ["terraform", "infrastructure as code", "iac"],
    "jenkins":          ["jenkins", "jenkins ci"],
    "github actions":   ["github actions", "github ci", "gh actions"],
    "ci/cd":            ["ci/cd", "cicd", "continuous integration", "continuous deployment", "continuous delivery"],
    "machine learning": ["machine learning", "ml", "supervised learning", "unsupervised learning", "predictive modeling"],
    "deep learning":    ["deep learning", "neural network", "cnn", "rnn", "lstm", "transformer"],
    "tensorflow":       ["tensorflow", "tf", "keras"],
    "pytorch":          ["pytorch", "torch"],
    "scikit-learn":     ["scikit-learn", "sklearn", "scikit learn"],
    "pandas":           ["pandas", "pandas dataframe"],
    "numpy":            ["numpy", "np"],
    "data analysis":    ["data analysis", "data analytics", "eda", "exploratory data analysis"],
    "nlp":              ["nlp", "natural language processing", "text mining", "text classification"],
    "computer vision":  ["computer vision", "image processing", "opencv", "cv"],
    "testing":          ["unit testing", "integration testing", "tdd", "bdd", "test driven development"],
    "selenium":         ["selenium", "selenium webdriver"],
    "jest":             ["jest", "jest testing"],
    "pytest":           ["pytest", "py.test"],
    "junit":            ["junit", "junit5"],
    "cypress":          ["cypress", "cypress.io"],
    "communication":    ["communication", "presentation", "public speaking", "interpersonal"],
    "leadership":       ["leadership", "team lead", "team leader", "led a team", "managed a team", "mentoring"],
    "agile":            ["agile", "scrum", "kanban", "sprint planning", "agile methodology"],
    "project management":["project management", "pmp", "jira", "confluence", "project planning"],
    "problem solving":  ["problem solving", "analytical", "critical thinking", "debugging"],
    "microservices":    ["microservices", "microservice architecture", "service oriented"],
    "graphql":          ["graphql", "graph ql"],
    "rest api":         ["rest", "restful", "rest api", "api development", "web services"],
    "git":              ["git", "github", "gitlab", "bitbucket", "version control"],
    "linux":            ["linux", "unix", "bash", "shell scripting", "ubuntu"],
    "kafka":            ["kafka", "apache kafka", "event streaming"],
    "rabbitmq":         ["rabbitmq", "message queue", "mq"],
    "html":             ["html", "html5"],
    "css":              ["css", "css3", "sass", "scss", "less", "tailwind"],
}

# Normalize alias → canonical
_ALIAS_TO_CANONICAL: dict[str, str] = {}
for canonical, aliases in SKILL_ALIASES.items():
    for alias in aliases:
        _ALIAS_TO_CANONICAL[alias.strip().lower()] = canonical

ROLE_KEYWORDS: dict[str, list[str]] = {
    "Software Engineer":       ["software engineer", "software developer", "sde", "swe"],
    "Frontend Developer":      ["frontend", "front-end", "front end", "ui developer", "react developer", "angular developer", "vue developer"],
    "Backend Developer":       ["backend", "back-end", "back end", "server side", "java developer", "python developer", "node developer"],
    "Full Stack Developer":    ["full stack", "fullstack", "full-stack"],
    "Data Scientist":          ["data scientist", "data science", "ml scientist"],
    "ML Engineer":             ["machine learning engineer", "ml engineer", "ai engineer", "ai developer"],
    "Data Engineer":           ["data engineer", "etl developer", "data pipeline", "big data"],
    "DevOps Engineer":         ["devops", "dev ops", "site reliability", "sre", "platform engineer", "cloud engineer"],
    "QA Engineer":             ["qa engineer", "quality assurance", "test engineer", "sdet", "automation engineer", "qa analyst"],
    "Product Manager":         ["product manager", "product owner"],
    "UI/UX Designer":          ["ui designer", "ux designer", "ui/ux", "product designer"],
    "Cloud Architect":         ["cloud architect", "solutions architect", "aws architect", "azure architect"],
    "Security Engineer":       ["security engineer", "cybersecurity", "information security", "infosec"],
    "Android Developer":       ["android developer", "android engineer"],
    "iOS Developer":           ["ios developer", "ios engineer", "swift developer"],
    "Database Administrator":  ["dba", "database administrator", "database engineer"],
    "Business Analyst":        ["business analyst", "ba", "systems analyst"],
    "Project Manager":         ["project manager", "program manager", "scrum master"],
}

DEPARTMENT_MAP: dict[str, list[str]] = {
    "Engineering":  ["software", "engineer", "developer", "devops", "backend", "frontend", "fullstack"],
    "Data Science": ["data scientist", "data engineer", "ml engineer", "analytics", "ai"],
    "QA":           ["qa", "quality assurance", "test", "sdet"],
    "Design":       ["designer", "ui", "ux"],
    "Product":      ["product manager", "product owner", "business analyst"],
    "Security":     ["security", "cybersecurity", "infosec"],
    "IT":           ["it support", "sysadmin", "network", "infrastructure"],
    "Management":   ["manager", "director", "vp", "head of", "lead"],
    "DevOps":       ["devops", "cloud", "sre", "platform"],
}

EDUCATION_KEYWORDS = [
    "b.tech", "b.e", "bachelor", "b.sc", "bsc", "b.s", "be",
    "m.tech", "m.e", "master", "m.sc", "msc", "m.s", "mba", "me",
    "phd", "ph.d", "doctorate",
    "diploma", "associate",
    "computer science", "information technology", "software engineering",
    "electronics", "electrical", "mechanical", "civil", "it",
]

# JD priority signal words
JD_PRIORITY_SIGNALS: dict[str, list[str]] = {
    "critical": ["must have", "required", "mandatory", "essential", "minimum requirement",
                 "must possess", "necessary", "must be proficient", "must include"],
    "high":     ["strong", "proficient in", "expertise in", "solid", "hands-on experience",
                 "experience with", "deep knowledge", "extensive experience"],
    "medium":   ["preferred", "good to have", "nice to have", "plus", "familiarity",
                 "knowledge of", "exposure to", "understanding of"],
    "low":      ["bonus", "optional", "advantageous", "ideally", "would be helpful",
                 "beneficial", "desirable"],
}

SOFT_SKILL_KEYWORDS = [
    "communication", "teamwork", "collaboration", "leadership", "problem solving",
    "analytical", "critical thinking", "adaptability", "time management", "creativity",
    "attention to detail", "interpersonal", "self-motivated", "initiative", "flexible",
    "organized", "presentation", "negotiation", "conflict resolution", "empathy",
]

CERT_KEYWORDS = [
    "aws certified", "azure certified", "google certified", "pmp", "cissp", "cisa",
    "ceh", "ccna", "ccnp", "oracle certified", "kubernetes certified", "ckad", "cka",
    "scrum master", "csm", "safe", "itil", "comptia", "java certified", "rhce",
]


# ══════════════════════════════════════════════════════════════════════════════
# 1. TEXT EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_text_from_pdf(file_bytes: bytes) -> str:
    if not PDF_AVAILABLE:
        raise HTTPException(status_code=422, detail="pdfplumber not installed. Run: pip install pdfplumber")
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    result = "\n".join(text_parts)
    if not result.strip():
        raise HTTPException(status_code=422, detail="PDF appears to be scanned or image-based. No text could be extracted.")
    return result


def extract_text_from_docx(file_bytes: bytes) -> str:
    if not DOCX_AVAILABLE:
        raise HTTPException(status_code=422, detail="python-docx not installed. Run: pip install python-docx")
    doc = DocxDocument(io.BytesIO(file_bytes))
    return "\n".join(para.text for para in doc.paragraphs if para.text.strip())


def extract_text(file_bytes: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_bytes)
    if ext in (".docx", ".doc"):
        return extract_text_from_docx(file_bytes)
    if ext == ".txt":
        return file_bytes.decode("utf-8", errors="ignore")
    raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'. Use PDF, DOCX, or TXT.")


# ══════════════════════════════════════════════════════════════════════════════
# 3. SKILL NORMALIZATION
# ══════════════════════════════════════════════════════════════════════════════

def normalize_skill(raw: str) -> str:
    """
    Normalize a skill name:
    1. lowercase + strip
    2. map aliases: js → javascript, springboot → spring boot, etc.
    3. return canonical form
    """
    s = raw.strip().lower()
    s = re.sub(r"[.\-_]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return _ALIAS_TO_CANONICAL.get(s, s)


def extract_skills(text: str) -> dict[str, float]:
    """Return {canonical_skill: score} found in text."""
    lower = text.lower()
    found: dict[str, float] = {}

    for canonical, aliases in SKILL_ALIASES.items():
        for alias in aliases:
            pattern = r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])"
            if re.search(pattern, lower):
                score = _estimate_skill_score(lower, alias)
                found[canonical] = max(found.get(canonical, 0.0), score)
                break

    return found


def _estimate_skill_score(text: str, skill: str) -> float:
    idx = text.find(skill)
    if idx < 0:
        return 6.0
    window = text[max(0, idx - 120): idx + 120]

    if any(w in window for w in ["expert", "advanced", "proficient", "extensive", "strong", "lead", "architect", "deep", "specialist"]):
        return 9.0
    if any(w in window for w in ["intermediate", "good", "solid", "experienced", "working knowledge", "hands-on", "proficiency"]):
        return 7.0
    if any(w in window for w in ["basic", "beginner", "familiar", "exposure", "learning", "entry", "basic knowledge"]):
        return 4.0
    yr_match = re.search(r"(\d+)\s*\+?\s*year", window)
    if yr_match:
        yrs = int(yr_match.group(1))
        return min(10.0, 4.0 + yrs * 0.8)
    return 6.0


# ══════════════════════════════════════════════════════════════════════════════
# 2. RESUME FIELD EXTRACTORS
# ══════════════════════════════════════════════════════════════════════════════

def extract_name(text: str) -> str:
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if SPACY_AVAILABLE and _nlp:
        doc = _nlp(text[:600])
        for ent in doc.ents:
            if ent.label_ == "PERSON" and len(ent.text.split()) >= 2:
                return ent.text.strip()
    for line in lines[:6]:
        words = line.split()
        if 2 <= len(words) <= 4 and all(re.match(r"^[A-Za-z.\-']+$", w) for w in words):
            return line
    return lines[0] if lines else "Unknown"


def extract_email(text: str) -> str:
    m = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    return m.group(0) if m else ""


def extract_phone(text: str) -> str:
    m = re.search(r"(\+?\d{1,3}[\s\-]?)?(\(?\d{3}\)?[\s\-]?)?\d{3}[\s\-]?\d{4}", text)
    return m.group(0).strip() if m else ""


def extract_location(text: str) -> str:
    """Extract city/state/country from resume."""
    patterns = [
        r"(?:location|address|city|based in)[:\s]+([A-Za-z ,]+?)(?:\n|,|\|)",
        r"\b([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)+)\b",  # City, Country pattern
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            loc = m.group(1).strip()
            if 3 <= len(loc) <= 50:
                return loc
    if SPACY_AVAILABLE and _nlp:
        doc = _nlp(text[:1000])
        for ent in doc.ents:
            if ent.label_ in ("GPE", "LOC") and len(ent.text) > 2:
                return ent.text.strip()
    return ""


def extract_experience_years(text: str) -> float:
    lower = text.lower()
    patterns = [
        r"(\d+(?:\.\d+)?)\+?\s+years?\s+of\s+(?:total\s+)?experience",
        r"(\d+(?:\.\d+)?)\+?\s+years?\s+experience",
        r"experience\s+of\s+(\d+(?:\.\d+)?)\+?\s+years?",
        r"(\d+(?:\.\d+)?)\+?\s+yrs?\s+(?:of\s+)?experience",
        r"worked\s+for\s+(\d+(?:\.\d+)?)\+?\s+years?",
        r"over\s+(\d+(?:\.\d+)?)\s+years?",
    ]
    for pattern in patterns:
        m = re.search(pattern, lower)
        if m:
            years = float(m.group(1))
            if 0 <= years <= 40:
                return round(years, 1)

    # Internship detection
    for pat in [r"(\d+)\s+month[s]?\s+internship", r"internship\s+for\s+(\d+)\s+month[s]?"]:
        m = re.search(pat, lower)
        if m:
            return round(int(m.group(1)) / 12, 1)

    if any(k in lower for k in ["fresher", "student", "currently pursuing", "recent graduate", "entry level"]):
        return 0.0

    # Date range calculation
    date_ranges = re.findall(r"(20\d{2}|19\d{2})\s*[-–—to]+\s*(20\d{2}|19\d{2}|present|current)", lower)
    if date_ranges:
        current_year = datetime.datetime.now().year
        total = 0
        for start, end in date_ranges:
            start_y = int(start)
            end_y = current_year if end in ("present", "current") else int(end)
            diff = max(0, end_y - start_y)
            if diff <= 15:
                total += diff
        return round(float(total), 1)

    return 0.0


def extract_role(text: str) -> str:
    lower = text.lower()
    for role, keywords in ROLE_KEYWORDS.items():
        for kw in keywords:
            if re.search(r"(?<![a-z])" + re.escape(kw) + r"(?![a-z])", lower):
                return role
    return "Software Engineer"


def predict_role(text: str, skills: dict[str, float]) -> str:
    """Predict the best-fit role based on extracted skills."""
    skill_names = set(skills.keys())
    role_scores: dict[str, float] = {}

    role_skill_map = {
        "Frontend Developer":  {"react", "angular", "vue", "javascript", "typescript", "html", "css"},
        "Backend Developer":   {"java", "python", "node js", "spring boot", "django", "flask", "sql", "postgresql"},
        "Full Stack Developer":{"react", "node js", "javascript", "python", "sql"},
        "Data Scientist":      {"machine learning", "python", "tensorflow", "pytorch", "pandas", "numpy"},
        "ML Engineer":         {"machine learning", "tensorflow", "pytorch", "python", "deep learning"},
        "DevOps Engineer":     {"docker", "kubernetes", "aws", "ci/cd", "terraform", "jenkins", "linux"},
        "QA Engineer":         {"testing", "selenium", "cypress", "pytest", "jest", "junit"},
        "Cloud Architect":     {"aws", "azure", "gcp", "terraform", "kubernetes"},
    }

    for role, expected_skills in role_skill_map.items():
        overlap = skill_names.intersection(expected_skills)
        if overlap:
            avg_score = sum(skills.get(s, 5) for s in overlap) / max(len(expected_skills), 1)
            role_scores[role] = len(overlap) * avg_score

    if role_scores:
        return max(role_scores, key=role_scores.get)
    return extract_role(text)


def extract_department(role: str, text: str) -> str:
    lower = (role + " " + text[:500]).lower()
    for dept, keywords in DEPARTMENT_MAP.items():
        if any(kw in lower for kw in keywords):
            return dept
    return "Engineering"


def extract_education(text: str) -> str:
    lower = text.lower()
    found = []
    for kw in EDUCATION_KEYWORDS:
        if kw in lower:
            for line in text.split("\n"):
                if kw in line.lower() and len(line.strip()) > 5:
                    found.append(line.strip())
                    break
    return "; ".join(dict.fromkeys(found[:3])) if found else ""


def extract_certifications(text: str) -> list[str]:
    lower = text.lower()
    certs = []
    for cert in CERT_KEYWORDS:
        if cert in lower:
            # Find full context
            for line in text.split("\n"):
                if cert in line.lower() and line.strip() not in certs:
                    certs.append(line.strip()[:100])
                    break
    return certs[:8]


def extract_soft_skills(text: str) -> list[str]:
    lower = text.lower()
    return [sk for sk in SOFT_SKILL_KEYWORDS if sk in lower]


def extract_projects(text: str) -> list[str]:
    """Extract project names/descriptions."""
    projects = []
    in_projects = False
    for line in text.split("\n"):
        stripped = line.strip()
        if re.match(r"^(projects?|personal projects?|academic projects?|notable projects?)\s*[:\-]?$", stripped, re.IGNORECASE):
            in_projects = True
            continue
        if in_projects:
            if re.match(r"^(experience|education|skills?|certifications?|summary|objective)\s*[:\-]?$", stripped, re.IGNORECASE):
                break
            if stripped and len(stripped) > 10:
                projects.append(stripped[:150])
        if len(projects) >= 5:
            break
    return projects


def extract_links(text: str) -> dict[str, str]:
    links: dict[str, str] = {}
    linkedin = re.search(r"linkedin\.com/in/[a-zA-Z0-9\-_/]+", text, re.IGNORECASE)
    github   = re.search(r"github\.com/[a-zA-Z0-9\-_/]+", text, re.IGNORECASE)
    portfolio = re.search(r"https?://[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:/[^\s]*)?", text)
    if linkedin:
        links["linkedin"] = f"https://{linkedin.group(0)}"
    if github:
        links["github"] = f"https://{github.group(0)}"
    if portfolio and "linkedin" not in portfolio.group(0) and "github" not in portfolio.group(0):
        links["portfolio"] = portfolio.group(0)
    return links


def extract_performance_rating(text: str) -> float:
    lower = text.lower()
    gpa_m = re.search(r"gpa\s*[:\-]?\s*(\d+\.?\d*)\s*/\s*(\d+\.?\d*)", lower)
    if gpa_m:
        gpa, scale = float(gpa_m.group(1)), float(gpa_m.group(2))
        return round(min(10.0, (gpa / scale) * 10), 1)
    pct_m = re.search(r"(\d{2,3}(?:\.\d+)?)\s*%", lower)
    if pct_m:
        pct = float(pct_m.group(1))
        if pct <= 100:
            return round(min(10.0, pct / 10), 1)
    if any(w in lower for w in ["award", "best employee", "top performer", "excellence", "distinction"]):
        return 9.0
    if any(w in lower for w in ["promoted", "recognition", "achievement"]):
        return 8.0
    return 7.0


def extract_availability(text: str) -> str:
    lower = text.lower()
    if any(w in lower for w in ["immediately available", "available immediately", "notice period: 0", "can join immediately"]):
        return "Available"
    if any(w in lower for w in ["notice period", "serving notice", "currently employed", "employed at"]):
        return "Busy"
    return "Available"


def compute_extraction_confidence(profile: dict) -> float:
    """0–100: how complete/reliable the extraction is."""
    score = 0.0
    checks = [
        (bool(profile.get("name") and profile["name"] != "Unknown"), 15),
        (bool(profile.get("email")),        20),
        (bool(profile.get("phone")),         8),
        (bool(profile.get("education")),    10),
        (bool(profile.get("experience", 0) > 0 or "fresher" in str(profile.get("raw_text", "")).lower()), 12),
        (len(profile.get("skillScores", {})) >= 3, 20),
        (bool(profile.get("role")),         10),
        (bool(profile.get("location")),      5),
    ]
    for passed, weight in checks:
        if passed:
            score += weight
    return round(score, 1)


def compute_resume_quality_score(profile: dict, text: str) -> float:
    """0–100: quality of the resume itself."""
    score = 50.0
    lower = text.lower()
    if len(text) > 1000:  score += 10
    if len(text) > 2500:  score += 5
    if profile.get("email"):      score += 5
    if profile.get("phone"):      score += 5
    if profile.get("education"):  score += 8
    if profile.get("links", {}):  score += 5
    if profile.get("certifications"): score += 7
    if profile.get("projects"):   score += 5
    if any(w in lower for w in ["achieved", "delivered", "improved", "reduced", "increased", "led", "built", "designed"]):
        score += 5
    missing = []
    if not profile.get("email"):        missing.append("email")
    if not profile.get("phone"):        missing.append("phone")
    if not profile.get("education"):    missing.append("education")
    if not profile.get("experience"):   missing.append("experience")
    if len(profile.get("skillScores", {})) < 3: missing.append("skills")
    return round(min(100.0, score), 1)


# ══════════════════════════════════════════════════════════════════════════════
# RESUME PARSER — main function
# ══════════════════════════════════════════════════════════════════════════════

def parse_resume(text: str, filename: str) -> dict[str, Any]:
    skills        = extract_skills(text)
    exp           = extract_experience_years(text)
    role          = extract_role(text)
    predicted_role = predict_role(text, skills)
    dept          = extract_department(role, text)
    edu           = extract_education(text)
    perf          = extract_performance_rating(text)
    avail         = extract_availability(text)
    certs         = extract_certifications(text)
    soft_skills   = extract_soft_skills(text)
    projects      = extract_projects(text)
    links         = extract_links(text)
    location      = extract_location(text)
    skill_level   = round(sum(skills.values()) / max(1, len(skills)), 1) if skills else 5.0

    tech_skills   = [s for s in skills if s not in SOFT_SKILL_KEYWORDS]

    profile = {
        "employeeId":      f"RES-{uuid.uuid4().hex[:8].upper()}",
        "name":            extract_name(text),
        "email":           extract_email(text),
        "phone":           extract_phone(text),
        "location":        location,
        "role":            role,
        "predictedRole":   predicted_role,
        "department":      dept,
        "skills":          ", ".join(tech_skills),
        "skillScores":     {k: round(v, 1) for k, v in skills.items()},
        "skillLevel":      min(10.0, skill_level),
        "technicalSkills": tech_skills,
        "softSkills":      soft_skills,
        "experience":      round(exp, 1),
        "education":       edu,
        "certifications":  certs,
        "projects":        projects,
        "links":           links,
        "category":        "Full-time",
        "availability":    avail,
        "performanceRating": perf,
        "sourceFile":      filename,
        "extractedAt":     datetime.datetime.now().isoformat(),
    }

    profile["extractionConfidence"]  = compute_extraction_confidence(profile)
    profile["resumeQualityScore"]    = compute_resume_quality_score(profile, text)
    profile["missingImportantFields"] = [
        f for f, v in [
            ("email", profile["email"]), ("phone", profile["phone"]),
            ("education", profile["education"]), ("experience", profile["experience"]),
        ] if not v
    ]
    return profile


# ══════════════════════════════════════════════════════════════════════════════
# 1. JD PARSER
# ══════════════════════════════════════════════════════════════════════════════

def _skill_priority_from_context(text: str, skill_alias: str) -> str:
    idx = text.lower().find(skill_alias)
    if idx < 0:
        return "medium"
    window = text.lower()[max(0, idx - 150): idx + 150]
    for priority, signals in JD_PRIORITY_SIGNALS.items():
        if any(s in window for s in signals):
            return priority
    return "medium"


def parse_jd(text: str) -> dict[str, Any]:
    """Parse Job Description text into structured fields."""
    lower = text.lower()

    # Job title — first line or "Position: XYZ"
    job_title = ""
    title_m = re.search(r"(?:job title|position|role|hiring for)[:\s]+(.+?)(?:\n|$)", lower)
    if title_m:
        job_title = title_m.group(1).strip().title()
    else:
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        if lines and len(lines[0]) < 80:
            job_title = lines[0]

    # Required role
    required_role = ""
    for role, keywords in ROLE_KEYWORDS.items():
        for kw in keywords:
            if kw in lower:
                required_role = role
                break
        if required_role:
            break

    # Extract skills with priorities
    required_skills: list[dict] = []
    seen_skills: set[str] = set()
    for canonical, aliases in SKILL_ALIASES.items():
        for alias in aliases:
            pat = r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])"
            if re.search(pat, lower):
                if canonical not in seen_skills:
                    seen_skills.add(canonical)
                    priority = _skill_priority_from_context(text, alias)
                    required_skills.append({
                        "skill":    canonical,
                        "priority": priority,
                        "minScore": 7 if priority in ("critical", "high") else 5,
                    })
                break

    # Sort by priority
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    required_skills.sort(key=lambda x: priority_order.get(x["priority"], 2))

    priority_skills = [s["skill"] for s in required_skills if s["priority"] in ("critical", "high")]

    # Experience
    min_exp = 0.0
    pref_exp = 0.0
    exp_patterns = [
        (r"minimum[:\s]+(\d+(?:\.\d+)?)\+?\s+years?", "min"),
        (r"at least\s+(\d+(?:\.\d+)?)\s+years?", "min"),
        (r"(\d+(?:\.\d+)?)\+?\s+years?\s+(?:of\s+)?experience\s+required", "min"),
        (r"(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s+years?", "range"),
        (r"(\d+(?:\.\d+)?)\+?\s+years?\s+(?:of\s+)?experience", "min"),
        (r"preferred[:\s]+(\d+(?:\.\d+)?)\+?\s+years?", "pref"),
    ]
    for pat, kind in exp_patterns:
        m = re.search(pat, lower)
        if m:
            if kind == "range":
                min_exp = float(m.group(1))
                pref_exp = float(m.group(2))
            elif kind == "pref":
                pref_exp = float(m.group(1))
            else:
                min_exp = float(m.group(1))
            break

    # Education
    edu_requirement = ""
    for kw in EDUCATION_KEYWORDS:
        if kw in lower:
            for line in text.split("\n"):
                if kw in line.lower() and len(line.strip()) > 5:
                    edu_requirement = line.strip()[:120]
                    break
            if edu_requirement:
                break

    # Certifications in JD
    jd_certs = [c for c in CERT_KEYWORDS if c in lower]

    # Soft skills in JD
    jd_soft = [s for s in SOFT_SKILL_KEYWORDS if s in lower]

    # Keywords — significant unique words
    words = re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#.\-]{2,}\b", text)
    stopwords = {"the", "and", "for", "with", "this", "that", "will", "are", "you",
                 "have", "our", "your", "team", "work", "should", "must", "able",
                 "strong", "good", "experience", "skills", "knowledge", "ability"}
    freq: dict[str, int] = {}
    for w in words:
        wl = w.lower()
        if wl not in stopwords and len(wl) > 3:
            freq[wl] = freq.get(wl, 0) + 1
    keywords = [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])[:20]]

    # Responsibilities
    responsibilities: list[str] = []
    in_resp = False
    for line in text.split("\n"):
        s = line.strip()
        if re.match(r"^(responsibilities|key responsibilities|role responsibilities|you will|duties)\s*[:\-]?$", s, re.IGNORECASE):
            in_resp = True
            continue
        if in_resp:
            if re.match(r"^(requirements?|qualifications?|skills?|what we|about)\s*[:\-]?$", s, re.IGNORECASE):
                break
            if s.startswith(("•", "-", "*", "–", "·")) or (s and s[0].isupper()):
                clean = re.sub(r"^[•\-*–·]\s*", "", s)
                if clean:
                    responsibilities.append(clean[:150])
        if len(responsibilities) >= 8:
            break

    return {
        "jobTitle":            job_title,
        "requiredRole":        required_role,
        "requiredSkills":      required_skills,
        "prioritySkills":      priority_skills,
        "minimumExperience":   min_exp,
        "preferredExperience": pref_exp,
        "educationRequirement": edu_requirement,
        "certifications":      jd_certs,
        "softSkills":          jd_soft,
        "keywords":            keywords,
        "responsibilities":    responsibilities,
        "totalSkillsRequired": len(required_skills),
    }


# ══════════════════════════════════════════════════════════════════════════════
# 4-8. JD MATCH SCORING
# ══════════════════════════════════════════════════════════════════════════════

def score_skill_match(resume_scores: dict[str, float], jd: dict) -> dict:
    """
    5. Skill Match Logic:
    - Strong Match: score >= 7
    - Partial Match: 4 <= score < 7
    - Missing: score < 4 or absent
    Returns skillMatchScore 0-100.
    """
    jd_skills = jd.get("requiredSkills", [])
    if not jd_skills:
        # No requirements — base on resume richness
        avg = sum(resume_scores.values()) / max(1, len(resume_scores)) * 10 if resume_scores else 50
        return {
            "skillMatchScore":      round(avg, 2),
            "matchedSkills":        list(resume_scores.keys()),
            "partialMatchedSkills": [],
            "missingSkills":        [],
            "strongSkills":         [s for s, v in resume_scores.items() if v >= 7],
        }

    priority_weight_map = {"critical": 1.0, "high": 0.8, "medium": 0.6, "low": 0.4}

    matched, partial, missing, strong = [], [], [], []
    weighted_score = 0.0
    max_possible   = 0.0

    for req in jd_skills:
        skill_name = normalize_skill(req.get("skill", ""))
        priority   = req.get("priority", "medium")
        pw         = priority_weight_map.get(priority, 0.6)
        max_possible += pw

        # Exact match first, then alias/partial
        score = resume_scores.get(skill_name, 0.0)
        if score == 0.0:
            for alias in SKILL_ALIASES.get(skill_name, []):
                norm_alias = normalize_skill(alias)
                if norm_alias in resume_scores:
                    score = resume_scores[norm_alias]
                    break
            # Partial string match as last resort
            if score == 0.0:
                for rs_name, rs_val in resume_scores.items():
                    if skill_name in rs_name or rs_name in skill_name:
                        score = rs_val
                        break

        if score >= 7:
            strong.append(f"{skill_name} ({score}/10)")
            matched.append(f"{skill_name} ({score}/10)")
            weighted_score += pw * 1.0
        elif score >= 4:
            partial.append(f"{skill_name} ({score}/10)")
            weighted_score += pw * 0.5
        else:
            missing.append(skill_name)
            weighted_score += 0

    skill_match = (weighted_score / max_possible) * 100 if max_possible > 0 else 50.0

    return {
        "skillMatchScore":      round(min(100, skill_match), 2),
        "matchedSkills":        matched,
        "partialMatchedSkills": partial,
        "missingSkills":        missing,
        "strongSkills":         strong,
    }


def score_experience_match(resume_exp: float, jd: dict) -> dict:
    """6. Experience Match Logic."""
    min_exp = float(jd.get("minimumExperience", 0))
    if min_exp <= 0:
        score = 100.0
        status = "Not Required"
    elif resume_exp >= min_exp:
        score = 100.0
        status = "Exceeds Requirement" if resume_exp > min_exp * 1.2 else "Meets Requirement"
    elif resume_exp >= min_exp * 0.8:
        score = 80.0 + ((resume_exp / min_exp) - 0.8) * 100
        status = "Slightly Below Requirement"
    elif resume_exp >= min_exp * 0.5:
        score = 40.0 + ((resume_exp / min_exp) - 0.5) * 120
        status = "Below Requirement"
    else:
        score = max(0.0, (resume_exp / max(min_exp, 0.1)) * 40)
        status = "Significantly Below Requirement"

    return {
        "experienceMatchScore":  round(min(100, score), 2),
        "candidateExperience":   resume_exp,
        "requiredExperience":    min_exp,
        "experienceStatus":      status,
    }


def score_role_match(resume_role: str, predicted_role: str, jd: dict) -> dict:
    """7. Role Match Logic."""
    jd_role = (jd.get("requiredRole") or jd.get("jobTitle") or "").lower()
    if not jd_role:
        return {"roleMatchScore": 70.0, "roleMatchReason": "No specific role required"}

    resume_role_l    = resume_role.lower()
    predicted_role_l = predicted_role.lower()

    # Exact match
    if jd_role == resume_role_l or jd_role == predicted_role_l:
        return {"roleMatchScore": 100.0, "roleMatchReason": f"Exact role match: {resume_role}"}

    # Substring match
    if jd_role in resume_role_l or resume_role_l in jd_role or jd_role in predicted_role_l:
        return {"roleMatchScore": 85.0, "roleMatchReason": f"Strong role match: {resume_role} ≈ {jd_role.title()}"}

    # Domain-level match
    DOMAIN_GROUPS = [
        {"frontend developer", "ui/ux designer", "full stack developer"},
        {"backend developer", "software engineer", "full stack developer"},
        {"data scientist", "ml engineer", "data engineer"},
        {"devops engineer", "cloud architect"},
        {"qa engineer"},
        {"project manager", "product manager", "business analyst"},
    ]
    for group in DOMAIN_GROUPS:
        if resume_role_l in group and jd_role in group:
            return {"roleMatchScore": 70.0, "roleMatchReason": f"Same domain: {resume_role} and {jd_role.title()}"}
        if predicted_role_l in group and jd_role in group:
            return {"roleMatchScore": 65.0, "roleMatchReason": f"Similar domain (predicted role): {predicted_role}"}

    # Keyword overlap
    jd_words    = set(jd_role.split())
    resume_words = set(resume_role_l.split()) | set(predicted_role_l.split())
    overlap = jd_words & resume_words
    if overlap:
        score = 40.0 + len(overlap) / max(len(jd_words), 1) * 30
        return {"roleMatchScore": round(score, 2), "roleMatchReason": f"Partial match on: {', '.join(overlap)}"}

    return {"roleMatchScore": 15.0, "roleMatchReason": f"Role mismatch: {resume_role} vs {jd_role.title()}"}


def score_education_match(resume_edu: str, jd: dict) -> dict:
    """8. Education Match Logic."""
    jd_edu = jd.get("educationRequirement", "")
    if not jd_edu:
        return {"educationMatchScore": 100.0, "matchedEducation": "No education requirement specified"}

    resume_edu_l = resume_edu.lower()
    jd_edu_l     = jd_edu.lower()

    EDU_LEVELS = {
        "phd": 4, "ph.d": 4, "doctorate": 4,
        "master": 3, "m.tech": 3, "m.sc": 3, "m.s": 3, "mba": 3,
        "bachelor": 2, "b.tech": 2, "b.sc": 2, "b.s": 2, "b.e": 2,
        "diploma": 1, "associate": 1,
    }

    resume_level = max((v for k, v in EDU_LEVELS.items() if k in resume_edu_l), default=0)
    jd_level     = max((v for k, v in EDU_LEVELS.items() if k in jd_edu_l),     default=0)

    if resume_level >= jd_level:
        score = 100.0
        msg   = f"Education meets requirement: {resume_edu[:60]}"
    elif resume_level == jd_level - 1:
        score = 65.0
        msg   = f"Education slightly below: {resume_edu[:60]} vs required {jd_edu[:60]}"
    else:
        score = 35.0
        msg   = f"Education below requirement"

    # Relevant field bonus
    relevant_fields = ["computer science", "information technology", "software", "engineering", "mathematics", "statistics"]
    if any(f in resume_edu_l for f in relevant_fields):
        score = min(100.0, score + 10.0)
        msg += " (relevant field)"

    return {"educationMatchScore": round(score, 2), "matchedEducation": msg}


def score_certification_match(resume_certs: list[str], jd: dict) -> dict:
    """8b. Certification Match Logic."""
    jd_certs = jd.get("certifications", [])
    if not jd_certs:
        has_certs = len(resume_certs) > 0
        return {
            "certificationMatchScore": 100.0 if has_certs else 80.0,
            "matchedCertifications":   resume_certs,
        }

    resume_certs_l = " ".join(resume_certs).lower()
    matched = [c for c in jd_certs if c in resume_certs_l]
    score = (len(matched) / len(jd_certs)) * 100 if jd_certs else 80.0

    return {
        "certificationMatchScore": round(score, 2),
        "matchedCertifications":   matched,
    }


def compute_jd_match(profile: dict, jd: dict) -> dict:
    """
    4. JD Match Scoring:
    finalJDMatchScore = 0.50*skill + 0.20*exp + 0.15*role + 0.10*edu + 0.05*cert
    Redistribute weights if education/cert not in JD.
    """
    skill_result  = score_skill_match(profile.get("skillScores", {}), jd)
    exp_result    = score_experience_match(float(profile.get("experience", 0)), jd)
    role_result   = score_role_match(
        profile.get("role", ""),
        profile.get("predictedRole", profile.get("role", "")),
        jd,
    )
    edu_result    = score_education_match(profile.get("education", ""), jd)
    cert_result   = score_certification_match(profile.get("certifications", []), jd)

    # Weight redistribution
    w_skill, w_exp, w_role, w_edu, w_cert = 0.50, 0.20, 0.15, 0.10, 0.05
    if not jd.get("educationRequirement"):
        w_skill += 0.06
        w_exp   += 0.04
        w_edu    = 0.0
    if not jd.get("certifications"):
        w_skill += 0.03
        w_exp   += 0.02
        w_cert   = 0.0

    final = (
        w_skill * skill_result["skillMatchScore"]
        + w_exp  * exp_result["experienceMatchScore"]
        + w_role * role_result["roleMatchScore"]
        + w_edu  * edu_result["educationMatchScore"]
        + w_cert * cert_result["certificationMatchScore"]
    )

    return {
        "finalJDMatchScore":       round(min(100, final), 2),
        "skillMatchScore":         skill_result["skillMatchScore"],
        "experienceMatchScore":    exp_result["experienceMatchScore"],
        "roleMatchScore":          role_result["roleMatchScore"],
        "educationMatchScore":     edu_result["educationMatchScore"],
        "certificationMatchScore": cert_result["certificationMatchScore"],
        "matchedSkills":           skill_result["matchedSkills"],
        "partialMatchedSkills":    skill_result["partialMatchedSkills"],
        "missingSkills":           skill_result["missingSkills"],
        "strongSkills":            skill_result["strongSkills"],
        "experienceStatus":        exp_result["experienceStatus"],
        "candidateExperience":     exp_result["candidateExperience"],
        "requiredExperience":      exp_result["requiredExperience"],
        "roleMatchReason":         role_result["roleMatchReason"],
        "matchedEducation":        edu_result["matchedEducation"],
        "matchedCertifications":   cert_result["matchedCertifications"],
    }


# ══════════════════════════════════════════════════════════════════════════════
# 9-10. CANDIDATE RANKING
# ══════════════════════════════════════════════════════════════════════════════

def _shortlist_label(score: float) -> str:
    if score >= 85: return "Excellent Match"
    if score >= 70: return "Good Match"
    if score >= 50: return "Needs Review"
    return "Not Suitable"


def _reason_for_ranking(rank: int, profile: dict, match: dict, jd: dict) -> str:
    total_req  = len(jd.get("requiredSkills", []))
    matched    = len(match.get("matchedSkills", []))
    strong     = len(match.get("strongSkills", []))
    exp        = profile.get("experience", 0)
    min_exp    = jd.get("minimumExperience", 0)
    role       = profile.get("role", "")
    jd_role    = jd.get("requiredRole", "") or jd.get("jobTitle", "")

    parts = [f"Ranked #{rank} because"]

    if total_req > 0:
        parts.append(f"matches {matched}/{total_req} required skills ({strong} strong)")
    else:
        skill_count = len(profile.get("skillScores", {}))
        parts.append(f"has {skill_count} detected skills")

    if min_exp > 0:
        if exp >= min_exp:
            parts.append(f"has {exp} yrs experience (required: {min_exp} yrs)")
        else:
            parts.append(f"has {exp} yrs experience (below required {min_exp} yrs)")
    else:
        parts.append(f"has {exp} yrs experience")

    if jd_role and role:
        role_score = match.get("roleMatchScore", 0)
        if role_score >= 85:
            parts.append(f"and role '{role}' strongly matches '{jd_role}'")
        elif role_score >= 60:
            parts.append(f"and role '{role}' partially matches '{jd_role}'")
        else:
            parts.append(f"but role '{role}' does not closely match '{jd_role}'")

    return ", ".join(parts) + "."


def rank_candidates(results: list[dict], jd: dict) -> list[dict]:
    """9-10. Sort by finalJDMatchScore, add rank + label + reason."""
    eligible = [r for r in results if r.get("success") and r.get("matchAnalysis")]
    failed   = [r for r in results if not r.get("success")]

    eligible.sort(key=lambda x: x["matchAnalysis"]["finalJDMatchScore"], reverse=True)

    for rank, result in enumerate(eligible, start=1):
        ma = result["matchAnalysis"]
        ma["rank"]           = rank
        ma["shortlistLabel"] = _shortlist_label(ma["finalJDMatchScore"])
        ma["reasonForRanking"] = _reason_for_ranking(
            rank, result["profile"], ma, jd
        )
        result["rank"] = rank

    return eligible + failed


# ══════════════════════════════════════════════════════════════════════════════
# API ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@APP.get("/api/resume/health")
def health():
    return {
        "status":       "ok",
        "version":      "2.0.0",
        "pdf_support":  PDF_AVAILABLE,
        "docx_support": DOCX_AVAILABLE,
        "spacy_support": SPACY_AVAILABLE,
    }


@APP.post("/api/resume/parse-jd")
async def parse_jd_endpoint(
    jd_text: str | None = Form(None),
    jd_file: UploadFile | None = File(None),
):
    """Parse a Job Description from text or uploaded file."""
    text = ""
    if jd_file and jd_file.filename:
        file_bytes = await jd_file.read()
        text = extract_text(file_bytes, jd_file.filename)
    elif jd_text:
        text = jd_text.strip()

    if not text or len(text) < 30:
        raise HTTPException(status_code=400, detail="Please provide a valid Job Description (at least 30 characters).")

    jd = parse_jd(text)
    return {"success": True, "jobDescription": jd, "textLength": len(text)}


@APP.post("/api/resume/extract-and-match")
async def extract_and_match(
    files: list[UploadFile] = File(...),
    jd_text: str | None     = Form(None),
    jd_file: UploadFile | None = File(None),
):
    """
    Extract resumes + match with JD in one call.
    Returns ranked candidates with full match analysis.
    """
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 files per batch.")

    # Parse JD
    jd_raw = ""
    if jd_file and jd_file.filename:
        jd_bytes = await jd_file.read()
        jd_raw = extract_text(jd_bytes, jd_file.filename)
    elif jd_text:
        jd_raw = jd_text.strip()

    jd = parse_jd(jd_raw) if jd_raw else {}
    has_jd = bool(jd_raw and len(jd_raw) >= 30)

    results = []
    seen_emails: set[str] = set()

    for file in files:
        filename = file.filename or "resume"
        try:
            ext = Path(filename).suffix.lower()
            if ext not in (".pdf", ".docx", ".doc", ".txt"):
                results.append({"filename": filename, "success": False, "error": f"Unsupported type: {ext}"})
                continue

            file_bytes = await file.read()
            if len(file_bytes) > 10 * 1024 * 1024:
                results.append({"filename": filename, "success": False, "error": "File too large (max 10 MB)"})
                continue
            if len(file_bytes) < 100:
                results.append({"filename": filename, "success": False, "error": "File is empty or too small"})
                continue

            text = extract_text(file_bytes, filename)
            if not text or len(text.strip()) < 50:
                results.append({"filename": filename, "success": False, "error": "Empty or unreadable resume (possibly scanned PDF)"})
                continue

            profile = parse_resume(text, filename)

            # Duplicate check by email
            email = profile.get("email", "")
            if email and email in seen_emails:
                results.append({"filename": filename, "success": False, "error": f"Duplicate candidate (email {email} already processed)"})
                continue
            if email:
                seen_emails.add(email)

            match_analysis = compute_jd_match(profile, jd) if has_jd else None

            results.append({
                "filename":      filename,
                "success":       True,
                "profile":       profile,
                "matchAnalysis": match_analysis,
                "skillsFound":   len(profile["skillScores"]),
            })

        except HTTPException as ex:
            results.append({"filename": filename, "success": False, "error": ex.detail})
        except Exception as ex:
            results.append({"filename": filename, "success": False, "error": str(ex)})

    # Rank candidates if JD provided
    if has_jd:
        results = rank_candidates(results, jd)

    return {
        "jobDescription": jd if has_jd else None,
        "hasJD":          has_jd,
        "results":        results,
        "total":          len(files),
        "successful":     sum(1 for r in results if r.get("success")),
        "failed":         sum(1 for r in results if not r.get("success")),
    }


@APP.post("/api/resume/extract")
async def extract_resume(file: UploadFile = File(...)):
    """Extract structured profile from a single resume file."""
    filename  = file.filename or "resume"
    ext = Path(filename).suffix.lower()
    if ext not in (".pdf", ".docx", ".doc", ".txt"):
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'.")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB.")

    text    = extract_text(file_bytes, filename)
    if not text or len(text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume appears to be empty or unreadable.")

    profile = parse_resume(text, filename)
    return {"success": True, "profile": profile, "rawTextLength": len(text), "skillsFound": len(profile["skillScores"])}


@APP.post("/api/resume/extract-batch")
async def extract_resumes_batch(files: list[UploadFile] = File(...)):
    """Extract profiles from multiple resume files."""
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 files per batch.")

    results = []
    for file in files:
        filename = file.filename or "resume"
        try:
            ext = Path(filename).suffix.lower()
            if ext not in (".pdf", ".docx", ".doc", ".txt"):
                results.append({"filename": filename, "success": False, "error": f"Unsupported type: {ext}"})
                continue
            file_bytes = await file.read()
            if len(file_bytes) > 10 * 1024 * 1024:
                results.append({"filename": filename, "success": False, "error": "File too large"})
                continue
            text = extract_text(file_bytes, filename)
            if not text or len(text.strip()) < 50:
                results.append({"filename": filename, "success": False, "error": "Empty or unreadable resume"})
                continue
            profile = parse_resume(text, filename)
            results.append({"filename": filename, "success": True, "profile": profile, "skillsFound": len(profile["skillScores"])})
        except HTTPException as ex:
            results.append({"filename": filename, "success": False, "error": ex.detail})
        except Exception as ex:
            results.append({"filename": filename, "success": False, "error": str(ex)})

    return {"total": len(files), "successful": sum(1 for r in results if r["success"]), "failed": sum(1 for r in results if not r["success"]), "results": results}


@APP.post("/api/resume/preview-text")
async def preview_text(file: UploadFile = File(...)):
    filename   = file.filename or "resume"
    file_bytes = await file.read()
    text = extract_text(file_bytes, filename)
    return {"filename": filename, "text": text[:3000], "totalLength": len(text)}


if __name__ == "__main__":
    uvicorn.run("resume_api:APP", host="0.0.0.0", port=5001, reload=True)
