import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { seedDatabase, DEMO_IDS } from '../src/db/seedData.js';

process.env.NODE_ENV = 'test';

const app = createApp();

let passengerToken = '';
let employeeToken = '';
let otherEmployeeToken = '';
let employerToken = '';
let otherEmployerToken = '';
let authorityToken = '';
let adminToken = '';

let testJourneyId = '';
let testConsentId = '';
let testIncidentId = '';

beforeAll(async () => {
  await db.init({ memory: true });
  await seedDatabase({ force: true });

  // Log in required user personas
  const passRes = await request(app).post('/api/v1/auth/login').send({
    email: 'passenger@roadalert.in',
    password: 'RoadAlert@2026',
  });
  passengerToken = passRes.body.data.accessToken;

  const empRes = await request(app).post('/api/v1/auth/login').send({
    email: 'employee@roadalert.in',
    password: 'RoadAlert@2026',
  });
  employeeToken = empRes.body.data.accessToken;

  const otherEmpRes = await request(app).post('/api/v1/auth/login').send({
    email: 'rohan.employee@roadalert.in',
    password: 'RoadAlert@2026',
  });
  otherEmployeeToken = otherEmpRes.body.data.accessToken;

  const emprRes = await request(app).post('/api/v1/auth/login').send({
    email: 'employer@roadalert.in',
    password: 'RoadAlert@2026',
  });
  employerToken = emprRes.body.data.accessToken;

  const otherEmprRes = await request(app).post('/api/v1/auth/login').send({
    email: 'other.employer@roadalert.in',
    password: 'RoadAlert@2026',
  });
  otherEmployerToken = otherEmprRes.body.data.accessToken;

  const authRes = await request(app).post('/api/v1/auth/login').send({
    email: 'authority@roadalert.in',
    password: 'RoadAlert@2026',
  });
  authorityToken = authRes.body.data.accessToken;

  const admRes = await request(app).post('/api/v1/auth/login').send({
    email: 'admin@roadalert.in',
    password: 'RoadAlert@2026',
  });
  adminToken = admRes.body.data.accessToken;
});

