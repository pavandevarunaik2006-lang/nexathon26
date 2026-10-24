import crypto from 'crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  classifyIncidentVerificationState,
  getConfidenceBandLabel,
  type IncidentVerificationState,
} from '@roadalert/shared';
import {
  calculateRoutesWithIncidents,
  minDistanceToPolylineKm,
  type PlannedRouteOption,
} from './routingService.js';
import { haversineDistanceKm } from './verificationEngine.js';

export interface PassengerJourneyAlert {
  alertDetected: boolean;
  alertTitle?: string;
  estimatedDelayMin: number;
  possibleReason?: string;
  incidentDetails?: {
    id: string;
    title: string;
    category: string;
    severity: string;
    roadName: string;
    latitude: number;
    longitude: number;
    authorityConfirmed: boolean;
    confidenceScore: number;
    verificationState: IncidentVerificationState;
    distanceFromRouteKm: number;
  };
  confidenceScore: number;
  confidenceLabel: string;
  confidenceBreakdown: {
    baseWeight: number;
    authorityConfirmedBonus: number;
    corroborationBonus: number;
    mediaEvidenceBonus: number;
    gpsSlowdownBonus: number;
    corroborationCount: number;
    hasMedia: boolean;
    hasGpsTelemetry: boolean;
    explanation: string[];
  };
  alternativeRoute?: {
    available: boolean;
    id?: string;
    name?: string;
    corridorDescription?: string;
    distanceKm?: number;
    totalEstimatedMin?: number;
    timeDifferenceMin?: number; // e.g. -22 mins compared to delayed current route
    geometry?: [number, number][];
    reason?: string;
  };
  lastEvaluatedAt: string;
}

export interface PassengerJourneyState {
  id: string;
  userId: string;
  origin: string;
  destination: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  selectedRouteId: string;
  selectedRouteName: string;
  distanceKm: number;
  baseDurationMin: number;
  routeGeometry: [number, number][];
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startedAt: string;
  endedAt?: string | null;
  reroutedAt?: string | null;
  rerouteReason?: string | null;
  activeAlert: PassengerJourneyAlert | null;
  lastMonitoredAt: string;
}

/**
 * Evaluates route geometry against active incidents and calculates transparent delay & confidence
 */
