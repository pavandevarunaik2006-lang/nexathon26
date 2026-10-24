import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { seedDatabase, DEMO_IDS } from '../src/db/seedData.js';

process.env.NODE_ENV = 'test';

const app = createApp();

let employeeToken = '';
let employerToken = '';
let otherEmployerToken = '';
let passengerToken = '';
let createdDelayReportId = '';

beforeAll(async () => {
  await db.init({ memory: true });
  await seedDatabase({ force: true });

  // 1. Employee login
  const empRes = await request(app).post('/api/v1/auth/login').send({
    email: 'employee@roadalert.in',
    password: 'RoadAlert@2026',
  });
  employeeToken = empRes.body.data.accessToken;

  // 2. Primary Employer login (same org as employee)
  const employerRes = await request(app).post('/api/v1/auth/login').send({
    email: 'employer@roadalert.in',
    password: 'RoadAlert@2026',
  });
  employerToken = employerRes.body.data.accessToken;

  // 3. Other Employer login (different org)
  const otherEmployerRes = await request(app).post('/api/v1/auth/login').send({
    email: 'other.employer@roadalert.in',
    password: 'RoadAlert@2026',
  });
  otherEmployerToken = otherEmployerRes.body.data.accessToken;

  // 4. Passenger login
  const passRes = await request(app).post('/api/v1/auth/login').send({
    email: 'passenger@roadalert.in',
    password: 'RoadAlert@2026',
  });
  passengerToken = passRes.body.data.accessToken;
});

