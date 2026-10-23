import {
  USER_ROLES,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from '../constants/index.js';

export type UserRole = (typeof USER_ROLES)[number];
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

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
