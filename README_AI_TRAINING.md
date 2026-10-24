# RoadAlert AI Training Suite (DL, NLP, ML)

Comprehensive AI training, baseline evaluation, and dataset analysis pipelines for the **RoadAlert** Intelligent Traffic Incident Verification & Response Platform.

---

## 1. Architecture & Pipeline Overview

RoadAlert utilizes three separate, decoupled AI pipelines to solve distinct problems without conflating surface detection with incident truth:

```
                            ┌────────────────────────────────────────┐
                            │          RoadAlert AI Suite            │
                            └────────────────────┬───────────────────┘
                                                 │
            ┌────────────────────────────────────┼───────────────────────────────────┐
            │                                    │                                   │
            ▼                                    ▼                                   ▼
 ┌──────────────────────┐             ┌──────────────────────┐            ┌──────────────────────┐
 │ 1. Deep Learning (DL)│             │ 2. NLP Generation    │            │ 3. Machine Learning  │
 │  Road Damage (RDD)   │             │ Accident Reports 800 │            │ Incident Verification│
 └──────────┬───────────┘             └──────────┬───────────┘            └──────────┬───────────┘
            │                                    │                                   │
            ▼                                    ▼                                   ▼
  Physical Defect Vision               Structured 5W1H Synthesis             Multi-Modal Confidence
  • YOLOv8 / Faster R-CNN              • Rule-based & T5-small               • Section 10 Heuristics
  • 4 RDD2022 Classes                  • Neutral Paragraph Generator         • Anomaly Isolation
  • Potholes, Cracks                   • Dispatcher & Authority Summaries    • Calibrated 0-100 Score
```

### Critical Separation Principle
- **DL (RDD):** Detects **physical road distress** (potholes, cracks). It **does not prove** an incident is genuine or recent.
- **NLP (DSTI 800):** Synthesizes **structured 5W1H notes into neutral text summaries**. It **does not label** genuine vs fake reports.
- **ML (Tabular):** Combines **independent corroborations, GPS speed telemetry, authority stamps, and photo evidence** into an explainable verification score.

---

## 2. Dataset Specifications

| Pipeline | Dataset Name & Location | License | Format | Purpose & Scope |
|---|---|---|---|---|
| **Deep Learning (DL)** | **RDD2022 India** (Official CRDDC 2022, Figshare DOI: `10.6084/m9.figshare.21431547`) | CC BY-SA 4.0 | Pascal VOC XML & JPG images (17,372 files) | 4 road damage classes (`D00`, `D10`, `D20`, `D40`). |
| **Natural Language Processing (NLP)** | `DSTI/traffic-accidents-reports-800` (Direct Hugging Face download) | MIT | Parquet (Train: 629, Eval: 70, Test: 100) | 5W1H lines (`input`) to concise incident report (`target`). |
| **Machine Learning (ML)** | RoadAlert PostgreSQL / Prisma Schema (`database/schema.prisma`) | Proprietary | Tabular structured relational data | 18 seeded coastal Karnataka incidents + `incident_data_template.csv`. |

---

## 3. RDD2022 India Class Definitions

The official RDD2022 multi-national benchmark standardizes road damage into 4 core categories:

| ID | Class Code | Description | Severity Impact |
|---|---|---|---|
| 0 | **D00** | Longitudinal Crack (Wheel mark / Construction joint) | Medium |
| 1 | **D10** | Transverse / Lateral Crack | Medium |
| 2 | **D20** | Alligator (Fatigue) Mesh Crack | High (Structural) |
| 3 | **D40** | Pothole / Rutting / Bump / Separation | Critical (Vehicle Hazard) |

---

## 4. Local Workspace vs Google Colab GPU Separation

### A. Local Workspace (CPU / VS Code)
The local script and notebook perform **structural audits, baseline evaluations, and training configurations**:
- `data/RoadDamageDetector` contains the Sekilab code repository, utilities, and label map. It does not contain the multi-gigabyte annotated training images.
- Running `python scripts/train_roadalert_ai.py` audits the directory structure, loads the Hugging Face NLP dataset, runs the deterministic NLP baseline, and validates the Section 10 ML heuristic engine.
- **No neural models are trained locally.**

