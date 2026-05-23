"""
Resume Extraction API  –  port 5001
Accepts PDF / DOCX resume uploads, extracts structured candidate profiles,
and returns them in the same shape the HRM frontend expects for employees.

Dependencies (add to requirements):
    fastapi uvicorn python-multipart pdfplumber python-docx spacy
    python -m spacy download en_core_web_sm
"""

import io
import json
import re
import uuid
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── optional heavy deps – graceful fallback if not installed ──────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
APP = FastAPI(title="HRM Resume Extraction API", version="1.0.0")
APP.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Skill knowledge base ──────────────────────────────────────────────────────
SKILL_KEYWORDS: dict[str, list[str]] = {
    # Programming languages
    "python": ["python", "python3"],
    "java": ["java", "java 8", "java 11", "java 17"],
    "javascript": ["javascript", "js", "es6", "es2015"],
    "typescript": ["typescript", "ts"],
    "c++": ["c++", "cpp", "c plus plus"],
    "c#": ["c#", "csharp", "c sharp", ".net"],
    "go": ["golang", "go lang"],
    "rust": ["rust"],
    "kotlin": ["kotlin"],
    "swift": ["swift"],
    "php": ["php"],
    "ruby": ["ruby", "ruby on rails", "rails"],
    "scala": ["scala"],
    "r": [" r ", "r programming", "rstudio"],
    # Web frameworks
    "react": ["react", "reactjs", "react.js", "react native"],
    "angular": ["angular", "angularjs"],
    "vue": ["vue", "vuejs", "vue.js"],
    "node js": ["node", "nodejs", "node.js", "express", "expressjs"],
    "spring boot": ["spring boot", "spring", "springboot"],
    "django": ["django"],
    "flask": ["flask"],
    "fastapi": ["fastapi", "fast api"],
    "laravel": ["laravel"],
    "next js": ["next.js", "nextjs"],
    # Databases
    "sql": ["sql", "mysql", "mariadb"],
    "postgresql": ["postgresql", "postgres", "psql"],
    "mongodb": ["mongodb", "mongo"],
    "redis": ["redis"],
    "elasticsearch": ["elasticsearch", "elastic search"],
    "oracle": ["oracle", "oracle db"],
    "sqlite": ["sqlite"],
    "cassandra": ["cassandra"],
    # Cloud & DevOps
    "aws": ["aws", "amazon web services", "ec2", "s3", "lambda"],
    "azure": ["azure", "microsoft azure"],
    "gcp": ["gcp", "google cloud", "google cloud platform"],
    "docker": ["docker", "dockerfile", "docker compose"],
    "kubernetes": ["kubernetes", "k8s"],
    "terraform": ["terraform"],
    "jenkins": ["jenkins"],
    "github actions": ["github actions", "github ci"],
    "ci/cd": ["ci/cd", "cicd", "continuous integration", "continuous deployment"],
    # ML / Data
    "machine learning": ["machine learning", "ml", "supervised learning", "unsupervised learning"],
    "deep learning": ["deep learning", "neural network", "cnn", "rnn", "lstm"],
    "tensorflow": ["tensorflow", "tf"],
    "pytorch": ["pytorch", "torch"],
    "scikit-learn": ["scikit-learn", "sklearn"],
    "pandas": ["pandas"],
    "numpy": ["numpy"],
    "data analysis": ["data analysis", "data analytics", "eda"],
    "nlp": ["nlp", "natural language processing", "text mining"],
    "computer vision": ["computer vision", "image processing", "opencv"],
    # Testing
    "testing": ["unit testing", "integration testing", "tdd", "bdd", "test driven"],
    "selenium": ["selenium"],
    "jest": ["jest"],
    "pytest": ["pytest"],
    "junit": ["junit"],
    # Soft skills
    "communication": ["communication", "presentation", "public speaking"],
    "leadership": ["leadership", "team lead", "team leader", "led a team", "managed a team"],
    "agile": ["agile", "scrum", "kanban", "sprint"],
    "project management": ["project management", "pmp", "jira", "confluence"],
    "problem solving": ["problem solving", "analytical", "critical thinking"],
}

