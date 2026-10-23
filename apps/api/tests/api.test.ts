import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { seedDatabase, DEMO_IDS } from '../src/db/seedData.js';

process.env.NODE_ENV = 'test';

const app = createApp();

let passengerToken = '';
let employeeToken = '';
let employerToken = '';
let otherEmployerToken = '';
let authorityToken = '';
let adminToken = '';
let createdIncidentId = '';
let createdJourneyId = '';

beforeAll(async () => {
  await db.init({ memory: true });
  await seedDatabase({ force: true });
});

describe('RoadAlert API — Acceptance Criteria & Security Suite (15 Criteria)', () => {
  it('1. Allows successful login for valid credentials and rejects invalid credentials', async () => {
    const validRes = await request(app).post('/api/v1/auth/login').send({
      email: 'passenger@roadalert.in',
      password: 'RoadAlert@2026',
    });
    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.data.accessToken).toBeDefined();
    passengerToken = validRes.body.data.accessToken;

    // Login other roles for subsequent tests
    const empRes = await request(app).post('/api/v1/auth/login').send({
      email: 'employee@roadalert.in',
      password: 'RoadAlert@2026',
    });
    employeeToken = empRes.body.data.accessToken;

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

    const invalidRes = await request(app).post('/api/v1/auth/login').send({
      email: 'passenger@roadalert.in',
      password: 'WrongPassword123',
    });
    expect(invalidRes.status).toBe(401);
    expect(invalidRes.body.success).toBe(false);
  });

  it('2. Prevents a passenger from accessing admin endpoints or self-assigning admin/authority roles', async () => {
    const adminUsersRes = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(adminUsersRes.status).toBe(403);

    const escalateRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Malicious Escalator',
      email: 'hacker@roadalert.in',
      password: 'Password123!',
      role: 'ADMIN',
    });
    expect(escalateRes.status).toBe(403);
  });

  it('3. Prevents an employer from accessing another organization’s employees or journeys', async () => {
    const crossOrgRes = await request(app)
      .get(`/api/v1/employer/dashboard?organizationId=${DEMO_IDS.orgs.primary}`)
      .set('Authorization', `Bearer ${otherEmployerToken}`);
    expect(crossOrgRes.status).toBe(403);
    expect(crossOrgRes.body.error.code).toBe('ORGANIZATION_ISOLATION_VIOLATION');
  });

  it('4. Saves a newly submitted incident report in PostgreSQL and returns a unique ID and initial score', async () => {
    const createRes = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        title: 'Oil Spill and Tanker Skid Near Baikampady Industrial Cross',
        description:
          'Diesel spill across left lane of NH-66 northbound near Baikampady industrial gate causing two-wheelers to slow down.',
        category: 'Vehicle breakdown',
        severity: 'HIGH',
        latitude: 12.9522,
        longitude: 74.8105,
        roadName: 'Baikampady Industrial Area, NH-66',
        estimatedDelayMinutes: 25,
        idempotencyKey: 'test-idem-key-001',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.incident.id).toBeDefined();
    createdIncidentId = createRes.body.data.incident.id;
    expect(createRes.body.data.confidenceBreakdown.totalScore).toBe(25); // 10 base report + 15 location proximity evidence
  });

  it('5. Incident filters return matching records by category, severity, and search query', async () => {
    const filterRes = await request(app)
      .get('/api/v1/incidents')
      .query({ category: 'Flood/waterlogging', severity: 'CRITICAL' });

    expect(filterRes.status).toBe(200);
    expect(filterRes.body.data.items.length).toBeGreaterThanOrEqual(1);
    for (const item of filterRes.body.data.items) {
      expect(item.category).toBe('Flood/waterlogging');
      expect(item.severity).toBe('CRITICAL');
    }
  });

  it('6. Duplicate reports from the same user do not inflate independent corroboration', async () => {
    // Original reporter (passenger) tries to corroborate their own report
    const selfCorrRes = await request(app)
      .post(`/api/v1/incidents/${createdIncidentId}/corroborate`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        corroborationType: 'CORROBORATE',
        latitude: 12.9523,
        longitude: 74.8106,
      });

    expect(selfCorrRes.status).toBe(200);
    expect(selfCorrRes.body.data.isSameAsOriginalReporter).toBe(true);
    expect(selfCorrRes.body.data.confidenceBreakdown.counts.distinctReporters).toBe(1);
    expect(selfCorrRes.body.data.confidenceBreakdown.components.independentReports).toBe(10);

    // Distinct user (employee) corroborates once -> increases score
    const empCorr1 = await request(app)
      .post(`/api/v1/incidents/${createdIncidentId}/corroborate`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        corroborationType: 'CORROBORATE',
        latitude: 12.9524,
        longitude: 74.8107,
      });
    expect(empCorr1.status).toBe(200);
    expect(empCorr1.body.data.duplicateIgnored).toBe(false);
    expect(empCorr1.body.data.confidenceBreakdown.counts.distinctReporters).toBe(2);
    expect(empCorr1.body.data.confidenceBreakdown.components.independentReports).toBe(20);

    // Same employee tries to corroborate a second time -> ignored, does not inflate
    const empCorr2 = await request(app)
      .post(`/api/v1/incidents/${createdIncidentId}/corroborate`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        corroborationType: 'CORROBORATE',
        latitude: 12.9524,
        longitude: 74.8107,
      });
    expect(empCorr2.status).toBe(200);
    expect(empCorr2.body.data.duplicateIgnored).toBe(true);
    expect(empCorr2.body.data.confidenceBreakdown.counts.distinctReporters).toBe(2);
    expect(empCorr2.body.data.confidenceBreakdown.components.independentReports).toBe(20);
  });

  it('7. Recalculates confidence score accurately as GPS telemetry and photo evidence are added', async () => {
    // Add GPS congestion signal (+10 GPS pts)
    const gpsRes = await request(app)
      .post(`/api/v1/incidents/${createdIncidentId}/corroborate`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        corroborationType: 'GPS_CONGESTION',
        latitude: 12.9521,
        longitude: 74.8104,
        speedKmh: 7.5,
      });
    expect(gpsRes.status).toBe(200);
    expect(gpsRes.body.data.confidenceBreakdown.components.gpsCorroboration).toBe(10);

    // Attach photo evidence (+15 media pts)
    const evRes = await request(app)
      .post(`/api/v1/incidents/${createdIncidentId}/evidence`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        evidenceType: 'PHOTO',
        caption: 'Photo of diesel slick and cones at Baikampady',
      });
    expect(evRes.status).toBe(201);
    expect(evRes.body.data.confidenceBreakdown.components.mediaEvidence).toBe(15);
    expect(evRes.body.data.confidenceBreakdown.verificationLevel).toBe(5);
  });

  it('8. Records an audit trail when evidence and confidence scores change', async () => {
    const detailRes = await request(app).get(`/api/v1/incidents/${createdIncidentId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.auditTrail.length).toBeGreaterThanOrEqual(3);
    const actions = detailRes.body.data.auditTrail.map((a: any) => a.action);
    expect(actions.some((a: string) => a.includes('EVIDENCE_SUBMITTED'))).toBe(true);
    expect(actions.some((a: string) => a.includes('CONFIDENCE_RECALCULATED'))).toBe(true);
  });

  it('9. Rejects starting an employee commute session without required active consent', async () => {
    const noConsentRes = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        origin: 'Mulki Bus Stand (NH-66)',
        destination: 'Pumpwell Circle, Mangaluru (NH-66)',
        consentRecordId: '',
      });
    expect(noConsentRes.status).toBe(400);
  });

  it('10. Allows an employee to start a consented commute session and explicitly stop it', async () => {
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
        consentRecordId: DEMO_IDS.consents.employeeActive,
      });

    expect(startRes.status).toBe(201);
    createdJourneyId = startRes.body.data.id;
    expect(['ACTIVE', 'DELAYED']).toContain(startRes.body.data.status);

    const stopRes = await request(app)
      .post(`/api/v1/journeys/${createdJourneyId}/stop`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send();

    expect(stopRes.status).toBe(200);
    expect(stopRes.body.data.status).toBe('COMPLETED');
    expect(stopRes.body.data.ended_at).toBeTruthy();
  });

  it('11. Ensures employer sees only authorized commute information with precise coordinates redacted by default', async () => {
    const dashRes = await request(app)
      .get('/api/v1/employer/dashboard')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.organization.id).toBe(DEMO_IDS.orgs.primary);
    expect(dashRes.body.data.activeJourneys.length).toBeGreaterThanOrEqual(1);
    for (const j of dashRes.body.data.activeJourneys) {
      expect(j.preciseCoordinatesRedacted).toBe(true);
      expect(j.originLat).toBeUndefined();
      expect(j.originLng).toBeUndefined();
    }
  });

  it('12. Allows Traffic Authority to review, confirm, and resolve an incident with mandatory reason', async () => {
    const reviewRes = await request(app)
      .post(`/api/v1/incidents/${createdIncidentId}/review`)
      .set('Authorization', `Bearer ${authorityToken}`)
      .send({
        decision: 'CONFIRM',
        reason: 'Fire & Emergency Services and NHAI patrol confirmed diesel spill cleanup at Baikampady.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.incident.authorityConfirmed).toBe(true);
    expect(reviewRes.body.data.confidenceBreakdown.verificationLevel).toBe(6);
    expect(reviewRes.body.data.confidenceBreakdown.components.authorityConfirmation).toBe(15);
  });

  it('13. Computes historical analytics and hotspot aggregations directly from stored database records', async () => {
    const analyticsRes = await request(app)
      .get('/api/v1/authority/analytics?period=monthly')
      .set('Authorization', `Bearer ${authorityToken}`);

    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.data.summary.totalIncidents).toBeGreaterThanOrEqual(18);
    expect(analyticsRes.body.data.byCategory.length).toBeGreaterThanOrEqual(5);
    expect(analyticsRes.body.data.byRoad.length).toBeGreaterThanOrEqual(5);
  });

  it('14. Persists notifications and allows marking individual or all notifications as read', async () => {
    const notifRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(notifRes.status).toBe(200);
    expect(notifRes.body.data.items.length).toBeGreaterThanOrEqual(2);
    const firstId = notifRes.body.data.items[0].id;

    const markOneRes = await request(app)
      .patch(`/api/v1/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(markOneRes.status).toBe(200);
    expect(markOneRes.body.data.readAt).toBeTruthy();

    const markAllRes = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(markAllRes.status).toBe(200);
  });

  it('15. Rejects invalid coordinates and disallowed executable file uploads', async () => {
    const badCoordsRes = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        title: 'Invalid Coordinate Test',
        description: 'Testing out of bounds latitude validation on server.',
        category: 'Accident',
        severity: 'HIGH',
        latitude: 195.5, // Invalid latitude (> 90)
        longitude: 74.85,
        roadName: 'NH-66 Test',
      });
    expect(badCoordsRes.status).toBe(400);

    // Attempt uploading an executable/script file as incident evidence
    const badFileRes = await request(app)
      .post(`/api/v1/incidents/${createdIncidentId}/evidence`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .attach('file', Buffer.from('#!/bin/bash\necho pwned'), {
        filename: 'exploit.sh',
        contentType: 'application/x-sh',
      });
    expect(badFileRes.status).toBe(400);
    expect(badFileRes.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('16. Provides location autocomplete suggestions for presets, landmarks, roads, and coordinate strings', async () => {
    // Empty query returns preset corridor locations
    const presetRes = await request(app).get('/api/v1/locations/search?q=');
    expect(presetRes.status).toBe(200);
    expect(presetRes.body.data.suggestions.length).toBeGreaterThanOrEqual(5);
    expect(presetRes.body.data.suggestions[0].source).toBe('PRESET');

    // Landmark query ("Jyothi Circle")
    const landmarkRes = await request(app).get(
      '/api/v1/locations/search?q=' + encodeURIComponent('Jyothi Circle')
    );
    expect(landmarkRes.status).toBe(200);
    expect(landmarkRes.body.data.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(landmarkRes.body.data.suggestions[0].label).toContain('Jyothi Circle');
    expect(landmarkRes.body.data.suggestions[0].lat).toBeCloseTo(12.8732, 3);

    // Coordinate string query ("13.0108, 74.7943")
    const coordRes = await request(app).get(
      '/api/v1/locations/search?q=' + encodeURIComponent('13.0108, 74.7943')
    );
    expect(coordRes.status).toBe(200);
    expect(coordRes.body.data.suggestions[0].source).toBe('COORDINATE');
    expect(coordRes.body.data.suggestions[0].lat).toBeCloseTo(13.0108, 3);
  });

  it('17. Reverse geocodes map-selected coordinates cleanly with exact, nearby, and coordinate fallback labels', async () => {
    // Near Pumpwell Circle
    const exactRes = await request(app).get('/api/v1/locations/reverse?lat=12.8670&lng=74.8691');
    expect(exactRes.status).toBe(200);
    expect(exactRes.body.data.label).toContain('Pumpwell');
    expect(exactRes.body.data.source).toBe('GAZETTEER_EXACT');

    // Nearby corridor point (~1.5km from Surathkal)
    const nearbyRes = await request(app).get('/api/v1/locations/reverse?lat=13.0210&lng=74.7960');
    expect(nearbyRes.status).toBe(200);
    expect(nearbyRes.body.data.label).toContain('Near');
    expect(nearbyRes.body.data.lat).toBeCloseTo(13.021, 3);

    // Reject out-of-range coordinates
    const invalidRes = await request(app).get('/api/v1/locations/reverse?lat=140.5&lng=74.8');
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error.code).toBe('INVALID_COORDINATES');
  });

  it('18. Plans routes for Dropdown Origin + Dropdown Destination and includes incident coordinates', async () => {
    const planRes = await request(app).post('/api/v1/routes/plan').send({
      origin: 'Pumpwell Circle, Mangaluru (NH-66)',
      destination: 'Udupi Karavali Bypass (NH-66)',
      avoidIncidentZones: true,
    });

    expect(planRes.status).toBe(200);
    expect(planRes.body.data.routes.length).toBe(3);
    expect(planRes.body.data.originLocation.source).toBe('PRESET');
    expect(planRes.body.data.destinationLocation.source).toBe('PRESET');

    // Verify affectingIncidents include numeric latitude and longitude for map pin rendering
    const primaryRoute = planRes.body.data.routes.find(
      (r: any) => r.id === 'route-nh66-primary'
    );
    expect(primaryRoute).toBeDefined();
    expect(primaryRoute.affectingIncidents.length).toBeGreaterThanOrEqual(1);
    for (const inc of primaryRoute.affectingIncidents) {
      expect(typeof inc.latitude).toBe('number');
      expect(typeof inc.longitude).toBe('number');
      expect(Number.isFinite(inc.latitude)).toBe(true);
      expect(Number.isFinite(inc.longitude)).toBe(true);
    }
  });

  it('19. Plans routes combining Dropdown + Manual Entry and Manual Entry + Dropdown', async () => {
    // Dropdown Origin + Manual Landmark Destination
    const combo1 = await request(app).post('/api/v1/routes/plan').send({
      origin: 'Pumpwell Circle, Mangaluru (NH-66)',
      destination: 'Manipal Tiger Circle',
      avoidIncidentZones: true,
    });
    expect(combo1.status).toBe(200);
    expect(combo1.body.data.originLocation.lat).toBeCloseTo(12.8669, 3);
    expect(combo1.body.data.destinationLocation.lat).toBeCloseTo(13.3525, 3);
    expect(combo1.body.data.routes.length).toBe(3);

    // Manual Landmark Origin + Dropdown Destination
    const combo2 = await request(app).post('/api/v1/routes/plan').send({
      origin: 'Jyothi Circle, Mangaluru',
      destination: 'Surathkal NITK Corridor (NH-66)',
      avoidIncidentZones: true,
    });
    expect(combo2.status).toBe(200);
    expect(combo2.body.data.originLocation.lat).toBeCloseTo(12.8732, 3);
    expect(combo2.body.data.destinationLocation.lat).toBeCloseTo(13.0108, 3);
  });

  it('20. Plans routes for Manual Origin + Manual Destination including raw coordinate strings', async () => {
    const manualRes = await request(app).post('/api/v1/routes/plan').send({
      origin: '12.8878, 74.8419', // Bejai KSRTC coordinates typed manually
      destination: 'Moodbidri Alvas Campus',
      avoidIncidentZones: true,
    });

    expect(manualRes.status).toBe(200);
    expect(manualRes.body.data.originLocation.source).toBe('COORDINATE');
    expect(manualRes.body.data.originLocation.lat).toBeCloseTo(12.8878, 3);
    expect(manualRes.body.data.destinationLocation.lat).toBeCloseTo(13.0692, 3);
    expect(manualRes.body.data.routes.length).toBe(3);
  });

  it('21. Plans routes using Map-Selected Origin and Map-Selected Destination coordinates', async () => {
    const mapPickRes = await request(app).post('/api/v1/routes/plan').send({
      origin: 'Near Kottara Chowki Flyover (12.9085, 74.8380)',
      originLat: 12.9085,
      originLng: 74.838,
      destination: 'Near Karkala Pulkeri Bypass (13.2150, 74.9960)',
      destLat: 13.215,
      destLng: 74.996,
      avoidIncidentZones: true,
    });

    expect(mapPickRes.status).toBe(200);
    expect(mapPickRes.body.data.originLocation.source).toBe('MAP_PIN');
    expect(mapPickRes.body.data.destinationLocation.source).toBe('MAP_PIN');
    expect(mapPickRes.body.data.originCoords.lat).toBeCloseTo(12.9085, 4);
    expect(mapPickRes.body.data.destCoords.lat).toBeCloseTo(13.215, 4);
    expect(mapPickRes.body.data.routes[0].geometry.length).toBeGreaterThan(2);
  });

  it('22. Supports swapping Origin and Destination endpoints cleanly', async () => {
    const forwardRes = await request(app).post('/api/v1/routes/plan').send({
      origin: 'KPT Junction, Mangaluru (NH-66)',
      destination: 'Padubidri Karkala Cross (NH-66 / SH-1)',
      avoidIncidentZones: true,
    });
    expect(forwardRes.status).toBe(200);

    const swappedRes = await request(app).post('/api/v1/routes/plan').send({
      origin: 'Padubidri Karkala Cross (NH-66 / SH-1)',
      destination: 'KPT Junction, Mangaluru (NH-66)',
      avoidIncidentZones: true,
    });
    expect(swappedRes.status).toBe(200);
    expect(swappedRes.body.data.originLocation.lat).toBeCloseTo(
      forwardRes.body.data.destinationLocation.lat,
      4
    );
    expect(swappedRes.body.data.destinationLocation.lat).toBeCloseTo(
      forwardRes.body.data.originLocation.lat,
      4
    );
  });

  it('23. Rejects unrecognized, malformed, ambiguous, or identical route endpoints cleanly', async () => {
    // Unrecognized location text
    const unrecRes = await request(app).post('/api/v1/routes/plan').send({
      origin: 'Atlantis Underwater Expressway XYZ999',
      destination: 'Udupi Karavali Bypass (NH-66)',
    });
    expect(unrecRes.status).toBe(400);
    expect(unrecRes.body.error.code).toBe('UNRECOGNIZED_LOCATION');

    // Malformed / out-of-bounds coordinate string
    const badCoordRes = await request(app).post('/api/v1/routes/plan').send({
      origin: '98.1234, 74.8500',
      destination: 'Udupi Karavali Bypass (NH-66)',
    });
    expect(badCoordRes.status).toBe(400);
    expect(badCoordRes.body.error.code).toBe('INVALID_COORDINATES');

    // Ambiguous generic token query
    const ambigRes = await request(app).post('/api/v1/routes/plan').send({
      origin: 'Junction',
      destination: 'Udupi Karavali Bypass (NH-66)',
    });
    expect(ambigRes.status).toBe(400);
    expect(ambigRes.body.error.code).toBe('AMBIGUOUS_LOCATION');

    // Identical origin and destination
    const sameRes = await request(app).post('/api/v1/routes/plan').send({
      origin: 'Pumpwell Circle, Mangaluru (NH-66)',
      destination: 'Pumpwell Circle',
    });
    expect(sameRes.status).toBe(400);
    expect(sameRes.body.error.code).toBe('SAME_ORIGIN_DESTINATION');
  });
});
