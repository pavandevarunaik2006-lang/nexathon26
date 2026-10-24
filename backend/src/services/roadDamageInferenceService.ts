/**
 * RoadAlert Road Damage Detection Service
 *
 * Dedicated inference engine for YOLO11/YOLOv8 road defect detection
 * trained on the RDD2022 India dataset (10 defect categories: D00 - D50).
 *
 * Architecture:
 * - Production Primary: High-speed pure Node.js ONNX Runtime (onnxruntime-node)
 * - Development Fallback: Python Ultralytics bridge for direct .pt execution
 * - Graceful Degradation: If weights are absent or unreadable, logs a warning
 *   on startup and safely returns non-breaking diagnostic metadata without
 *   throwing unhandled exceptions or disrupting evidence uploads.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { env } from '../config/env.js';

const execFileAsync = promisify(execFile);

// Exact class mapping matching the trained RDD2022 India YOLO model
export const RDD_CLASS_MAPPING: Record<
  number,
  { code: string; name: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }
> = {
  0: { code: 'D00', name: 'Wheel Mark Longitudinal Crack', severity: 'MEDIUM' },
  1: { code: 'D01', name: 'Construction Joint Longitudinal Crack', severity: 'LOW' },
  2: { code: 'D0w0', name: 'Longitudinal Crack (Variant)', severity: 'MEDIUM' },
  3: { code: 'D10', name: 'Transverse / Lateral Crack', severity: 'MEDIUM' },
  4: { code: 'D11', name: 'Lateral Construction Joint Crack', severity: 'LOW' },
  5: { code: 'D20', name: 'Alligator (Fatigue) Mesh Crack', severity: 'HIGH' },
  6: { code: 'D40', name: 'Pothole / Rutting / Bump', severity: 'CRITICAL' },
  7: { code: 'D43', name: 'Crosswalk / White Line Blur', severity: 'LOW' },
  8: { code: 'D44', name: 'Lane Mark / Center Line Blur', severity: 'LOW' },
  9: { code: 'D50', name: 'Manhole / Utility Defect', severity: 'MEDIUM' },
};

export interface RoadDamageBoundingBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface RoadDamageDetection {
  classCode: string;
  className: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  bbox: RoadDamageBoundingBox;
}

export interface RoadDamageAnalysisResult {
  analyzed: boolean;
  modelLoaded: boolean;
  modelName: string;
  modelType: 'ONNX_RUNTIME' | 'PYTHON_BRIDGE' | 'DISABLED';
  damageDetected: boolean;
  detectionsCount: number;
  detections: RoadDamageDetection[];
  confidenceThreshold: number;
  latencyMs?: number;
  statusNote: string;
}

let onnxSession: any = null;
let activeModelPath: string | null = null;
let activeModelType: 'ONNX_RUNTIME' | 'PYTHON_BRIDGE' | 'DISABLED' = 'DISABLED';
let isInitialized = false;

/**
 * Resolves a model path robustly against current working directory or backend root
 */
function resolveModelPath(configuredPath: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), configuredPath),
    path.resolve(process.cwd(), 'models', path.basename(configuredPath)),
    path.resolve(process.cwd(), '..', configuredPath),
    path.resolve(process.cwd(), '..', 'data', path.basename(configuredPath)),
    path.resolve(process.cwd(), '..', 'backend', 'models', path.basename(configuredPath)),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Also check if an ONNX companion exists when configured as .pt
  if (configuredPath.endsWith('.pt')) {
    const onnxCandidate = configuredPath.replace(/\.pt$/, '.onnx');
    return resolveModelPath(onnxCandidate);
  }

  return null;
}

/**
 * Initialize the road damage inference model once at application startup.
 * Never reloads models from disk on every HTTP request.
 */
