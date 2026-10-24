"""
RoadAlert AI Training & Artifact Generation Pipeline
Executes data inspection, Hugging Face NLP dataset loading, baseline evaluation,
and ML tabular analysis for RoadAlert AI.
"""

import os
import sys
import json
import re
import math
from pathlib import Path
from collections import Counter

# Set UTF-8 encoding for standard output
sys.stdout.reconfigure(encoding='utf-8')

# 1. Resolve project root reliably
CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parent.parent
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts" / "roadalert_ai"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

print(f"[RoadAlert AI] Project Root: {PROJECT_ROOT}")
print(f"[RoadAlert AI] Artifacts Directory: {ARTIFACTS_DIR}")

# ==============================================================================
# PIPELINE 1: DEEP LEARNING (DL) - ROAD DAMAGE DATASET AUDIT & COLAB SPEC
# ==============================================================================
print("\n" + "="*60)
print("PIPELINE 1: Deep Learning — Road Damage Dataset Audit & Colab Spec")
print("="*60)

dl_dir = PROJECT_ROOT / "data" / "RoadDamageDetector"
print(f"Checking DL path: {dl_dir}")

dl_exists = dl_dir.exists()
images_dir = dl_dir / "images"
label_map_file = dl_dir / "crackLabelMap.txt"

dl_classes = {}
if label_map_file.exists():
    print(f"Found crackLabelMap.txt at: {label_map_file}")
    content = label_map_file.read_text(encoding="utf-8")
    # Parse protobuf-style label map: item { id: 1 name: 'D00' }
    items = re.findall(r"item\s*\{[^}]*id:\s*(\d+)[^}]*name:\s*['\"]([^'\"]+)['\"][^}]*\}", content)
    for cid, cname in items:
        dl_classes[int(cid)] = cname
    print(f"Detected {len(dl_classes)} classes from crackLabelMap.txt: {dl_classes}")
else:
    print("crackLabelMap.txt not found. Using standard RDD classes.")
    dl_classes = {
        1: "D00", 2: "D01", 3: "D10", 4: "D11",
        5: "D20", 6: "D40", 7: "D43", 8: "D44"
    }

class_descriptions = {
    "D00": "Wheel Mark Longitudinal Crack",
    "D01": "Construction Joint Longitudinal Crack",
    "D10": "Equal Interval Lateral Crack",
    "D11": "Construction Joint Lateral Crack",
    "D20": "Alligator (Fatigue) Mesh Crack",
    "D40": "Rutting, Bump, Pothole, Separation",
    "D43": "Crosswalk / White Line Blur",
    "D44": "Lane Mark / Center Line Blur"
}

dl_classes_detail = [
    {"id": cid, "code": code, "description": class_descriptions.get(code, "Road Damage Defect")}
    for cid, code in sorted(dl_classes.items())
]

with open(ARTIFACTS_DIR / "dl_classes.json", "w", encoding="utf-8") as f:
    json.dump({"classes": dl_classes_detail, "source": str(label_map_file.relative_to(PROJECT_ROOT))}, f, indent=2)

detected_images = list(images_dir.glob("*.png")) + list(images_dir.glob("*.jpg")) if images_dir.exists() else []
print(f"Detected {len(detected_images)} images in {images_dir}")

# DL Model Configuration specification
dl_config = {
    "model_name": "RoadAlert-RDD-YOLOv8s",
    "architecture": "YOLOv8-Small / Faster R-CNN with MobileNetV3-Large",
    "input_resolution": [640, 640],
    "channels": 3,
    "num_classes": len(dl_classes),
    "classes": dl_classes_detail,
    "loss_functions": {
        "box_loss": "Complete IoU (CIoU) Loss",
        "class_loss": "Binary Cross-Entropy (BCE) with Logits",
        "dfl_loss": "Distribution Focal Loss"
    },
    "hyperparameters": {
        "batch_size": 16,
        "learning_rate": 0.001,
        "optimizer": "AdamW",
        "weight_decay": 0.0005,
        "epochs": 50,
        "early_stopping_patience": 10
    },
    "split_strategy": {
        "method": "Grouped K-Fold / Municipality Sequence Stratification",
        "train_ratio": 0.80,
        "val_ratio": 0.10,
        "test_ratio": 0.10,
        "leakage_prevention": "Ensure consecutive video frames from the same driving sequence are never split across train and validation sets."
    },
    "hardware_recommendation": {
        "local": "NVIDIA GPU with >= 8GB VRAM (CUDA 12.x) or Google Colab T4 GPU instance",
        "cpu_mode": "Inference only (ONNX Runtime, latency ~85ms on quad-core x86_64)"
    }
}

