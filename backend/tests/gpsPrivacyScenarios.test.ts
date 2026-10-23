import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { seedDatabase, DEMO_IDS } from '../src/db/seedData.js';

process.env.NODE_ENV = 'test';

const app = createApp();

let passengerToken = '';
let employeeToken = '';
let validConsentId = '';
let activeCommuteJourneyId = '';

beforeAll(async () => {
  await db.init({ memory: true });
  await seedDatabase({ force: true });

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
});

describe('RoadAlert GPS Privacy & Commute Isolation Scenarios', () => {
  it('Scenario 5 & A: Submits an incident without requiring continuous GPS or creating a commute session', async () => {
    // Check initial journey count for passenger
    const initialJourneysRes = await request(app)
      .get('/api/v1/journeys')
      .set('Authorization', `Bearer ${passengerToken}`);
    const initialCount = initialJourneysRes.body.data.length;

    // Report incident using map pin / manual coordinates
    const incidentRes = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        title: 'Waterlogging near Surathkal Toll Gate (NH-66)',
        description: 'Moderate water accumulation on the leftmost lane, traffic moving slowly.',
        category: 'Flood/waterlogging',
        severity: 'MEDIUM',
        latitude: 13.0108,
        longitude: 74.7943,
        roadName: 'Surathkal NH-66 Toll Plaza',
        estimatedDelayMinutes: 15,
      });

    expect(incidentRes.status).toBe(201);
    expect(incidentRes.body.data.incident.id).toBeDefined();
    expect(incidentRes.body.data.incident.latitude).toBe(13.0108);
    expect(incidentRes.body.data.incident.longitude).toBe(74.7943);

    // Verify in database that only hazard location is stored, not user movement trace
    const dbInc = await db.query<any>(`SELECT * FROM incidents WHERE id = $1`, [
      incidentRes.body.data.incident.id,
    ]);
    expect(dbInc.rows.length).toBe(1);
    expect(Number(dbInc.rows[0].latitude)).toBe(13.0108);
    expect(Number(dbInc.rows[0].longitude)).toBe(74.7943);

    // Verify no commute session was spawned for this reporter
    const afterJourneysRes = await request(app)
      .get('/api/v1/journeys')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(afterJourneysRes.body.data.length).toBe(initialCount);
  });

  it('Scenario 7: Rejects commute session start without valid explicit consent', async () => {
    // Attempt to start journey without consentRecordId
    const noConsentRes = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        origin: 'Udupi City Bus Stand',
        destination: 'Mangaluru Central',
      });
    expect(noConsentRes.status).toBe(400);
    expect(noConsentRes.body.error.code).toBe('CONSENT_REQUIRED');

    // Attempt with nonexistent consent ID
    const fakeConsentRes = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        origin: 'Udupi City Bus Stand',
        destination: 'Mangaluru Central',
        consentRecordId: '00000000-0000-0000-0000-000000000000',
      });
    expect(fakeConsentRes.status).toBe(400);
    expect(fakeConsentRes.body.error.code).toBe('INVALID_CONSENT');
  });

  it('Scenario 8: Starts commute with valid consent and accepts authentic BROWSER_GPS checkpoints', async () => {
    // Grant explicit consent
    const consentRes = await request(app)
      .post('/api/v1/consents')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        organizationId: DEMO_IDS.orgs.primary,
        policyVersion: 'v2026.3-GPS-AUDIT',
        purpose: 'Consent-based employee commute delay verification',
        sharePreciseCoords: true,
      });
    expect(consentRes.status).toBe(201);
    validConsentId = consentRes.body.data.id;

    // Start commute journey
    const startRes = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        origin: 'Udupi Service Bus Stand (NH-66)',
        destination: 'Pumpwell Circle, Mangaluru (NH-66)',
        originLat: 13.3409,
        originLng: 74.7421,
        destLat: 12.8669,
        destLng: 74.8692,
        consentRecordId: validConsentId,
      });
    expect(startRes.status).toBe(201);
    activeCommuteJourneyId = startRes.body.data.id;
    expect(startRes.body.data.status).toMatch(/ACTIVE|DELAYED/);

    // Synchronize legitimate GPS checkpoint
    const cpRes = await request(app)
      .post(`/api/v1/journeys/${activeCommuteJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.3350,
        longitude: 74.7435,
        speed: 42.5,
        sourceType: 'BROWSER_GPS',
        statusNote: 'Interactive map real GPS sync',
      });
    expect(cpRes.status).toBe(201);
    expect(cpRes.body.data.checkpoints[0].validationStatus).toBe('VALID');
    expect(cpRes.body.data.checkpoints[0].sourceType).toBe('BROWSER_GPS');
  });

  it('Scenario 9: Rejects subsequent checkpoint submission when commute is stopped while map remains open', async () => {
    // Stop the commute session
    const stopRes = await request(app)
      .post(`/api/v1/journeys/${activeCommuteJourneyId}/stop`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send();
    expect(stopRes.status).toBe(200);
    expect(stopRes.body.data.status).toBe('COMPLETED');

    // Attempt to post a checkpoint to the stopped journey (simulating background map trying to send)
    const subsequentCpRes = await request(app)
      .post(`/api/v1/journeys/${activeCommuteJourneyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.3200,
        longitude: 74.7450,
        speed: 45.0,
        sourceType: 'BROWSER_GPS',
      });
    expect(subsequentCpRes.status).toBe(400);
    expect(subsequentCpRes.body.error.code).toBe('JOURNEY_ALREADY_ENDED');
  });

  it('Scenario 10: Revoking consent during a commute terminates session and rejects further checkpoints', async () => {
    // Create new consent and start a new active commute
    const cRes = await request(app)
      .post('/api/v1/consents')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        organizationId: DEMO_IDS.orgs.primary,
        policyVersion: 'v2026.3-GPS-AUDIT',
        purpose: 'Consent test for revocation during commute',
        sharePreciseCoords: true,
      });
    const tempConsentId = cRes.body.data.id;

    const jRes = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        origin: 'Padubidri Junction (NH-66)',
        destination: 'Surathkal NITK',
        consentRecordId: tempConsentId,
      });
    const journeyId = jRes.body.data.id;

    // Revoke the consent while commute is active
    const revokeRes = await request(app)
      .post(`/api/v1/consents/${tempConsentId}/revoke`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send();
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.revoked).toBe(true);

    // Verify journey status was immediately set to TERMINATED
    const journeyDb = await db.query<any>(`SELECT * FROM journeys WHERE id = $1`, [journeyId]);
    expect(journeyDb.rows[0].status).toBe('TERMINATED');
    expect(journeyDb.rows[0].ended_at).not.toBeNull();

    // Verify backend rejects subsequent checkpoint submission
    const cpRes = await request(app)
      .post(`/api/v1/journeys/${journeyId}/checkpoints`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 13.1500,
        longitude: 74.7700,
        speed: 38.0,
        sourceType: 'BROWSER_GPS',
      });
    expect(cpRes.status).toBe(400); // Session already ended/terminated
  });
});