export async function initRoadDamageService(): Promise<void> {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

  if (!env.ROAD_DAMAGE_ENABLED) {
    activeModelType = 'DISABLED';
    console.log('[RoadDamageDetector] Service is explicitly disabled via ROAD_DAMAGE_ENABLED=false.');
    return;
  }

  const resolved = resolveModelPath(env.ROAD_DAMAGE_MODEL_PATH);

  if (!resolved) {
    activeModelType = 'DISABLED';
    console.warn(
      `[RoadDamageDetector] Warning: Model weights not found for path "${env.ROAD_DAMAGE_MODEL_PATH}". ` +
      `Road damage visual inference will be inactive until weights (best.onnx or best.pt) are provided.`
    );
    return;
  }

  activeModelPath = resolved;

  // 1. Prefer native ONNX Runtime if an .onnx file is present
  if (resolved.endsWith('.onnx')) {
    try {
      const ort = await import('onnxruntime-node');
      onnxSession = await ort.InferenceSession.create(resolved, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });
      activeModelType = 'ONNX_RUNTIME';
      console.log(
        `[RoadDamageDetector] Successfully loaded ONNX model: ${path.basename(resolved)} ` +
        `(Pure Node.js ONNX Runtime, 10 RDD classes)`
      );
      return;
    } catch (err: any) {
      console.warn(
        `[RoadDamageDetector] Failed to create ONNX session for ${resolved}: ${err.message}. ` +
        `Checking fallback options...`
      );
    }
  }

  // 2. Fallback to Python Ultralytics bridge if .pt file is present
  if (resolved.endsWith('.pt')) {
    const bridgeScript = path.resolve(process.cwd(), '..', 'scripts', 'predict_yolo.py');
    const localBridgeScript = path.resolve(process.cwd(), 'scripts', 'predict_yolo.py');
    const scriptPath = fs.existsSync(bridgeScript) ? bridgeScript : localBridgeScript;

    if (fs.existsSync(scriptPath)) {
      activeModelType = 'PYTHON_BRIDGE';
      console.log(
        `[RoadDamageDetector] Configured PyTorch model: ${path.basename(resolved)} ` +
        `(Using Python CLI bridge: ${path.basename(scriptPath)})`
      );
      return;
    }
  }

  activeModelType = 'DISABLED';
  console.warn(
    `[RoadDamageDetector] Model exists at ${resolved} but no compatible runtime could be initialized.`
  );
}

/**
 * Perform Non-Maximum Suppression (NMS) on bounding box candidates
 */
function applyNMS(
  boxes: Array<{ xmin: number; ymin: number; xmax: number; ymax: number; score: number; classId: number }>,
  iouThreshold = 0.45
) {
  // Sort descending by score
  boxes.sort((a, b) => b.score - a.score);

  const selected: typeof boxes = [];
  const active = new Array(boxes.length).fill(true);

  for (let i = 0; i < boxes.length; i++) {
    if (!active[i]) continue;
    selected.push(boxes[i]);

    for (let j = i + 1; j < boxes.length; j++) {
      if (!active[j]) continue;
      if (boxes[i].classId !== boxes[j].classId) continue;

      // Calculate Intersection over Union (IoU)
      const interX1 = Math.max(boxes[i].xmin, boxes[j].xmin);
      const interY1 = Math.max(boxes[i].ymin, boxes[j].ymin);
      const interX2 = Math.min(boxes[i].xmax, boxes[j].xmax);
      const interY2 = Math.min(boxes[i].ymax, boxes[j].ymax);

      const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
      const areaA = (boxes[i].xmax - boxes[i].xmin) * (boxes[i].ymax - boxes[i].ymin);
      const areaB = (boxes[j].xmax - boxes[j].xmin) * (boxes[j].ymax - boxes[j].ymin);
      const unionArea = areaA + areaB - interArea;

      const iou = unionArea > 0 ? interArea / unionArea : 0;
      if (iou > iouThreshold) {
        active[j] = false;
      }
    }
  }

  return selected;
}

/**
 * Decode and preprocess image buffer to normalized float32 NCHW tensor [1, 3, 640, 640]
 */
