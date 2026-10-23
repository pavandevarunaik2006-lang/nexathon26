import { z } from 'zod';
import {
  USER_ROLES,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from '../constants/index.js';

export const RegisterUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  role: z.enum(['PASSENGER', 'EMPLOYEE']).optional().default('PASSENGER'),
});

export const LoginUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const CreateIncidentSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(140),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  category: z.enum(INCIDENT_CATEGORIES),
  severity: z.enum(INCIDENT_SEVERITIES),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  roadName: z.string().min(2, 'Road name or landmark is required').max(200),
  occurrenceTime: z.string().optional(),
  estimatedDelayMinutes: z.number().min(0).max(720).optional().default(15),
  anonymousPublicDisplay: z.boolean().optional().default(false),
  idempotencyKey: z.string().optional(),
});

export const PatchIncidentSchema = z.object({
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  status: z.enum(INCIDENT_STATUSES).optional(),
  estimatedDelayMinutes: z.number().min(0).max(720).optional(),
  roadClosed: z.boolean().optional(),
  reason: z.string().min(3).max(500).optional(),
});

export const CorroborateIncidentSchema = z.object({
  corroborationType: z.enum(['CORROBORATE', 'DISPUTE', 'GPS_CONGESTION']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  speedKmh: z.number().min(0).max(200).optional(),
  notes: z.string().max(500).optional(),
});

export const ReviewIncidentSchema = z.object({
  decision: z.enum([
    'CONFIRM',
    'REJECT',
    'UPDATE_SEVERITY',
    'MARK_ROAD_CLOSED',
    'RESOLVE',
    'NOTE',
  ]),
  reason: z.string().min(5, 'A clear administrative reason is required for audit trail').max(1000),
  newSeverity: z.enum(INCIDENT_SEVERITIES).optional(),
  newStatus: z.enum(INCIDENT_STATUSES).optional(),
});

export const FlagIncidentSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(500),
});

export const StartJourneySchema = z.object({
  origin: z.string().min(2).max(200),
  destination: z.string().min(2).max(200),
  originLat: z.number().min(-90).max(90).optional(),
  originLng: z.number().min(-180).max(180).optional(),
  destLat: z.number().min(-90).max(90).optional(),
  destLng: z.number().min(-180).max(180).optional(),
  consentRecordId: z.string().min(1, 'Explicit consent record is required to start commute tracking'),
  manualSelfReported: z.boolean().optional().default(false),
  manualStatusNote: z.string().max(400).optional(),
});

export const CheckpointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().min(0).max(200).optional().default(0),
  sourceType: z.enum(['BROWSER_GPS', 'MANUAL_SELF_REPORTED']).default('BROWSER_GPS'),
  statusNote: z.string().max(300).optional(),
});

export const CreateConsentSchema = z.object({
  organizationId: z.string().min(1).optional(),
  policyVersion: z.string().default('v2026.1-PRIVACY-FIRST'),
  purpose: z
    .string()
    .min(5)
    .default(
      'Explicit session-only commute delay verification along coastal Karnataka corridor'
    ),
  sharePreciseCoords: z.boolean().optional().default(false),
});

export const RoutePlanRequestSchema = z.object({
  origin: z.string().min(2),
  destination: z.string().min(2),
  originLat: z.number().min(-90).max(90).optional(),
  originLng: z.number().min(-180).max(180).optional(),
  destLat: z.number().min(-90).max(90).optional(),
  destLng: z.number().min(-180).max(180).optional(),
  avoidIncidentZones: z.boolean().optional().default(true),
});

export const CreateProblemReportSchema = z.object({
  locationName: z.string().min(2).max(200),
  daysLookback: z.number().min(1).max(365).optional().default(30),
});

export const UpdatePolicySchema = z.object({
  trackingMode: z.enum(['SESSION_ONLY_EXPLICIT', 'CORRIDOR_CHECKPOINT_ONLY']).optional(),
  retentionDays: z.number().min(1).max(365).optional(),
  requireConsent: z.boolean().optional(),
  allowPreciseCoordinate: z.boolean().optional(),
});

export const AdminUpdateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  reason: z.string().min(3).optional(),
});

export const AdminCreateOrganizationSchema = z.object({
  name: z.string().min(3).max(150),
  organizationType: z.string().min(2).max(80),
});
