import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seedData.js';
import {
  evaluateRouteIncidentsAndAlerts,
  startPassengerJourney,
  getActivePassengerJourney,
  monitorPassengerJourney,
  switchPassengerRoute,
  endPassengerJourney,
} from '../src/services/passengerJourneyService.js';
import { minDistanceToPolylineKm } from '../src/services/routingService.js';

describe('RoadAlert — Passenger Live Journey Monitoring & Intelligent Rerouting Suite', () => {
  let app: any;
  let passengerToken: string;
  let otherPassengerToken: string;

  // Mangaluru (Pumpwell) -> Udupi (Karavali Bypass) NH-66 Corridor Polyline
  const mangaluruToUdupiPolyline: [number, number][] = [
    [12.8669, 74.8692], // Pumpwell Circle (Mangaluru)
    [12.8825, 74.8648], // Nanthoor Circle
    [12.8935, 74.8594], // KPT
    [12.9261, 74.8267], // Kuloor Bridge
    [12.9522, 74.8105], // Baikampady
    [13.0108, 74.7943], // Surathkal
    [13.0908, 74.7864], // Mulki Junction (Site of seeded emergency culvert closure)
    [13.1422, 74.7731], // Padubidri
    [13.2244, 74.7484], // Kaup
    [13.3409, 74.7351], // Udupi Karavali Bypass
  ];

  beforeAll(async () => {
    await db.init({ memory: true });
    await seedDatabase({ force: true });
    app = createApp();

    // Authenticate demo passenger
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'passenger@roadalert.in', password: 'RoadAlert@2026' });
    passengerToken = loginRes.body.data.accessToken;

    // Authenticate another user to test unauthorized access prevention
    const otherLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'employee@roadalert.in', password: 'RoadAlert@2026' });
    otherPassengerToken = otherLoginRes.body.data.accessToken;
  });

  it('1. Geometry distance analysis: Correctly measures distance from Mulki incident to NH-66 route', () => {
    // Mulki Junction coordinates: [13.0908, 74.7864]
    const distanceKm = minDistanceToPolylineKm(13.0908, 74.7864, mangaluruToUdupiPolyline);
    expect(distanceKm).toBeLessThan(0.1); // Exactly on polyline vertex
  });

  it('2. Ignores unrelated incidents far away from selected route', () => {
    // Bantwal coordinates: [12.8922, 75.0345] ~ 18 km east of coastal NH-66
    const distToBantwal = minDistanceToPolylineKm(12.8922, 75.0345, mangaluruToUdupiPolyline);
    expect(distToBantwal).toBeGreaterThan(15);
  });

  it('3. Acceptance Scenario: Evaluates Mangaluru -> Udupi route and detects Mulki traffic incident with 45 min delay and 92% confidence', async () => {
    const alert = await evaluateRouteIncidentsAndAlerts(
      mangaluruToUdupiPolyline,
      'Mangaluru Pumpwell',
      'Udupi Karavali Bypass',
      { lat: 12.8669, lng: 74.8692 },
      { lat: 13.3409, lng: 74.7351 },
      'route-nh66-primary'
    );

    expect(alert.alertDetected).toBe(true);
    expect(alert.alertTitle).toContain('Mulki');
    expect(alert.estimatedDelayMin).toBe(45);
    expect(alert.confidenceScore).toBe(92);
    expect(alert.confidenceLabel).toContain('92%');
    expect(alert.incidentDetails).toBeDefined();
    expect(alert.incidentDetails?.roadName).toContain('Mulki');
    expect(alert.incidentDetails?.authorityConfirmed).toBe(true);

    // Verify transparent, non-fabricated confidence breakdown
    expect(alert.confidenceBreakdown.baseWeight).toBe(20);
    expect(alert.confidenceBreakdown.authorityConfirmedBonus).toBe(30);
    expect(alert.confidenceBreakdown.corroborationBonus).toBe(20);
    expect(alert.confidenceBreakdown.mediaEvidenceBonus).toBe(12);
    expect(alert.confidenceBreakdown.gpsSlowdownBonus).toBe(10);
    expect(alert.confidenceBreakdown.hasMedia).toBe(true);
    expect(alert.confidenceBreakdown.hasGpsTelemetry).toBe(true);
    expect(alert.confidenceBreakdown.explanation.length).toBeGreaterThan(0);

    // Verify alternative route is available (Inland SH-1 / Bajpe-Padubidri bypass)
    expect(alert.alternativeRoute?.available).toBe(true);
    expect(alert.alternativeRoute?.name).toContain('Bypass');
    expect(alert.alternativeRoute?.geometry?.length).toBeGreaterThan(2);
  });

  it('4. Starting passenger live journey monitoring via API persists state and returns initial alert', async () => {
    const res = await request(app)
      .post('/api/v1/passenger/journeys/start')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        origin: 'Mangaluru Pumpwell',
        destination: 'Udupi Karavali Bypass',
        originLat: 12.8669,
        originLng: 74.8692,
        destLat: 13.3409,
        destLng: 74.7351,
        selectedRouteId: 'route-nh66-primary',
        selectedRouteName: 'NH-66 Primary Coastal Highway',
        distanceKm: 56.4,
        baseDurationMin: 65,
        routeGeometry: mangaluruToUdupiPolyline,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.activeAlert).toBeDefined();
    expect(res.body.data.activeAlert.alertDetected).toBe(true);
    expect(res.body.data.activeAlert.estimatedDelayMin).toBe(45);
  });

  it('5. Retrieving active passenger journey returns the active session with monitored route', async () => {
    const res = await request(app)
      .get('/api/v1/passenger/journeys/active')
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).not.toBeNull();
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.origin).toBe('Mangaluru Pumpwell');
    expect(res.body.data.destination).toBe('Udupi Karavali Bypass');
  });

  it('6. Periodic journey monitoring step refreshes alert and returns latest corridor conditions', async () => {
    const activeRes = await request(app)
      .get('/api/v1/passenger/journeys/active')
      .set('Authorization', `Bearer ${passengerToken}`);
    const journeyId = activeRes.body.data.id;

    const monitorRes = await request(app)
      .post(`/api/v1/passenger/journeys/${journeyId}/monitor`)
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(monitorRes.status).toBe(200);
    expect(monitorRes.body.success).toBe(true);
    expect(monitorRes.body.data.alertDetected).toBe(true);
    expect(monitorRes.body.data.estimatedDelayMin).toBe(45);
    expect(monitorRes.body.data.confidenceScore).toBe(92);
  });

  it('7. Preventing unauthorized access: Another user cannot monitor or modify another passenger\'s journey', async () => {
    const activeRes = await request(app)
      .get('/api/v1/passenger/journeys/active')
      .set('Authorization', `Bearer ${passengerToken}`);
    const journeyId = activeRes.body.data.id;

    const unauthRes = await request(app)
      .post(`/api/v1/passenger/journeys/${journeyId}/monitor`)
      .set('Authorization', `Bearer ${otherPassengerToken}`);

    expect(unauthRes.status).toBe(404); // Scoped to req.user.userId
  });

  it('8. Intelligent rerouting: Switches route only after explicit passenger confirmation', async () => {
    const activeRes = await request(app)
      .get('/api/v1/passenger/journeys/active')
      .set('Authorization', `Bearer ${passengerToken}`);
    const journeyId = activeRes.body.data.id;
    const alert = activeRes.body.data.activeAlert;
    const altRouteId = alert.alternativeRoute.id;

    // Switch route with reason
    const switchRes = await request(app)
      .post(`/api/v1/passenger/journeys/${journeyId}/switch-route`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        alternativeRouteId: altRouteId,
        reason: 'Passenger avoided Mulki road closure chokepoint via Inland SH-1 bypass',
      });

    expect(switchRes.status).toBe(200);
    expect(switchRes.body.success).toBe(true);
    expect(switchRes.body.data.selectedRouteId).toBe(altRouteId);
    expect(switchRes.body.data.reroutedAt).toBeDefined();
    expect(switchRes.body.data.rerouteReason).toContain('Passenger avoided Mulki');
  });

  it('9. Ending passenger live journey stops monitoring and marks journey COMPLETED', async () => {
    const activeRes = await request(app)
      .get('/api/v1/passenger/journeys/active')
      .set('Authorization', `Bearer ${passengerToken}`);
    const journeyId = activeRes.body.data.id;

    const endRes = await request(app)
      .post(`/api/v1/passenger/journeys/${journeyId}/end`)
      .set('Authorization', `Bearer ${passengerToken}`);

    expect(endRes.status).toBe(200);
    expect(endRes.body.success).toBe(true);
    expect(endRes.body.data.status).toBe('COMPLETED');
    expect(endRes.body.data.endedAt).toBeDefined();

    // Verify getActivePassengerJourney now returns null
    const checkActive = await request(app)
      .get('/api/v1/passenger/journeys/active')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(checkActive.body.data).toBeNull();
  });

  it('10. AI Mobility Assistant explains passenger live journey delays with factual route & incident data', async () => {
    // Start a fresh active journey
    const startRes = await request(app)
      .post('/api/v1/passenger/journeys/start')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        origin: 'Mangaluru Pumpwell',
        destination: 'Udupi Karavali Bypass',
        originLat: 12.8669,
        originLng: 74.8692,
        destLat: 13.3409,
        destLng: 74.7351,
        selectedRouteId: 'route-nh66-primary',
        selectedRouteName: 'NH-66 Coastal Highway',
        distanceKm: 56.4,
        baseDurationMin: 65,
        routeGeometry: mangaluruToUdupiPolyline,
      });

    const journeyId = startRes.body.data.id;

    // Ask AI assistant to explain the journey delay
    const chatRes = await request(app)
      .post('/api/v1/assistant/chat')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        message: 'Why is my journey delayed near Mulki?',
        journeyId,
      });

    expect(chatRes.status).toBe(200);
    expect(chatRes.body.success).toBe(true);
    expect(chatRes.body.data.reply).toContain('Mulki');
    expect(chatRes.body.data.reply).toContain('45 minutes');
    expect(chatRes.body.data.reply).toContain('92%');
    expect(chatRes.body.data.suggestedActions).toBeDefined();

    // Clean up by ending journey
    await request(app)
      .post(`/api/v1/passenger/journeys/${journeyId}/end`)
      .set('Authorization', `Bearer ${passengerToken}`);
  });
});