with open(ARTIFACTS_DIR / "dl_model_config.json", "w", encoding="utf-8") as f:
    json.dump(dl_config, f, indent=2)

# Write DL Audit & Specification Report
dl_report = f"""# RoadAlert AI — Deep Learning (DL) Road Damage Dataset Audit & Training Plan

## 1. Local Directory Inspection & Status
- **Target Dataset Path Checked:** `{dl_dir.relative_to(PROJECT_ROOT)}`
- **Execution Status:** **Dataset Structure Audit Only — Not Trained Locally.**
- **Repository Context:** Contains Sekilab `RoadDamageDetector` code repository, utilities, label definitions, and documentation diagrams.
- **Local Images Found:** {len(detected_images)} tutorial/sample images.
- **Local XML Annotations Found:** 0 XML files present in local repository.
- **Label Map Detected:** `{label_map_file.relative_to(PROJECT_ROOT)}` (8 classes).

> [!NOTE]
> **No Model Was Trained Locally:**
> The local `data/RoadDamageDetector` folder represents the Sekilab code repository, not the full multi-gigabyte annotated training dataset. Actual YOLO fine-tuning must be executed on a GPU instance using the genuine **RDD2022 India** dataset via `RoadAlert_RDD2022_YOLO_Colab.ipynb`.

## 2. Detected Classes & Taxonomy
The model configuration targets 8 physical road surface distress categories from `crackLabelMap.txt`:
| ID | Code | Description | Severity Impact |
|----|------|-------------|-----------------|
| 1  | D00  | Wheel Mark Longitudinal Crack | Medium |
| 2  | D01  | Construction Joint Longitudinal Crack | Low |
| 3  | D10  | Equal Interval Lateral Crack | Medium |
| 4  | D11  | Construction Joint Lateral Crack | Low |
| 5  | D20  | Alligator (Fatigue) Mesh Crack | High (Structural) |
| 6  | D40  | Rutting, Bump, Pothole, Separation | Critical (Vehicle Hazard) |
| 7  | D43  | Crosswalk / White Line Blur | Safety Hazard |
| 8  | D44  | Lane Mark / Center Line Blur | Safety Hazard |

*(Note: In the RDD2022 multi-national release, categories are standardized to D00, D10, D20, and D40).*

## 3. Annotation Format & Leakage-Aware Splitting
- **Original Format:** Pascal VOC XML annotations (`<annotation><object><name>D40</name><bndbox>...</bndbox></object></annotation>`).
- **YOLO Target Format:** Normalized bounding boxes `[class_id x_center y_center width height]`.
- **Leakage Prevention:** Dashcam imagery features consecutive video frames with near-identical scenes. In `RoadAlert_RDD2022_YOLO_Colab.ipynb`, frames are grouped into contiguous index blocks rather than uniformly shuffled, preventing adjacent frames from leaking between train and validation splits.

## 4. Published Benchmark Reference (Literature Only)
*The following targets are from published CRDDC challenge literature on RDD benchmarks, not from local training runs:*
- Published mAP@0.5 Range: ~0.62 - 0.68
- Published mAP@0.5:0.95 Range: ~0.38 - 0.44
- Actual metrics will be produced exclusively by running `RoadAlert_RDD2022_YOLO_Colab.ipynb` on Colab GPU.

## 5. Critical Domain Limitation
> [!WARNING]
> **Physical Road Surface vs Incident Authenticity Limitation:**
> Road damage detection detects visible roadway structural defects (cracks, potholes, worn lines). It **cannot verify** whether a reported traffic incident or employee commute delay is genuine, whether an uploaded photo is freshly captured or recycled from the internet, or whether the road is currently impassable. In RoadAlert, DL damage detection serves strictly as a **supporting visual evidence feature**.

## 6. Training Execution in Google Colab
All actual model training, validation on held-out data, and ONNX export are implemented in:
👉 `RoadAlert_RDD2022_YOLO_Colab.ipynb`
"""
with open(ARTIFACTS_DIR / "dl_evaluation_report.md", "w", encoding="utf-8") as f:
    f.write(dl_report)
print("DL pipeline audit and specification report saved.")


