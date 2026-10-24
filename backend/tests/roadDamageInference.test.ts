import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seedData.js';
import {
  initRoadDamageService,
  detectRoadDamage,
  getRoadDamageServiceStatus,
  RDD_CLASS_MAPPING,
} from '../src/services/roadDamageInferenceService.js';

process.env.NODE_ENV = 'test';

const app = createApp();
let passengerToken = '';
let testIncidentId = '';

beforeAll(async () => {
  await db.init({ memory: true });
  await seedDatabase({ force: true });
  await initRoadDamageService();

  // Log in as passenger to obtain auth token for evidence upload tests
  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: 'passenger@roadalert.in',
    password: 'RoadAlert@2026',
  });
  passengerToken = loginRes.body.data.accessToken;

  // Retrieve an existing seeded incident ID
  const incRes = await request(app).get('/api/v1/incidents');
  testIncidentId = incRes.body.data.items[0].id;
});

describe('RoadAlert — Road Damage Inference Service Unit & Integration Suite', () => {
  describe('1. Model Diagnostics and Status', () => {
    it('returns structured diagnostic status with 10 RDD classes', () => {
      const status = getRoadDamageServiceStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.enabled).toBe(true);
      expect(['ONNX_RUNTIME', 'PYTHON_BRIDGE', 'DISABLED']).toContain(status.modelType);
      expect(status.confidenceThreshold).toBeDefined();
      expect(status.imageSize).toBe(640);
      expect(status.supportedClasses.length).toBe(10);
      expect(status.supportedClasses.map((c) => c.code)).toContain('D40'); // Pothole
      expect(status.supportedClasses.map((c) => c.code)).toContain('D20'); // Alligator Crack
    });

    it('exposes status over HTTP GET /api/v1/incidents/road-damage/status', async () => {
      const res = await request(app).get('/api/v1/incidents/road-damage/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.supportedClasses).toBeDefined();
      expect(res.body.data.supportedClasses.length).toBe(10);
    });
  });

  describe('2. Error Handling & Edge Cases', () => {
    it('handles non-existent image paths safely without crashing', async () => {
      const result = await detectRoadDamage('/path/to/non_existent_image.jpg');
      expect(result.analyzed).toBe(false);
      expect(result.damageDetected).toBe(false);
      expect(result.detectionsCount).toBe(0);
      expect(result.detections).toEqual([]);
      expect(result.statusNote).toContain('not found on disk');
    });

    it('rejects unsupported file formats safely', async () => {
      const dummyTxtPath = path.resolve(process.cwd(), 'uploads', 'test_dummy.txt');
      fs.mkdirSync(path.dirname(dummyTxtPath), { recursive: true });
      fs.writeFileSync(dummyTxtPath, 'Not an image');

      try {
        const result = await detectRoadDamage(dummyTxtPath);
        expect(result.analyzed).toBe(false);
        expect(result.damageDetected).toBe(false);
        expect(result.statusNote).toContain('Unsupported image format');
      } finally {
        if (fs.existsSync(dummyTxtPath)) fs.unlinkSync(dummyTxtPath);
      }
    });

    it('handles corrupt image files gracefully without throwing errors', async () => {
      const corruptImgPath = path.resolve(process.cwd(), 'uploads', 'corrupt_test.jpg');
      fs.mkdirSync(path.dirname(corruptImgPath), { recursive: true });
      fs.writeFileSync(corruptImgPath, Buffer.from([0xff, 0xd8, 0x00, 0x00, 0x12, 0x34]));

      try {
        const result = await detectRoadDamage(corruptImgPath);
        expect(result.damageDetected).toBe(false);
        expect(result.detectionsCount).toBe(0);
        expect(result.detections).toEqual([]);
      } finally {
        if (fs.existsSync(corruptImgPath)) fs.unlinkSync(corruptImgPath);
      }
    });
  });

  describe('3. Successful Inference & Response Structure', () => {
    it('executes inference on a valid image and returns complete structured metadata', async () => {
      const sampleImgPath = path.resolve(
        process.cwd(),
        '..',
        'data',
        'RoadDamageDetector',
        'images',
        'RoadDamageTypeDef.png'
      );

      // Verify file exists before running test
      if (fs.existsSync(sampleImgPath)) {
        const result = await detectRoadDamage(sampleImgPath);
        expect(result.modelName).toBeDefined();
        expect(typeof result.damageDetected).toBe('boolean');
        expect(typeof result.detectionsCount).toBe('number');
        expect(Array.isArray(result.detections)).toBe(true);
        expect(result.confidenceThreshold).toBeDefined();
        expect(typeof result.latencyMs).toBe('number');
        expect(result.statusNote).toBeDefined();

        // Diagram image should not contain false positive potholes
        expect(result.damageDetected).toBe(false);
        expect(result.detectionsCount).toBe(0);
      } else {
        console.warn('Sample image RoadDamageTypeDef.png not found; skipping image test.');
      }
    });

    it('strictly respects the configured confidence threshold', async () => {
      const sampleImgPath = path.resolve(
        process.cwd(),
        '..',
        'data',
        'RoadDamageDetector',
        'images',
        'RoadDamageTypeDef.png'
      );

      if (fs.existsSync(sampleImgPath)) {
        // High confidence threshold should filter all candidate boxes
        const strictResult = await detectRoadDamage(sampleImgPath, {
          confidenceThreshold: 0.99,
        });
        expect(strictResult.detectionsCount).toBe(0);
        expect(strictResult.damageDetected).toBe(false);
      }
    });
  });

  describe('4. Incident Evidence Upload Integration', () => {
    it('processes uploaded photo evidence, runs inference, and stores results in metadata', async () => {
      const sampleImgPath = path.resolve(
        process.cwd(),
        '..',
        'data',
        'RoadDamageDetector',
        'images',
        'RoadDamageTypeDef.png'
      );

      let imageBuffer: Buffer;
      if (fs.existsSync(sampleImgPath)) {
        imageBuffer = fs.readFileSync(sampleImgPath);
      } else {
        // 1x1 test PNG fallback
        imageBuffer = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        );
      }

      const res = await request(app)
        .post(`/api/v1/incidents/${testIncidentId}/evidence`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .attach('file', imageBuffer, 'scene-evidence.png')
        .field('caption', 'Pothole on service road');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.evidenceId).toBeDefined();
      expect(res.body.data.evidenceType).toBe('PHOTO');
      expect(res.body.data.storageKey).toBeDefined();
      expect(res.body.data.confidenceBreakdown).toBeDefined();

      // Check that road damage analysis is attached
      if (res.body.data.roadDamageAnalysis) {
        expect(typeof res.body.data.roadDamageAnalysis.damageDetected).toBe('boolean');
        expect(Array.isArray(res.body.data.roadDamageAnalysis.detections)).toBe(true);
      }

      // Verify the metadata stored in database
      const dbRow = await db.query<any>(
        `SELECT metadata FROM incident_evidences WHERE id = $1`,
        [res.body.data.evidenceId]
      );
      expect(dbRow.rows.length).toBe(1);
      const parsedMeta =
        typeof dbRow.rows[0].metadata === 'string'
          ? JSON.parse(dbRow.rows[0].metadata)
          : dbRow.rows[0].metadata;
      expect(parsedMeta.caption).toBe('Pothole on service road');
    });

    it('attaches non-photo evidence smoothly without triggering road damage inference', async () => {
      const res = await request(app)
        .post(`/api/v1/incidents/${testIncidentId}/evidence`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          evidenceType: 'GPS_TELEMETRY',
          caption: 'Consented GPS slowdown proof',
          latitude: 12.8669,
          longitude: 74.8692,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.evidenceType).toBe('GPS_TELEMETRY');
      expect(res.body.data.roadDamageAnalysis).toBeUndefined();
    });
  });
});
