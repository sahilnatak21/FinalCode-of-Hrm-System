# ─────────────────────────────────────────────────────────────────
# HRM Team Formation — Quick Test Script (PowerShell)
# Run from: d:\FinalCode-of-Hrm-System\Frontend\python\
# Prerequisite: Python API running on port 5000
#   pip install -r requirements-team-api.txt
#   python team_api.py
# ─────────────────────────────────────────────────────────────────

$API = "http://localhost:5000"

Write-Host "`n=== HRM Team Formation ML API - Test Runner ===" -ForegroundColor Cyan

# ── Health check ──────────────────────────────────────────────────
Write-Host "`n[1] Health Check..." -ForegroundColor Yellow
$health = Invoke-RestMethod "$API/api/team/health" -Method Get
Write-Host "    Status: $($health.status)  Version: $($health.version)" -ForegroundColor Green

# ── PROJECT 1: E-Commerce Web Platform ────────────────────────────
Write-Host "`n[2] Project 1 — E-Commerce Web Platform (team size 5)" -ForegroundColor Yellow

$proj1 = @{
  criteria = @{
    projectName   = "E-Commerce Web Platform"
    projectId     = "PROJ-001"
    teamName      = "Web Dev Squad"
    teamSize      = 5
    numberOfTeams = 1
    minExperience = 2
    projectBudget = 420000
    requiredSkillRanges = @(
      @{ id="req-1"; name="React";       minScore=7; maxScore=10; priority="critical" }
      @{ id="req-2"; name="Spring Boot"; minScore=7; maxScore=10; priority="high"     }
      @{ id="req-3"; name="MySQL";       minScore=6; maxScore=10; priority="high"     }
      @{ id="req-4"; name="Docker";      minScore=6; maxScore=10; priority="medium"   }
      @{ id="req-5"; name="Testing";     minScore=5; maxScore=10; priority="low"      }
    )
    scoreWeights = @{ skill=50; experience=25; performance=25 }
  }
  config = @{ minClusters=2; maxClusters=6; randomState=42; kmeansNInit=20 }
} | ConvertTo-Json -Depth 10

$r1 = Invoke-RestMethod "$API/api/ml/team-formation" -Method Post -ContentType "application/json" -Body $proj1
Write-Host "    K = $($r1.kmeans.selectedK)  Silhouette = $($r1.kmeans.silhouetteScore)" -ForegroundColor Green
Write-Host "    RF Accuracy = $($r1.randomForestEvaluation.accuracyScore)  PseudoLabels = $($r1.randomForestEvaluation.pseudoLabelUsed)" -ForegroundColor Green
Write-Host "    Skill Gap Coverage = $($r1.skillGapAnalysis.coveragePercent)%" -ForegroundColor Green
Write-Host "    Team Members:" -ForegroundColor Green
$r1.members | ForEach-Object { Write-Host "      - $($_.name)  Score=$($_.finalCandidateScore)  Cluster=$($_.clusterId)" }
Write-Host "    Leader: $($r1.leader.name)  LeaderScore=$($r1.leader.leaderScore)" -ForegroundColor Magenta
Write-Host "    Excluded (On Leave/Unavailable): $($r1.datasetSource.excludedEmployees -join ', ')" -ForegroundColor DarkYellow

# ── PROJECT 2: ML Recommendation Engine ───────────────────────────
Write-Host "`n[3] Project 2 — ML Recommendation Engine (team size 4)" -ForegroundColor Yellow

$proj2 = @{
  criteria = @{
    projectName   = "ML Recommendation Engine"
    projectId     = "PROJ-002"
    teamName      = "AI Core Team"
    teamSize      = 4
    numberOfTeams = 1
    minExperience = 2
    requiredRole  = "data scientist, ml engineer"
    projectBudget = 380000
    requiredSkillRanges = @(
      @{ id="req-1"; name="Python";          minScore=8; maxScore=10; priority="critical" }
      @{ id="req-2"; name="Machine Learning"; minScore=7; maxScore=10; priority="critical" }
      @{ id="req-3"; name="TensorFlow";       minScore=6; maxScore=10; priority="high"     }
      @{ id="req-4"; name="PostgreSQL";       minScore=5; maxScore=10; priority="medium"   }
    )
    scoreWeights = @{ skill=60; experience=20; performance=20 }
  }
  config = @{ minClusters=2; maxClusters=5; randomState=42; kmeansNInit=20 }
} | ConvertTo-Json -Depth 10

