import {
  USER_ROLES,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  GPS_VALIDATION_STATUSES,
} from '../constants/index.js';

export type UserRole = (typeof USER_ROLES)[number];
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export type GpsValidationStatus = (typeof GPS_VALIDATION_STATUSES)[number];

/**
 * Explicit Routing States (Section 11)
 * Shared across backend routing engine, route planner, and dispatcher dashboard.
 */
export type ExplicitRouteState =
  | 'NORMAL'
  | 'ROUTE_AFFECTED_RECALCULATING'
  | 'ALTERNATE_ROUTE_FOUND'
  | 'NO_VIABLE_ROUTE_FOUND'
  | 'ROUTING_UNAVAILABLE';

/**
 * Distinct Incident Verification & Obstruction Lifecycle States (Section 7)
 * Distinguishes:
 * 1. UNVERIFIED_REPORT: Submitted report awaiting verification (must NOT block a road)
 * 2. VERIFIED_INCIDENT: Event verified, but road is passable with caution/delay (must NOT block a road)
 * 3. CONFIRMED_OBSTRUCTION: Confirmed road closure / physical blockage (hard routing constraint)
 * 4. RESOLVED_OBSTRUCTION: Obstruction cleared; stops affecting routing constraints
 * 5. REJECTED_REPORT: Dismissed / false report
 */
export type IncidentVerificationState =
  | 'UNVERIFIED_REPORT'
  | 'VERIFIED_INCIDENT'
  | 'CONFIRMED_OBSTRUCTION'
  | 'RESOLVED_OBSTRUCTION'
  | 'REJECTED_REPORT';

export type TrafficCongestionLevel =
  | 'FREE_FLOW'
  | 'MODERATE'
  | 'HEAVY'
  | 'SEVERE'
  | 'CONFIRMED_CLOSURE';

/**
 * Determines the canonical verification and obstruction state of an incident.
 * Enforces:
 * - Unverified reports never automatically become confirmed closures.
 * - Verified incidents without confirmed obstruction never block a road.
 */
export function classifyIncidentVerificationState(incident: {
  status?: string;
  category?: string;
  severity?: string;
  confidenceScore?: number;
  confidence_score?: number;
  authorityConfirmed?: boolean;
  authority_confirmed?: boolean;
  roadClosed?: boolean;
  road_closed?: boolean;
}): IncidentVerificationState {
  const status = String(incident.status || 'REPORTED').toUpperCase();
  if (status === 'REJECTED') {
    return 'REJECTED_REPORT';
  }
  if (status === 'RESOLVED') {
    return 'RESOLVED_OBSTRUCTION';
  }

  const confidence = Number(incident.confidenceScore ?? incident.confidence_score ?? 20);
  const authorityConfirmed = Boolean(
    incident.authorityConfirmed ?? incident.authority_confirmed ?? false
  );
  const roadClosedFlag = Boolean(incident.roadClosed ?? incident.road_closed ?? false);
  const isVerified = status === 'VERIFIED' || authorityConfirmed || confidence >= 60;

  // Hard obstruction requires BOTH verification (or explicit authority closure flag) AND road closure status
  if (roadClosedFlag && (isVerified || authorityConfirmed)) {
    return 'CONFIRMED_OBSTRUCTION';
  }
  if (
    authorityConfirmed &&
    (String(incident.category || '').toLowerCase().includes('closure') ||
      String(incident.category || '').toLowerCase().includes('landslide'))
  ) {
    return 'CONFIRMED_OBSTRUCTION';
  }

  if (isVerified) {
    return 'VERIFIED_INCIDENT';
  }

  return 'UNVERIFIED_REPORT';
}

export interface ConfidenceBreakdown {
  totalScore: number;
  band: string;
  verificationLevel: number;
  verificationLevelLabel: string;
  authorityConfirmed: boolean;
  components: {
    independentReports: number; // max 30
    locationTimeProximity: number; // max 20
    gpsCorroboration: number; // max 20
    mediaEvidence: number; // max 15
    authorityConfirmation: number; // max 15
  };
  counts: {
    distinctReporters: number;
    corroboratingCount: number;
    disputingCount: number;
    gpsSpeedDropsCount: number;
    validatedMediaCount: number;
  };
  missingFactors: string[];
  explanation: string[];
}

export interface IncidentDto {
  id: string;
  reporterId?: string | null;
  reporterName: string;
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  latitude: number;
  longitude: number;
  roadName: string;
  occurrenceTime: string;
  reportedAt: string;
  updatedAt: string;
  status: IncidentStatus;
  confidenceScore: number;
  verificationLevel: number;
  authorityConfirmed: boolean;
  roadClosed: boolean;
  anonymousPublicDisplay?: boolean;
  estimatedDelayMinutes: number;
  demoData: boolean;
  corroborationCount: number;
  evidenceCount: number;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponseEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Feature 3: Multi-Evidence Incident Trust Layer Types
 */
export type IncidentTrustState =
  | 'UNVERIFIED'
  | 'LIKELY'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'RESOLVED';

export interface IncidentTrustEvaluation {
  trustState: IncidentTrustState;
  confidenceScore: number;
  routingPolicy:
    | 'NORMAL_PASSABLE'
    | 'CAUTION_SLOWDOWN'
    | 'CONFIRMED_CLOSURE_AVOID'
    | 'RESTORED';
  routingPolicyLabel: string;
  explanation: string;
  evidenceSignals: {
    distinctUserCount: number;
    gpsSlowdownConfirmed: boolean;
    mediaEvidenceCount: number;
    authorityConfirmed: boolean;
    disputeCount: number;
    reportAgeMinutes: number;
  };
  auditLog: {
    action: string;
    actorRole: string;
    reason: string;
    timestampIso: string;
  }[];
}

/**
 * Feature 2: Decision-Critical Verification Queue Item
 */
export interface CriticalVerificationItem {
  id: string;
  incidentId: string;
  title: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  roadName: string;
  latitude: number;
  longitude: number;
  reportedAt: string;
  confidenceScore: number;
  trustState: IncidentTrustState;
  priorityScore: number; // 0-100 explainable ranking score
  priorityBand: 'URGENT_EMERGENCY_IMPACT' | 'HIGH_CORRIDOR_RISK' | 'MEDIUM' | 'ROUTINE';
  priorityReasons: string[];
  lifelineThreat: boolean;
  threatenedHospitals: string[];
  suggestedAction:
    | 'CONFIRM_ROAD_CLOSURE'
    | 'VERIFY_PASSABLE'
    | 'DISPUTE_REPORT'
    | 'REQUEST_MORE_EVIDENCE';
}
