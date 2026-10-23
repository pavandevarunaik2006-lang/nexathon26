import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { StartJourneySchema, CheckpointSchema } from '@roadalert/shared';
import { haversineDistanceKm } from '../services/verificationEngine.js';
import { evaluateJourneyDelay } from '../services/delayVerificationService.js';

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
    const ConsentCreateSchema = z.object({
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

    const parsed = ConsentCreateSchema.parse(req.body);

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

    res.json({
      success: true,
      data: items,
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

// POST /api/v1/journeys/:id/checkpoints — Record permitted checkpoint while session is active
journeysAndConsentsRouter.post('/journeys/:id/checkpoints', authenticate, async (req, res, next) => {
  try {
    const journeyId = req.params.id;
    const parsed = CheckpointSchema.parse(req.body);

    const jRes = await db.query<any>(`SELECT * FROM journeys WHERE id = $1`, [journeyId]);
    if (jRes.rows.length === 0) {
      throw new ApiError(404, 'JOURNEY_NOT_FOUND', 'Journey not found');
    }
    const journey = jRes.rows[0];
    if (journey.employee_id !== req.user!.userId) {
      throw new ApiError(403, 'FORBIDDEN', 'Only the session owner can record checkpoints');
    }
    if (journey.ended_at || ['COMPLETED', 'TERMINATED'].includes(journey.status)) {
      throw new ApiError(
        400,
        'JOURNEY_ALREADY_ENDED',
        'Cannot record checkpoints after the commute session has been stopped'
      );
    }

    const cpId = crypto.randomUUID();
    await db.query(
      `INSERT INTO journey_checkpoints (id, journey_id, latitude, longitude, speed, source_type, status_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        cpId,
        journeyId,
        parsed.latitude,
        parsed.longitude,
        parsed.speed,
        parsed.sourceType,
        parsed.statusNote || null,
      ]
    );

    // Check if checkpoint is near an active incident and speed < 15 km/h to auto-corroborate commute delay
    const incidentsRes = await db.query<any>(
      `SELECT * FROM incidents WHERE status NOT IN ('RESOLVED', 'REJECTED')`
    );
    let matchedDelay = journey.estimated_delay_min;
    for (const inc of incidentsRes.rows) {
      const dist = haversineDistanceKm(
        parsed.latitude,
        parsed.longitude,
        Number(inc.latitude),
        Number(inc.longitude)
      );
      if (dist <= 2.5 && parsed.speed <= 20) {
        matchedDelay = Math.max(matchedDelay, Number(inc.estimated_delay_minutes || 15));
      }
    }

    await db.query(
      `UPDATE journeys
       SET estimated_delay_min = $1,
           manual_self_reported = CASE WHEN $2 = 'MANUAL_SELF_REPORTED' THEN TRUE ELSE manual_self_reported END
       WHERE id = $3`,
      [matchedDelay, parsed.sourceType, journeyId]
    );

    res.status(201).json({
      success: true,
      data: {
        checkpointId: cpId,
        journeyId,
        recordedAt: new Date().toISOString(),
        sourceType: parsed.sourceType,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/journeys/:id/stop — Explicitly stop an active commute session
journeysAndConsentsRouter.post('/journeys/:id/stop', authenticate, async (req, res, next) => {
  try {
    const journeyId = String(req.params.id);
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

    // Auto-evaluate delay verification for employer verification audit trail
    try {
      await evaluateJourneyDelay({ journeyId, forceReevaluate: true });
    } catch {
      // Non-blocking for commuter stopping session
    }

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

const UpdateCommuteProfileSchema = z.object({
  department: z.string().max(100).optional().or(z.literal('')),
  employeeCode: z.string().max(50).optional().or(z.literal('')),
  usualCommuteOrigin: z.string().max(200).optional().or(z.literal('')),
  usualCommuteDestination: z.string().max(200).optional().or(z.literal('')),
  usualCommuteCorridor: z.string().max(100).optional().or(z.literal('')),
  usualCommuteOriginLat: z.number().min(-90).max(90).optional().nullable(),
  usualCommuteOriginLng: z.number().min(-180).max(180).optional().nullable(),
  usualCommuteDestLat: z.number().min(-90).max(90).optional().nullable(),
  usualCommuteDestLng: z.number().min(-180).max(180).optional().nullable(),
  shiftStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  shiftEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  sharePreciseCoords: z.boolean().optional(),
});

// GET /api/v1/commute/profile — Get employee's own commute profile and organization context
journeysAndConsentsRouter.get('/commute/profile', authenticate, async (req, res, next) => {
  try {
    const memRes = await db.query<any>(
      `SELECT om.*, o.name as organization_name, o.city as organization_city,
              o.address as organization_address, o.default_shift_start, o.default_shift_end,
              tc.id as consent_id, tc.share_precise_coords, tc.revoked_at as consent_revoked_at,
              tc.granted_at as consent_granted_at, tc.purpose as consent_purpose
       FROM organization_memberships om
       JOIN organizations o ON o.id = om.organization_id
       LEFT JOIN tracking_consents tc ON tc.user_id = om.user_id AND tc.organization_id = om.organization_id AND tc.revoked_at IS NULL
       WHERE om.user_id = $1 AND om.status = 'ACTIVE'
       LIMIT 1`,
      [req.user!.userId]
    );

    if (memRes.rows.length === 0) {
      res.json({
        success: true,
        data: {
          hasOrganization: false,
          membership: null,
        },
      });
      return;
    }

    const r = memRes.rows[0];
    res.json({
      success: true,
      data: {
        hasOrganization: true,
        organizationId: r.organization_id,
        organizationName: r.organization_name,
        organizationCity: r.organization_city,
        membershipId: r.id,
        membershipRole: r.membership_role,
        department: r.department || '',
        employeeCode: r.employee_code || '',
        usualCommuteOrigin: r.usual_commute_origin || '',
        usualCommuteDestination: r.usual_commute_destination || '',
        usualCommuteCorridor: r.usual_commute_corridor || '',
        usualCommuteOriginLat: r.usual_commute_origin_lat,
        usualCommuteOriginLng: r.usual_commute_origin_lng,
        usualCommuteDestLat: r.usual_commute_dest_lat,
        usualCommuteDestLng: r.usual_commute_dest_lng,
        shiftStartTime: r.shift_start_time || r.default_shift_start || '09:00',
        shiftEndTime: r.shift_end_time || r.default_shift_end || '18:00',
        consentId: r.consent_id || null,
        consentActive: Boolean(r.consent_id && !r.consent_revoked_at),
        sharePreciseCoords: Boolean(r.share_precise_coords),
        consentGrantedAt: r.consent_granted_at || null,
        consentPurpose: r.consent_purpose || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/commute/profile — Configure or confirm employee's own commute profile and consent
journeysAndConsentsRouter.patch('/commute/profile', authenticate, async (req, res, next) => {
  try {
    const parsed = UpdateCommuteProfileSchema.parse(req.body);

    const memRes = await db.query<any>(
      `SELECT * FROM organization_memberships WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [req.user!.userId]
    );

    if (memRes.rows.length === 0) {
      throw new ApiError(404, 'NO_ACTIVE_MEMBERSHIP', 'No active organization membership found for this user');
    }

    const cur = memRes.rows[0];

    // Check duplicate employee code within org if changing employee code
    if (parsed.employeeCode && parsed.employeeCode.trim() && parsed.employeeCode.trim() !== cur.employee_code) {
      const codeCheck = await db.query(
        `SELECT id FROM organization_memberships WHERE organization_id = $1 AND employee_code = $2 AND id != $3`,
        [cur.organization_id, parsed.employeeCode.trim(), cur.id]
      );
      if (codeCheck.rows.length > 0) {
        throw new ApiError(
          409,
          'DUPLICATE_EMPLOYEE_CODE',
          `An employee with Employee ID "${parsed.employeeCode}" already exists in your organization`
        );
      }
    }

    await db.query(
      `UPDATE organization_memberships
       SET department = $1,
           employee_code = $2,
           usual_commute_origin = $3,
           usual_commute_destination = $4,
           usual_commute_corridor = $5,
           usual_commute_origin_lat = $6,
           usual_commute_origin_lng = $7,
           usual_commute_dest_lat = $8,
           usual_commute_dest_lng = $9,
           shift_start_time = $10,
           shift_end_time = $11,
           updated_at = NOW()
       WHERE id = $12`,
      [
        parsed.department !== undefined ? (parsed.department || null) : cur.department,
        parsed.employeeCode !== undefined ? (parsed.employeeCode || null) : cur.employee_code,
        parsed.usualCommuteOrigin !== undefined ? (parsed.usualCommuteOrigin || null) : cur.usual_commute_origin,
        parsed.usualCommuteDestination !== undefined ? (parsed.usualCommuteDestination || null) : cur.usual_commute_destination,
        parsed.usualCommuteCorridor !== undefined ? (parsed.usualCommuteCorridor || null) : cur.usual_commute_corridor,
        parsed.usualCommuteOriginLat !== undefined ? parsed.usualCommuteOriginLat : cur.usual_commute_origin_lat,
        parsed.usualCommuteOriginLng !== undefined ? parsed.usualCommuteOriginLng : cur.usual_commute_origin_lng,
        parsed.usualCommuteDestLat !== undefined ? parsed.usualCommuteDestLat : cur.usual_commute_dest_lat,
        parsed.usualCommuteDestLng !== undefined ? parsed.usualCommuteDestLng : cur.usual_commute_dest_lng,
        parsed.shiftStartTime ?? cur.shift_start_time,
        parsed.shiftEndTime ?? cur.shift_end_time,
        cur.id,
      ]
    );

    // If sharePreciseCoords is specified, update or create tracking consent
    if (parsed.sharePreciseCoords !== undefined) {
      const activeConsent = await db.query<any>(
        `SELECT id FROM tracking_consents WHERE user_id = $1 AND organization_id = $2 AND revoked_at IS NULL LIMIT 1`,
        [req.user!.userId, cur.organization_id]
      );
      if (activeConsent.rows.length > 0) {
        await db.query(
          `UPDATE tracking_consents SET share_precise_coords = $1 WHERE id = $2`,
          [parsed.sharePreciseCoords, activeConsent.rows[0].id]
        );
      }
    }

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'COMMUTE_PROFILE_UPDATED', 'ORGANIZATION_MEMBERSHIP', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, cur.id, JSON.stringify(parsed)]
    );

    res.json({
      success: true,
      data: {
        message: 'Commute profile successfully updated',
      },
    });
  } catch (err) {
    next(err);
  }
});
