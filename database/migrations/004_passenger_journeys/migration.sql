-- RoadAlert Schema Migration 004: Passenger Live Journey Monitoring & Intelligent Rerouting
-- Compatible with PostgreSQL 15/16 and PGlite Embedded Local

-- 1. Allow passenger journeys to start without employer consent records
ALTER TABLE journeys ALTER COLUMN consent_record_id DROP NOT NULL;

-- 2. Add columns for passenger journey monitoring, route geometries, alerts, and rerouting history
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS journey_type TEXT NOT NULL DEFAULT 'COMMUTE';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS selected_route_id TEXT;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS selected_route_name TEXT;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS route_geometry JSONB;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS base_duration_min INTEGER;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS alternative_route_id TEXT;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS rerouted_at TIMESTAMPTZ;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS reroute_reason TEXT;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS last_monitored_at TIMESTAMPTZ;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS active_alert JSONB;

-- 3. Indexes for passenger journey queries
CREATE INDEX IF NOT EXISTS idx_journeys_journey_type ON journeys(journey_type);
CREATE INDEX IF NOT EXISTS idx_journeys_user_status ON journeys(employee_id, status);
