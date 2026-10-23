import crypto from 'crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { CheckpointInput, GpsValidationStatus } from '@roadalert/shared';
import { haversineDistanceKm, recalculateIncidentConfidence } from './verificationEngine.js';

export interface ProcessedGpsObservation {
  id: string;
  journeyId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  calculatedSpeed: number | null;
  heading: number | null;
  recordedAt: string;
  receivedAt: string;
  sourceType: string;
  validationStatus: GpsValidationStatus;
  statusNote: string | null;
}

export interface GpsBatchResult {
  processedCount: number;
  validCount: number;
  checkpoints: ProcessedGpsObservation[];
  journeyUpdated: {
    id: string;
    status: string;
    estimatedDelayMin: number;
    verifiedDelayMin: number;
    verificationLevel: number;
  };
  matchedIncidentId?: string;
}

/**
 * Validate and sanitize a single GPS observation relative to previous checkpoint
 */
export function validateAndSanitizeGpsPoint(
  obs: CheckpointInput,
  previousCheckpoint: { latitude: number; longitude: number; recorded_at: string | Date } | null,
  serverReceivedAt: Date
): {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  calculatedSpeed: number | null;
  heading: number | null;
  recordedAt: string;
  receivedAt: string;
  sourceType: string;
  validationStatus: GpsValidationStatus;
  statusNote: string | null;
} {
  // 1. Coordinate validation
  const lat = Number(obs.latitude);
  const lng = Number(obs.longitude);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ApiError(
      400,
      'INVALID_COORDINATES',
      `Coordinates out of range: latitude (${lat}) must be [-90, 90], longitude (${lng}) must be [-180, 180]`
    );
  }

  // 2. Observation timestamp (UTC)
  let recordedAtDate: Date;
  if (obs.recordedAt) {
    recordedAtDate = new Date(obs.recordedAt);
    if (isNaN(recordedAtDate.getTime())) {
      throw new ApiError(400, 'INVALID_TIMESTAMP', 'Invalid recordedAt timestamp format');
    }
  } else {
    recordedAtDate = serverReceivedAt;
  }

  // Reject future timestamps (> 2 minutes ahead of server clock)
  const futureSkewMs = recordedAtDate.getTime() - serverReceivedAt.getTime();
  if (futureSkewMs > 2 * 60 * 1000) {
    throw new ApiError(
      400,
      'FUTURE_TIMESTAMP',
      'GPS observation timestamp cannot be in the future'
    );
  }

  let validationStatus: GpsValidationStatus = 'VALID';
  const notes: string[] = [];
  if (obs.statusNote) {
    notes.push(obs.statusNote);
  }

  // Check for stale observation (> 24 hours old)
  const ageMs = serverReceivedAt.getTime() - recordedAtDate.getTime();
  if (ageMs > 24 * 3600 * 1000) {
    validationStatus = 'STALE';
    notes.push(`Observation timestamp is stale (${Math.round(ageMs / 3600000)}h old)`);
  }

  // 3. Accuracy validation (in metres)
  let accuracy: number | null = null;
  if (obs.accuracy !== undefined && obs.accuracy !== null) {
    accuracy = Number(obs.accuracy);
    if (isNaN(accuracy) || accuracy < 0) {
      throw new ApiError(400, 'INVALID_ACCURACY', 'GPS accuracy in metres must be non-negative');
    }
    // High inaccuracy threshold (> 150m) flags degraded accuracy
    if (accuracy > 150) {
      if (validationStatus === 'VALID') {
        validationStatus = 'INACCURATE';
      }
      notes.push(`Degraded GPS accuracy: ${accuracy}m radius`);
    }
  }

  // 4. Device speed (never substitute zero for missing speed)
  let deviceSpeed: number | null = null;
  if (obs.speed !== undefined && obs.speed !== null) {
    deviceSpeed = Number(obs.speed);
    if (isNaN(deviceSpeed) || deviceSpeed < 0 || deviceSpeed > 250) {
      throw new ApiError(
        400,
        'INVALID_SPEED',
        'Device-reported speed must be between 0 and 250 km/h'
      );
    }
  }

  // 5. Heading (0 to 360 degrees)
  let heading: number | null = null;
  if (obs.heading !== undefined && obs.heading !== null) {
    heading = Number(obs.heading);
    if (isNaN(heading) || heading < 0 || heading > 360) {
      throw new ApiError(
        400,
        'INVALID_HEADING',
        'Heading must be between 0 and 360 degrees'
      );
    }
  }

  // 6. Duplicate detection & Implausible Jump / Speed Calculation
  let calculatedSpeed: number | null = null;
  if (previousCheckpoint) {
    const prevTime = new Date(previousCheckpoint.recorded_at).getTime();
    const timeDeltaSec = (recordedAtDate.getTime() - prevTime) / 1000;
    const distanceKm = haversineDistanceKm(
      previousCheckpoint.latitude,
      previousCheckpoint.longitude,
      lat,
      lng
    );

    // Duplicate detection: identical coordinates (< 0.1m) within 1 second
    if (distanceKm < 0.0001 && Math.abs(timeDeltaSec) <= 1) {
      validationStatus = 'DUPLICATE';
      notes.push('Duplicate observation point at identical coordinates and timestamp');
    } else if (timeDeltaSec <= 0) {
      // Out of order timestamps (preserve STALE if already flagged)
      if (validationStatus === 'VALID') {
        validationStatus = 'OUT_OF_ORDER';
      }
      notes.push('Observation timestamp is equal to or older than previous checkpoint');
    } else {
      // Server-calculated speed: km / (sec / 3600) = km/h
      const speedKmh = (distanceKm / (timeDeltaSec / 3600));
      calculatedSpeed = Math.round(speedKmh * 10) / 10;

      // Realistic highway travel threshold: > 180 km/h is implausible movement / GPS glitch
      if (speedKmh > 180) {
        validationStatus = 'IMPLAUSIBLE_JUMP';
        notes.push(
          `Implausible movement jump: calculated speed ${calculatedSpeed} km/h (${distanceKm.toFixed(2)} km in ${timeDeltaSec.toFixed(1)}s)`
        );
      }
    }
  }

  return {
    latitude: lat,
    longitude: lng,
    accuracy,
    speed: deviceSpeed,
    calculatedSpeed,
    heading,
    recordedAt: recordedAtDate.toISOString(),
    receivedAt: serverReceivedAt.toISOString(),
    sourceType: obs.sourceType || 'BROWSER_GPS',
    validationStatus,
    statusNote: notes.length > 0 ? notes.join('; ') : null,
  };
}