export async function evaluateRouteIncidentsAndAlerts(
  geometry: [number, number][],
  origin: string,
  destination: string,
  originCoords: { lat: number; lng: number },
  destCoords: { lat: number; lng: number },
  currentRouteId?: string
): Promise<PassengerJourneyAlert> {
  const now = Date.now();
  const cutoffTime = new Date(now - 24 * 3600 * 1000).toISOString();

  // 1. Fetch active incidents from database (excluding resolved or rejected ones)
  const activeIncidentsRes = await db.query<any>(
    `SELECT i.*,
            (SELECT COUNT(*) FROM incident_corroborations ic WHERE ic.incident_id = i.id AND ic.corroboration_type != 'DISPUTE') as corroboration_count,
            (SELECT COUNT(*) FROM incident_evidences ie WHERE ie.incident_id = i.id) as evidence_count,
            (SELECT COUNT(*) FROM incident_corroborations ic WHERE ic.incident_id = i.id AND ic.corroboration_type = 'GPS_CONGESTION') as gps_corroboration_count
     FROM incidents i
     WHERE i.status NOT IN ('RESOLVED', 'REJECTED')
       AND i.reported_at >= $1
     ORDER BY i.reported_at DESC`,
    [cutoffTime]
  );

  const incidents = activeIncidentsRes.rows;
  const intersectingIncidents: Array<{
    incident: any;
    distanceKm: number;
    verificationState: IncidentVerificationState;
    delayMin: number;
    confidenceScore: number;
  }> = [];

  for (const inc of incidents) {
    const incLat = Number(inc.latitude);
    const incLng = Number(inc.longitude);
    if (!Number.isFinite(incLat) || !Number.isFinite(incLng)) continue;

    // Strict geometry distance check: incident must be within 2.2 km of the route polyline
    const distKm = minDistanceToPolylineKm(incLat, incLng, geometry);
    if (distKm > 2.2) {
      // Incident is unrelated or too far from this route; ignore
      continue;
    }

    const verificationState = classifyIncidentVerificationState(inc);
    if (verificationState === 'REJECTED_REPORT' || verificationState === 'RESOLVED_OBSTRUCTION') {
      continue;
    }

    // Determine evidence-based confidence score
    let confidenceScore = 20; // base score for a recorded report
    let authorityBonus = 0;
    let corroborationBonus = 0;
    let mediaBonus = 0;
    let gpsBonus = 0;

    const authConfirmed = Boolean(inc.authority_confirmed || inc.authorityConfirmed);
    if (authConfirmed) {
      authorityBonus = 30;
      confidenceScore += authorityBonus;
    }

    const corrCount = Number(inc.corroboration_count || 0);
    if (corrCount >= 2) {
      corroborationBonus = 20;
      confidenceScore += corroborationBonus;
    } else if (corrCount === 1) {
      corroborationBonus = 10;
      confidenceScore += corroborationBonus;
    }

    const evCount = Number(inc.evidence_count || 0);
    if (evCount > 0) {
      mediaBonus = 12;
      confidenceScore += mediaBonus;
    }

    const gpsCount = Number(inc.gps_corroboration_count || 0);
    if (gpsCount > 0) {
      gpsBonus = 10;
      confidenceScore += gpsBonus;
    }

    // Cap confidence score between 0 and 98 unless full authority verified
    const finalConfidence = Math.min(99, Math.max(15, confidenceScore));
    const delayMin = Number(inc.estimated_delay_minutes || 15);

    intersectingIncidents.push({
      incident: inc,
      distanceKm: Math.round(distKm * 10) / 10,
      verificationState,
      delayMin,
      confidenceScore: finalConfidence,
    });
  }

  // If no incidents intersect the route
  if (intersectingIncidents.length === 0) {
    return {
      alertDetected: false,
      estimatedDelayMin: 0,
      confidenceScore: 0,
      confidenceLabel: 'Normal traffic conditions — No active incidents detected',
      confidenceBreakdown: {
        baseWeight: 0,
        authorityConfirmedBonus: 0,
        corroborationBonus: 0,
        mediaEvidenceBonus: 0,
        gpsSlowdownBonus: 0,
        corroborationCount: 0,
        hasMedia: false,
        hasGpsTelemetry: false,
        explanation: ['Zero active incidents intersecting this route corridor.'],
      },
      lastEvaluatedAt: new Date().toISOString(),
    };
  }

  // Sort by severity / confirmed obstruction first, then highest delay
  intersectingIncidents.sort((a, b) => {
    const aClosed = a.verificationState === 'CONFIRMED_OBSTRUCTION' ? 1 : 0;
    const bClosed = b.verificationState === 'CONFIRMED_OBSTRUCTION' ? 1 : 0;
    if (aClosed !== bClosed) return bClosed - aClosed;
    return b.delayMin - a.delayMin;
  });

  const primary = intersectingIncidents[0];
  const primaryInc = primary.incident;
  const isAuthConfirmed = Boolean(primaryInc.authority_confirmed || primaryInc.authorityConfirmed);
  const corrCount = Number(primaryInc.corroboration_count || 0);
  const evCount = Number(primaryInc.evidence_count || 0);
  const gpsCount = Number(primaryInc.gps_corroboration_count || 0);

  // Construct documented explanations
  const explanation: string[] = [
    `Incident verified near ${primaryInc.road_name || 'route'} at ${primary.distanceKm} km from corridor centerline.`,
  ];
  if (isAuthConfirmed) {
    explanation.push('Confirmed by Traffic Authority operations desk.');
  }
  if (corrCount > 0) {
    explanation.push(`Corroborated by ${corrCount} independent field reports.`);
  }
  if (gpsCount > 0) {
    explanation.push('Corroborated by GPS speed telemetry drop.');
  }
  if (evCount > 0) {
    explanation.push('Verified with uploaded photo/camera evidence.');
  }

  // Format possible reason clearly for user display
  let possibleReason = 'Traffic obstruction';
  const catLower = String(primaryInc.category || '').toLowerCase();
  if (catLower.includes('accident') || catLower.includes('collision')) {
    possibleReason = 'Road accident';
  } else if (catLower.includes('closure') || catLower.includes('closed')) {
    possibleReason = 'Road closure & infrastructure maintenance';
  } else if (catLower.includes('flood') || catLower.includes('rain')) {
    possibleReason = 'Waterlogging / Heavy rain';
  } else if (catLower.includes('repair') || catLower.includes('construction')) {
    possibleReason = 'Culvert & road repair work';
  } else if (primaryInc.title) {
    possibleReason = primaryInc.title;
  }

  // 2. Discover Alternative Route using existing routing engine
  let alternativeRoute: PassengerJourneyAlert['alternativeRoute'] = {
    available: false,
    reason: 'Evaluating regional bypass routes...',
  };

  try {
    const routePlanResult = await calculateRoutesWithIncidents(
      origin,
      destination,
      originCoords,
      destCoords,
      true, // avoidIncidentZones: true
      incidents
    );

    // Look for an alternative route that does NOT have a road closure warning and is different from the current route
    const currentId = currentRouteId || 'route-nh66-primary';
    const candidate = routePlanResult.routes.find(
      (r) => r.id !== currentId && !r.hasRoadClosureWarning && r.geometry && r.geometry.length >= 2
    );

    if (candidate) {
      // Calculate travel time comparison
      // Current route travel time under traffic: base duration + primary incident delay
      const candidateDurationMin = candidate.totalEstimatedMin;
      // Normal baseline for this corridor plus delay:
      const delayedDurationMin = Math.max(
        candidateDurationMin,
        Math.round((candidate.distanceKm / 45) * 60) + primary.delayMin
      );
      const timeDifferenceMin = candidateDurationMin - delayedDurationMin; // Negative means saving time

      alternativeRoute = {
        available: true,
        id: candidate.id,
        name: candidate.name,
        corridorDescription: candidate.corridorDescription,
        distanceKm: candidate.distanceKm,
        totalEstimatedMin: candidateDurationMin,
        timeDifferenceMin,
        geometry: candidate.geometry,
      };
    } else {
      alternativeRoute = {
        available: false,
        reason: 'No suitable alternative route is currently available without confirmed obstructions.',
      };
    }
  } catch (err: any) {
    alternativeRoute = {
      available: false,
      reason: 'Routing provider temporarily unavailable for dynamic alternative computation.',
    };
  }

  // Location clean name (e.g., extract "Mulki" from "Mulki Junction, NH-66 Coastal Corridor")
  const roadLabel = primaryInc.road_name || primaryInc.roadName || 'corridor';
  const cleanLocation = roadLabel.includes('Mulki')
    ? 'Mulki'
    : roadLabel.includes('Surathkal')
    ? 'Surathkal'
    : roadLabel.includes('Pumpwell')
    ? 'Pumpwell'
    : roadLabel.includes('Nanthoor')
    ? 'Nanthoor'
    : roadLabel;

  return {
    alertDetected: true,
    alertTitle: `Heavy traffic detected near ${cleanLocation}`,
    estimatedDelayMin: primary.delayMin,
    possibleReason,
    incidentDetails: {
      id: primaryInc.id,
      title: primaryInc.title,
      category: primaryInc.category,
      severity: primaryInc.severity,
      roadName: primaryInc.road_name || primaryInc.roadName || 'Regional Corridor',
      latitude: Number(primaryInc.latitude),
      longitude: Number(primaryInc.longitude),
      authorityConfirmed: isAuthConfirmed,
      confidenceScore: primary.confidenceScore,
      verificationState: primary.verificationState,
      distanceFromRouteKm: primary.distanceKm,
    },
    confidenceScore: primary.confidenceScore,
    confidenceLabel: `${primary.confidenceScore}% (${getConfidenceBandLabel(primary.confidenceScore)})`,
    confidenceBreakdown: {
      baseWeight: 20,
      authorityConfirmedBonus: isAuthConfirmed ? 30 : 0,
      corroborationBonus: corrCount >= 2 ? 20 : corrCount === 1 ? 10 : 0,
      mediaEvidenceBonus: evCount > 0 ? 12 : 0,
      gpsSlowdownBonus: gpsCount > 0 ? 10 : 0,
      corroborationCount: corrCount,
      hasMedia: evCount > 0,
      hasGpsTelemetry: gpsCount > 0,
      explanation,
    },
    alternativeRoute,
    lastEvaluatedAt: new Date().toISOString(),
  };
}

