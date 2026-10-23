import crypto from 'crypto';
import { db } from '../db/index.js';
import {
  ConfidenceBreakdown,
  getConfidenceBandLabel,
  VERIFICATION_LEVELS,
} from '@roadalert/shared';

/**
 * Haversine distance in kilometers between two coordinates
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Explainable Rule-Based Verification Engine (Section 10)
 *
 * Heuristic Weights (Normalized 0-100):
 * - Independent, distinct reports: up to 30 points
 * - Location and time proximity: up to 20 points
 * - Consented GPS/speed corroboration: up to 20 points
 * - Validated photo/video evidence: up to 15 points
 * - Authorized authority confirmation: up to 15 points
 *
 * Clearly labeled as a product confidence heuristic, never a guaranteed probability.
 */
export async function recalculateIncidentConfidence(
  incidentId: string,
  actorId?: string,
  auditTrigger?: string
): Promise<ConfidenceBreakdown> {
  const incRes = await db.query<any>(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
  if (incRes.rows.length === 0) {
    throw new Error('Incident not found');
  }
  const inc = incRes.rows[0];

  const corrRes = await db.query<any>(
    `SELECT * FROM incident_corroborations WHERE incident_id = $1`,
    [incidentId]
  );
  const evidRes = await db.query<any>(
    `SELECT * FROM incident_evidences WHERE incident_id = $1 AND validation_status = 'VALIDATED'`,
    [incidentId]
  );
  const revRes = await db.query<any>(
    `SELECT * FROM incident_reviews WHERE incident_id = $1 ORDER BY created_at DESC`,
    [incidentId]
  );

  // 1. Independent, distinct reports (max 30 points)
  // Primary reporter counts as 1 distinct reporter (base 10 pts).
  // Additional distinct user corroborations (excluding the primary reporter) add +10 pts each, up to 30 pts.
  // Disputes subtract 8 pts per distinct disputing user.
  const distinctCorroborators = new Set<string>();
  const distinctDisputers = new Set<string>();
  const gpsCorroborators = new Set<string>();
  let closeProximityCount = 0;

  for (const c of corrRes.rows) {
    if (c.corroboration_type === 'CORROBORATE') {
      if (c.user_id !== inc.reporter_id) {
        distinctCorroborators.add(c.user_id);
      }
      if (c.latitude != null && c.longitude != null) {
        const dist = haversineDistanceKm(
          Number(inc.latitude),
          Number(inc.longitude),
          Number(c.latitude),
          Number(c.longitude)
        );
        if (dist <= 2.5) {
          closeProximityCount++;
        }
      }
    } else if (c.corroboration_type === 'DISPUTE') {
      if (c.user_id !== inc.reporter_id) {
        distinctDisputers.add(c.user_id);
      }
    } else if (c.corroboration_type === 'GPS_CONGESTION') {
      gpsCorroborators.add(c.user_id);
      if (c.latitude != null && c.longitude != null) {
        const dist = haversineDistanceKm(
          Number(inc.latitude),
          Number(inc.longitude),
          Number(c.latitude),
          Number(c.longitude)
        );
        if (dist <= 2.5) {
          closeProximityCount++;
        }
      }
    }
  }

  const totalDistinctReporters = 1 + distinctCorroborators.size;
  const rawIndependentScore = Math.min(30, 10 + distinctCorroborators.size * 10);
  const disputePenalty = distinctDisputers.size * 8;
  const independentReports = Math.max(5, Math.min(30, rawIndependentScore - disputePenalty));

  // 2. Location and time proximity (max 20 points)
  // Base 10 points for valid regional coordinates + occurrence time within plausible window.
  // +5 pts per proximity-verified corroboration or location evidence, up to 20 pts.
  const locationEvidCount = evidRes.rows.filter(
    (e: any) => e.evidence_type === 'LOCATION_PROXIMITY'
  ).length;
  const locationTimeProximity = Math.min(
    20,
    10 + (closeProximityCount + locationEvidCount) * 5
  );

  // 3. Consented GPS/speed corroboration (max 20 points)
  const gpsEvidCount = evidRes.rows.filter(
    (e: any) => e.evidence_type === 'GPS_TELEMETRY'
  ).length;
  const totalGpsSignals = gpsCorroborators.size + gpsEvidCount;
  const gpsCorroboration = Math.min(20, totalGpsSignals * 10);

  // 4. Validated photo/video evidence (max 15 points)
  const mediaItems = evidRes.rows.filter(
    (e: any) => e.evidence_type === 'PHOTO' || e.evidence_type === 'VIDEO'
  );
  const mediaEvidence = mediaItems.length > 0 ? 15 : 0;

  // 5. Authorized traffic authority confirmation (max 15 points)
  const authorityConfirmed =
    Boolean(inc.authority_confirmed) ||
    revRes.rows.some((r: any) => r.decision === 'CONFIRM' || r.decision === 'MARK_ROAD_CLOSED');
  const authorityRejected = revRes.rows.some((r: any) => r.decision === 'REJECT');
  const authorityConfirmation = authorityConfirmed ? 15 : 0;

  let totalScore =
    independentReports +
    locationTimeProximity +
    gpsCorroboration +
    mediaEvidence +
    authorityConfirmation;

  if (authorityRejected) {
    totalScore = Math.min(totalScore, 15);
  }
  totalScore = Math.max(0, Math.min(100, totalScore));

  // Determine highest achieved Verification Level (1 to 6)
  let verificationLevel = 1;
  if (locationTimeProximity >= 15) verificationLevel = 2;
  if (totalDistinctReporters >= 2) verificationLevel = 3;
  if (gpsCorroboration >= 10) verificationLevel = 4;
  if (mediaEvidence >= 15) verificationLevel = 5;
  if (authorityConfirmed) verificationLevel = 6;

  const missingFactors: string[] = [];
  if (distinctCorroborators.size < 2) {
    missingFactors.push(
      `Needs ${2 - distinctCorroborators.size} more independent commuter report(s) for max report score (+${30 - independentReports} pts available)`
    );
  }
  if (gpsCorroboration < 20) {
    missingFactors.push(
      `Missing consented GPS/commute speed-drop telemetry (+${20 - gpsCorroboration} pts available)`
    );
  }
  if (mediaEvidence === 0) {
    missingFactors.push('No validated on-scene photo or video evidence attached (+15 pts available)');
  }
  if (!authorityConfirmed) {
    missingFactors.push('Awaiting Traffic Authority field or control-room confirmation (+15 pts available)');
  }

  const explanation: string[] = [
    `Primary report + ${distinctCorroborators.size} distinct independent corroboration(s): +${independentReports}/30 pts`,
    `Geospatial & timestamp proximity compatibility: +${locationTimeProximity}/20 pts`,
    `Consented commute GPS speed-drop corroboration (${totalGpsSignals} signal(s)): +${gpsCorroboration}/20 pts`,
    `Validated photo/video evidence (${mediaItems.length} attachment(s)): +${mediaEvidence}/15 pts`,
    `Authorized Traffic Authority confirmation: +${authorityConfirmation}/15 pts`,
  ];
  if (distinctDisputers.size > 0) {
    explanation.push(`Dispute adjustment (${distinctDisputers.size} dispute report(s)): -${disputePenalty} pts applied`);
  }

  // Update incident record
  let newStatus = inc.status;
  if (authorityRejected) {
    newStatus = 'REJECTED';
  } else if (inc.status !== 'RESOLVED') {
    if (authorityConfirmed || totalScore >= 75) {
      newStatus = 'VERIFIED';
    } else if (distinctDisputers.size >= 2 && totalScore < 40) {
      newStatus = 'DISPUTED';
    } else if (totalScore >= 50 && inc.status === 'REPORTED') {
      newStatus = 'UNDER_REVIEW';
    }
  }

  await db.query(
    `UPDATE incidents
     SET confidence_score = $1,
         verification_level = $2,
         authority_confirmed = $3,
         status = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [totalScore, verificationLevel, authorityConfirmed, newStatus, incidentId]
  );

  if (auditTrigger) {
    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        crypto.randomUUID(),
        actorId || null,
        `CONFIDENCE_RECALCULATED:${auditTrigger}`,
        'INCIDENT',
        incidentId,
        JSON.stringify({
          previousScore: inc.confidence_score,
          newScore: totalScore,
          verificationLevel,
          authorityConfirmed,
          status: newStatus,
        }),
      ]
    );
  }

  return {
    totalScore,
    band: getConfidenceBandLabel(totalScore),
    verificationLevel,
    verificationLevelLabel:
      VERIFICATION_LEVELS[verificationLevel as keyof typeof VERIFICATION_LEVELS] ||
      'Level 1: User reported',
    authorityConfirmed,
    components: {
      independentReports,
      locationTimeProximity,
      gpsCorroboration,
      mediaEvidence,
      authorityConfirmation,
    },
    counts: {
      distinctReporters: totalDistinctReporters,
      corroboratingCount: distinctCorroborators.size,
      disputingCount: distinctDisputers.size,
      gpsSpeedDropsCount: totalGpsSignals,
      validatedMediaCount: mediaItems.length,
    },
    missingFactors,
    explanation,
  };
}
