import {
  type IncidentTrustEvaluation,
  type IncidentTrustState,
  type ConfidenceBreakdown,
} from '@roadalert/shared';

/**
 * Feature 3: Multi-Evidence Incident Trust Layer
 * Evaluates operational trust state and routing policy from multi-source evidence signals.
 */
export function evaluateIncidentTrust(
  incident: any,
  breakdown: ConfidenceBreakdown,
  corroborations: any[] = [],
  auditTrail: any[] = []
): IncidentTrustEvaluation {
  const statusUpper = String(incident.status || '').toUpperCase();
  const reportedAtMs = new Date(incident.reported_at || incident.reportedAt).getTime();
  const ageMinutes = Math.max(0, Math.round((Date.now() - reportedAtMs) / 60_000));
  const confidence = Number(incident.confidence_score ?? incident.confidenceScore ?? breakdown.totalScore);
  const isAuthorityConfirmed = Boolean(incident.authority_confirmed ?? incident.authorityConfirmed);
  const isRoadClosed = Boolean(incident.road_closed ?? incident.roadClosed);

  const disputeCount = corroborations.filter((c: any) => c.corroboration_type === 'DISPUTE').length;
  const validCorrCount = corroborations.filter((c: any) => c.corroboration_type !== 'DISPUTE').length;

  let trustState: IncidentTrustState = 'UNVERIFIED';
  let routingPolicy: IncidentTrustEvaluation['routingPolicy'] = 'CAUTION_SLOWDOWN';
  let routingPolicyLabel = 'Caution Advisory Only';
  let explanation = '';

  if (statusUpper === 'RESOLVED') {
    trustState = 'RESOLVED';
    routingPolicy = 'RESTORED';
    routingPolicyLabel = 'Normal Flow Restored';
    explanation = 'Obstruction cleared by traffic authority or commuter consensus. Corridor has resumed regular speed.';
  } else if (statusUpper === 'REJECTED' || (disputeCount >= 2 && confidence < 35)) {
    trustState = 'UNVERIFIED';
    routingPolicy = 'NORMAL_PASSABLE';
    routingPolicyLabel = 'Disputed / Dismissed';
    explanation = 'Report has been flagged as inaccurate or contradicted by field evidence. Does not alter routing.';
  } else if (ageMinutes > 180 && validCorrCount === 0 && !isAuthorityConfirmed) {
    trustState = 'EXPIRED';
    routingPolicy = 'NORMAL_PASSABLE';
    routingPolicyLabel = 'Expired (Stale Report)';
    explanation = `Report is ${Math.round(ageMinutes / 60)} hours old without re-corroboration. Routing penalties deactivated.`;
  } else if (isAuthorityConfirmed || confidence >= 70) {
    trustState = 'CONFIRMED';
    if (isRoadClosed) {
      routingPolicy = 'CONFIRMED_CLOSURE_AVOID';
      routingPolicyLabel = 'Strict Road Closure Enforced';
      explanation = 'Verified and confirmed road blockage. Routing engine actively diverts all traffic around this segment.';
    } else {
      routingPolicy = 'CAUTION_SLOWDOWN';
      routingPolicyLabel = 'Confirmed Disruption (Passable)';
      explanation = 'Verified active incident. Road remains passable with calibrated transit delay.';
    }
  } else if (confidence >= 40 || validCorrCount >= 2 || breakdown.counts.gpsSpeedDropsCount > 0) {
    trustState = 'LIKELY';
    routingPolicy = 'CAUTION_SLOWDOWN';
    routingPolicyLabel = 'Likely Disruption (Advisory Slowdown)';
    explanation = 'Corroborated by independent commuter signals or GPS speed drop. Road remains open; advisory delay applied.';
  } else {
    trustState = 'UNVERIFIED';
    routingPolicy = 'NORMAL_PASSABLE';
    routingPolicyLabel = 'Unverified (Caution Advisory Halo)';
    explanation = 'Single citizen submission. Road is NOT blocked in routing; rendered with cautionary advisory halo.';
  }

  return {
    trustState,
    confidenceScore: confidence,
    routingPolicy,
    routingPolicyLabel,
    explanation,
    evidenceSignals: {
      distinctUserCount: breakdown.counts.distinctReporters,
      gpsSlowdownConfirmed: breakdown.counts.gpsSpeedDropsCount > 0,
      mediaEvidenceCount: breakdown.counts.validatedMediaCount,
      authorityConfirmed: isAuthorityConfirmed,
      disputeCount,
      reportAgeMinutes: ageMinutes,
    },
    auditLog: auditTrail.map((a: any) => ({
      action: a.action,
      actorRole: a.actor_role || 'OPERATOR',
      reason: a.metadata?.notes || a.action,
      timestampIso: a.created_at,
    })),
  };
}