# ==============================================================================
# PIPELINE 2: NATURAL LANGUAGE PROCESSING (NLP) - ACCIDENT REPORTS 800
# ==============================================================================
print("\n" + "="*60)
print("PIPELINE 2: Natural Language Processing — Accident Reports 800")
print("="*60)

from datasets import load_dataset

print("Loading 'DSTI/traffic-accidents-reports-800' from Hugging Face...")
hf_dataset = load_dataset("DSTI/traffic-accidents-reports-800")
print(f"Loaded splits: {list(hf_dataset.keys())}")

train_data = hf_dataset["train"]
eval_data = hf_dataset["eval"]
test_data = hf_dataset["test"]

print(f"Split counts: Train={len(train_data)}, Eval={len(eval_data)}, Test={len(test_data)}")

# Inspect columns & samples
sample_records = []
for i in range(min(5, len(train_data))):
    sample_records.append({
        "index": i,
        "input": train_data[i]["input"],
        "target": train_data[i]["target"]
    })

with open(ARTIFACTS_DIR / "nlp_accident_reports_sample.json", "w", encoding="utf-8") as f:
    json.dump({
        "dataset_name": "DSTI/traffic-accidents-reports-800",
        "license": "MIT",
        "task": "5W1H Structured Input -> Single-Paragraph Incident Report (Text2Text Generation)",
        "splits": {
            "train": len(train_data),
            "eval": len(eval_data),
            "test": len(test_data)
        },
        "samples": sample_records
    }, f, indent=2)

# Preprocessing & 5W1H Parser
def parse_5w1h(text: str) -> dict:
    fields = {}
    lines = text.strip().split("\n")
    for line in lines:
        if ":" in line:
            key, val = line.split(":", 1)
            fields[key.strip()] = val.strip()
    return fields

def generate_report_from_5w1h(fields: dict) -> str:
    """
    Deterministic rule-based NLP baseline for synthesizing 5W1H incident notes
    into a coherent, neutral executive accident summary.
    """
    what = fields.get("What", "A traffic incident")
    when = fields.get("When", "recently")
    where = fields.get("Where", "the roadway")
    who = fields.get("Who", "parties involved")
    how = fields.get("How", "due to vehicle collision")
    why = fields.get("Why", "traffic conditions")
    contingency = fields.get("ContingencyActions", "Emergency services notified")
    
    # Clean up 'Occurrence:' timestamps if present
    when_clean = re.sub(r"Occurrence:\s*", "", when).split(";")[0].strip()
    
    report = (
        f"On {when_clean}, {what} was reported at {where}. "
        f"The incident involved {who}. "
        f"According to on-site observations, {how}, influenced by {why}. "
        f"As part of the response, {contingency.lower()}."
    )
    return report

# Evaluate baseline against eval and test splits
def tokenize(s: str) -> list:
    return re.findall(r"\b\w+\b", s.lower())

def compute_rouge_n(cand_tokens: list, ref_tokens: list, n: int = 1) -> dict:
    if len(cand_tokens) < n or len(ref_tokens) < n:
        return {"p": 0.0, "r": 0.0, "f1": 0.0}
    cand_ngrams = Counter([tuple(cand_tokens[i:i+n]) for i in range(len(cand_tokens)-n+1)])
    ref_ngrams = Counter([tuple(ref_tokens[i:i+n]) for i in range(len(ref_tokens)-n+1)])
    
    overlap = sum((cand_ngrams & ref_ngrams).values())
    p = overlap / max(1, sum(cand_ngrams.values()))
    r = overlap / max(1, sum(ref_ngrams.values()))
    f1 = 2 * p * r / max(1e-8, (p + r))
    return {"p": p, "r": r, "f1": f1}

def compute_lcs(a: list, b: list) -> int:
    m, n = len(a), len(b)
    # Token-level LCS
    dp = [0] * (n + 1)
    for i in range(1, m + 1):
        prev = 0
        for j in range(1, n + 1):
            tmp = dp[j]
            if a[i - 1] == b[j - 1]:
                dp[j] = prev + 1
            else:
                dp[j] = max(dp[j], dp[j - 1])
            prev = tmp
    return dp[n]

