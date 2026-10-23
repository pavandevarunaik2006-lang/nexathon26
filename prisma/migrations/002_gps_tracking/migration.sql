-- RoadAlert Schema Migration 002: Persistent GPS observations & tracking enhancements
-- Compatible with PostgreSQL 15/16 and PGlite

ALTER TABLE journey_checkpoints ADD COLUMN IF NOT EXISTS accuracy DOUBLE PRECISION;
ALTER TABLE journey_checkpoints ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION;
ALTER TABLE journey_checkpoints ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE journey_checkpoints ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'VALID';
ALTER TABLE journey_checkpoints ADD COLUMN IF NOT EXISTS calculated_speed DOUBLE PRECISION;

-- Allow speed column to be NULL when not reported by device (never substitute zero for missing measurements)
ALTER TABLE journey_checkpoints ALTER COLUMN speed DROP NOT NULL;
ALTER TABLE journey_checkpoints ALTER COLUMN speed DROP DEFAULT;

-- Performance indexes for observation queries
CREATE INDEX IF NOT EXISTS idx_journey_checkpoints_recorded_at ON journey_checkpoints(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_journey_checkpoints_validation ON journey_checkpoints(validation_status);
