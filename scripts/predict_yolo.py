#!/usr/bin/env python3
"""
RoadAlert YOLO Inference Bridge
Accepts model path and image path, performs inference using Ultralytics YOLO,
and returns structured JSON detection output on stdout.
"""

import sys
import json
import argparse
from pathlib import Path

# Explicit class mappings from the trained RDD2022 model
DEFAULT_CLASS_MAPPING = {
    0: {"code": "D00", "description": "Longitudinal Crack"},
    1: {"code": "D01", "description": "Longitudinal Construction Joint Crack"},
    2: {"code": "D0w0", "description": "Longitudinal Crack (Variant)"},
    3: {"code": "D10", "description": "Transverse / Lateral Crack"},
    4: {"code": "D11", "description": "Lateral Construction Joint Crack"},
    5: {"code": "D20", "description": "Alligator (Fatigue) Mesh Crack"},
    6: {"code": "D40", "description": "Pothole / Rutting / Bump"},
    7: {"code": "D43", "description": "Crosswalk / White Line Blur"},
    8: {"code": "D44", "description": "Lane Mark / Center Line Blur"},
    9: {"code": "D50", "description": "Manhole / Utility Defect"},
}

def main():
    parser = argparse.ArgumentParser(description="RoadAlert YOLO Inference CLI")
    parser.add_argument("--model", type=str, required=True, help="Path to best.pt or best.onnx")
    parser.add_argument("--source", type=str, required=True, help="Path to input image")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    args = parser.parse_args()

    model_path = Path(args.model)
    source_path = Path(args.source)

    if not model_path.exists():
        output = {
            "success": False,
            "error": f"Model file not found: {model_path}",
            "damageDetected": False,
            "detectionsCount": 0,
            "detections": []
        }
        print(json.dumps(output))
        sys.exit(0)

    if not source_path.exists():
        output = {
            "success": False,
            "error": f"Source image not found: {source_path}",
            "damageDetected": False,
            "detectionsCount": 0,
            "detections": []
        }
        print(json.dumps(output))
        sys.exit(0)

    try:
        from ultralytics import YOLO
    except ImportError as e:
        output = {
            "success": False,
            "error": "Ultralytics package is not installed in the Python environment",
            "damageDetected": False,
            "detectionsCount": 0,
            "detections": []
        }
        print(json.dumps(output))
        sys.exit(0)

    try:
        model = YOLO(str(model_path))
        results = model.predict(
            source=str(source_path),
            conf=args.conf,
            imgsz=args.imgsz,
            verbose=False,
            device="cpu"
        )

        detections = []
        if results and len(results) > 0:
            boxes = results[0].boxes
            for box in boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                xyxy = box.xyxy[0].tolist()

                cls_info = DEFAULT_CLASS_MAPPING.get(
                    cls_id,
                    {"code": f"Class_{cls_id}", "description": "Road Defect"}
                )

                detections.append({
                    "classCode": cls_info["code"],
                    "className": cls_info["description"],
                    "confidence": round(conf, 4),
                    "bbox": {
                        "xmin": round(xyxy[0], 2),
                        "ymin": round(xyxy[1], 2),
                        "xmax": round(xyxy[2], 2),
                        "ymax": round(xyxy[3], 2),
                    }
                })

        output = {
            "success": True,
            "modelName": model_path.name,
            "damageDetected": len(detections) > 0,
            "detectionsCount": len(detections),
            "confidenceThreshold": args.conf,
            "detections": detections,
            "statusNote": f"Processed image with {len(detections)} defect(s) detected above {args.conf} confidence."
        }
        print(json.dumps(output))

    except Exception as exc:
        output = {
            "success": False,
            "error": f"Inference execution failed: {str(exc)}",
            "damageDetected": False,
            "detectionsCount": 0,
            "detections": []
        }
        print(json.dumps(output))

if __name__ == "__main__":
    main()