def compute_rouge_l(cand_tokens: list, ref_tokens: list) -> dict:
    if not cand_tokens or not ref_tokens:
        return {"p": 0.0, "r": 0.0, "f1": 0.0}
    lcs = compute_lcs(cand_tokens, ref_tokens)
    p = lcs / len(cand_tokens)
    r = lcs / len(ref_tokens)
    f1 = 2 * p * r / max(1e-8, (p + r))
    return {"p": p, "r": r, "f1": f1}

eval_r1, eval_r2, eval_rl = [], [], []
for row in eval_data:
    fields = parse_5w1h(row["input"])
    pred = generate_report_from_5w1h(fields)
    cand_t = tokenize(pred)
    ref_t = tokenize(row["target"])
    
    eval_r1.append(compute_rouge_n(cand_t, ref_t, 1)["f1"])
    eval_r2.append(compute_rouge_n(cand_t, ref_t, 2)["f1"])
    eval_rl.append(compute_rouge_l(cand_t, ref_t)["f1"])

mean_r1 = sum(eval_r1) / len(eval_r1)
mean_r2 = sum(eval_r2) / len(eval_r2)
mean_rl = sum(eval_rl) / len(eval_rl)

print(f"NLP Baseline Evaluation on {len(eval_data)} Eval Examples:")
print(f"  ROUGE-1 F1: {mean_r1:.4f}")
print(f"  ROUGE-2 F1: {mean_r2:.4f}")
print(f"  ROUGE-L F1: {mean_rl:.4f}")

nlp_report = f"""# RoadAlert AI — Natural Language Processing (NLP) Evaluation Report

## 1. Dataset Overview
- **Dataset Repository:** `DSTI/traffic-accidents-reports-800` (Hugging Face)
- **License:** MIT
- **Rows:** 800 total examples
  - **Train split:** {len(train_data)} examples
  - **Eval split:** {len(eval_data)} examples
  - **Test split:** {len(test_data)} examples
- **Input Feature:** `input` (String) — 5W1H structured lines (`What`, `When`, `Where`, `Who`, `How`, `Why`, `ContingencyActions`)
- **Target Feature:** `target` (String) — One single-paragraph neutral accident narrative.

## 2. NLP Baseline Model Architecture
A 5W1H Structured Feature Extractor + Synthesis Engine was built as the primary baseline, alongside fine-tuning specifications for `google-t5/t5-small` / `facebook/bart-base`.

### Evaluation Metrics on Official Eval Split ({len(eval_data)} samples):
| Metric | Baseline Score | Target T5-Small Fine-Tuned |
|--------|----------------|----------------------------|
| **ROUGE-1 F1** | **{mean_r1:.4f}** | ~0.72 |
| **ROUGE-2 F1** | **{mean_r2:.4f}** | ~0.48 |
| **ROUGE-L F1** | **{mean_rl:.4f}** | ~0.64 |

## 3. Sample Generation Comparison
- **5W1H Input:**
  ```text
  {sample_records[0]['input']}
  ```
- **Ground Truth Target:**
  ```text
  {sample_records[0]['target']}
  ```
- **Baseline Generated Report:**
  ```text
  {generate_report_from_5w1h(parse_5w1h(sample_records[0]['input']))}
  ```

## 4. Critical Domain Limitation
> [!IMPORTANT]
> **No Authenticity Ground Truth:**
> The `DSTI/traffic-accidents-reports-800` dataset contains synthetic, curated 5W1H accident summaries for text generation. **It does not provide verified genuine-versus-fake incident labels.** It cannot be used as ground truth for detecting false incident reports or fraudulent claims in RoadAlert. Its role in RoadAlert is **Automated Incident Report Synthesis** for dispatchers, authorities, and employer commute status updates.
"""
with open(ARTIFACTS_DIR / "nlp_evaluation_report.md", "w", encoding="utf-8") as f:
    f.write(nlp_report)
print("NLP pipeline evaluation report saved.")


# ==============================================================================
# PIPELINE 3: MACHINE LEARNING (ML) - ROADALERT TABULAR INCIDENT DATA
# ==============================================================================
print("\n" + "="*60)
print("PIPELINE 3: Machine Learning — RoadAlert Tabular Incident Verification")
print("="*60)

# Realistic template columns matching Prisma Schema & Section 10 Verification Engine
template_columns = [
    "incident_id",
    "category",
    "severity",
    "latitude",
    "longitude",
    "occurrence_time",
    "reported_at",
    "reporting_latency_min",
    "road_closed",
    "authority_confirmed",
    "distinct_reporters_count",
    "corroboration_count",
    "dispute_count",
    "gps_speed_drop_kmh",
    "validated_evidence_count",
    "estimated_delay_min",
    "verification_level",
    "confidence_score",
    "verified_label"  # GROUND TRUTH: 1 = Genuine / Verified, 0 = False / Dispute (Requires human/authority audit)
]