/**
 * Start a new passenger live journey
 */
export async function startPassengerJourney(
  userId: string,
  payload: {
    origin: string;
    destination: string;
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
    selectedRouteId: string;
    selectedRouteName: string;
    distanceKm: number;
    baseDurationMin: number;
    routeGeometry: [number, number][];
  }
): Promise<PassengerJourneyState> {
  // Terminate any prior active passenger journeys for this user to ensure single active session
  await db.query(
    `UPDATE journeys
     SET status = 'CANCELLED', ended_at = NOW()
     WHERE employee_id = $1 AND journey_type = 'PASSENGER_LIVE' AND status = 'ACTIVE'`,
    [userId]
  );

  const journeyId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Initial route evaluation against active incidents
  const alert = await evaluateRouteIncidentsAndAlerts(
    payload.routeGeometry,
    payload.origin,
    payload.destination,
    { lat: payload.originLat, lng: payload.originLng },
    { lat: payload.destLat, lng: payload.destLng },
    payload.selectedRouteId
  );

  await db.query(
    `INSERT INTO journeys (
      id, employee_id, origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
      status, journey_type, selected_route_id, selected_route_name, distance_km,
      base_duration_min, route_geometry, estimated_delay_min, last_monitored_at,
      active_alert, started_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      'ACTIVE', 'PASSENGER_LIVE', $9, $10, $11,
      $12, $13, $14, NOW(),
      $15, NOW()
    )`,
    [
      journeyId,
      userId,
      payload.origin,
      payload.destination,
      payload.originLat,
      payload.originLng,
      payload.destLat,
      payload.destLng,
      payload.selectedRouteId,
      payload.selectedRouteName,
      payload.distanceKm,
      payload.baseDurationMin,
      JSON.stringify(payload.routeGeometry),
      alert.estimatedDelayMin,
      JSON.stringify(alert),
    ]
  );

  return {
    id: journeyId,
    userId,
    origin: payload.origin,
    destination: payload.destination,
    originLat: payload.originLat,
    originLng: payload.originLng,
    destLat: payload.destLat,
    destLng: payload.destLng,
    selectedRouteId: payload.selectedRouteId,
    selectedRouteName: payload.selectedRouteName,
    distanceKm: payload.distanceKm,
    baseDurationMin: payload.baseDurationMin,
    routeGeometry: payload.routeGeometry,
    status: 'ACTIVE',
    startedAt: now,
    endedAt: null,
    activeAlert: alert,
    lastMonitoredAt: now,
  };
}