describe('AI Mobility Assistant & Delay Report Review Engine', () => {
  it('1. AI Assistant processes travel request and returns calculated routes with coordinates', async () => {
    const res = await request(app)
      .post('/api/v1/assistant/chat')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        message: 'Find an alternate route from Surathkal to Mangaluru Junction',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reply).toBeDefined();
    expect(typeof res.body.data.reply).toBe('string');
    // Model disclosure honesty check
    expect(res.body.data.modelUsed).toBeDefined();

    // Attached route should contain calculated coordinates and metrics
    expect(res.body.data.attachedRoute).toBeDefined();
    const route = res.body.data.attachedRoute;
    expect(route.name).toBeDefined();
    expect(route.distanceKm).toBeGreaterThan(0);
    expect(route.totalEstimatedMin).toBeGreaterThan(0);
    expect(route.coordinates).toBeInstanceOf(Array);
    expect(route.coordinates.length).toBeGreaterThan(1);
    expect(route.coordinates[0]).toHaveLength(2); // [lat, lng]
  });

  it('2. AI Assistant answers incident questions based on active road conditions', async () => {
    const res = await request(app)
      .post('/api/v1/assistant/chat')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        message: 'Are there any traffic disruptions on NH-66?',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reply).toContain('NH-66');
  });

  it('3. Evidence image upload validates allowed MIME types and rejects forbidden formats', async () => {
    // 3a. Reject text/plain or invalid file
    const badUpload = await request(app)
      .post('/api/v1/assistant/upload-evidence')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('file', Buffer.from('malicious executable code'), 'exploit.exe');

    expect(badUpload.status).toBe(400);
    expect(badUpload.body.error.code).toBe('INVALID_FILE_TYPE');

    // 3b. Accept valid image buffer (PNG)
    // 1x1 PNG pixel buffer
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const goodUpload = await request(app)
      .post('/api/v1/assistant/upload-evidence')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('file', pngBuffer, 'traffic_jam_photo.png');

    expect(goodUpload.status).toBe(201);
    expect(goodUpload.body.success).toBe(true);
    expect(goodUpload.body.data.fileUrl).toMatch(/^\/uploads\//);
    expect(goodUpload.body.data.originalName).toBe('traffic_jam_photo.png');
    expect(goodUpload.body.data.mimeType).toBe('image/png');
  });

  it('4. Employee can explain commute delay and submit delay report with photo evidence', async () => {
    // 4a. Query delay explanation
    const explainRes = await request(app)
      .post('/api/v1/assistant/chat')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        message: 'Explain my commute delay for journey Surathkal to Mangaluru',
        journeyId: DEMO_IDS.journeys.activeCommute,
      });

    expect(explainRes.status).toBe(200);
    expect(explainRes.body.data.reply).toBeDefined();

    // 4b. Submit delay report for employer review
    const submitRes = await request(app)
      .post('/api/v1/assistant/delay-report')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        journeyId: DEMO_IDS.journeys.activeCommute,
        delayReason: 'Severe gridlock near Baikampady due to container vehicle breakdown and waterlogging',
        delayMinutes: 35,
        evidenceFilePath: '/uploads/demo-evidence.jpg',
        evidenceOriginalName: 'demo-evidence.jpg',
        evidenceMimeType: 'image/jpeg',
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.report.id).toBeDefined();
    expect(submitRes.body.data.report.status).toBe('PENDING');
    expect(submitRes.body.data.report.delay_minutes).toBe(35);
    createdDelayReportId = submitRes.body.data.report.id;
  });

  it('5. Employee can retrieve their own submitted delay reports', async () => {
    const res = await request(app)
      .get('/api/v1/assistant/delay-reports/my')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.reports)).toBe(true);
    const found = res.body.data.reports.find((r: any) => r.id === createdDelayReportId);
    expect(found).toBeDefined();
    expect(found.delay_minutes).toBe(35);
  });

  it('6. Organization Isolation: Authorized primary employer sees the report, other employer is isolated', async () => {
    // 6a. Primary employer sees employee report
    const primaryRes = await request(app)
      .get('/api/v1/employer/delay-reports')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(primaryRes.status).toBe(200);
    expect(primaryRes.body.success).toBe(true);
    const inPrimary = primaryRes.body.data.reports.find((r: any) => r.id === createdDelayReportId);
    expect(inPrimary).toBeDefined();

    // 6b. Secondary employer from different org cannot see primary employee report
    const otherRes = await request(app)
      .get('/api/v1/employer/delay-reports')
      .set('Authorization', `Bearer ${otherEmployerToken}`);

    expect(otherRes.status).toBe(200);
    const inOther = otherRes.body.data.reports.find((r: any) => r.id === createdDelayReportId);
    expect(inOther).toBeUndefined();

    // 6c. Secondary employer trying to review primary report receives 403 Forbidden
    const illegalReview = await request(app)
      .post(`/api/v1/employer/delay-reports/${createdDelayReportId}/review`)
      .set('Authorization', `Bearer ${otherEmployerToken}`)
      .send({
        action: 'APPROVE',
        notes: 'Attempted unauthorized approval across organization boundaries',
      });

    expect(illegalReview.status).toBe(403);
    expect(illegalReview.body.error.code).toBe('ORGANIZATION_ISOLATION_VIOLATION');
  });

  it('7. Employer review actions update status, sync verified delay, and log audit trail', async () => {
    // 7a. Primary employer requests additional evidence
    const reqEvidenceRes = await request(app)
      .post(`/api/v1/employer/delay-reports/${createdDelayReportId}/review`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        action: 'REQUEST_EVIDENCE',
        notes: 'Please attach a clearer timestamped photograph of the obstruction.',
      });

    expect(reqEvidenceRes.status).toBe(200);
    expect(reqEvidenceRes.body.data.report.status).toBe('EVIDENCE_REQUESTED');
    expect(reqEvidenceRes.body.data.report.reviewer_notes).toContain('timestamped');

    // 7b. Primary employer approves delay report
    const approveRes = await request(app)
      .post(`/api/v1/employer/delay-reports/${createdDelayReportId}/review`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        action: 'APPROVE',
        notes: 'Verified against NH-66 traffic sensor speed drop.',
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.report.status).toBe('APPROVED');
    expect(approveRes.body.data.report.reviewed_at).toBeDefined();

    // Verify journey table verified delay minutes was synced
    const journeyCheck = await db.query<any>(
      `SELECT verified_delay_min FROM journeys WHERE id = $1`,
      [DEMO_IDS.journeys.activeCommute]
    );
    expect(journeyCheck.rows[0].verified_delay_min).toBe(35);

    // Verify audit log entry was created for employer review action
    const auditCheck = await db.query<any>(
      `SELECT * FROM audit_logs WHERE actor_id = $1 AND action = $2 ORDER BY created_at DESC LIMIT 1`,
      [DEMO_IDS.users.employer, 'REVIEW_COMMUTE_DELAY_REPORT']
    );
    expect(auditCheck.rows.length).toBe(1);
    const meta = typeof auditCheck.rows[0].metadata === 'string' ? JSON.parse(auditCheck.rows[0].metadata) : auditCheck.rows[0].metadata;
    expect(meta.decision).toBe('APPROVE');
    expect(meta.delayMinutes).toBe(35);
  });
});
