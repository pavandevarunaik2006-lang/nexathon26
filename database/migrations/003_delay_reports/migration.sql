-- RoadAlert Schema Migration 003: Commute Delay Reports & Evidence Review Workflow
-- Compatible with PostgreSQL 15/16 and PGlite Embedded Local

CREATE TABLE IF NOT EXISTS commute_delay_reports (
  id TEXT PRIMARY KEY,
  journey_id TEXT REFERENCES journeys(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES users(id),
  delay_reason TEXT NOT NULL,
  delay_minutes INTEGER NOT NULL DEFAULT 15,
  evidence_file_path TEXT,
  evidence_original_name TEXT,
  evidence_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewer_id TEXT REFERENCES users(id),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delay_reports_employee ON commute_delay_reports(employee_id);
CREATE INDEX IF NOT EXISTS idx_delay_reports_journey ON commute_delay_reports(journey_id);
CREATE INDEX IF NOT EXISTS idx_delay_reports_status ON commute_delay_reports(status);