/**
 * Process a bounded batch of GPS observations for an active journey
 */
export async function processGpsBatch(
  journeyId: string,
  userId: string,
  observations: CheckpointInput[]
): Promise<GpsBatchResult> {
  if (observations.length === 0) {
    throw new ApiError(400, 'EMPTY_BATCH', 'At least one GPS observation must be submitted');
  }
  if (observations.length > 100) {
    throw new ApiError(400, 'BATCH_TOO_LARGE', 'Maximum batch size is 100 observations');
  }

  // 1. Fetch journey and verify ownership & status
  const jRes = await db.query<any>(`SELECT * FROM journeys WHERE id = $1`, [journeyId]);
  if (jRes.rows.length === 0) {
    throw new ApiError(404, 'JOURNEY_NOT_FOUND', 'Journey not found');
  }
  const journey = jRes.rows[0];

  if (journey.employee_id !== userId) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the journey owner can record GPS observations');
  }

  if (journey.ended_at || ['COMPLETED', 'TERMINATED'].includes(journey.status)) {
    throw new ApiError(
      400,
      'JOURNEY_ALREADY_ENDED',
      'Cannot record observations for a commute session that has already ended'
    );
  }

  // 2. Verify tracking consent is still active and not revoked
  const consentRes = await db.query<any>(
    `SELECT * FROM tracking_consents WHERE id = $1`,
    [journey.consent_record_id]
  );
  if (consentRes.rows.length === 0 || consentRes.rows[0].revoked_at) {
    // Terminate journey immediately if consent is revoked
    await db.query(
      `UPDATE journeys SET status = 'TERMINATED', ended_at = NOW() WHERE id = $1`,
      [journeyId]
    );
    throw new ApiError(
      403,
      'CONSENT_REVOKED',
      'Tracking consent was revoked; commute session has been terminated'
    );
  }

  // 3. Fetch latest checkpoint for this journey to establish continuity
  const lastCpRes = await db.query<any>(
    `SELECT latitude, longitude, recorded_at FROM journey_checkpoints
     WHERE journey_id = $1
     ORDER BY recorded_at DESC LIMIT 1`,
    [journeyId]
  );
  let previousCheckpoint = lastCpRes.rows[0] || null;

  const serverReceivedAt = new Date();
  const processedPoints: ProcessedGpsObservation[] = [];
  let validCount = 0;

  // Fetch active corridor incidents for congestion delay matching
  const incidentsRes = await db.query<any>(
    `SELECT * FROM incidents WHERE status NOT IN ('RESOLVED', 'REJECTED')`
  );

  let matchedDelay = Number(journey.estimated_delay_min || 0);
  let matchedVerifiedDelay = Number(journey.verified_delay_min || 0);
  let maxVerificationLevel = Number(journey.verification_level || 1);
  let matchedIncidentId: string | undefined;

  for (const rawObs of observations) {
    const sanitized = validateAndSanitizeGpsPoint(rawObs, previousCheckpoint, serverReceivedAt);
    const cpId = crypto.randomUUID();

    await db.query(
      `INSERT INTO journey_checkpoints (
        id, journey_id, latitude, longitude, recorded_at, received_at,
        accuracy, speed, calculated_speed, heading, source_type, validation_status, status_note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        cpId,
        journeyId,
        sanitized.latitude,
        sanitized.longitude,
        sanitized.recordedAt,
        sanitized.receivedAt,
        sanitized.accuracy,
        sanitized.speed,
        sanitized.calculatedSpeed,
        sanitized.heading,
        sanitized.sourceType,
        sanitized.validationStatus,
        sanitized.statusNote,
      ]
    );

    const processedObj: ProcessedGpsObservation = {
      id: cpId,
      journeyId,
      ...sanitized,
    };
    processedPoints.push(processedObj);

    // Update continuity checkpoint for next iteration in batch
    previousCheckpoint = {
      latitude: sanitized.latitude,
      longitude: sanitized.longitude,
      recorded_at: sanitized.recordedAt,
    };

    if (sanitized.validationStatus === 'VALID') {
      validCount++;

      // Check for congestion near an active incident
      // Effective speed: device speed if available, otherwise calculated speed
      const effSpeed = sanitized.speed !== null ? sanitized.speed : sanitized.calculatedSpeed;
      if (effSpeed !== null && effSpeed <= 20) {
        for (const inc of incidentsRes.rows) {
          const dist = haversineDistanceKm(
            sanitized.latitude,
            sanitized.longitude,
            Number(inc.latitude),
            Number(inc.longitude)
          );
          if (dist <= 2.5) {
            matchedIncidentId = inc.id;
            matchedDelay = Math.max(matchedDelay, Number(inc.estimated_delay_minutes || 15));
            matchedVerifiedDelay = Math.max(
              matchedVerifiedDelay,
              Math.round(Number(inc.estimated_delay_minutes || 15) * 0.85)
            );
            maxVerificationLevel = Math.max(maxVerificationLevel, 4); // Level 4: GPS speed corroboration

            // Record incident corroboration for congestion telemetry
            try {
              const dupCorr = await db.query<any>(
                `SELECT id FROM incident_corroborations
                 WHERE incident_id = $1 AND user_id = $2 AND corroboration_type = 'GPS_CONGESTION'`,
                [inc.id, userId]
              );
              if (dupCorr.rows.length === 0) {
                await db.query(
                  `INSERT INTO incident_corroborations (
                    id, incident_id, user_id, corroboration_type, latitude, longitude, speed_kmh, notes
                  ) VALUES ($1, $2, $3, 'GPS_CONGESTION', $4, $5, $6, $7)`,
                  [
                    crypto.randomUUID(),
                    inc.id,
                    userId,
                    sanitized.latitude,
                    sanitized.longitude,
                    effSpeed,
                    `Live commute speed drop telemetry: ${effSpeed} km/h`,
                  ]
                );
                // Recalculate incident confidence score with new GPS signal
                await recalculateIncidentConfidence(inc.id, userId, 'GPS_CONGESTION_AUTO_SIGNAL');
              }
            } catch {
              // Non-blocking corroboration attempt
            }
          }
        }
      }
    }
  }

  // Update journey status and delay metrics
  const newStatus = matchedDelay >= 15 ? 'DELAYED' : journey.status;
  await db.query(
    `UPDATE journeys
     SET estimated_delay_min = $1,
         verified_delay_min = $2,
         verification_level = $3,
         status = $4
     WHERE id = $5`,
    [matchedDelay, matchedVerifiedDelay, maxVerificationLevel, newStatus, journeyId]
  );

  return {
    processedCount: processedPoints.length,
    validCount,
    checkpoints: processedPoints,
    journeyUpdated: {
      id: journeyId,
      status: newStatus,
      estimatedDelayMin: matchedDelay,
      verifiedDelayMin: matchedVerifiedDelay,
      verificationLevel: maxVerificationLevel,
    },
    matchedIncidentId,
  };
}
