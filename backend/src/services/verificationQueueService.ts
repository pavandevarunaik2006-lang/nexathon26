import { db } from '../db/index.js';
import crypto from 'crypto';
import {
  LIFELINE_HOSPITALS,
  CORRIDOR_GRAPH_EDGES,
  type CriticalVerificationItem,
  type IncidentTrustState,
} from '@roadalert/shared';
import { haversineDistanceKm } from './verificationEngine.js';
import { findClosestEdgeForIncident } from './lifelineReachabilityService.js';

/**
 * Feature 2: Decision-Critical Verification Queue Service
 * Ranks unverified and pending incident reports by their potential threat
 * to lifeline hospital access, emergency routing, and corridor resilience.
 */
export async function getDecisionCriticalVerificationQueue(): Promise<CriticalVerificationItem[]> {
  const incRes = await db.query<any>(
    `SELECT i.*,
            (SELECT COUNT(*) FROM incident_corroborations ic WHERE ic.incident_id = i.id AND ic.corroboration_type != 'DISPUTE') as corr_count,
            (SELECT COUNT(*) FROM incident_corroborations ic WHERE ic.incident_id = i.id AND ic.corroboration_type = 'DISPUTE') as disp_count,
            (SELECT COUNT(*) FROM incident_evidences ie WHERE ie.incident_id = i.id) as evid_count
     FROM incidents i
     WHERE i.status NOT IN ('RESOLVED', 'REJECTED', 'VERIFIED')
     ORDER BY i.reported_at DESC`
  );

  const incidents = incRes.rows || [];
  const nowMs = Date.now();
  const queueItems: CriticalVerificationItem[] = [];

  for (const inc of incidents) {
    const lat = Number(inc.latitude);
    const lng = Number(inc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const reportedAtMs = new Date(inc.reported_at).getTime();
    const ageMinutes = Math.max(0, Math.round((nowMs - reportedAtMs) / 60_000));
    const confidenceScore = Number(inc.confidence_score ?? 25);
    const corrCount = Number(inc.corr_count || 0);
    const dispCount = Number(inc.disp_count || 0);
    const evidCount = Number(inc.evid_count || 0);

    // Compute trust state
    let trustState: IncidentTrustState = 'UNVERIFIED';
    if (inc.status === 'VERIFIED' || inc.authority_confirmed || confidenceScore >= 70) {
      trustState = 'CONFIRMED';
    } else if (confidenceScore >= 45 || corrCount >= 2) {
      trustState = 'LIKELY';
    } else if (ageMinutes > 180 && corrCount === 0) {
      trustState = 'EXPIRED';
    }

    const priorityReasons: string[] = [];
    let priorityScore = 0;

    // 1. Proximity to Lifeline Hospitals (up to 35 pts)
    const threatenedHospitals: string[] = [];
    let closestHospitalDist = Infinity;
    let closestHospitalName = '';

    for (const hosp of LIFELINE_HOSPITALS) {
      const dist = haversineDistanceKm(lat, lng, hosp.lat, hosp.lng);
      if (dist < closestHospitalDist) {
        closestHospitalDist = dist;
        closestHospitalName = hosp.shortName;
      }
      if (dist <= 3.5) {
        threatenedHospitals.push(hosp.shortName);
      }
    }

    if (closestHospitalDist <= 2.0) {
      priorityScore += 35;
      priorityReasons.push(`Immediate proximity to ${closestHospitalName} (${closestHospitalDist.toFixed(1)} km)`);
    } else if (closestHospitalDist <= 4.0) {
      priorityScore += 25;
      priorityReasons.push(`Located within key access zone for ${closestHospitalName} (${closestHospitalDist.toFixed(1)} km)`);
    } else if (threatenedHospitals.length > 0) {
      priorityScore += 18;
      priorityReasons.push(`Intersects arterial approach for ${threatenedHospitals.join(', ')}`);
    }

    // 2. Chokepoint / Critical Bridge Corridor Risk (up to 25 pts)
    const matchedEdgeId = findClosestEdgeForIncident(lat, lng, inc.road_name);
    let matchedEdge = matchedEdgeId ? CORRIDOR_GRAPH_EDGES.find((e) => e.id === matchedEdgeId) : null;

    if (matchedEdge) {
      if (matchedEdge.isBridgeOrEstuary) {
        priorityScore += 25;
        priorityReasons.push(`Located on critical bridge/estuary crossing: ${matchedEdge.roadName}`);
      } else if (matchedEdge.fragilityCriticality >= 80) {
        priorityScore += 20;
        priorityReasons.push(`Sits on high-fragility highway bottleneck: ${matchedEdge.roadName}`);
      } else if (matchedEdge.isPrimaryCorridor) {
        priorityScore += 14;
        priorityReasons.push(`Affects primary highway spine (${matchedEdge.corridorCode})`);
      }
    }

    // 3. Category & Stated Impact Risk (up to 20 pts)
    const cat = String(inc.category || '').toUpperCase();
    const sev = String(inc.severity || '').toUpperCase();
    const isClosureReported = Boolean(inc.road_closed) || cat.includes('CLOSURE') || cat.includes('LANDSLIDE');

    if (isClosureReported) {
      priorityScore += 20;
      priorityReasons.push('Report indicates physical road obstruction or total closure');
    } else if (sev === 'CRITICAL' || cat === 'ACCIDENT_MAJOR' || cat === 'FLOODING') {
      priorityScore += 15;
      priorityReasons.push(`High-severity category: ${inc.category} (${inc.severity})`);
    } else if (sev === 'HIGH') {
      priorityScore += 10;
    }

    // 4. Evidence Momentum & Freshness (up to 20 pts)
    if (corrCount >= 3) {
      priorityScore += 12;
      priorityReasons.push(`High commuter corroboration (${corrCount} independent confirmations)`);
    } else if (corrCount >= 1) {
      priorityScore += 6;
      priorityReasons.push(`Corroborated by ${corrCount} commuter report`);
    }

    if (evidCount > 0) {
      priorityScore += 5;
      priorityReasons.push(`${evidCount} validated photo/telemetry evidence attached`);
    }

    if (ageMinutes <= 15) {
      priorityScore += 8;
      priorityReasons.push(`Fresh incident reported ${ageMinutes} min ago`);
    } else if (ageMinutes <= 45) {
      priorityScore += 5;
    } else if (ageMinutes > 120 && corrCount === 0) {
      priorityScore -= 10; // Stale uncorroborated penalty
    }

    if (dispCount >= 2) {
      priorityScore -= 15;
      priorityReasons.push(`Disputed by ${dispCount} distinct commuters`);
    }

    // Clamp score
    priorityScore = Math.max(5, Math.min(100, Math.round(priorityScore)));

    // Priority Band
    let priorityBand: CriticalVerificationItem['priorityBand'] = 'ROUTINE';
    if (priorityScore >= 75) {
      priorityBand = 'URGENT_EMERGENCY_IMPACT';
    } else if (priorityScore >= 55) {
      priorityBand = 'HIGH_CORRIDOR_RISK';
    } else if (priorityScore >= 35) {
      priorityBand = 'MEDIUM';
    }

    // Suggested Action
    let suggestedAction: CriticalVerificationItem['suggestedAction'] = 'REQUEST_MORE_EVIDENCE';
    if (dispCount >= 2 && confidenceScore < 35) {
      suggestedAction = 'DISPUTE_REPORT';
    } else if (isClosureReported && (corrCount >= 2 || evidCount > 0 || priorityScore >= 75)) {
      suggestedAction = 'CONFIRM_ROAD_CLOSURE';
    } else if (confidenceScore >= 50 || corrCount >= 2) {
      suggestedAction = 'VERIFY_PASSABLE';
    }

    const lifelineThreat = threatenedHospitals.length > 0 || (matchedEdge ? matchedEdge.fragilityCriticality >= 75 : false);

    queueItems.push({
      id: `queue-${inc.id}`,
      incidentId: inc.id,
      title: inc.title || 'Traffic Incident',
      category: inc.category,
      severity: inc.severity,
      roadName: inc.road_name || (matchedEdge ? matchedEdge.roadName : 'Corridor Segment'),
      latitude: lat,
      longitude: lng,
      reportedAt: inc.reported_at,
      confidenceScore,
      trustState,
      priorityScore,
      priorityBand,
      priorityReasons,
      lifelineThreat,
      threatenedHospitals,
      suggestedAction,
    });
  }

  // Sort queue by priority score descending
  queueItems.sort((a, b) => b.priorityScore - a.priorityScore);
  return queueItems;
}

/**
 * Perform quick operator action on a verification queue item
 */
export async function executeQueueAction(
  incidentId: string,
  action: 'CONFIRM_ROAD_CLOSURE' | 'VERIFY_PASSABLE' | 'DISPUTE_REPORT' | 'REQUEST_MORE_EVIDENCE',
  actorId?: string,
  notes?: string
) {
  const incRes = await db.query<any>(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
  if (incRes.rows.length === 0) {
    throw new Error('Incident not found');
  }
  const inc = incRes.rows[0];

  let newStatus = inc.status;
  let newConfidence = Number(inc.confidence_score || 30);
  let newRoadClosed = Boolean(inc.road_closed);
  let authorityConfirmed = Boolean(inc.authority_confirmed);

  if (action === 'CONFIRM_ROAD_CLOSURE') {
    newStatus = 'VERIFIED';
    newConfidence = Math.max(90, newConfidence);
    newRoadClosed = true;
    authorityConfirmed = true;
  } else if (action === 'VERIFY_PASSABLE') {
    newStatus = 'VERIFIED';
    newConfidence = Math.max(75, newConfidence);
    newRoadClosed = false;
    authorityConfirmed = true;
  } else if (action === 'DISPUTE_REPORT') {
    newStatus = 'REJECTED';
    newConfidence = Math.min(15, newConfidence);
    newRoadClosed = false;
  } else if (action === 'REQUEST_MORE_EVIDENCE') {
    newStatus = 'UNDER_REVIEW';
  }

  await db.query(
    `UPDATE incidents
     SET status = $1,
         confidence_score = $2,
         road_closed = $3,
         authority_confirmed = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [newStatus, newConfidence, newRoadClosed, authorityConfirmed, incidentId]
  );

  // Insert audit record
  await db.query(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      crypto.randomUUID(),
      actorId || null,
      `QUEUE_ACTION:${action}`,
      'INCIDENT',
      incidentId,
      JSON.stringify({
        action,
        notes: notes || 'Reviewed via Decision-Critical Queue',
        previousStatus: inc.status,
        newStatus,
        roadClosed: newRoadClosed,
      }),
    ]
  );

  return {
    incidentId,
    action,
    newStatus,
    newConfidence,
    newRoadClosed,
    authorityConfirmed,
  };
}