### B. Google Colab (GPU Training)
Full training of Ultralytics YOLOv8s on the genuine **RDD2022 India** dataset is executed in Google Colab using:
👉 [`RoadAlert_RDD2022_YOLO_Colab.ipynb`](./RoadAlert_RDD2022_YOLO_Colab.ipynb)

---

## 5. How to Train in Google Colab (Step-by-Step)

1. Open [Google Colab](https://colab.research.google.com/).
2. Click **Upload** and upload [`RoadAlert_RDD2022_YOLO_Colab.ipynb`](./RoadAlert_RDD2022_YOLO_Colab.ipynb).
3. In Colab, navigate to **Runtime > Change runtime type**, and select **T4 GPU** (or A100).
4. Run the cells step-by-step:
   - **Step 1:** Verifies GPU acceleration via `!nvidia-smi`.
   - **Step 2:** Installs `ultralytics`, `pyyaml`, and dependencies.
   - **Step 3:** Downloads the official RDD2022 archive from Figshare and extracts the `India/` folder.
   - **Step 4:** Parses the Pascal VOC XML annotations, confirms classes (`D00`, `D10`, `D20`, `D40`), and verifies image-XML pairing.
   - **Step 5:** Converts bounding boxes from Pascal VOC XML to normalized YOLO format.
   - **Step 6 (Leakage-Aware Split):** Sorts frames and splits into 80% Train, 10% Validation, and 10% Test using contiguous 100-frame blocks. This prevents adjacent dashcam video frames from leaking across splits.
   - **Step 7:** Trains YOLOv8s for 40 epochs on GPU device 0 (`imgsz=640`, `batch=16`, `optimizer='AdamW'`).
   - **Step 8:** Evaluates `best.pt` on the held-out test split and reports genuine `mAP@0.5`, `mAP@0.5:0.95`, Precision, and Recall.
   - **Step 9:** Exports the trained model to ONNX format (`best.onnx`) with dynamic batching.
   - **Step 10:** Visualizes detection predictions on sample Indian road images.
5. Download the exported `best.onnx` file from `RoadAlert_RDD_Runs/yolov8s_rdd2022_india/weights/best.onnx`.

---

## 6. Leakage-Aware Splitting Methodology

### Metadata Availability Assessment
In the official RDD2022 India dataset, files are named sequentially (`India_000004.jpg`, `India_000006.jpg`, etc.). No separate video session logs or GPS trip metadata files are provided.

### Splitting Strategy
Because dashcam footage captures contiguous video streams:
- Uniform random splitting places adjacent frames (captured milliseconds apart) into both train and validation sets, resulting in falsely inflated validation scores.
- To prevent this leakage without assuming non-existent metadata, `RoadAlert_RDD2022_YOLO_Colab.ipynb` groups images into **contiguous blocks of 100 frames**, allocating whole blocks to Train (80%), Val (10%), or Test (10%).

---

## 7. Production Backend Integration Blueprint

Once you have trained the model in Colab and downloaded `best.onnx`:

1. Place `best.onnx` into `backend/models/road_damage_yolov8s.onnx`.
2. Integration Hook in `backend/src/services/incidentService.ts`:
   When citizen or employee evidence photos are uploaded via `POST /api/v1/incidents/:id/evidence`:
   ```typescript
   // On-device inference with onnxruntime-node
   // 1. Resize evidence image to 640x640 RGB tensor
   // 2. Run session.run({ images: tensor })
   // 3. Filter boxes with confidence >= 0.40 for D40 (pothole) or D20 (alligator crack)
   // 4. Save metadata: { damage_detected: true, class: 'D40', confidence: 0.85 }
   // 5. VerificationEngine awards +15 points for validated evidence
   ```
3. Existing production routes, authentication, Prisma database schemas, and frontend views remain intact.

---

## 8. Artifacts & Git Hygiene

- Datasets (`data/`), model weights (`*.pt`, `*.onnx`), and training runs (`runs/`, `RoadAlert_RDD_Runs/`) are excluded via `.gitignore`.
- Only notebook definitions, documentation, and lightweight schema templates are tracked.