$r2 = Invoke-RestMethod "$API/api/ml/team-formation" -Method Post -ContentType "application/json" -Body $proj2
Write-Host "    K = $($r2.kmeans.selectedK)  Silhouette = $($r2.kmeans.silhouetteScore)" -ForegroundColor Green
Write-Host "    RF Accuracy = $($r2.randomForestEvaluation.accuracyScore)  F1 = $($r2.randomForestEvaluation.f1Score)" -ForegroundColor Green
Write-Host "    Confusion Matrix Labels: $($r2.randomForestEvaluation.labels -join ' | ')" -ForegroundColor Green
Write-Host "    Team Members:" -ForegroundColor Green
$r2.members | ForEach-Object { Write-Host "      - $($_.name)  FinalScore=$($_.finalCandidateScore)  AttnSkill=$($_.attentionSkillScore)" }

# ── PROJECT 3: DevSecOps Pipeline ─────────────────────────────────
Write-Host "`n[4] Project 3 — DevSecOps Pipeline (team size 4)" -ForegroundColor Yellow

$proj3 = @{
  criteria = @{
    projectName   = "DevSecOps Pipeline"
    projectId     = "PROJ-003"
    teamName      = "Platform Engineering"
    teamSize      = 4
    numberOfTeams = 1
    minExperience = 3
    requiredRole  = "devops, cloud"
    projectBudget = 320000
    requiredSkillRanges = @(
      @{ id="req-1"; name="Docker";     minScore=7; maxScore=10; priority="critical" }
      @{ id="req-2"; name="Kubernetes"; minScore=7; maxScore=10; priority="critical" }
      @{ id="req-3"; name="AWS";        minScore=6; maxScore=10; priority="high"     }
      @{ id="req-4"; name="CI/CD";      minScore=6; maxScore=10; priority="high"     }
      @{ id="req-5"; name="Testing";    minScore=5; maxScore=10; priority="medium"   }
    )
    scoreWeights = @{ skill=55; experience=30; performance=15 }
  }
  config = @{ minClusters=2; maxClusters=5; randomState=42; kmeansNInit=20 }
} | ConvertTo-Json -Depth 10

$r3 = Invoke-RestMethod "$API/api/ml/team-formation" -Method Post -ContentType "application/json" -Body $proj3
Write-Host "    K = $($r3.kmeans.selectedK)  ClusterDiversity = $($r3.statistics.clusterDiversityScore)" -ForegroundColor Green
Write-Host "    Skill Gap Analysis:" -ForegroundColor Green
$r3.skillGapAnalysis.gaps | ForEach-Object {
  $color = if ($_.coverageStatus -eq "Covered") { "Green" } elseif ($_.coverageStatus -eq "Partially Covered") { "DarkYellow" } else { "Red" }
  Write-Host "      $($_.skill) [$($_.priority)] → $($_.coverageStatus) (best: $($_.bestTeamScore)/10)" -ForegroundColor $color
}
Write-Host "    Backup Candidates:" -ForegroundColor Cyan
$r3.backupCandidates | ForEach-Object { Write-Host "      - $($_.name): $($_.backupReason)" }

# ── Confusion Matrix Display ───────────────────────────────────────
Write-Host "`n[5] Confusion Matrix (Project 1 RF):" -ForegroundColor Yellow
if ($r1.randomForestEvaluation.available) {
  $labels = $r1.randomForestEvaluation.labels
  Write-Host ("    " + ($labels -join " | ")) -ForegroundColor Cyan
  $r1.randomForestEvaluation.confusionMatrix | ForEach-Object {
    Write-Host ("    " + ($_ -join "  ")) -ForegroundColor White
  }
  Write-Host "    $($r1.randomForestEvaluation.cmInterpretation.explanation)" -ForegroundColor DarkCyan
}

Write-Host "`n=== All tests complete ===" -ForegroundColor Cyan