ROLE_KEYWORDS: dict[str, list[str]] = {
    "Software Engineer": ["software engineer", "software developer", "sde", "swe"],
    "Frontend Developer": ["frontend", "front-end", "front end", "ui developer", "react developer"],
    "Backend Developer": ["backend", "back-end", "back end", "server side"],
    "Full Stack Developer": ["full stack", "fullstack", "full-stack"],
    "Data Scientist": ["data scientist", "data science"],
    "ML Engineer": ["machine learning engineer", "ml engineer", "ai engineer"],
    "Data Engineer": ["data engineer", "etl developer", "data pipeline"],
    "DevOps Engineer": ["devops", "dev ops", "site reliability", "sre", "platform engineer"],
    "QA Engineer": ["qa engineer", "quality assurance", "test engineer", "sdet", "automation engineer"],
    "Product Manager": ["product manager", "pm", "product owner"],
    "UI/UX Designer": ["ui designer", "ux designer", "ui/ux", "product designer"],
    "Cloud Architect": ["cloud architect", "solutions architect", "aws architect"],
    "Security Engineer": ["security engineer", "cybersecurity", "information security"],
    "Android Developer": ["android developer", "android engineer"],
    "iOS Developer": ["ios developer", "ios engineer", "swift developer"],
    "Database Administrator": ["dba", "database administrator", "database engineer"],
    "Business Analyst": ["business analyst", "ba", "systems analyst"],
    "Project Manager": ["project manager", "program manager", "scrum master"],
}

DEPARTMENT_MAP: dict[str, list[str]] = {
    "Engineering": ["software", "engineer", "developer", "devops", "sre", "platform", "backend", "frontend", "fullstack"],
    "Data": ["data scientist", "data engineer", "ml engineer", "analytics", "bi developer"],
    "QA": ["qa", "quality assurance", "test", "sdet"],
    "Design": ["designer", "ui", "ux", "product design"],
    "Product": ["product manager", "product owner", "business analyst"],
    "Security": ["security", "cybersecurity", "infosec"],
    "IT": ["it support", "system admin", "network", "infrastructure"],
    "Management": ["manager", "director", "vp", "head of", "lead"],
}

EDUCATION_KEYWORDS = [
    "b.tech", "b.e", "bachelor", "b.sc", "bsc", "b.s",
    "m.tech", "m.e", "master", "m.sc", "msc", "m.s", "mba",
    "phd", "ph.d", "doctorate",
    "diploma", "associate",
    "computer science", "information technology", "software engineering",
    "electronics", "electrical", "mechanical", "civil",
]

SECTION_HEADERS = [
    "experience", "work experience", "employment", "professional experience",
    "education", "academic", "qualification",
    "skills", "technical skills", "core competencies",
    "projects", "certifications", "achievements", "summary", "objective",
]


# ── Text extraction ───────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes) -> str:
    if not PDF_AVAILABLE:
        raise HTTPException(status_code=422, detail="pdfplumber not installed. Run: pip install pdfplumber")
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)


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
    raise HTTPException(status_code=415, detail=f"Unsupported file type: {ext}. Use PDF, DOCX, or TXT.")


# ── Field extractors ──────────────────────────────────────────────────────────

