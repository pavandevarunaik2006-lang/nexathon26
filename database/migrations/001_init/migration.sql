-- RoadAlert Initial PostgreSQL Schema Migration (001_init.sql)
-- Compatible with PostgreSQL 15/16 and PGlite

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PASSENGER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  road_name TEXT NOT NULL,
  occurrence_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'REPORTED',
  confidence_score INTEGER NOT NULL DEFAULT 20,
  verification_level INTEGER NOT NULL DEFAULT 1,
  authority_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  road_closed BOOLEAN NOT NULL DEFAULT FALSE,
  anonymous_public_display BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_delay_minutes INTEGER NOT NULL DEFAULT 15,
  idempotency_key TEXT UNIQUE,
  demo_data BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_at ON incidents(reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_coords ON incidents(latitude, longitude);

CREATE TABLE IF NOT EXISTS incident_evidences (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  submitted_by TEXT NOT NULL REFERENCES users(id),
  evidence_type TEXT NOT NULL,
  storage_key TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  validation_status TEXT NOT NULL DEFAULT 'VALIDATED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_evidences_incident_id ON incident_evidences(incident_id);

CREATE TABLE IF NOT EXISTS incident_corroborations (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  corroboration_type TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  speed_kmh DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(incident_id, user_id, corroboration_type)
);

CREATE INDEX IF NOT EXISTS idx_incident_corroborations_incident_id ON incident_corroborations(incident_id);

CREATE TABLE IF NOT EXISTS tracking_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  policy_version TEXT NOT NULL,
  purpose TEXT NOT NULL,
  share_precise_coords BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tracking_consents_user_org ON tracking_consents(user_id, organization_id);

CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users(id),
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  dest_lat DOUBLE PRECISION,
  dest_lng DOUBLE PRECISION,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  consent_record_id TEXT NOT NULL REFERENCES tracking_consents(id),
  estimated_delay_min INTEGER NOT NULL DEFAULT 0,
  verified_delay_min INTEGER NOT NULL DEFAULT 0,
  verification_level INTEGER NOT NULL DEFAULT 1,
  manual_self_reported BOOLEAN NOT NULL DEFAULT FALSE,
  manual_status_note TEXT,
  demo_data BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_journeys_employee_id ON journeys(employee_id);
CREATE INDEX IF NOT EXISTS idx_journeys_status ON journeys(status);

CREATE TABLE IF NOT EXISTS journey_checkpoints (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  speed DOUBLE PRECISION NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'BROWSER_GPS',
  status_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_journey_checkpoints_journey_id ON journey_checkpoints(journey_id);

CREATE TABLE IF NOT EXISTS organization_tracking_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  tracking_mode TEXT NOT NULL DEFAULT 'SESSION_ONLY_EXPLICIT',
  retention_days INTEGER NOT NULL DEFAULT 30,
  require_consent BOOLEAN NOT NULL DEFAULT TRUE,
  allow_precise_coordinate BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  incident_id TEXT REFERENCES incidents(id) ON DELETE SET NULL,
  journey_id TEXT REFERENCES journeys(id) ON DELETE SET NULL,
  delivery_status TEXT NOT NULL DEFAULT 'DELIVERED',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS incident_reviews (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_reviews_incident_id ON incident_reviews(incident_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem_reports (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  location_name TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_configs (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