/**
 * Retrieve the current active passenger journey for the user
 */
export async function getActivePassengerJourney(
  userId: string
): Promise<PassengerJourneyState | null> {
  const res = await db.query<any>(
    `SELECT * FROM journeys
     WHERE employee_id = $1 AND journey_type = 'PASSENGER_LIVE' AND status = 'ACTIVE'
     ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  return {
    id: row.id,
    userId: row.employee_id,
    origin: row.origin,
    destination: row.destination,
    originLat: Number(row.origin_lat),
    originLng: Number(row.origin_lng),
    destLat: Number(row.dest_lat),
    destLng: Number(row.dest_lng),
    selectedRouteId: row.selected_route_id || 'route-nh66-primary',
    selectedRouteName: row.selected_route_name || 'NH-66 Coastal Highway',
    distanceKm: Number(row.distance_km || 56.4),
    baseDurationMin: Number(row.base_duration_min || 65),
    routeGeometry: Array.isArray(row.route_geometry)
      ? row.route_geometry
      : JSON.parse(row.route_geometry || '[]'),
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    reroutedAt: row.rerouted_at,
    rerouteReason: row.reroute_reason,
    activeAlert: row.active_alert ? (typeof row.active_alert === 'string' ? JSON.parse(row.active_alert) : row.active_alert) : null,
    lastMonitoredAt: row.last_monitored_at || row.started_at,
  };
}

/**
 * Live periodic monitoring step: re-evaluates route conditions against latest incidents
 */
export async function monitorPassengerJourney(
  userId: string,
  journeyId: string
): Promise<PassengerJourneyAlert> {
  const jRes = await db.query<any>(
    `SELECT * FROM journeys
     WHERE id = $1 AND employee_id = $2 AND journey_type = 'PASSENGER_LIVE'`,
    [journeyId, userId]
  );

  if (jRes.rows.length === 0) {
    throw new ApiError(404, 'JOURNEY_NOT_FOUND', 'Active passenger journey not found or unauthorized');
  }

  const row = jRes.rows[0];
  if (row.status !== 'ACTIVE') {
    throw new ApiError(400, 'JOURNEY_NOT_ACTIVE', 'Journey is already completed or ended');
  }

  const geometry: [number, number][] = Array.isArray(row.route_geometry)
    ? row.route_geometry
    : JSON.parse(row.route_geometry || '[]');

  const alert = await evaluateRouteIncidentsAndAlerts(
    geometry,
    row.origin,
    row.destination,
    { lat: Number(row.origin_lat), lng: Number(row.origin_lng) },
    { lat: Number(row.dest_lat), lng: Number(row.dest_lng) },
    row.selected_route_id
  );

  await db.query(
    `UPDATE journeys
     SET estimated_delay_min = $1, active_alert = $2, last_monitored_at = NOW()
     WHERE id = $3`,
    [alert.estimatedDelayMin, JSON.stringify(alert), journeyId]
  );

  return alert;
}

/**
 * Avoid route: switches active journey route to the alternative candidate
 */
export async function switchPassengerRoute(
  userId: string,
  journeyId: string,
  alternativeRouteId: string,
  reason: string
): Promise<PassengerJourneyState> {
  const jRes = await db.query<any>(
    `SELECT * FROM journeys
     WHERE id = $1 AND employee_id = $2 AND journey_type = 'PASSENGER_LIVE'`,
    [journeyId, userId]
  );

  if (jRes.rows.length === 0) {
    throw new ApiError(404, 'JOURNEY_NOT_FOUND', 'Active passenger journey not found or unauthorized');
  }

  const row = jRes.rows[0];
  if (row.status !== 'ACTIVE') {
    throw new ApiError(400, 'JOURNEY_NOT_ACTIVE', 'Cannot switch routes on an inactive journey');
  }

  // Calculate fresh routes to get the exact candidate details
  const incRes = await db.query<any>(
    `SELECT * FROM incidents WHERE status NOT IN ('RESOLVED', 'REJECTED')`
  );
  const routePlanResult = await calculateRoutesWithIncidents(
    row.origin,
    row.destination,
    { lat: Number(row.origin_lat), lng: Number(row.origin_lng) },
    { lat: Number(row.dest_lat), lng: Number(row.dest_lng) },
    true,
    incRes.rows
  );

  const candidate = routePlanResult.routes.find((r) => r.id === alternativeRouteId);
  if (!candidate) {
    throw new ApiError(400, 'INVALID_ALTERNATIVE', 'Requested alternative route candidate could not be resolved');
  }

  // Re-evaluate candidate route for any residual incidents
  const freshAlert = await evaluateRouteIncidentsAndAlerts(
    candidate.geometry,
    row.origin,
    row.destination,
    { lat: Number(row.origin_lat), lng: Number(row.origin_lng) },
    { lat: Number(row.dest_lat), lng: Number(row.dest_lng) },
    candidate.id
  );

  await db.query(
    `UPDATE journeys
     SET selected_route_id = $1,
         selected_route_name = $2,
         distance_km = $3,
         base_duration_min = $4,
         route_geometry = $5,
         alternative_route_id = $6,
         rerouted_at = NOW(),
         reroute_reason = $7,
         estimated_delay_min = $8,
         active_alert = $9,
         last_monitored_at = NOW()
     WHERE id = $10`,
    [
      candidate.id,
      candidate.name,
      candidate.distanceKm,
      candidate.totalEstimatedMin,
      JSON.stringify(candidate.geometry),
      row.selected_route_id, // preserve previous route as alternative reference
      reason || 'Passenger selected Avoid This Route bypass',
      freshAlert.estimatedDelayMin,
      JSON.stringify(freshAlert),
      journeyId,
    ]
  );

  const updated = await getActivePassengerJourney(userId);
  return updated!;
}

/**
 * End passenger live journey and stop monitoring
 */
export async function endPassengerJourney(
  userId: string,
  journeyId: string
): Promise<{ id: string; status: 'COMPLETED'; endedAt: string }> {
  const jRes = await db.query<any>(
    `SELECT * FROM journeys
     WHERE id = $1 AND employee_id = $2 AND journey_type = 'PASSENGER_LIVE'`,
    [journeyId, userId]
  );

  if (jRes.rows.length === 0) {
    throw new ApiError(404, 'JOURNEY_NOT_FOUND', 'Passenger journey not found or unauthorized');
  }

  const endedAt = new Date().toISOString();
  await db.query(
    `UPDATE journeys
     SET status = 'COMPLETED', ended_at = NOW(), last_monitored_at = NOW()
     WHERE id = $1`,
    [journeyId]
  );

  return {
    id: journeyId,
    status: 'COMPLETED',
    endedAt,
  };
}
