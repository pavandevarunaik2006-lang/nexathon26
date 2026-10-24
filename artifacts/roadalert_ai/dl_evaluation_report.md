# RoadAlert AI — Deep Learning (DL) Road Damage Dataset Audit & Training Plan

## 1. Local Directory Inspection & Status
- **Target Dataset Path Checked:** `data\RoadDamageDetector`
- **Execution Status:** **Dataset Structure Audit Only — Not Trained Locally.**
- **Repository Context:** Contains Sekilab `RoadDamageDetector` code repository, utilities, label definitions, and documentation diagrams.
- **Local Images Found:** 4 tutorial/sample images.
- **Local XML Annotations Found:** 0 XML files present in local repository.
- **Label Map Detected:** `data\RoadDamageDetector\crackLabelMap.txt` (8 classes).

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
