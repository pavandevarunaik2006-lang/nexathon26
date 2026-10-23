import { UserRole } from '@roadalert/shared';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface IncidentDbRow {
  id: string;
  reporter_id: string | null;
  reporter_name?: string;
  reporter_role?: UserRole;
  title: string;
  description: string;
  category: string;
  severity: string;
  latitude: number | string;
  longitude: number | string;
  road_name: string;
  occurrence_time: string;
  reported_at: string;
  updated_at: string;
  status: string;
  confidence_score: number | string;
  verification_level: number | string;
  authority_confirmed: boolean;
  road_closed: boolean;
  anonymous_public_display: boolean;
  estimated_delay_minutes: number | string;
  demo_data: boolean;
  corroboration_count?: number | string;
  evidence_count?: number | string;
}
