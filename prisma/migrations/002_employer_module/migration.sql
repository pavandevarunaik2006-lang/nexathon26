-- RoadAlert Migration 002: Employer / Company Module
-- Extends organizations, memberships, journeys, and adds invitations & delay_verifications

-- 1. Extend organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Mangaluru';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_shift_start TEXT DEFAULT '09:00';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_shift_end TEXT DEFAULT '18:00';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Extend organization_memberships table
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS usual_commute_origin TEXT;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS usual_commute_destination TEXT;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS usual_commute_origin_lat DOUBLE PRECISION;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS usual_commute_origin_lng DOUBLE PRECISION;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS usual_commute_dest_lat DOUBLE PRECISION;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS usual_commute_dest_lng DOUBLE PRECISION;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS usual_commute_corridor TEXT;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS shift_start_time TEXT DEFAULT '09:00';
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS shift_end_time TEXT DEFAULT '18:00';
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS employee_code TEXT;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Extend journeys table
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS journey_display_status TEXT DEFAULT 'Normal';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS delay_evidence_summary TEXT;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS last_data_update_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Create organization_invitations table
CREATE TABLE IF NOT EXISTS organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  membership_role TEXT NOT NULL DEFAULT 'EMPLOYEE',
  department TEXT,
  usual_commute_origin TEXT,
  usual_commute_destination TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_email ON organization_invitations(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_code ON organization_invitations(invite_code);

-- 5. Create delay_verifications table
CREATE TABLE IF NOT EXISTS delay_verifications (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verification_status TEXT NOT NULL,
  journey_status TEXT NOT NULL DEFAULT 'DELAYED',
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  incident_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  incident_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  journey_window_start TIMESTAMPTZ NOT NULL,
  journey_window_end TIMESTAMPTZ,
  evidence_summary TEXT NOT NULL,
  conclusion_text TEXT NOT NULL,
  verification_method TEXT NOT NULL DEFAULT 'CORRIDOR_SPATIO_TEMPORAL_INTERSECTION',
  spatial_intersection BOOLEAN NOT NULL DEFAULT FALSE,
  temporal_intersection BOOLEAN NOT NULL DEFAULT FALSE,
  gps_observation_summary TEXT,
  speed_drop_detected BOOLEAN NOT NULL DEFAULT FALSE,
  missing_evidence_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delay_verifications_journey ON delay_verifications(journey_id);
CREATE INDEX IF NOT EXISTS idx_delay_verifications_org ON delay_verifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_delay_verifications_employee ON delay_verifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_delay_verifications_status ON delay_verifications(verification_status);