function preprocessImage(
  buffer: Buffer,
  ext: string,
  targetSize: number
): { data: Float32Array; origWidth: number; origHeight: number } {
  let rawPixels: Uint8Array | Buffer;
  let origWidth: number;
  let origHeight: number;

  const cleanExt = ext.toLowerCase();
  if (cleanExt === '.png') {
    const png = PNG.sync.read(buffer);
    rawPixels = png.data;
    origWidth = png.width;
    origHeight = png.height;
  } else {
    // Default to JPEG decoder (handles .jpg, .jpeg)
    const decoded = jpeg.decode(buffer, { useTArray: true });
    rawPixels = decoded.data;
    origWidth = decoded.width;
    origHeight = decoded.height;
  }

  if (!origWidth || !origHeight || origWidth <= 0 || origHeight <= 0) {
    throw new Error('Invalid image dimensions');
  }

  const floatData = new Float32Array(3 * targetSize * targetSize);
  const targetArea = targetSize * targetSize;

  // Bilinear sampling and normalization (0.0 to 1.0)
  for (let y = 0; y < targetSize; y++) {
    const srcY = Math.min(origHeight - 1, Math.floor((y * origHeight) / targetSize));
    const yOffset = y * targetSize;

    for (let x = 0; x < targetSize; x++) {
      const srcX = Math.min(origWidth - 1, Math.floor((x * origWidth) / targetSize));
      const srcIdx = (srcY * origWidth + srcX) * 4;

      const r = rawPixels[srcIdx] / 255.0;
      const g = rawPixels[srcIdx + 1] / 255.0;
      const b = rawPixels[srcIdx + 2] / 255.0;

      floatData[yOffset + x] = r;
      floatData[targetArea + yOffset + x] = g;
      floatData[2 * targetArea + yOffset + x] = b;
    }
  }

  return { data: floatData, origWidth, origHeight };
}

/**
 * Execute road damage detection on an uploaded image file asynchronously.
 * Guarantees safe return structure without unhandled exceptions.
 */
