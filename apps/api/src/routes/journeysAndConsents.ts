import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  StartJourneySchema,
  CheckpointSchema,
  CreateConsentSchema,
} from '../validators/index.js';
import { haversineDistanceKm } from '../services/verificationEngine.js';
import { processGpsBatch } from '../services/gpsTrackingService.js';

export const journeysAndConsentsRouter = Router();

// GET /api/v1/consents/me — Get current user's tracking consents and organization policies
journeysAndConsentsRouter.get('/consents/me', authenticate, async (req, res, next) => {
  try {
    const consentsRes = await db.query<any>(
      `SELECT tc.*, o.name as organization_name
       FROM tracking_consents tc
       LEFT JOIN organizations o ON o.id = tc.organization_id
       WHERE tc.user_id = $1
       ORDER BY tc.granted_at DESC`,
      [req.user!.userId]
    );

    const orgPoliciesRes = await db.query<any>(
      `SELECT otp.*, o.name as organization_name
       FROM organization_memberships om
       JOIN organizations o ON o.id = om.organization_id
       LEFT JOIN organization_tracking_policies otp ON otp.organization_id = o.id
       WHERE om.user_id = $1 AND om.status = 'ACTIVE'`,
      [req.user!.userId]
    );

    res.json({
      success: true,
      data: {
        consents: consentsRes.rows.map((c: any) => ({
          id: c.id,
          userId: c.user_id,
          organizationId: c.organization_id,
          organizationName: c.organization_name,
          policyVersion: c.policy_version,
          purpose: c.purpose,
          sharePreciseCoords: Boolean(c.share_precise_coords),
          grantedAt: c.granted_at,
          revokedAt: c.revoked_at,
          active: !c.revoked_at,
        })),
        organizationPolicies: orgPoliciesRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/consents — Explicitly grant commute session tracking consent
journeysAndConsentsRouter.post('/consents', authenticate, async (req, res, next) => {
  try {
    const parsed = CreateConsentSchema.parse(req.body);

    let organizationId = parsed.organizationId;
    if (!organizationId) {
      const memRes = await db.query<{ organization_id: string }>(
        `SELECT organization_id FROM organization_memberships WHERE user_id = $1 LIMIT 1`,
        [req.user!.userId]
      );
      if (memRes.rows.length > 0) {
        organizationId = memRes.rows[0].organization_id;
      } else {
        const orgRes = await db.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`);
        organizationId = orgRes.rows[0]?.id;
      }
    }

    if (!organizationId) {
      throw new ApiError(400, 'NO_ORGANIZATION', 'Organization ID is required for consent record');
    }

    const consentId = crypto.randomUUID();
    await db.query(
      `INSERT INTO tracking_consents (id, user_id, organization_id, policy_version, purpose, share_precise_coords)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        consentId,
        req.user!.userId,
        organizationId,
        parsed.policyVersion,
        parsed.purpose,
        parsed.sharePreciseCoords,
      ]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'TRACKING_CONSENT_GRANTED', 'CONSENT', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        consentId,
        JSON.stringify({
          organizationId,
          policyVersion: parsed.policyVersion,
          sharePreciseCoords: parsed.sharePreciseCoords,
        }),
      ]
    );

    const created = await db.query<any>(`SELECT * FROM tracking_consents WHERE id = $1`, [
      consentId,
    ]);

    res.status(201).json({
      success: true,
      data: {
        id: created.rows[0].id,
        userId: created.rows[0].user_id,
        organizationId: created.rows[0].organization_id,
        policyVersion: created.rows[0].policy_version,
        purpose: created.rows[0].purpose,
        sharePreciseCoords: Boolean(created.rows[0].share_precise_coords),
        grantedAt: created.rows[0].granted_at,
        revokedAt: created.rows[0].revoked_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/consents/:id/revoke — Revoke tracking consent & automatically terminate any active journey using it
journeysAndConsentsRouter.post('/consents/:id/revoke', authenticate, async (req, res, next) => {
  try {
    const consentId = req.params.id;
    const cRes = await db.query<any>(`SELECT * FROM tracking_consents WHERE id = $1`, [consentId]);
    if (cRes.rows.length === 0) {
      throw new ApiError(404, 'CONSENT_NOT_FOUND', 'Consent record not found');
    }
    if (cRes.rows[0].user_id !== req.user!.userId && req.user!.role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'You can only revoke your own consent records');
    }

    await db.query(`UPDATE tracking_consents SET revoked_at = NOW() WHERE id = $1`, [consentId]);

    // Terminate any active journeys relying on this consent
    await db.query(
      `UPDATE journeys
       SET status = 'TERMINATED', ended_at = NOW()
       WHERE consent_record_id = $1 AND status IN ('ACTIVE', 'DELAYED')`,
      [consentId]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'TRACKING_CONSENT_REVOKED', 'CONSENT', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        consentId,
        JSON.stringify({ revokedBy: req.user!.userId }),
      ]
    );

    res.json({
      success: true,
      data: {
        id: consentId,
        revoked: true,
        message:
          'Tracking consent revoked and any active commute sessions under this consent have been immediately stopped.',
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/journeys — Start an explicitly consented commute session
journeysAndConsentsRouter.post('/journeys', authenticate, async (req, res, next) => {
  try {
    if (!req.body?.consentRecordId) {
      throw new ApiError(
        400,
        'CONSENT_REQUIRED',
        'Employee cannot start commute tracking without an explicit, active consentRecordId'
      );
    }

    const parsed = StartJourneySchema.parse(req.body);

    // Verify consent belongs to this user and is NOT revoked
    const consentRes = await db.query<any>(`SELECT * FROM tracking_consents WHERE id = $1`, [
      parsed.consentRecordId,
    ]);
    if (consentRes.rows.length === 0) {
      throw new ApiError(400, 'INVALID_CONSENT', 'Provided consent record does not exist');
    }
    const consent = consentRes.rows[0];
    if (consent.user_id !== req.user!.userId) {
      throw new ApiError(
        403,
        'CONSENT_OWNERSHIP_MISMATCH',
        'Consent record does not belong to the authenticated user'
      );
    }
    if (consent.revoked_at) {
      throw new ApiError(
        400,
        'CONSENT_REVOKED',
        'Cannot start commute tracking with a revoked consent record'
      );
    }

    // Calculate intersecting incidents for initial delay & verification
    const activeIncidents = await db.query<any>(
      `SELECT * FROM incidents WHERE status NOT IN ('RESOLVED', 'REJECTED')`
    );

    let estimatedDelayMin = 0;
    let verifiedDelayMin = 0;
    let maxVerificationLevel = parsed.manualSelfReported ? 1 : 2;

    const originLat = parsed.originLat ?? 13.3409;
    const originLng = parsed.originLng ?? 74.7351;
    const destLat = parsed.destLat ?? 12.8669;
    const destLng = parsed.destLng ?? 74.8692;

    for (const inc of activeIncidents.rows) {
      const minLat = Math.min(originLat, destLat) - 0.04;
      const maxLat = Math.max(originLat, destLat) + 0.04;
      if (Number(inc.latitude) >= minLat && Number(inc.latitude) <= maxLat) {
        estimatedDelayMin += Math.round(Number(inc.estimated_delay_minutes || 15) * 0.5);
        if (Number(inc.confidence_score) >= 60) {
          verifiedDelayMin += Math.round(Number(inc.estimated_delay_minutes || 15) * 0.45);
          maxVerificationLevel = Math.max(maxVerificationLevel, Number(inc.verification_level));
        }
      }
    }

    const journeyId = crypto.randomUUID();
    const initialStatus = estimatedDelayMin >= 15 ? 'DELAYED' : 'ACTIVE';

    await db.query(
      `INSERT INTO journeys (
        id, employee_id, origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
        status, consent_record_id, estimated_delay_min, verified_delay_min,
        verification_level, manual_self_reported, manual_status_note, demo_data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,FALSE)`,
      [
        journeyId,
        req.user!.userId,
        parsed.origin.trim(),
        parsed.destination.trim(),
        originLat,
        originLng,
        destLat,
        destLng,
        initialStatus,
        parsed.consentRecordId,
        estimatedDelayMin,
        verifiedDelayMin,
        maxVerificationLevel,
        parsed.manualSelfReported,
        parsed.manualStatusNote || null,
      ]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'COMMUTE_SESSION_STARTED', 'JOURNEY', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        journeyId,
        JSON.stringify({
          origin: parsed.origin,
          destination: parsed.destination,
          consentRecordId: parsed.consentRecordId,
          manualSelfReported: parsed.manualSelfReported,
        }),
      ]
    );

    const saved = await db.query<any>(`SELECT * FROM journeys WHERE id = $1`, [journeyId]);
    res.status(201).json({
      success: true,
      data: saved.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/journeys — List current user's journeys with checkpoints and delay evidence
journeysAndConsentsRouter.get('/journeys', authenticate, async (req, res, next) => {
  try {
    const journeysRes = await db.query<any>(
      `SELECT j.*, tc.purpose as consent_purpose, tc.policy_version, tc.share_precise_coords
       FROM journeys j
       LEFT JOIN tracking_consents tc ON tc.id = j.consent_record_id
       WHERE j.employee_id = $1
       ORDER BY j.started_at DESC`,
      [req.user!.userId]
    );

    const activeIncidents = await db.query<any>(
      `SELECT id, title, category, severity, road_name, confidence_score, verification_level, estimated_delay_minutes, latitude, longitude, demo_data
       FROM incidents WHERE status NOT IN ('REJECTED')
       ORDER BY confidence_score DESC LIMIT 6`
    );

    const items = [];
    for (const j of journeysRes.rows) {
      const cpRes = await db.query<any>(
        `SELECT * FROM journey_checkpoints WHERE journey_id = $1 ORDER BY recorded_at ASC`,
        [j.id]
      );
      items.push({
        id: j.id,
        employeeId: j.employee_id,
        origin: j.origin,
        destination: j.destination,
        originLat: j.origin_lat,
        originLng: j.origin_lng,
        destLat: j.dest_lat,
        destLng: j.dest_lng,
        startedAt: j.started_at,
        endedAt: j.ended_at,
        status: j.status,
        consentRecordId: j.consent_record_id,
        consentPurpose: j.consent_purpose,
        policyVersion: j.policy_version,
        sharePreciseCoords: Boolean(j.share_precise_coords),
        estimatedDelayMin: Number(j.estimated_delay_min || 0),
        verifiedDelayMin: Number(j.verified_delay_min || 0),
        verificationLevel: Number(j.verification_level || 1),
        manualSelfReported: Boolean(j.manual_self_reported),
        manualStatusNote: j.manual_status_note,
        demoData: Boolean(j.demo_data),
        checkpoints: cpRes.rows,
        corroboratingIncidents: activeIncidents.rows.slice(0, 3),
      });
    }

    const totalJourneys = items.length;
    const activeJourneys = items.filter((j) => ['ACTIVE', 'DELAYED'].includes(j.status)).length;
    const completedJourneys = items.filter((j) => j.status === 'COMPLETED').length;
    const totalEstimatedDelayMin = items.reduce((acc, j) => acc + (j.estimatedDelayMin || 0), 0);
    const totalVerifiedDelayMin = items.reduce((acc, j) => acc + (j.verifiedDelayMin || 0), 0);
    const avgVerifiedDelayMin =
      totalJourneys > 0 ? Math.round(totalVerifiedDelayMin / totalJourneys) : 0;

    const allSpeeds = items
      .flatMap((j) => (j.checkpoints || []).map((cp: any) => cp.calculated_speed ?? cp.speed))
      .filter((s) => s != null && s > 0);
    const avgSpeedKmh =
      allSpeeds.length > 0
        ? Math.round((allSpeeds.reduce((a, b) => a + Number(b), 0) / allSpeeds.length) * 10) / 10
        : null;

    const summary = {
      totalJourneys,
      activeJourneys,
      completedJourneys,
      totalEstimatedDelayMin,
      totalVerifiedDelayMin,
      avgVerifiedDelayMin,
      avgSpeedKmh,
    };

    res.json({
      success: true,
      data: items,
      metrics: summary,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/journeys/metrics — Aggregated commute journey metrics for current user
journeysAndConsentsRouter.get('/journeys/metrics', authenticate, async (req, res, next) => {
  try {
    const jRes = await db.query<any>(
      `SELECT status, estimated_delay_min, verified_delay_min
       FROM journeys WHERE employee_id = $1`,
      [req.user!.userId]
    );

    const totalJourneys = jRes.rows.length;
    const activeJourneys = jRes.rows.filter((j) => ['ACTIVE', 'DELAYED'].includes(j.status)).length;
    const completedJourneys = jRes.rows.filter((j) => j.status === 'COMPLETED').length;
    const totalEstimatedDelayMin = jRes.rows.reduce(
      (acc, j) => acc + Number(j.estimated_delay_min || 0),
      0
    );
    const totalVerifiedDelayMin = jRes.rows.reduce(
      (acc, j) => acc + Number(j.verified_delay_min || 0),
      0
    );
    const avgVerifiedDelayMin =
      totalJourneys > 0 ? Math.round(totalVerifiedDelayMin / totalJourneys) : 0;

    const cpSpeeds = await db.query<any>(
      `SELECT calculated_speed, speed
       FROM journey_checkpoints jc
       JOIN journeys j ON j.id = jc.journey_id
       WHERE j.employee_id = $1 AND jc.validation_status = 'VALID'`,
      [req.user!.userId]
    );
    const speeds = cpSpeeds.rows
      .map((r) => r.calculated_speed ?? r.speed)
      .filter((s) => s != null && s > 0);
    const avgSpeedKmh =
      speeds.length > 0
        ? Math.round((speeds.reduce((a, b) => a + Number(b), 0) / speeds.length) * 10) / 10
        : null;

    res.json({
      success: true,
      data: {
        totalJourneys,
        activeJourneys,
        completedJourneys,
        totalEstimatedDelayMin,
        totalVerifiedDelayMin,
        avgVerifiedDelayMin,
        avgSpeedKmh,
      },
    });
  } catch (err) {
    next(err);
  }
});


// GET /api/v1/journeys/:id
journeysAndConsentsRouter.get('/journeys/:id', authenticate, async (req, res, next) => {
  try {
    const jRes = await db.query<any>(`SELECT * FROM journeys WHERE id = $1`, [req.params.id]);
    if (jRes.rows.length === 0) {
      throw new ApiError(404, 'JOURNEY_NOT_FOUND', 'Journey not found');
    }
    const j = jRes.rows[0];
    if (j.employee_id !== req.user!.userId && !['ADMIN', 'EMPLOYER'].includes(req.user!.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Not authorized to inspect this journey');
    }
    const cpRes = await db.query<any>(
      `SELECT * FROM journey_checkpoints WHERE journey_id = $1 ORDER BY recorded_at ASC`,
      [j.id]
    );
    res.json({
      success: true,
      data: {
        ...j,
        checkpoints: cpRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/journeys/:id/checkpoints — Record permitted checkpoint(s) / bounded batch while session is active
journeysAndConsentsRouter.post('/journeys/:id/checkpoints', authenticate, async (req, res, next) => {
  try {
    const journeyId = String(req.params.id);

    let observations: any[];
    if (Array.isArray(req.body)) {
      observations = req.body;
    } else if (Array.isArray(req.body?.checkpoints)) {
      observations = req.body.checkpoints;
    } else {
      observations = [req.body];
    }

    if (observations.length === 0) {
      throw new ApiError(400, 'EMPTY_BATCH', 'At least one GPS observation must be provided');
    }
    if (observations.length > 100) {
      throw new ApiError(400, 'BATCH_TOO_LARGE', 'Maximum batch size is 100 observations');
    }

    const parsedObservations = observations.map((o) => CheckpointSchema.parse(o));
    const result = await processGpsBatch(journeyId, req.user!.userId, parsedObservations);

    const firstCp = result.checkpoints[0];
    res.status(201).json({
      success: true,
      data: {
        checkpointId: firstCp?.id,
        journeyId,
        processedCount: result.processedCount,
        validCount: result.validCount,
        checkpoints: result.checkpoints,
        journeyUpdated: result.journeyUpdated,
        matchedIncidentId: result.matchedIncidentId,
        recordedAt: firstCp?.recordedAt || new Date().toISOString(),
        sourceType: firstCp?.sourceType || 'BROWSER_GPS',
      },
    });
  } catch (err) {
    next(err);
  }
});


// POST /api/v1/journeys/:id/stop — Explicitly stop an active commute session
journeysAndConsentsRouter.post('/journeys/:id/stop', authenticate, async (req, res, next) => {
  try {
    const journeyId = req.params.id;
    const jRes = await db.query<any>(`SELECT * FROM journeys WHERE id = $1`, [journeyId]);
    if (jRes.rows.length === 0) {
      throw new ApiError(404, 'JOURNEY_NOT_FOUND', 'Journey not found');
    }
    const journey = jRes.rows[0];
    if (journey.employee_id !== req.user!.userId && req.user!.role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only the employee can stop their commute session');
    }

    await db.query(
      `UPDATE journeys SET status = 'COMPLETED', ended_at = NOW() WHERE id = $1`,
      [journeyId]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'COMMUTE_SESSION_STOPPED', 'JOURNEY', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        journeyId,
        JSON.stringify({ stoppedAt: new Date().toISOString() }),
      ]
    );

    const updated = await db.query<any>(`SELECT * FROM journeys WHERE id = $1`, [journeyId]);
    res.json({
      success: true,
      data: updated.rows[0],
    });
  } catch (err) {
    next(err);
  }
});
