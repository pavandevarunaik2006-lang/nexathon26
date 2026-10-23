import { z } from 'zod';

export const USER_ROLES = [
  'PASSENGER',
  'EMPLOYEE',
  'EMPLOYER',
  'TRAFFIC_AUTHORITY',
  'ADMIN',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const INCIDENT_CATEGORIES = [
  'Accident',
  'Road repair/construction',
  'Festival/public event',
  'Strike/protest',
  'VIP movement',
  'Landslide',
  'Heavy rain',
  'Flood/waterlogging',
  'Traffic signal failure',
  'Vehicle breakdown',
  'Road closure',
  'Bridge/road maintenance',
  'Police/security restriction',
  'Heavy traffic',
  'Unknown reason',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const INCIDENT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  'REPORTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'DISPUTED',
  'REJECTED',
  'RESOLVED',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const VERIFICATION_LEVELS = {
  1: 'Level 1: User reported',
  2: 'Level 2: Location corroborated',
  3: 'Level 3: Multiple independent reports',
  4: 'Level 4: GPS speed or journey data corroborates congestion',
  5: 'Level 5: Photo/video evidence attached',
  6: 'Level 6: Authorized traffic authority confirmation',
} as const;

export const CONFIDENCE_BANDS = {
  UNVERIFIED: { min: 0, max: 34, label: 'Unverified' },
  LOW_CONFIDENCE: { min: 35, max: 59, label: 'Low confidence' },
  CORROBORATED: { min: 60, max: 79, label: 'Corroborated' },
  HIGH_CONFIDENCE: { min: 80, max: 100, label: 'High confidence' },
} as const;

export function getConfidenceBandLabel(score: number): string {
  if (score >= 80) return 'High confidence';
  if (score >= 60) return 'Corroborated';
  if (score >= 35) return 'Low confidence';
  return 'Unverified';
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

export const CorroborateIncidentSchema = z.object({
  corroborationType: z.enum(['CORROBORATE', 'DISPUTE', 'GPS_CONGESTION']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  speedKmh: z.number().min(0).max(200).optional(),
  notes: z.string().max(500).optional(),
});

export const ReviewIncidentSchema = z.object({
  decision: z.enum(['CONFIRM', 'REJECT', 'UPDATE_SEVERITY', 'MARK_ROAD_CLOSED', 'RESOLVE', 'NOTE']),
  reason: z.string().min(5, 'A clear administrative reason is required for audit trail').max(1000),
  newSeverity: z.enum(INCIDENT_SEVERITIES).optional(),
  newStatus: z.enum(INCIDENT_STATUSES).optional(),
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

export const REGIONAL_DESTINATIONS = [
  { name: 'Pumpwell Circle, Mangaluru (NH-66)', lat: 12.8669, lng: 74.8692, corridor: 'NH-66 South/Central' },
  { name: 'Nanthoor Junction, Mangaluru (NH-66)', lat: 12.8825, lng: 74.8648, corridor: 'NH-66 Central' },
  { name: 'KPT Junction, Mangaluru (NH-66)', lat: 12.8935, lng: 74.8594, corridor: 'NH-66 North' },
  { name: 'Thokkottu Flyover, Ullal (NH-66)', lat: 12.8127, lng: 74.8615, corridor: 'NH-66 South' },
  { name: 'Surathkal NITK Toll Gate (NH-66)', lat: 13.0108, lng: 74.7943, corridor: 'NH-66 Coastal' },
  { name: 'Mulki Bus Stand (NH-66)', lat: 13.0908, lng: 74.7864, corridor: 'NH-66 Coastal' },
  { name: 'Padubidri Junction (NH-66 / SH-1)', lat: 13.1422, lng: 74.7731, corridor: 'Udupi Border' },
  { name: 'Kaup (Kapu) Junction (NH-66)', lat: 13.2244, lng: 74.7484, corridor: 'Udupi South' },
  { name: 'Udupi Karavali Bypass (NH-66)', lat: 13.3409, lng: 74.7351, corridor: 'Udupi City' },
  { name: 'Manipal Tiger Circle (NH-169A)', lat: 13.3525, lng: 74.7868, corridor: 'Manipal Academic' },
  { name: 'Kulai / Baikampady Industrial Area', lat: 12.9522, lng: 74.8105, corridor: 'NH-66 Industrial' },
  { name: 'BC Road, Bantwal (NH-75)', lat: 12.8789, lng: 75.0258, corridor: 'NH-75 East' },
  { name: 'Kuloor Bridge, Mangaluru (NH-66)', lat: 12.9261, lng: 74.8267, corridor: 'NH-66 Bridge' },
  { name: 'Hampankatta / State Bank, Mangaluru', lat: 12.8698, lng: 74.8431, corridor: 'Mangaluru CBD' },
] as const;