describe('RoadAlert Phase 2 — GPS Observations, Tracking & Backend Verification Suite', () => {
  it('1. Requires explicit consent before employee commute tracking can be started', async () => {
    // Grant explicit tracking consent
    const consentRes = await request(app)
      .post('/api/v1/consents')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        organizationId: DEMO_IDS.orgs.primary,
        policyVersion: 'v2026.2-GPS-STRICT',
        purpose: 'Consent-based GPS commute verification along coastal Karnataka corridor',
        sharePreciseCoords: true,
      });

    expect(consentRes.status).toBe(201);
    expect(consentRes.body.data.id).toBeDefined();
    testConsentId = consentRes.body.data.id;

    // Start commute session using this valid consent
    const startRes = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        origin: 'Mulki Bus Stand (NH-66)',
        destination: 'Pumpwell Circle, Mangaluru (NH-66)',
        originLat: 13.0908,
        originLng: 74.7864,
        destLat: 12.8669,
        destLng: 74.8692,
        consentRecordId: testConsentId,
      });

    expect(startRes.status).toBe(201);
    expect(startRes.body.data.id).toBeDefined();
    expect(startRes.body.data.status).toMatch(/ACTIVE|DELAYED/);
    testJourneyId = startRes.body.data.id;
  });

  it('2. Enforces authentication and journey ownership on checkpoint submissions', async () => {
    // Unauthenticated request fails with 401
    const unauthRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .send({
        latitude: 13.0908,
        longitude: 74.7864,
      });
    expect(unauthRes.status).toBe(401);

    // Another employee cannot submit checkpoints to this employee's journey (fails with 403)
    const wrongOwnerRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${otherEmployeeToken}`)
      .send({
        latitude: 13.0908,
        longitude: 74.7864,
      });
    expect(wrongOwnerRes.status).toBe(403);
    expect(wrongOwnerRes.body.error.code).toBe('FORBIDDEN');
  });

  it('3. Validates latitude and longitude ranges and rejects invalid coordinates', async () => {
    // Latitude > 90
    const badLatRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 91.5,
        longitude: 74.7864,
      });
    expect(badLatRes.status).toBe(400);

    // Longitude > 180
    const badLngRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0908,
        longitude: 185.0,
      });
    expect(badLngRes.status).toBe(400);

    // Latitude < -90
    const badLatMinRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: -95.0,
        longitude: 74.7864,
      });
    expect(badLatMinRes.status).toBe(400);
  });

  it('4. Handles GPS accuracy: accepts valid accuracy and flags degraded accuracy as INACCURATE', async () => {
    // Negative accuracy rejected with 400
    const negAccRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0908,
        longitude: 74.7864,
        accuracy: -10,
      });
    expect(negAccRes.status).toBe(400);

    // Valid high-precision accuracy (e.g. 5.2 metres) marked VALID
    const goodAccRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0908,
        longitude: 74.7864,
        accuracy: 5.2,
        recordedAt: new Date(Date.now() - 60000).toISOString(),
      });
    expect(goodAccRes.status).toBe(201);
    expect(goodAccRes.body.data.checkpoints[0].accuracy).toBe(5.2);
    expect(goodAccRes.body.data.checkpoints[0].validationStatus).toBe('VALID');

    // Highly inaccurate GPS (e.g. 250 metres) flagged as INACCURATE
    const badAccRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0910,
        longitude: 74.7866,
        accuracy: 250.0,
        recordedAt: new Date(Date.now() - 55000).toISOString(),
      });
    expect(badAccRes.status).toBe(201);
    expect(badAccRes.body.data.checkpoints[0].accuracy).toBe(250.0);
    expect(badAccRes.body.data.checkpoints[0].validationStatus).toBe('INACCURATE');
  });

  it('5. Handles observation timestamps: rejects future timestamps and flags stale observations', async () => {
    // Timestamp in future (> 2 min ahead) rejected with 400
    const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const futureRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0908,
        longitude: 74.7864,
        recordedAt: futureTime,
      });
    expect(futureRes.status).toBe(400);
    expect(futureRes.body.error.code).toBe('FUTURE_TIMESTAMP');

    // Stale timestamp (> 24 hours ago) marked as STALE
    const staleTime = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
    const staleRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0912,
        longitude: 74.7868,
        recordedAt: staleTime,
      });
    expect(staleRes.status).toBe(201);
    expect(staleRes.body.data.checkpoints[0].validationStatus).toBe('STALE');
  });

  it('6. Preserves null for missing device speed and never substitutes zero', async () => {
    // Submit checkpoint without speed
    const noSpeedRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0915,
        longitude: 74.7870,
        accuracy: 8.0,
        recordedAt: new Date(Date.now() - 40000).toISOString(),
      });
    expect(noSpeedRes.status).toBe(201);
    // speed must be null, NOT zero!
    expect(noSpeedRes.body.data.checkpoints[0].speed).toBeNull();

    // Verify in database that speed column stored NULL
    const dbCp = await db.query<any>(
      `SELECT speed FROM journey_checkpoints WHERE id = $1`,
      [noSpeedRes.body.data.checkpoints[0].id]
    );
    expect(dbCp.rows[0].speed).toBeNull();

    // Explicitly zero speed (stationary at traffic signal) is preserved as 0
    const zeroSpeedRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0916,
        longitude: 74.7871,
        speed: 0,
        accuracy: 8.0,
        recordedAt: new Date(Date.now() - 35000).toISOString(),
      });
    expect(zeroSpeedRes.status).toBe(201);
    expect(zeroSpeedRes.body.data.checkpoints[0].speed).toBe(0);
  });

  it('7. Detects duplicate observations at identical coordinates and timestamps', async () => {
    const fixedTime = new Date(Date.now() - 25000).toISOString();
    // Point A
    const ptARes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0920,
        longitude: 74.7875,
        recordedAt: fixedTime,
      });
    expect(ptARes.status).toBe(201);

    // Duplicate Point A with same coordinates and timestamp
    const dupRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0920,
        longitude: 74.7875,
        recordedAt: fixedTime,
      });
    expect(dupRes.status).toBe(201);
    expect(dupRes.body.data.checkpoints[0].validationStatus).toBe('DUPLICATE');
  });

  it('8. Calculates speed between consecutive checkpoints and flags unrealistic jumps (> 180 km/h)', async () => {
    const baseTime = Date.now() - 20000;

    // First anchor checkpoint at Padubidri
    await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.1422,
        longitude: 74.7731,
        recordedAt: new Date(baseTime).toISOString(),
      });

    // Plausible movement: 1.2 km further along corridor 90 seconds later (approx 48 km/h)
    const plausibleRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.1530,
        longitude: 74.7700,
        recordedAt: new Date(baseTime + 90000).toISOString(),
      });
    expect(plausibleRes.status).toBe(201);
    expect(plausibleRes.body.data.checkpoints[0].validationStatus).toBe('VALID');
    expect(plausibleRes.body.data.checkpoints[0].calculatedSpeed).toBeGreaterThan(30);
    expect(plausibleRes.body.data.checkpoints[0].calculatedSpeed).toBeLessThan(80);

    // Unrealistic jump: teleporting 25 km away to Manipal in 5 seconds (> 18,000 km/h)
    const jumpRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.3525,
        longitude: 74.7868,
        recordedAt: new Date(baseTime + 95000).toISOString(),
      });
    expect(jumpRes.status).toBe(201);
    expect(jumpRes.body.data.checkpoints[0].validationStatus).toBe('IMPLAUSIBLE_JUMP');
  });

  it('9. Supports bounded batch submissions of GPS observations', async () => {
    const now = Date.now();
    const batch = [
      {
        latitude: 13.0908,
        longitude: 74.7864,
        accuracy: 10.0,
        speed: 35.0,
        heading: 180.0,
        recordedAt: new Date(now - 10000).toISOString(),
      },
      {
        latitude: 13.0850,
        longitude: 74.7880,
        accuracy: 9.5,
        speed: 40.0,
        heading: 185.0,
        recordedAt: new Date(now - 8000).toISOString(),
      },
      {
        latitude: 13.0800,
        longitude: 74.7900,
        accuracy: 11.0,
        speed: 42.0,
        heading: 182.0,
        recordedAt: new Date(now - 6000).toISOString(),
      },
    ];

    const batchRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ checkpoints: batch });

    expect(batchRes.status).toBe(201);
    expect(batchRes.body.data.processedCount).toBe(3);
    expect(batchRes.body.data.checkpoints.length).toBe(3);
  });

  it('10. Allows employee to inspect their own journey history with computed metrics', async () => {
    const historyRes = await request(app)
      .get('/api/v1/journeys')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(historyRes.body.metrics).toBeDefined();
    expect(historyRes.body.metrics.totalJourneys).toBeGreaterThanOrEqual(1);

    // Dedicated metrics endpoint
    const metricsRes = await request(app)
      .get('/api/v1/journeys/metrics')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.data.totalJourneys).toBeGreaterThanOrEqual(1);
    expect(metricsRes.body.data.activeJourneys).toBeGreaterThanOrEqual(1);
  });

  it('11. Allows authorized employer to view active locations and enforces cross-org isolation', async () => {
    // Employer A views active locations for their own organization
    const activeLocRes = await request(app)
      .get('/api/v1/employer/active-locations')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(activeLocRes.status).toBe(200);
    expect(activeLocRes.body.data.organizationId).toBe(DEMO_IDS.orgs.primary);
    expect(activeLocRes.body.data.locations).toBeDefined();

    // Cross-organization attempt: Employer B tries to access Employer A's active locations
    const crossOrgLocRes = await request(app)
      .get(`/api/v1/employer/active-locations?organizationId=${DEMO_IDS.orgs.primary}`)
      .set('Authorization', `Bearer ${otherEmployerToken}`);

    expect(crossOrgLocRes.status).toBe(403);
    expect(crossOrgLocRes.body.error.code).toBe('ORGANIZATION_ISOLATION_VIOLATION');

    // Passenger cannot access employer active locations
    const passAccessRes = await request(app)
      .get('/api/v1/employer/active-locations')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(passAccessRes.status).toBe(403);
  });

  it('12. Rejects checkpoint submissions once tracking session is stopped', async () => {
    // Explicitly stop the journey
    const stopRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/stop`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send();
    expect(stopRes.status).toBe(200);
    expect(stopRes.body.data.status).toBe('COMPLETED');

    // Attempt to submit checkpoint to stopped journey
    const postStopRes = await request(app)
      .post(`/api/v1/journeys/${testJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 12.8669,
        longitude: 74.8692,
      });
    expect(postStopRes.status).toBe(400);
    expect(postStopRes.body.error.code).toBe('JOURNEY_ALREADY_ENDED');
  });

  it('13. Automatically terminates active journey and blocks tracking when consent is revoked', async () => {
    // Start a new journey with a fresh consent record
    const consentRes = await request(app)
      .post('/api/v1/consents')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        organizationId: DEMO_IDS.orgs.primary,
        purpose: 'Session to test consent revocation termination',
      });
    const cId = consentRes.body.data.id;

    const jRes = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        origin: 'Mulki',
        destination: 'Surathkal',
        consentRecordId: cId,
      });
    const revocableJourneyId = jRes.body.data.id;

    // Revoke tracking consent
    const revokeRes = await request(app)
      .post(`/api/v1/consents/${cId}/revoke`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send();
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.revoked).toBe(true);

    // Submitting checkpoint to this journey must be blocked
    const cpRes = await request(app)
      .post(`/api/v1/journeys/${revocableJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.0108,
        longitude: 74.7943,
      });
    expect(cpRes.status).toBe(400); // Already ended/terminated or consent revoked
  });

  it('14. Prevents client/commuter from marking their own incident report as verified', async () => {
    // Commuter creates an incident report
    const createIncRes = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        title: 'Fallen Tree Obstructing Left Carriageway near Kaup',
        description: 'Large banyan tree branch partially blocking road on NH-66 near Kaup.',
        category: 'Road closure',
        severity: 'HIGH',
        latitude: 13.2244,
        longitude: 74.7484,
        roadName: 'Kaup Bypass, NH-66',
        estimatedDelayMinutes: 30,
      });
    expect(createIncRes.status).toBe(201);
    testIncidentId = createIncRes.body.data.incident.id;
    expect(createIncRes.body.data.incident.status).toBe('REPORTED');
    expect(createIncRes.body.data.incident.authorityConfirmed).toBe(false);

    // Commuter tries to review and CONFIRM their own report (status 403 Forbidden)
    const clientReviewRes = await request(app)
      .post(`/api/v1/incidents/${testIncidentId}/review`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        decision: 'CONFIRM',
        reason: 'I am verifying my own report',
      });
    expect(clientReviewRes.status).toBe(403);

    // Commuter tries to patch status to VERIFIED (status 403 Forbidden)
    const clientPatchRes = await request(app)
      .patch(`/api/v1/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        status: 'VERIFIED',
      });
    expect(clientPatchRes.status).toBe(403);
  });

  it('15. Restricts incident GPS evidence retrieval to authorized roles and audits access', async () => {
    // Unauthenticated request fails with 401
    const unauthEvRes = await request(app).get(
      `/api/v1/incidents/${testIncidentId}/gps-evidence`
    );
    expect(unauthEvRes.status).toBe(401);

    // Unrelated passenger without role cannot inspect raw GPS telemetry (fails with 403)
    const unrelatedPassRes = await request(app)
      .get(`/api/v1/incidents/55555555-5555-4555-8555-555555555501/gps-evidence`)
      .set('Authorization', `Bearer ${otherEmployeeToken}`);
    expect(unrelatedPassRes.status).toBe(403);

    // Authorized Traffic Authority can inspect GPS evidence
    const authEvRes = await request(app)
      .get(`/api/v1/incidents/55555555-5555-4555-8555-555555555501/gps-evidence`)
      .set('Authorization', `Bearer ${authorityToken}`);
    expect(authEvRes.status).toBe(200);
    expect(authEvRes.body.data.incidentId).toBe('55555555-5555-4555-8555-555555555501');
    expect(authEvRes.body.data.gpsCongestionCorroborations).toBeDefined();

    // Verify audit log recorded for GPS evidence access
    const auditRes = await db.query<any>(
      `SELECT * FROM audit_logs WHERE action = 'INCIDENT_GPS_EVIDENCE_ACCESSED' ORDER BY created_at DESC LIMIT 1`
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].entity_id).toBe('55555555-5555-4555-8555-555555555501');
  });
});