export async function detectRoadDamage(
  imagePath: string,
  options?: { confidenceThreshold?: number; imageSize?: number }
): Promise<RoadDamageAnalysisResult> {
  const confThreshold = options?.confidenceThreshold ?? env.ROAD_DAMAGE_CONFIDENCE_THRESHOLD;
  const targetSize = options?.imageSize ?? env.ROAD_DAMAGE_IMAGE_SIZE;
  const startTime = Date.now();

  const emptyResult = (statusNote: string): RoadDamageAnalysisResult => ({
    analyzed: false,
    modelLoaded: activeModelType !== 'DISABLED',
    modelName: activeModelPath ? path.basename(activeModelPath) : 'None',
    modelType: activeModelType,
    damageDetected: false,
    detectionsCount: 0,
    detections: [],
    confidenceThreshold: confThreshold,
    latencyMs: Date.now() - startTime,
    statusNote,
  });

  if (!fs.existsSync(imagePath)) {
    return emptyResult(`Image file not found on disk: ${path.basename(imagePath)}`);
  }

  const ext = path.extname(imagePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return emptyResult(`Unsupported image format for damage detection: ${ext}`);
  }

  if (activeModelType === 'DISABLED' || !activeModelPath) {
    return emptyResult('Road damage model not loaded (running in pass-through mode)');
  }

  try {
    // 1. Pure Node.js ONNX Runtime Execution
    if (activeModelType === 'ONNX_RUNTIME' && onnxSession) {
      const ort = await import('onnxruntime-node');
      const fileBuffer = await fs.promises.readFile(imagePath);
      const { data, origWidth, origHeight } = preprocessImage(fileBuffer, ext, targetSize);

      const inputTensor = new ort.Tensor('float32', data, [1, 3, targetSize, targetSize]);
      const output = await onnxSession.run({ images: inputTensor });

      const raw = output.output0.data as Float32Array;
      const candidateBoxes: Array<{
        xmin: number;
        ymin: number;
        xmax: number;
        ymax: number;
        score: number;
        classId: number;
      }> = [];

      // YOLO output shape is [1, 14, 8400]: 4 box coordinates + 10 class scores
      const numAnchors = 8400;
      const numClasses = 10;

      for (let i = 0; i < numAnchors; i++) {
        let maxClassId = 0;
        let maxClassScore = 0;

        for (let c = 0; c < numClasses; c++) {
          const score = raw[(4 + c) * numAnchors + i];
          if (score > maxClassScore) {
            maxClassScore = score;
            maxClassId = c;
          }
        }

        if (maxClassScore >= confThreshold) {
          const xc = raw[0 * numAnchors + i];
          const yc = raw[1 * numAnchors + i];
          const w = raw[2 * numAnchors + i];
          const h = raw[3 * numAnchors + i];

          // Normalized in 640x640 space, scale to original dimensions
          const xmin = Math.max(0, ((xc - w / 2) / targetSize) * origWidth);
          const ymin = Math.max(0, ((yc - h / 2) / targetSize) * origHeight);
          const xmax = Math.min(origWidth, ((xc + w / 2) / targetSize) * origWidth);
          const ymax = Math.min(origHeight, ((yc + h / 2) / targetSize) * origHeight);

          candidateBoxes.push({
            xmin: Math.round(xmin * 100) / 100,
            ymin: Math.round(ymin * 100) / 100,
            xmax: Math.round(xmax * 100) / 100,
            ymax: Math.round(ymax * 100) / 100,
            score: Math.round(maxClassScore * 10000) / 10000,
            classId: maxClassId,
          });
        }
      }

      const filteredBoxes = applyNMS(candidateBoxes, 0.45);

      const detections: RoadDamageDetection[] = filteredBoxes.map((b) => {
        const info = RDD_CLASS_MAPPING[b.classId] || {
          code: `Class_${b.classId}`,
          name: 'Road Defect',
          severity: 'MEDIUM' as const,
        };

        return {
          classCode: info.code,
          className: info.name,
          severity: info.severity,
          confidence: b.score,
          bbox: {
            xmin: b.xmin,
            ymin: b.ymin,
            xmax: b.xmax,
            ymax: b.ymax,
          },
        };
      });

      return {
        analyzed: true,
        modelLoaded: true,
        modelName: path.basename(activeModelPath),
        modelType: 'ONNX_RUNTIME',
        damageDetected: detections.length > 0,
        detectionsCount: detections.length,
        detections,
        confidenceThreshold: confThreshold,
        latencyMs: Date.now() - startTime,
        statusNote:
          detections.length > 0
            ? `Detected ${detections.length} road defect(s) on-scene.`
            : 'No road defects detected above confidence threshold.',
      };
    }

    // 2. Python Bridge Execution (for raw .pt weights)
    if (activeModelType === 'PYTHON_BRIDGE') {
      const bridgeScript = path.resolve(process.cwd(), '..', 'scripts', 'predict_yolo.py');
      const localBridgeScript = path.resolve(process.cwd(), 'scripts', 'predict_yolo.py');
      const scriptPath = fs.existsSync(bridgeScript) ? bridgeScript : localBridgeScript;

      const { stdout } = await execFileAsync('python', [
        scriptPath,
        '--model',
        activeModelPath,
        '--source',
        imagePath,
        '--conf',
        String(confThreshold),
        '--imgsz',
        String(targetSize),
      ]);

      const parsed = JSON.parse(stdout.trim());
      const rawDetections = parsed.detections || [];

      const detections: RoadDamageDetection[] = rawDetections.map((d: any) => {
        const classEntry = Object.values(RDD_CLASS_MAPPING).find((c) => c.code === d.classCode);
        return {
          classCode: d.classCode,
          className: d.className || classEntry?.name || 'Road Defect',
          severity: classEntry?.severity || 'MEDIUM',
          confidence: d.confidence,
          bbox: d.bbox,
        };
      });

      return {
        analyzed: true,
        modelLoaded: true,
        modelName: path.basename(activeModelPath),
        modelType: 'PYTHON_BRIDGE',
        damageDetected: detections.length > 0,
        detectionsCount: detections.length,
        detections,
        confidenceThreshold: confThreshold,
        latencyMs: Date.now() - startTime,
        statusNote: parsed.statusNote || `Python bridge returned ${detections.length} detection(s).`,
      };
    }

    return emptyResult('Inference skipped: no active model runtime');
  } catch (err: any) {
    console.error(`[RoadDamageDetector] Inference error on ${path.basename(imagePath)}:`, err.message);
    return emptyResult(`Inference failed: ${err.message}`);
  }
}

/**
 * Returns current model health and diagnostic status
 */
export function getRoadDamageServiceStatus() {
  return {
    isInitialized,
    enabled: env.ROAD_DAMAGE_ENABLED,
    modelType: activeModelType,
    modelPath: activeModelPath ? path.basename(activeModelPath) : null,
    confidenceThreshold: env.ROAD_DAMAGE_CONFIDENCE_THRESHOLD,
    imageSize: env.ROAD_DAMAGE_IMAGE_SIZE,
    supportedClasses: Object.values(RDD_CLASS_MAPPING).map((c) => ({
      code: c.code,
      name: c.name,
      severity: c.severity,
    })),
  };
}