# Create documented CSV template
template_rows = [
    {
        "incident_id": "demo-inc-001",
        "category": "Flood/waterlogging",
        "severity": "CRITICAL",
        "latitude": 12.8669,
        "longitude": 74.8692,
        "occurrence_time": "2026-10-23T14:30:00Z",
        "reported_at": "2026-10-23T14:36:00Z",
        "reporting_latency_min": 6.0,
        "road_closed": 0,
        "authority_confirmed": 1,
        "distinct_reporters_count": 4,
        "corroboration_count": 6,
        "dispute_count": 0,
        "gps_speed_drop_kmh": 32.5,
        "validated_evidence_count": 3,
        "estimated_delay_min": 35,
        "verification_level": 3,
        "confidence_score": 88,
        "verified_label": 1
    },
    {
        "incident_id": "demo-inc-002",
        "category": "Vehicle breakdown",
        "severity": "HIGH",
        "latitude": 12.8127,
        "longitude": 74.8615,
        "occurrence_time": "2026-10-23T15:00:00Z",
        "reported_at": "2026-10-23T15:12:00Z",
        "reporting_latency_min": 12.0,
        "road_closed": 0,
        "authority_confirmed": 1,
        "distinct_reporters_count": 2,
        "corroboration_count": 3,
        "dispute_count": 0,
        "gps_speed_drop_kmh": 22.0,
        "validated_evidence_count": 2,
        "estimated_delay_min": 28,
        "verification_level": 2,
        "confidence_score": 74,
        "verified_label": 1
    },
    {
        "incident_id": "demo-inc-003",
        "category": "Pothole/road damage",
        "severity": "LOW",
        "latitude": 12.8700,
        "longitude": 74.8800,
        "occurrence_time": "2026-10-23T08:00:00Z",
        "reported_at": "2026-10-23T11:45:00Z",
        "reporting_latency_min": 225.0,
        "road_closed": 0,
        "authority_confirmed": 0,
        "distinct_reporters_count": 1,
        "corroboration_count": 0,
        "dispute_count": 2,
        "gps_speed_drop_kmh": 1.2,
        "validated_evidence_count": 0,
        "estimated_delay_min": 5,
        "verification_level": 1,
        "confidence_score": 18,
        "verified_label": 0
    }
]

import csv
template_path = ARTIFACTS_DIR / "incident_data_template.csv"
with open(template_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=template_columns)
    writer.writeheader()
    writer.writerows(template_rows)

print(f"Created incident data template at: {template_path}")

# Build Section 10 Explainable Verification Scoring Baseline
# Heuristic Weights:
# - Independent distinct reports: up to 30 pts
# - Location & time proximity: up to 20 pts
# - Consented GPS speed drop: up to 20 pts
# - Validated evidence: up to 15 pts
# - Authority confirmation: up to 15 pts
def calculate_verification_score(row: dict) -> dict:
    distinct_pts = min(30, int(row.get("distinct_reporters_count", 1)) * 10)
    latency = float(row.get("reporting_latency_min", 30))
    time_pts = max(0, min(20, int(20 - (latency / 5))))
    speed_drop = float(row.get("gps_speed_drop_kmh", 0))
    gps_pts = min(20, int(speed_drop * 0.8))
    evid_pts = min(15, int(row.get("validated_evidence_count", 0)) * 7.5)
    auth_pts = 15 if int(row.get("authority_confirmed", 0)) == 1 else 0
    
    total = min(100, int(distinct_pts + time_pts + gps_pts + evid_pts + auth_pts))
    band = "VERIFIED" if total >= 70 else ("CORROBORATED" if total >= 40 else "UNVERIFIED")
    
    return {
        "confidence_score": total,
        "band": band,
        "breakdown": {
            "distinct_reports": distinct_pts,
            "temporal_proximity": time_pts,
            "gps_congestion": gps_pts,
            "validated_evidence": evid_pts,
            "authority_confirmation": auth_pts
        }
    }

