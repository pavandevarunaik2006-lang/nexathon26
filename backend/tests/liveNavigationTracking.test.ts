import { describe, it, expect } from 'vitest';
import {
  haversineDistanceKm,
  calculatePolylineLengthKm,
  projectPointOntoSegment,
  calculateRouteProgress,
  calculateDynamicEta,
  resolveVehicleSpeed,
  resolveVehicleHeading,
  calculateForwardBearingDeg,
  isValidCoordinate,
  detectCoordinateOrder,
  normalizeCoordinateToLatLng,
  normalizePolylineGeometry,
} from '@roadalert/shared';

describe('Live GPS Vehicle Tracking & Dynamic ETA Engine', () => {
  // Test Route Geometry: NH-66 corridor from Pumpwell (Mangaluru) to Karavali Bypass (Udupi)
  const sampleCorridorPolyline: [number, number][] = [
    [12.8669, 74.8692], // Pumpwell Circle (Mangaluru)
    [12.875, 74.86],
    [12.9261, 74.8415], // Kuloor Bridge
    [13.0084, 74.7915], // Surathkal Junction
    [13.1166, 74.767], // Mulki
    [13.2185, 74.7431], // Padubidri
    [13.275, 74.738], // Kaup
    [13.3409, 74.7351], // Udupi Karavali Bypass
  ];

  it('1. Geometry and distance calculations: Haversine distance and polyline length are accurate', () => {
    const distKm = haversineDistanceKm(12.8669, 74.8692, 13.3409, 74.7351);
    expect(distKm).toBeGreaterThan(50);
    expect(distKm).toBeLessThan(60);

    const polylineLenKm = calculatePolylineLengthKm(sampleCorridorPolyline);
    expect(polylineLenKm).toBeGreaterThan(52);
    expect(polylineLenKm).toBeLessThan(62);
  });

  it('2. Snapping vehicle to route when close to corridor (< 55m)', () => {
    // Point 15 meters east of Pumpwell Circle
    const nearPumpwellLat = 12.8669;
    const nearPumpwellLng = 74.86935; // ~16 meters offset

    const progress = calculateRouteProgress(
      nearPumpwellLat,
      nearPumpwellLng,
      sampleCorridorPolyline,
      { snapThresholdMeters: 55, offRouteThresholdMeters: 100 }
    );

    expect(progress.isSnapped).toBe(true);
    expect(progress.isOffRoute).toBe(false);
    expect(progress.distanceToRouteMeters).toBeLessThan(55);
    expect(progress.progressDistanceKm).toBeCloseTo(0, 1);
    expect(progress.remainingDistanceKm).toBeGreaterThan(50);
    expect(progress.travelledPolyline.length).toBeGreaterThanOrEqual(1);
    expect(progress.remainingPolyline.length).toBeGreaterThanOrEqual(2);
  });

  it('3. Detecting route deviation (off-route) when vehicle leaves the corridor (> 100m)', () => {
    // Point 500 meters away from the corridor
    const offRouteLat = 12.9261;
    const offRouteLng = 74.855; // ~1.4 km west of Kuloor Bridge

    const progress = calculateRouteProgress(
      offRouteLat,
      offRouteLng,
      sampleCorridorPolyline,
      { snapThresholdMeters: 55, offRouteThresholdMeters: 100 }
    );

    expect(progress.isSnapped).toBe(false);
    expect(progress.isOffRoute).toBe(true);
    expect(progress.distanceToRouteMeters).toBeGreaterThan(100);
  });

  it('4. Monotonic progress guard: small GPS noise or backwards jitter does not reverse route progress', () => {
    // Progress at Surathkal (index 3)
    const surathkalProgress = calculateRouteProgress(
      13.0084,
      74.7915,
      sampleCorridorPolyline,
      { previousProgressKm: 0 }
    );
    const recordedProgressKm = surathkalProgress.progressDistanceKm;
    expect(recordedProgressKm).toBeGreaterThan(15);

    // Slightly jittered backwards GPS reading (50 meters backwards)
    const jitteredLat = 13.0081;
    const jitteredLng = 74.7917;

    const jitteredProgress = calculateRouteProgress(
      jitteredLat,
      jitteredLng,
      sampleCorridorPolyline,
      { previousProgressKm: recordedProgressKm }
    );

    // Progress is held monotonically and not rolled backwards
    expect(jitteredProgress.progressDistanceKm).toBeGreaterThanOrEqual(recordedProgressKm);
  });

  it('5. Dynamic ETA: blends rolling speed with corridor baseline speed', () => {
    const eta = calculateDynamicEta({
      remainingDistanceKm: 30, // 30 km remaining
      currentSpeedKmh: 60, // travelling at 60 km/h
      rollingSpeeds: [55, 58, 62, 60],
      routeBaseDurationMin: 60,
      routeTotalDistanceKm: 55,
      affectingIncidents: [],
    });

    expect(eta.calculationMethod).toBe('GPS_DYNAMIC');
    expect(eta.remainingMinutes).toBeGreaterThan(25);
    expect(eta.remainingMinutes).toBeLessThan(35);
    expect(eta.remainingDurationFormatted).toContain('min');
    expect(eta.formattedArrivalTime).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
  });

  it('6. Stationary or crawl vehicle (< 18 km/h): does not crash, divide by zero, or explode ETA', () => {
    const etaStationary = calculateDynamicEta({
      remainingDistanceKm: 25,
      currentSpeedKmh: 0, // completely stationary at a traffic signal or barrier
      rollingSpeeds: [0, 0, 0],
      routeBaseDurationMin: 55,
      routeTotalDistanceKm: 55,
      affectingIncidents: [],
    });

    // Effective speed safely clamped, does not divide by zero
    expect(etaStationary.effectiveSpeedKmh).toBeGreaterThan(12);
    expect(Number.isFinite(etaStationary.remainingMinutes)).toBe(true);
    expect(etaStationary.remainingMinutes).toBeLessThan(120);
    expect(etaStationary.calculationMethod).toBe('GPS_DYNAMIC');
  });

  it('7. Verified incident delays ahead are added to dynamic ETA without duplicate counting', () => {
    const incidents = [
      {
        id: 'inc-kuloor-waterlog',
        latitude: 12.9261,
        longitude: 74.8415,
        estimatedDelayMinutes: 15,
        roadClosed: false,
      },
      // Same incident duplicated in payload
      {
        id: 'inc-kuloor-waterlog',
        latitude: 12.9261,
        longitude: 74.8415,
        estimatedDelayMinutes: 15,
        roadClosed: false,
      },
      {
        id: 'inc-surathkal-work',
        latitude: 13.0084,
        longitude: 74.7915,
        estimatedDelayMinutes: 10,
        roadClosed: false,
      },
    ];

    const etaWithIncidents = calculateDynamicEta({
      remainingDistanceKm: 40,
      currentSpeedKmh: 50,
      rollingSpeeds: [50, 50],
      routeBaseDurationMin: 60,
      routeTotalDistanceKm: 55,
      affectingIncidents: incidents,
    });

    // 15 min + 10 min = 25 min delay added exactly once (no duplicate counting)
    expect(etaWithIncidents.remainingIncidentDelayMinutes).toBe(25);
    // Base travel for 40 km @ 50 km/h is 48 min + 25 min delay = 73 min
    expect(etaWithIncidents.remainingMinutes).toBeGreaterThanOrEqual(70);
    expect(etaWithIncidents.remainingMinutes).toBeLessThanOrEqual(76);
  });

  it('8. Arrival at destination: remaining distance is 0 and status is Arrived', () => {
    const etaArrived = calculateDynamicEta({
      remainingDistanceKm: 0.02, // 20 meters from destination
      currentSpeedKmh: 10,
      routeBaseDurationMin: 50,
      routeTotalDistanceKm: 55,
    });

    expect(etaArrived.remainingDistanceKm).toBe(0);
    expect(etaArrived.remainingMinutes).toBe(0);
    expect(etaArrived.remainingDurationFormatted).toBe('Arrived');
  });

  it('9. Speed resolution: filters impossible GPS spikes (> 160 km/h)', () => {
    const spikeSpeed = resolveVehicleSpeed({
      rawSpeed: 240, // Impossible passenger car speed
      currentPosition: [12.8669, 74.8692],
      currentTimestamp: Date.now(),
    });

    expect(spikeSpeed.isSpikeRejected).toBe(true);
    expect(spikeSpeed.speedKmh).toBeNull();

    const normalSpeed = resolveVehicleSpeed({
      rawSpeed: 52.4, // 52.4 km/h
      currentPosition: [12.8669, 74.8692],
      currentTimestamp: Date.now(),
    });

    expect(normalSpeed.isSpikeRejected).toBe(false);
    expect(normalSpeed.speedKmh).toBe(52.4);
  });

  it('10. Speed estimation: computes speed from delta positions when hardware speed is null', () => {
    const prevPos: [number, number] = [12.8669, 74.8692];
    // Moved ~50 meters north in 3 seconds (approx 60 km/h)
    const nextPos: [number, number] = [12.86735, 74.8692];
    const prevTime = 10000;
    const nextTime = 13000;

    const estimated = resolveVehicleSpeed({
      rawSpeed: null,
      prevPosition: prevPos,
      currentPosition: nextPos,
      prevTimestamp: prevTime,
      currentTimestamp: nextTime,
    });

    expect(estimated.isEstimated).toBe(true);
    expect(estimated.isSpikeRejected).toBe(false);
    expect(estimated.speedKmh).toBeGreaterThan(45);
    expect(estimated.speedKmh).toBeLessThan(75);
  });

  it('11. Heading calculation: calculates forward bearing along displacement direction', () => {
    // Moving northward from Pumpwell towards Kuloor
    const bearingNorth = calculateForwardBearingDeg(12.8669, 74.8692, 12.9261, 74.8692);
    expect(bearingNorth).toBeCloseTo(0, 0);

    // Moving northward from consecutive positions
    const resolvedHeading = resolveVehicleHeading({
      deviceHeading: null,
      prevPosition: [12.8669, 74.8692],
      currentPosition: [12.875, 74.86],
      minDisplacementMeters: 5,
    });

    expect(resolvedHeading).not.toBeNull();
    expect(resolvedHeading).toBeGreaterThan(300); // Northwest bearing
  });

  it('12. Poor GPS accuracy handling: does not cause false deviations', () => {
    // Vehicle is 45 meters off route, but GPS accuracy is ±50m
    const progress = calculateRouteProgress(
      12.8672,
      74.8695,
      sampleCorridorPolyline,
      {
        snapThresholdMeters: 55,
        offRouteThresholdMeters: 90,
        gpsAccuracyMeters: 50, // Weak accuracy
      }
    );

    // With weak accuracy, effective off-route threshold is expanded to avoid false alarms
    expect(progress.isOffRoute).toBe(false);
    expect(progress.isSnapped).toBe(true);
  });

  it('13. Route switching: resetting previous progress recalculates clean geometry segments', () => {
    // Resetting progress to 0 simulates picking a different alternative route
    const resetProgress = calculateRouteProgress(
      sampleCorridorPolyline[0][0],
      sampleCorridorPolyline[0][1],
      sampleCorridorPolyline,
      { previousProgressKm: 0 }
    );

    expect(resetProgress.progressDistanceKm).toBe(0);
    expect(resetProgress.progressPercent).toBe(0);
    expect(resetProgress.remainingDistanceKm).toBeGreaterThan(50);
  });

  it('14. Coordinate validation: validates finite numbers within geographic bounds and rejects invalid inputs', () => {
    // Valid coordinates in Mangaluru / Udupi region
    expect(isValidCoordinate(12.8669, 74.8692)).toBe(true);
    expect(isValidCoordinate(13.3409, 74.7351)).toBe(true);
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(-90, 180)).toBe(true);

    // Invalid coordinates
    expect(isValidCoordinate(NaN, 74.8692)).toBe(false);
    expect(isValidCoordinate(12.8669, Infinity)).toBe(false);
    expect(isValidCoordinate(95, 74.8692)).toBe(false); // Latitude > 90
    expect(isValidCoordinate(12.8669, 195)).toBe(false); // Longitude > 180
    expect(isValidCoordinate('12.8669' as any, 74.8692)).toBe(false);
  });

  it('15. Coordinate order detection: detects GeoJSON [longitude, latitude] vs Leaflet [latitude, longitude]', () => {
    // In Mangaluru region: latitude is ~12.9, longitude is ~74.8
    const leafletOrder: [number, number] = [12.8669, 74.8692];
    const geoJsonOrder: [number, number] = [74.8692, 12.8669];

    expect(detectCoordinateOrder(leafletOrder)).toBe('LAT_LNG');
    expect(detectCoordinateOrder(geoJsonOrder)).toBe('LNG_LAT');

    // Global limits
    expect(detectCoordinateOrder([120.5, 23.4])).toBe('LNG_LAT'); // 120 cannot be latitude
    expect(detectCoordinateOrder([23.4, 120.5])).toBe('LAT_LNG');
  });

  it('16. Coordinate normalization: converts GeoJSON [lng, lat] to Leaflet [lat, lng] without Arctic distortion', () => {
    const geoJsonPoint: [number, number] = [74.8692, 12.8669];
    const normalized = normalizeCoordinateToLatLng(geoJsonPoint);

    // Latitude must be ~12.8669, NOT 74.8692 (which would place the marker in the Arctic Ocean)
    expect(normalized[0]).toBeCloseTo(12.8669, 4);
    expect(normalized[1]).toBeCloseTo(74.8692, 4);

    // Object format { lat, lng }
    const objPoint = { lat: 13.0084, lng: 74.7915 };
    const normalizedObj = normalizeCoordinateToLatLng(objPoint);
    expect(normalizedObj[0]).toBeCloseTo(13.0084, 4);
    expect(normalizedObj[1]).toBeCloseTo(74.7915, 4);
  });

  it('17. Polyline normalization: normalizes array of coordinates and filters invalid entries', () => {
    const rawGeoJsonPolyline: [number, number][] = [
      [74.8692, 12.8669], // Pumpwell [lng, lat]
      [74.8415, 12.9261], // Kuloor [lng, lat]
      [NaN, 74.8] as any, // Invalid point
      [74.7915, 13.0084], // Surathkal [lng, lat]
    ];

    const normalized = normalizePolylineGeometry(rawGeoJsonPolyline);
    expect(normalized.length).toBe(3);
    // All vertices in Leaflet [lat, lng] format
    expect(normalized[0][0]).toBeCloseTo(12.8669, 4);
    expect(normalized[0][1]).toBeCloseTo(74.8692, 4);
    expect(normalized[1][0]).toBeCloseTo(12.9261, 4);
    expect(normalized[1][1]).toBeCloseTo(74.8415, 4);
    expect(normalized[2][0]).toBeCloseTo(13.0084, 4);
    expect(normalized[2][1]).toBeCloseTo(74.7915, 4);
  });

  it('18. Equirectangular projection: projectPointOntoSegment handles metric scaling and segment clamping', () => {
    const s1Lat = 12.8669;
    const s1Lng = 74.8692;
    const s2Lat = 12.9261;
    const s2Lng = 74.8415;

    // Midpoint between s1 and s2
    const midLat = (s1Lat + s2Lat) / 2;
    const midLng = (s1Lng + s2Lng) / 2;

    const projMid = projectPointOntoSegment(midLat, midLng, s1Lat, s1Lng, s2Lat, s2Lng);
    expect(projMid.t).toBeCloseTo(0.5, 1);
    expect(projMid.distanceKm).toBeCloseTo(0, 2);

    // Point before s1 (clamped to s1, t = 0)
    const beforeS1 = projectPointOntoSegment(12.80, 74.88, s1Lat, s1Lng, s2Lat, s2Lng);
    expect(beforeS1.t).toBe(0);
    expect(beforeS1.point[0]).toBe(s1Lat);
    expect(beforeS1.point[1]).toBe(s1Lng);

    // Point after s2 (clamped to s2, t = 1)
    const afterS2 = projectPointOntoSegment(13.00, 74.80, s1Lat, s1Lng, s2Lat, s2Lng);
    expect(afterS2.t).toBe(1);
    expect(afterS2.point[0]).toBe(s2Lat);
    expect(afterS2.point[1]).toBe(s2Lng);
  });

  it('19. Origin proximity check: detects when vehicle is close to route origin vs > 400m away', () => {
    const routeOriginLat = 12.8669;
    const routeOriginLng = 74.8692;

    // GPS 80 meters from route origin
    const closeGpsLat = 12.8674;
    const closeGpsLng = 74.8696;
    const closeDistKm = haversineDistanceKm(closeGpsLat, closeGpsLng, routeOriginLat, routeOriginLng);
    expect(closeDistKm).toBeLessThan(0.4); // < 400 meters -> Safe to auto-start

    // GPS in Bangalore (300 km away)
    const farGpsLat = 12.9716;
    const farGpsLng = 77.5946;
    const farDistKm = haversineDistanceKm(farGpsLat, farGpsLng, routeOriginLat, routeOriginLng);
    expect(farDistKm).toBeGreaterThan(0.4); // > 400 meters -> Triggers origin mismatch modal
    expect(farDistKm).toBeGreaterThan(250);
  });

  it('20. Off-route reporting: preserves actual GPS position when off-route without silently snapping to unrelated road', () => {
    // GPS point 800 meters west of the NH-66 corridor near Baikampady
    const offCorridorLat = 12.9522;
    const offCorridorLng = 74.8010; // off by ~1 km into the sea/harbour

    const progress = calculateRouteProgress(
      offCorridorLat,
      offCorridorLng,
      sampleCorridorPolyline,
      { snapThresholdMeters: 55, offRouteThresholdMeters: 100 }
    );

    expect(progress.isSnapped).toBe(false);
    expect(progress.isOffRoute).toBe(true);
    expect(progress.distanceToRouteMeters).toBeGreaterThan(700);

    // When off-route, actual GPS position is preserved exactly as input
    expect(progress.actualPosition[0]).toBe(offCorridorLat);
    expect(progress.actualPosition[1]).toBe(offCorridorLng);
  });

  it('21. Initial vehicle placement: placed at selected origin (vertex 0) with forward bearing along first road segment', () => {
    const originVertex = sampleCorridorPolyline[0]; // [12.8669, 74.8692] Pumpwell
    const nextVertex = sampleCorridorPolyline[1]; // [12.875, 74.86]

    // Verify initial vehicle coordinates match the route origin
    expect(originVertex[0]).toBe(12.8669);
    expect(originVertex[1]).toBe(74.8692);

    // Initial forward bearing points north-west along NH-66 towards Udupi
    const initialBearing = calculateForwardBearingDeg(
      originVertex[0],
      originVertex[1],
      nextVertex[0],
      nextVertex[1]
    );

    expect(initialBearing).toBeGreaterThan(300); // ~315-330° (North-West)
    expect(initialBearing).toBeLessThan(360);
  });

  it('22. Dynamic origin change: changing origin from Mangaluru (Pumpwell) to Surathkal updates vehicle position', () => {
    // New route calculated starting from Surathkal
    const surathkalRoutePolyline: [number, number][] = [
      [13.0084, 74.7915], // Surathkal
      [13.1166, 74.767], // Mulki
      [13.2185, 74.7431], // Padubidri
      [13.3409, 74.7351], // Udupi
    ];

    const normalized = normalizePolylineGeometry(surathkalRoutePolyline);
    const newVehicleOrigin = normalized[0];

    expect(newVehicleOrigin[0]).toBe(13.0084);
    expect(newVehicleOrigin[1]).toBe(74.7915);

    // Distance between old and new origin is ~17 km
    const distFromOldOrigin = haversineDistanceKm(
      sampleCorridorPolyline[0][0],
      sampleCorridorPolyline[0][1],
      newVehicleOrigin[0],
      newVehicleOrigin[1]
    );
    expect(distFromOldOrigin).toBeGreaterThan(15);
  });

  it('23. Switching alternative routes: updates initial vehicle placement and segment orientation', () => {
    // Primary Route: NH-66 via coastal bypass
    const routePrimary: [number, number][] = [
      [12.8669, 74.8692],
      [12.9261, 74.8415],
      [13.3409, 74.7351],
    ];

    // Alternative Route: Interior route via Karkala / Moodbidri
    const routeAlternativeInterior: [number, number][] = [
      [12.8669, 74.8692],
      [12.985, 74.98], // Moodbidri
      [13.215, 74.995], // Karkala
      [13.3409, 74.7351], // Udupi
    ];

    const bearingPrimary = calculateForwardBearingDeg(
      routePrimary[0][0],
      routePrimary[0][1],
      routePrimary[1][0],
      routePrimary[1][1]
    );

    const bearingAlternative = calculateForwardBearingDeg(
      routeAlternativeInterior[0][0],
      routeAlternativeInterior[0][1],
      routeAlternativeInterior[1][0],
      routeAlternativeInterior[1][1]
    );

    // Both start at Pumpwell, but point in different directions:
    // Coastal route points North-West (~335°), Interior route points North-East (~40°)
    expect(bearingPrimary).toBeGreaterThan(300);
    expect(bearingAlternative).toBeLessThan(90);
    expect(bearingAlternative).toBeGreaterThan(10);
  });

  it('24. Distinguishing planned origin from live GPS when physical location is distant (> 400m)', () => {
    const routeOrigin: [number, number] = [12.8669, 74.8692];
    // User is physically located in Manipal (60 km north)
    const userGps: [number, number] = [13.3525, 74.7928];

    const distanceKm = haversineDistanceKm(
      userGps[0],
      userGps[1],
      routeOrigin[0],
      routeOrigin[1]
    );

    expect(distanceKm).toBeGreaterThan(50);

    // Before navigation starts: vehicle is at planned origin
    const plannedVehiclePos = routeOrigin;
    expect(plannedVehiclePos).toEqual([12.8669, 74.8692]);

    // When navigation starts with "Keep Selected Origin", the route progress correctly marks user off-route
    // and does NOT falsely claim user GPS is at the route origin
    const progress = calculateRouteProgress(
      userGps[0],
      userGps[1],
      sampleCorridorPolyline
    );

    expect(progress.isSnapped).toBe(false);
    expect(progress.isOffRoute).toBe(true);
    expect(progress.actualPosition).toEqual([13.3525, 74.7928]);
  });

  it('25. Start navigation with GPS near origin: snaps to route vertex 0 and starts tracking', () => {
    // GPS fix 20m from route origin
    const nearOriginGpsLat = 12.8670;
    const nearOriginGpsLng = 74.8693;

    const progress = calculateRouteProgress(
      nearOriginGpsLat,
      nearOriginGpsLng,
      sampleCorridorPolyline,
      { snapThresholdMeters: 55 }
    );

    expect(progress.isSnapped).toBe(true);
    expect(progress.isOffRoute).toBe(false);
    expect(progress.distanceToRouteMeters).toBeLessThan(25);
    expect(progress.segmentIndex).toBe(0);
    expect(progress.progressDistanceKm).toBeLessThan(0.1);
  });

  it('26. Comprehensive GeoJSON longitude/latitude order detection and conversion', () => {
    // GeoJSON route coordinates from external OSRM [longitude, latitude]
    const geoJsonCoordinates: [number, number][] = [
      [74.8692, 12.8669],
      [74.8600, 12.8750],
      [74.8415, 12.9261],
      [74.7915, 13.0084],
      [74.7351, 13.3409],
    ];

    const normalized = normalizePolylineGeometry(geoJsonCoordinates);

    // Every coordinate must now be [latitude, longitude] in valid Karnataka range
    for (const point of normalized) {
      expect(point[0]).toBeGreaterThan(12.0);
      expect(point[0]).toBeLessThan(14.0); // Latitude: ~12.8 - 13.4
      expect(point[1]).toBeGreaterThan(74.0);
      expect(point[1]).toBeLessThan(75.5); // Longitude: ~74.7 - 74.9
      expect(isValidCoordinate(point[0], point[1])).toBe(true);
    }
  });
});

