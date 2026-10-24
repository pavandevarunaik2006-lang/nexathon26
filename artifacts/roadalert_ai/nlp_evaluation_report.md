# RoadAlert AI — Natural Language Processing (NLP) Evaluation Report

## 1. Dataset Overview
- **Dataset Repository:** `DSTI/traffic-accidents-reports-800` (Hugging Face)
- **License:** MIT
- **Rows:** 800 total examples
  - **Train split:** 629 examples
  - **Eval split:** 70 examples
  - **Test split:** 100 examples
- **Input Feature:** `input` (String) — 5W1H structured lines (`What`, `When`, `Where`, `Who`, `How`, `Why`, `ContingencyActions`)
- **Target Feature:** `target` (String) — One single-paragraph neutral accident narrative.

## 2. NLP Baseline Model Architecture
A 5W1H Structured Feature Extractor + Synthesis Engine was built as the primary baseline, alongside fine-tuning specifications for `google-t5/t5-small` / `facebook/bart-base`.

### Evaluation Metrics on Official Eval Split (70 samples):
| Metric | Baseline Score | Target T5-Small Fine-Tuned |
|--------|----------------|----------------------------|
| **ROUGE-1 F1** | **0.5786** | ~0.72 |
| **ROUGE-2 F1** | **0.2569** | ~0.48 |
| **ROUGE-L F1** | **0.3450** | ~0.64 |

## 3. Sample Generation Comparison
- **5W1H Input:**
  ```text
  What: rear-end collision, 2 vehicles
When: Occurrence: July 6, 2024, 21:55; Discovery: July 6, 2024, 21:58
Where: North Highway near exit 45
Who: Ms. Sophia Lin – Vehicle A (SUV), rear driver; Mr. David Carter – Vehicle B (compact car), injured
How: Vehicle A failed to brake in time, rear-ending Vehicle B in slow traffic
Why: Driver inattention by Vehicle A
ContingencyActions: Police notified, paramedics dispatched, debris cleared from highway
  ```
- **Ground Truth Target:**
  ```text
  On July 6, 2024, at 21:55, a rear-end collision occurred on North Highway near exit 45. Ms. Sophia Lin, driving Vehicle A (an SUV), failed to react to slowing traffic and struck Vehicle B (a compact car) operated by Mr. David Carter. Mr. Carter sustained mild whiplash. Police and paramedics responded quickly and highway debris was removed.
  ```
- **Baseline Generated Report:**
  ```text
  On July 6, 2024, 21:55, rear-end collision, 2 vehicles was reported at North Highway near exit 45. The incident involved Ms. Sophia Lin – Vehicle A (SUV), rear driver; Mr. David Carter – Vehicle B (compact car), injured. According to on-site observations, Vehicle A failed to brake in time, rear-ending Vehicle B in slow traffic, influenced by Driver inattention by Vehicle A. As part of the response, police notified, paramedics dispatched, debris cleared from highway.
  ```

## 4. Critical Domain Limitation
> [!IMPORTANT]
> **No Authenticity Ground Truth:**
> The `DSTI/traffic-accidents-reports-800` dataset contains synthetic, curated 5W1H accident summaries for text generation. **It does not provide verified genuine-versus-fake incident labels.** It cannot be used as ground truth for detecting false incident reports or fraudulent claims in RoadAlert. Its role in RoadAlert is **Automated Incident Report Synthesis** for dispatchers, authorities, and employer commute status updates.