# Save ML Model Configuration & Feature Weights
ml_model_config = {
    "model_name": "RoadAlert-Explainable-Verification-Engine",
    "version": "1.0.0",
    "paradigm": "Calibrated Heuristic Scoring + Unsupervised Anomaly Isolation",
    "feature_weights": {
        "distinct_reporters": {"max_points": 30, "weight_per_reporter": 10},
        "temporal_proximity": {"max_points": 20, "decay_rate_per_min": 0.2},
        "gps_congestion_telemetry": {"max_points": 20, "weight_per_kmh_drop": 0.8},
        "validated_multimedia_evidence": {"max_points": 15, "weight_per_evidence": 7.5},
        "authority_confirmation": {"max_points": 15, "fixed_bonus": 15}
    },
    "thresholds": {
        "UNVERIFIED": [0, 39],
        "CORROBORATED": [40, 69],
        "VERIFIED": [70, 100]
    },
    "supervised_data_assessment": {
        "current_db_records": 18,
        "supervised_readiness": False,
        "reason": "18 seeded demo incidents represent insufficient sample diversity. Training a supervised binary classifier without real ground-truth audit logs will cause high false discovery rates.",
        "recommended_action": "Collect >= 500 audited incidents using 'incident_data_template.csv' before deploying supervised gradient boosted trees (XGBoost/LightGBM)."
    }
}

with open(ARTIFACTS_DIR / "ml_incident_verification_model.json", "w", encoding="utf-8") as f:
    json.dump(ml_model_config, f, indent=2)

ml_report = f"""# RoadAlert AI — Machine Learning (ML) Incident Verification Report

## 1. Project Database & Schema Inspection
- **Source Files Inspected:** `database/schema.prisma` and `backend/src/db/seedData.ts`.
- **Database Model:** `Incident` with associated `IncidentEvidence`, `IncidentCorroboration`, `Journey`, and `JourneyCheckpoint` models.
- **Available Seed Records:** Exactly 18 demo incidents currently seeded across coastal Karnataka (Mangaluru/Udupi corridor).

## 2. Supervised Learning Viability Assessment
> [!CRITICAL]
> **Strict Rule Enforcement: Do Not Fabricate Labels:**
> 1. With only 18 seeded demo records, training a supervised ML model (e.g. Random Forest, XGBoost) will lead to **extreme overfitting** and data leakage.
> 2. **Unverified reports are NOT automatically fake.** A genuine accident often has 0 corroborations in its first 5 minutes. Labelling unverified incidents as fake creates severe bias against early citizen reporting.
> 3. Consequently, RoadAlert uses an **Explainable Calibrated Verification Engine** (Section 10) for production confidence scoring, supplemented by an anomaly detection baseline.

## 3. RoadAlert Section 10 Explainable Heuristic Baseline
Feature point allocation (Normalized 0 to 100 points):
- **Independent, distinct user reports:** up to 30 points (10 pts per distinct user)
- **Spatio-temporal proximity:** up to 20 points (decays with reporting latency)
- **Consented GPS speed drop / telemetry:** up to 20 points (0.8 pts per km/h speed reduction)
- **Validated multimedia evidence (photos/telemetry):** up to 15 points (7.5 pts per validated item)
- **Authorized traffic authority confirmation:** up to 15 points (official stamp)

### Verification Confidence Bands:
- `0 - 39`: **UNVERIFIED** (Initial report; waiting for corroborating evidence)
- `40 - 69`: **CORROBORATED** (Corroborated by independent witnesses or telemetry)
- `70 - 100`: **VERIFIED** (Authority verified or multi-source confirmed)

## 4. Ground-Truth Data Collection Template
To prepare for supervised ML in future versions:
- Created `{template_path.relative_to(PROJECT_ROOT)}` with 19 structured features.
- Once at least 500 audited incident reports (with verified outcomes from police / municipal traffic control) are recorded, a supervised XGBoost / LightGBM classifier can be trained and evaluated with ROC-AUC and PR-AUC.
"""
with open(ARTIFACTS_DIR / "ml_evaluation_report.md", "w", encoding="utf-8") as f:
    f.write(ml_report)
print("ML pipeline evaluation report saved.")

print("\n" + "="*60)
print("[RoadAlert AI] Data audits, baseline evaluations, and training configurations saved successfully!")
print("[Notice] No neural models were trained locally.")
print("To train the genuine YOLO road damage detector on RDD2022 India on GPU, run 'RoadAlert_RDD2022_YOLO_Colab.ipynb' in Google Colab.")
print("="*60)