def extract_name(text: str) -> str:
    """Extract candidate name — first non-empty line that looks like a name."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    # Try spaCy PERSON entity first
    if SPACY_AVAILABLE and _nlp:
        doc = _nlp(text[:500])
        for ent in doc.ents:
            if ent.label_ == "PERSON" and len(ent.text.split()) >= 2:
                return ent.text.strip()
    # Fallback: first line that is 2-4 words, no digits, no special chars
    for line in lines[:5]:
        words = line.split()
        if 2 <= len(words) <= 4 and all(re.match(r"^[A-Za-z.\-']+$", w) for w in words):
            return line
    return lines[0] if lines else "Unknown"


def extract_email(text: str) -> str:
    match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    return match.group(0) if match else ""


def extract_phone(text: str) -> str:
    match = re.search(
        r"(\+?\d{1,3}[\s\-]?)?(\(?\d{3}\)?[\s\-]?)?\d{3}[\s\-]?\d{4}", text
    )
    return match.group(0).strip() if match else ""


def extract_skills(text: str) -> dict[str, float]:
    """Return {skill_name: score} where score is estimated from context."""
    lower = text.lower()
    found: dict[str, float] = {}

    for canonical, aliases in SKILL_KEYWORDS.items():
        for alias in aliases:
            # Use word-boundary-aware search
            pattern = r"(?<![a-z])" + re.escape(alias) + r"(?![a-z])"
            if re.search(pattern, lower):
                # Estimate score from proficiency keywords near the skill mention
                score = _estimate_skill_score(lower, alias)
                found[canonical] = max(found.get(canonical, 0), score)
                break

    return found


def _estimate_skill_score(text: str, skill: str) -> float:
    """Estimate a 1-10 score based on proficiency words near the skill mention."""
    idx = text.find(skill)
    if idx < 0:
        return 6.0
    window = text[max(0, idx - 80): idx + 80]

    if any(w in window for w in ["expert", "advanced", "proficient", "extensive", "strong", "lead", "architect"]):
        return 9.0
    if any(w in window for w in ["intermediate", "good", "solid", "experienced", "working knowledge"]):
        return 7.0
    if any(w in window for w in ["basic", "beginner", "familiar", "exposure", "learning", "entry"]):
        return 4.0
    # Count years of experience with this skill
    yr_match = re.search(r"(\d+)\s*\+?\s*year", window)
    if yr_match:
        yrs = int(yr_match.group(1))
        return min(10.0, 4.0 + yrs * 0.8)
    return 6.0


def extract_experience_years(text: str) -> float:
    """
    Extract total years of experience correctly.
    Prevents CGPA, percentages, phone numbers,
    and random numbers from becoming experience.
    """

    lower = text.lower()

    # Explicit experience patterns
    patterns = [
        r"(\d+(?:\.\d+)?)\+?\s+years?\s+of\s+experience",
        r"(\d+(?:\.\d+)?)\+?\s+years?\s+experience",
        r"experience\s+of\s+(\d+(?:\.\d+)?)\+?\s+years?",
        r"(\d+(?:\.\d+)?)\+?\s+yrs?\s+experience",
        r"worked\s+for\s+(\d+(?:\.\d+)?)\+?\s+years?",
    ]

    for pattern in patterns:
        match = re.search(pattern, lower)

        if match:
            years = float(match.group(1))

            # Ignore invalid values
            if 0 <= years <= 40:
                return round(years, 1)

    # Internship experience detection
    internship_patterns = [
        r"(\d+)\s+month[s]?\s+internship",
        r"internship\s+for\s+(\d+)\s+month[s]?",
        r"(\d+)\s+month[s]?\s+training",
    ]

    for pattern in internship_patterns:
        match = re.search(pattern, lower)

        if match:
            months = int(match.group(1))
            return round(months / 12, 1)

    # Fresher/student detection
    fresher_keywords = [
        "fresher",
        "student",
        "currently pursuing",
        "recent graduate",
        "entry level",
    ]

    if any(keyword in lower for keyword in fresher_keywords):
        return 0.0

    # Detect date ranges like 2023-2024
    date_ranges = re.findall(
        r"(20\d{2}|19\d{2})\s*[-–—to]+\s*(20\d{2}|19\d{2}|present|current)",
        lower,
    )

    if date_ranges:
        import datetime

        current_year = datetime.datetime.now().year
        total = 0

        for start, end in date_ranges:
            start_year = int(start)

            if end in ["present", "current"]:
                end_year = current_year
            else:
                end_year = int(end)

            diff = max(0, end_year - start_year)

            # Ignore unrealistic values
            if diff <= 15:
                total += diff

        return round(float(total), 1)

    return 0.0


def extract_role(text: str) -> str:
    lower = text.lower()
    for role, keywords in ROLE_KEYWORDS.items():
        for kw in keywords:
            if kw in lower:
                return role
    return "Software Engineer"


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
            # Find the line containing this keyword
            for line in text.split("\n"):
                if kw in line.lower() and len(line.strip()) > 5:
                    found.append(line.strip())
                    break
    return "; ".join(dict.fromkeys(found[:3])) if found else ""


def extract_performance_rating(text: str) -> float:
    """Estimate performance from GPA, ratings, or achievement keywords."""
    lower = text.lower()
    # GPA
    gpa_match = re.search(r"gpa\s*[:\-]?\s*(\d+\.?\d*)\s*/\s*(\d+\.?\d*)", lower)
    if gpa_match:
        gpa = float(gpa_match.group(1))
        scale = float(gpa_match.group(2))
        return round(min(10.0, (gpa / scale) * 10), 1)
    # Percentage
    pct_match = re.search(r"(\d{2,3}(?:\.\d+)?)\s*%", lower)
    if pct_match:
        pct = float(pct_match.group(1))
        if pct <= 100:
            return round(min(10.0, pct / 10), 1)
    # Achievement keywords
    if any(w in lower for w in ["award", "best employee", "top performer", "excellence", "distinction"]):
        return 9.0
    if any(w in lower for w in ["promoted", "recognition", "achievement"]):
        return 8.0
    return 7.0


def extract_availability(text: str) -> str:
    lower = text.lower()
    if any(w in lower for w in ["immediately available", "available immediately", "notice period: 0"]):
        return "Available"
    if any(w in lower for w in ["notice period", "serving notice", "currently employed"]):
        return "Busy"
    return "Available"


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_resume(text: str, filename: str) -> dict[str, Any]:
    """Parse raw resume text into a structured employee profile."""
    name     = extract_name(text)
    email    = extract_email(text)
    phone    = extract_phone(text)
    skills   = extract_skills(text)
    exp      = extract_experience_years(text)
    role     = extract_role(text)
    dept     = extract_department(role, text)
    edu      = extract_education(text)
    perf     = extract_performance_rating(text)
    avail    = extract_availability(text)
    skill_level = round(sum(skills.values()) / max(1, len(skills)), 1) if skills else 5.0

    return {
        "employeeId": f"RES-{uuid.uuid4().hex[:8].upper()}",
        "name": name,
        "email": email,
        "phone": phone,
        "role": role,
        "department": dept,
        "skills": ", ".join(skills.keys()),
        "skillScores": {k: round(v, 1) for k, v in skills.items()},
        "skillLevel": min(10.0, skill_level),
        "experience": round(exp, 1),
        "category": "Full-time",
        "availability": avail,
        "performanceRating": perf,
        "education": edu,
        "sourceFile": filename,
        "extractedAt": __import__("datetime").datetime.now().isoformat(),
    }


# ── API endpoints ─────────────────────────────────────────────────────────────

@APP.get("/api/resume/health")
def health():
    return {
        "status": "ok",
        "pdf_support": PDF_AVAILABLE,
        "docx_support": DOCX_AVAILABLE,
        "spacy_support": SPACY_AVAILABLE,
    }


@APP.post("/api/resume/extract")
async def extract_resume(file: UploadFile = File(...)):
    """
    Extract a structured employee profile from a single resume file.
    Accepts: PDF, DOCX, TXT
    Returns: employee profile JSON
    """
    filename = file.filename or "resume"
    ext = Path(filename).suffix.lower()
    if ext not in (".pdf", ".docx", ".doc", ".txt"):
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ext}'. Upload PDF, DOCX, or TXT.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB.")

    try:
        text = extract_text(file_bytes, filename)
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=422, detail=f"Could not read file: {str(ex)}") from ex

    if not text or len(text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume appears to be empty or unreadable.")

    profile = parse_resume(text, filename)
    return {
        "success": True,
        "profile": profile,
        "rawTextLength": len(text),
        "skillsFound": len(profile["skillScores"]),
    }


@APP.post("/api/resume/extract-batch")
async def extract_resumes_batch(files: list[UploadFile] = File(...)):
    """
    Extract profiles from multiple resume files in one request.
    Returns list of results (success or error per file).
    """
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
                results.append({"filename": filename, "success": False, "error": "File too large (max 10 MB)"})
                continue

            text = extract_text(file_bytes, filename)
            if not text or len(text.strip()) < 50:
                results.append({"filename": filename, "success": False, "error": "Empty or unreadable resume"})
                continue

            profile = parse_resume(text, filename)
            results.append({
                "filename": filename,
                "success": True,
                "profile": profile,
                "skillsFound": len(profile["skillScores"]),
            })
        except HTTPException as ex:
            results.append({"filename": filename, "success": False, "error": ex.detail})
        except Exception as ex:
            results.append({"filename": filename, "success": False, "error": str(ex)})

    return {
        "total": len(files),
        "successful": sum(1 for r in results if r["success"]),
        "failed": sum(1 for r in results if not r["success"]),
        "results": results,
    }


@APP.post("/api/resume/preview-text")
async def preview_text(file: UploadFile = File(...)):
    """Return the raw extracted text for debugging/preview."""
    filename = file.filename or "resume"
    file_bytes = await file.read()
    text = extract_text(file_bytes, filename)
    return {"filename": filename, "text": text[:3000], "totalLength": len(text)}


if __name__ == "__main__":
    uvicorn.run("resume_api:APP", host="0.0.0.0", port=5001, reload=True)
