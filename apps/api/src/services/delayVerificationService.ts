import crypto from 'crypto';
import { db } from '../db/index.js';
import { haversineDistanceKm } from './verificationEngine.js';
import {
  DelayVerificationEvaluation,
  DelayVerificationStatus,
  JourneyDisplayStatus,
} from '@roadalert/shared';

export interface EvaluateDelayOptions {
  journeyId: string;
  organizationId?: string;
  forceReevaluate?: boolean;
}

/**
 * Evidence-Based Delay Verification Service
 * Evaluates whether an employee's commute delay was caused by verified traffic/road closures
 * or remains unverified / not traffic-related.
 * Strictly adheres to truthfulness: does not claim GPS proves dwell time unless checkpoints support it.
 */
export async function evaluateJourneyDelay(
  options: EvaluateDelayOptions
): Promise<DelayVerificationEvaluation> {
  const { journeyId, organizationId } = options;

  // 1. Fetch Journey record
  const jRes = await db.query<any>(
    `SELECT j.*, u.name as employee_name, u.email as employee_email,
            tc.organization_id, tc.share_precise_coords, tc.revoked_at
     FROM journeys j
     JOIN users u ON u.id = j.employee_id
     JOIN tracking_consents tc ON tc.id = j.consent_record_id
     WHERE j.id = $1`,
    [journeyId]
  );

  if (jRes.rows.length === 0) {
    throw new Error('Journey not found');
  }

  const j = jRes.rows[0];

  if (organizationId && j.organization_id !== organizationId) {
    throw new Error('ORGANIZATION_ISOLATION_VIOLATION');
  }

  // Check if evaluation already exists and not forced
  if (!options.forceReevaluate) {
    const existingVer = await db.query<any>(
      `SELECT * FROM delay_verifications WHERE journey_id = $1 ORDER BY verified_at DESC LIMIT 1`,
      [journeyId]
    );
    if (existingVer.rows.length > 0) {
      const v = existingVer.rows[0];
      return {
        id: v.id,
        journeyId: v.journey_id,
        organizationId: v.organization_id,
        employeeId: v.employee_id,
        employeeName: j.employee_name,
        verificationStatus: v.verification_status as DelayVerificationStatus,
        journeyStatus: v.journey_status as JourneyDisplayStatus,
        delayMinutes: Number(v.delay_minutes),
        incidentIds: Array.isArray(v.incident_ids) ? v.incident_ids : JSON.parse(v.incident_ids || '[]'),
        incidentDetails: Array.isArray(v.incident_details) ? v.incident_details : JSON.parse(v.incident_details || '[]'),
        journeyWindowStart: v.journey_window_start,
        journeyWindowEnd: v.journey_window_end,
        evidenceSummary: v.evidence_summary,
        conclusionText: v.conclusion_text,
        verificationMethod: v.verification_method,
        spatialIntersection: Boolean(v.spatial_intersection),
        temporalIntersection: Boolean(v.temporal_intersection),
        gpsObservationSummary: v.gps_observation_summary,
        speedDropDetected: Boolean(v.speed_drop_detected),
        missingEvidenceFactors: Array.isArray(v.missing_evidence_factors)
          ? v.missing_evidence_factors
          : JSON.parse(v.missing_evidence_factors || '[]'),
        verifiedAt: v.verified_at,
      };
    }
  }

  // 2. Fetch Checkpoints
  const cpRes = await db.query<any>(
    `SELECT * FROM journey_checkpoints WHERE journey_id = $1 ORDER BY recorded_at ASC`,
    [journeyId]
  );
  const checkpoints = cpRes.rows;

  const journeyStart = new Date(j.started_at);
  const journeyEnd = j.ended_at ? new Date(j.ended_at) : new Date();

  // Search window: incidents occurring up to 4 hours before journey start, or during journey
  const windowStart = new Date(journeyStart.getTime() - 4 * 3600 * 1000);
  const windowEnd = new Date(journeyEnd.getTime() + 1 * 3600 * 1000);

  // 3. Fetch Incidents active around this window
  const incRes = await db.query<any>(
    `SELECT id, title, description, category, severity, road_name, confidence_score,
            verification_level, authority_confirmed, road_closed, estimated_delay_minutes,
            latitude, longitude, occurrence_time, reported_at, status, demo_data
     FROM incidents
     WHERE status NOT IN ('REJECTED')
       AND occurrence_time <= $1
       AND reported_at >= $2`,
    [windowEnd.toISOString(), windowStart.toISOString()]
  );

  const candidateIncidents = incRes.rows;

  // 4. Corridor bounds
  const originLat = Number(j.origin_lat ?? 12.8669);
  const originLng = Number(j.origin_lng ?? 74.8692);
  const destLat = Number(j.dest_lat ?? 13.3409);
  const destLng = Number(j.dest_lng ?? 74.7351);

  const minLat = Math.min(originLat, destLat) - 0.05;
  const maxLat = Math.max(originLat, destLat) + 0.05;
  const minLng = Math.min(originLng, destLng) - 0.06;
  const maxLng = Math.max(originLng, destLng) + 0.06;

  // Intersect candidate incidents with corridor
  interface MatchedIncident {
    incident: any;
    distanceKm: number;
    inZoneCheckpoints: any[];
    speedDrop: boolean;
    temporalMatch: boolean;
  }

  const matchedIncidents: MatchedIncident[] = [];

  for (const inc of candidateIncidents) {
    const incLat = Number(inc.latitude);
    const incLng = Number(inc.longitude);

    // Bounding box check
    const inBBox =
      incLat >= minLat && incLat <= maxLat && incLng >= minLng && incLng <= maxLng;

    // Check distance to route checkpoints if any
    let minCpDist = Infinity;
    const inZoneCps: any[] = [];
    let hasSpeedDrop = false;

    for (const cp of checkpoints) {
      const dist = haversineDistanceKm(Number(cp.latitude), Number(cp.longitude), incLat, incLng);
      if (dist < minCpDist) minCpDist = dist;
      if (dist <= 3.0) {
        inZoneCps.push(cp);
        if (Number(cp.speed) <= 20) {
          hasSpeedDrop = true;
        }
      }
    }

    // Distance to direct line or corridor anchor
    const distToOrigin = haversineDistanceKm(originLat, originLng, incLat, incLng);
    const distToDest = haversineDistanceKm(destLat, destLng, incLat, incLng);
    const directDist = haversineDistanceKm(originLat, originLng, destLat, destLng);
    const corridorDetour = distToOrigin + distToDest - directDist;
    const isCorridorLineMatch = corridorDetour <= 8.0; // Within corridor ellipse

    const isSpatiallyRelevant = inBBox || isCorridorLineMatch || minCpDist <= 3.5;

    // Temporal check
    const incOccur = new Date(inc.occurrence_time);
    const temporalMatch =
      incOccur.getTime() >= windowStart.getTime() && incOccur.getTime() <= windowEnd.getTime();

    if (isSpatiallyRelevant && temporalMatch) {
      matchedIncidents.push({
        incident: inc,
        distanceKm: minCpDist === Infinity ? Math.min(distToOrigin, distToDest) : minCpDist,
        inZoneCheckpoints: inZoneCps,
        speedDrop: hasSpeedDrop,
        temporalMatch: true,
      });
    }
  }

  // Sort matched incidents by confidence score descending, then road closed
  matchedIncidents.sort((a, b) => {
    if (a.incident.road_closed && !b.incident.road_closed) return -1;
    if (!a.incident.road_closed && b.incident.road_closed) return 1;
    return Number(b.incident.confidence_score) - Number(a.incident.confidence_score);
  });

  // 5. Verification status determination
  let verificationStatus: DelayVerificationStatus = 'UNVERIFIED';
  let journeyStatus: JourneyDisplayStatus = 'Normal';
  let conclusionText = '';
  let evidenceSummary = '';
  let gpsObservationSummary: string | null = null;
  let speedDropDetected = false;
  const missingEvidenceFactors: string[] = [];

  const estimatedDelayMin = Number(j.estimated_delay_min || 0);
  const reportedDelayMin = estimatedDelayMin > 0 ? estimatedDelayMin : Number(j.verified_delay_min || 0);

  // Check if journey was normal with zero delay
  if (reportedDelayMin <= 5 && matchedIncidents.length === 0) {
    verificationStatus = 'VERIFIED';
    journeyStatus = j.status === 'COMPLETED' ? 'Completed' : 'Normal';
    conclusionText = `On-time journey completed along ${j.origin} → ${j.destination} corridor. No verified traffic disruptions or roadblocks detected.`;
    evidenceSummary = 'Normal traffic flow; no delays recorded.';
    if (checkpoints.length > 0) {
      gpsObservationSummary = `${checkpoints.length} GPS checkpoint(s) logged normal highway transit.`;
    }
  } else if (matchedIncidents.length > 0) {
    const topMatch = matchedIncidents[0];
    const inc = topMatch.incident;
    speedDropDetected = topMatch.speedDrop;

    // Check if incident is a road closure
    if (inc.road_closed) {
      journeyStatus = 'Road Block';
    } else if (Number(inc.confidence_score) >= 60 || inc.category === 'Flood/waterlogging' || inc.category === 'Heavy traffic') {
      journeyStatus = 'Traffic';
    } else {
      journeyStatus = 'Delayed';
    }

    const incTimeStr = new Date(inc.occurrence_time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const repTimeStr = new Date(inc.reported_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (topMatch.inZoneCheckpoints.length >= 1 && speedDropDetected) {
      // FULLY VERIFIED WITH GPS TELEMETRY
      verificationStatus = 'VERIFIED';
      if (topMatch.inZoneCheckpoints.length >= 2) {
        const dwellStart = new Date(topMatch.inZoneCheckpoints[0].recorded_at).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const dwellEnd = new Date(
          topMatch.inZoneCheckpoints[topMatch.inZoneCheckpoints.length - 1].recorded_at
        ).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        gpsObservationSummary = `${topMatch.inZoneCheckpoints.length} GPS telemetry observation(s) indicate speed dropped to under 20 km/h within the affected corridor zone.`;
        conclusionText = `${inc.category} detected at ${inc.road_name} from ${incTimeStr} to ${repTimeStr} (+${inc.estimated_delay_minutes} min delay). Available employee GPS observations indicate that the employee remained within the affected zone from ${dwellStart} to ${dwellEnd} during this period.`;
      } else {
        const obsTime = new Date(topMatch.inZoneCheckpoints[0].recorded_at).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        gpsObservationSummary = `GPS telemetry observation logged at ${obsTime} indicates speed dropped to ${topMatch.inZoneCheckpoints[0].speed} km/h within the affected corridor zone.`;
        conclusionText = `${inc.category} detected at ${inc.road_name} from ${incTimeStr} to ${repTimeStr} (+${inc.estimated_delay_minutes} min delay). Available employee GPS observations indicate that the employee encountered the congestion zone at ${obsTime} during this period.`;
      }
      evidenceSummary = `Verified traffic delay: Corroborated by ${inc.title} (Confidence: ${inc.confidence_score}/100) and consented GPS slow-speed telemetry.`;
    } else if (Number(inc.confidence_score) >= 60 || inc.authority_confirmed || inc.road_closed) {
      // PARTIALLY VERIFIED: Incident is high confidence or authority confirmed, but GPS in-zone observation is missing or sparse
      verificationStatus = 'PARTIALLY_VERIFIED';
      if (checkpoints.length === 0) {
        missingEvidenceFactors.push('Employee commute session has no recorded GPS checkpoints (privacy redaction or telemetry off).');
        gpsObservationSummary = 'No GPS checkpoints recorded for this commute session.';
      } else {
        missingEvidenceFactors.push(
          `GPS telemetry available outside bottleneck, but no recorded slowdown samples within the ${inc.road_name} disruption perimeter.`
        );
        gpsObservationSummary = `${checkpoints.length} GPS checkpoint(s) logged on corridor, but none inside the incident bottleneck.`;
      }

      conclusionText = `Confirmed ${inc.category.toLowerCase()} reported at ${inc.road_name} (+${inc.estimated_delay_minutes} min delay, Confidence ${inc.confidence_score}/100). Corridor route intersects the affected area, but available GPS observations are insufficient to conclusively verify in-zone presence.`;
      evidenceSummary = `Partially verified: High-confidence incident on travel corridor, but GPS presence samples in bottleneck are sparse or absent.`;
    } else {
      // UNVERIFIED: Incident exists but low confidence or disputed
      verificationStatus = 'UNVERIFIED';
      journeyStatus = 'Delayed';
      missingEvidenceFactors.push(`Incident confidence score is only ${inc.confidence_score}/100 (below verified threshold of 60).`);
      missingEvidenceFactors.push('No independent GPS speed-drop signals confirming bottleneck.');
      conclusionText = `Unverified delay: Low-confidence report (${inc.title}) noted near ${inc.road_name}, but available evidence is insufficient to verify a traffic delay.`;
      evidenceSummary = `Unverified: Incident evidence is below required confidence threshold and lack corroborating GPS speed drops.`;
    }
  } else {
    // NO INCIDENTS MATCHED
    // Check if checkpoints indicate fast transit vs delay
    const avgSpeed =
      checkpoints.length > 0
        ? Math.round(checkpoints.reduce((acc: number, c: any) => acc + Number(c.speed || 0), 0) / checkpoints.length)
        : null;

    if (avgSpeed !== null && avgSpeed >= 40) {
      verificationStatus = 'NOT_TRAFFIC_RELATED';
      journeyStatus = 'Delayed';
      gpsObservationSummary = `GPS telemetry indicates average highway speed of ${avgSpeed} km/h throughout the commute route.`;
      conclusionText = `Not traffic-related: Available GPS observations show unimpeded travel (average ${avgSpeed} km/h) with zero recorded corridor roadblocks or incidents. Reported delay cannot be substantiated by traffic conditions.`;
      evidenceSummary = `Not traffic-related: Normal highway transit speeds logged with zero corridor incidents.`;
    } else {
      verificationStatus = 'UNVERIFIED';
      journeyStatus = reportedDelayMin > 0 ? 'Delayed' : 'Unknown';
      missingEvidenceFactors.push('No road incidents, closures, or congestion reported on corridor during travel window.');
      conclusionText = `Unverified delay: No traffic congestion, road closures, or hazardous incidents were reported along ${j.origin} → ${j.destination} during this travel window. Delay reason is unverified.`;
      evidenceSummary = `Unverified: Zero traffic disruptions recorded along commute corridor.`;
    }
  }

  const delayMinutes =
    verificationStatus === 'VERIFIED'
      ? Math.max(reportedDelayMin, matchedIncidents[0]?.incident?.estimated_delay_minutes || 15)
      : reportedDelayMin;

  const evaluationId = crypto.randomUUID();
  const verifiedAt = new Date().toISOString();

  const incidentIds = matchedIncidents.map((m) => m.incident.id);
  const incidentDetails = matchedIncidents.slice(0, 5).map((m) => ({
    id: m.incident.id,
    title: m.incident.title,
    category: m.incident.category,
    severity: m.incident.severity,
    roadName: m.incident.road_name,
    confidenceScore: Number(m.incident.confidence_score),
    estimatedDelayMinutes: Number(m.incident.estimated_delay_minutes || 15),
    authorityConfirmed: Boolean(m.incident.authority_confirmed),
    roadClosed: Boolean(m.incident.road_closed),
    distanceKm: Math.round(m.distanceKm * 10) / 10,
  }));

  // Upsert into delay_verifications table
  await db.query(
    `INSERT INTO delay_verifications (
      id, journey_id, organization_id, employee_id, verification_status, journey_status,
      delay_minutes, incident_ids, incident_details, journey_window_start, journey_window_end,
      evidence_summary, conclusion_text, verification_method, spatial_intersection,
      temporal_intersection, gps_observation_summary, speed_drop_detected,
      missing_evidence_factors, verified_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      evaluationId,
      journeyId,
      j.organization_id,
      j.employee_id,
      verificationStatus,
      journeyStatus,
      delayMinutes,
      JSON.stringify(incidentIds),
      JSON.stringify(incidentDetails),
      journeyStart.toISOString(),
      j.ended_at ? journeyEnd.toISOString() : null,
      evidenceSummary,
      conclusionText,
      'CORRIDOR_SPATIO_TEMPORAL_INTERSECTION',
      matchedIncidents.length > 0,
      matchedIncidents.length > 0,
      gpsObservationSummary,
      speedDropDetected,
      JSON.stringify(missingEvidenceFactors),
      verifiedAt,
    ]
  );

  // Update journeys table with verification result
  await db.query(
    `UPDATE journeys
     SET verification_status = $1,
         journey_display_status = $2,
         delay_evidence_summary = $3,
         verified_delay_min = $4,
         last_data_update_at = NOW()
     WHERE id = $5`,
    [verificationStatus, journeyStatus, conclusionText, delayMinutes, journeyId]
  );

  return {
    id: evaluationId,
    journeyId,
    organizationId: j.organization_id,
    employeeId: j.employee_id,
    employeeName: j.employee_name,
    verificationStatus,
    journeyStatus,
    delayMinutes,
    incidentIds,
    incidentDetails,
    journeyWindowStart: journeyStart.toISOString(),
    journeyWindowEnd: j.ended_at ? journeyEnd.toISOString() : null,
    evidenceSummary,
    conclusionText,
    verificationMethod: 'CORRIDOR_SPATIO_TEMPORAL_INTERSECTION',
    spatialIntersection: matchedIncidents.length > 0,
    temporalIntersection: matchedIncidents.length > 0,
    gpsObservationSummary,
    speedDropDetected,
    missingEvidenceFactors,
    verifiedAt,
  };
}
