import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { getAuthorizedOrgIds } from '../repositories/organizationRepository.js';
import { UpdatePolicySchema } from '../validators/index.js';

export async function handleGetEmployerDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);

    if (orgIds.length === 0) {
      res.json({
        success: true,
        data: {
          organization: null,
          metrics: {
            authorizedEmployees: 0,
            activeConsentedJourneys: 0,
            delayedCommutes: 0,
            avgVerifiedDelayMin: 0,
          },
          activeJourneys: [],
          relevantCorridorIncidents: [],
        },
      });
      return;
    }

    const primaryOrgId = orgIds[0];
    const orgRes = await db.query<any>(`SELECT * FROM organizations WHERE id = $1`, [primaryOrgId]);
    const policyRes = await db.query<any>(
      `SELECT * FROM organization_tracking_policies WHERE organization_id = $1`,
      [primaryOrgId]
    );

    const empRes = await db.query<any>(
      `SELECT u.id, u.name, u.email, om.membership_role, om.status
       FROM organization_memberships om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1 AND om.membership_role = 'EMPLOYEE'`,
      [primaryOrgId]
    );

    const journeysRes = await db.query<any>(
      `SELECT j.*, u.name as employee_name, u.email as employee_email,
              tc.purpose as consent_purpose, tc.share_precise_coords, tc.revoked_at
       FROM journeys j
       JOIN tracking_consents tc ON tc.id = j.consent_record_id
       JOIN users u ON u.id = j.employee_id
       WHERE tc.organization_id = $1 AND tc.revoked_at IS NULL
       ORDER BY j.started_at DESC`,
      [primaryOrgId]
    );

    const allowPrecisePolicy = Boolean(policyRes.rows[0]?.allow_precise_coordinate);

    const sanitizedJourneys = journeysRes.rows.map((j: any) => {
      const canExposeCoords = allowPrecisePolicy && Boolean(j.share_precise_coords);
      return {
        id: j.id,
        employeeId: j.employee_id,
        employeeName: j.employee_name,
        origin: j.origin,
        destination: j.destination,
        startedAt: j.started_at,
        endedAt: j.ended_at,
        status: j.status,
        estimatedDelayMin: Number(j.estimated_delay_min || 0),
        verifiedDelayMin: Number(j.verified_delay_min || 0),
        verificationLevel: Number(j.verification_level || 1),
        manualSelfReported: Boolean(j.manual_self_reported),
        manualStatusNote: j.manual_status_note,
        demoData: Boolean(j.demo_data),
        preciseCoordinatesRedacted: !canExposeCoords,
        ...(canExposeCoords
          ? {
              originLat: j.origin_lat,
              originLng: j.origin_lng,
              destLat: j.dest_lat,
              destLng: j.dest_lng,
            }
          : {}),
      };
    });

    const activeJourneys = sanitizedJourneys.filter((j: any) =>
      ['ACTIVE', 'DELAYED'].includes(j.status)
    );
    const delayedCommutes = activeJourneys.filter((j: any) => j.estimatedDelayMin > 0);
    const avgVerifiedDelayMin =
      sanitizedJourneys.length > 0
        ? Math.round(
            sanitizedJourneys.reduce((acc: number, r: any) => acc + r.verifiedDelayMin, 0) /
              sanitizedJourneys.length
          )
        : 0;

    const incidentsRes = await db.query<any>(
      `SELECT id, title, category, severity, status, road_name, confidence_score, verification_level, estimated_delay_minutes, reported_at, demo_data
       FROM incidents
       WHERE status NOT IN ('REJECTED', 'RESOLVED') AND confidence_score >= 60
       ORDER BY confidence_score DESC
       LIMIT 6`
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYER_VIEW_DASHBOARD', 'ORGANIZATION', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        primaryOrgId,
        JSON.stringify({ viewedJourneysCount: sanitizedJourneys.length }),
      ]
    );

    res.json({
      success: true,
      data: {
        organization: orgRes.rows[0],
        policy: policyRes.rows[0] || null,
        metrics: {
          authorizedEmployees: empRes.rows.length,
          activeConsentedJourneys: activeJourneys.length,
          delayedCommutes: delayedCommutes.length,
          avgVerifiedDelayMin,
        },
        activeJourneys: sanitizedJourneys,
        relevantCorridorIncidents: incidentsRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function handleListEmployerEmployees(req: Request, res: Response, next: NextFunction) {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const empRes = await db.query<any>(
      `SELECT u.id, u.name, u.email, u.role, u.status, om.membership_role, om.created_at as joined_at,
              (SELECT COUNT(*) FROM tracking_consents tc WHERE tc.user_id = u.id AND tc.organization_id = $1 AND tc.revoked_at IS NULL) as active_consents_count,
              (SELECT COUNT(*) FROM journeys j JOIN tracking_consents tc2 ON tc2.id = j.consent_record_id WHERE j.employee_id = u.id AND tc2.organization_id = $1) as total_journeys_count
       FROM organization_memberships om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1
       ORDER BY om.membership_role ASC, u.name ASC`,
      [primaryOrgId]
    );

    res.json({
      success: true,
      data: empRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleListEmployerJourneys(req: Request, res: Response, next: NextFunction) {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const journeysRes = await db.query<any>(
      `SELECT j.*, u.name as employee_name, u.email as employee_email,
              tc.policy_version, tc.purpose as consent_purpose, tc.share_precise_coords
       FROM journeys j
       JOIN tracking_consents tc ON tc.id = j.consent_record_id
       JOIN users u ON u.id = j.employee_id
       WHERE tc.organization_id = $1 AND tc.revoked_at IS NULL
       ORDER BY j.started_at DESC`,
      [primaryOrgId]
    );

    const items = journeysRes.rows.map((j: any) => ({
      id: j.id,
      employeeName: j.employee_name,
      employeeEmail: j.employee_email,
      origin: j.origin,
      destination: j.destination,
      startedAt: j.started_at,
      endedAt: j.ended_at,
      status: j.status,
      estimatedDelayMin: Number(j.estimated_delay_min || 0),
      verifiedDelayMin: Number(j.verified_delay_min || 0),
      verificationLevel: Number(j.verification_level || 1),
      manualSelfReported: Boolean(j.manual_self_reported),
      consentPolicyVersion: j.policy_version,
      preciseCoordinatesRedacted: !j.share_precise_coords,
      demoData: Boolean(j.demo_data),
    }));

    if (req.query.format === 'csv') {
      const header =
        'JourneyID,EmployeeName,Origin,Destination,StartedAt,EndedAt,Status,EstimatedDelayMin,VerifiedDelayMin,VerificationLevel,SelfReported,DemoData\n';
      const rows = items
        .map(
          (i: any) =>
            `"${i.id}","${i.employeeName}","${i.origin}","${i.destination}","${i.startedAt}","${
              i.endedAt || ''
            }","${i.status}",${i.estimatedDelayMin},${i.verifiedDelayMin},${i.verificationLevel},${
              i.manualSelfReported
            },${i.demoData}`
        )
        .join('\n');

      await db.query(
        `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'EMPLOYER_EXPORT_COMMUTE_CSV', 'ORGANIZATION', $3, $4)`,
        [
          crypto.randomUUID(),
          req.user!.userId,
          primaryOrgId,
          JSON.stringify({ exportedRowCount: items.length }),
        ]
      );

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="roadalert-authorized-commute-report.csv"'
      );
      res.send(header + rows);
      return;
    }

    res.json({
      success: true,
      data: items,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleListEmployerPolicies(req: Request, res: Response, next: NextFunction) {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const polRes = await db.query<any>(
      `SELECT otp.*, o.name as organization_name
       FROM organization_tracking_policies otp
       JOIN organizations o ON o.id = otp.organization_id
       WHERE otp.organization_id = $1`,
      [primaryOrgId]
    );

    res.json({
      success: true,
      data: polRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateEmployerPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const policyId = req.params.id;
    const parsed = UpdatePolicySchema.parse(req.body);

    const existing = await db.query<any>(
      `SELECT * FROM organization_tracking_policies WHERE id = $1`,
      [policyId]
    );
    if (existing.rows.length === 0) {
      throw new ApiError(404, 'POLICY_NOT_FOUND', 'Organization tracking policy not found');
    }
    const pol = existing.rows[0];
    await getAuthorizedOrgIds(req.user!.userId, req.user!.role, pol.organization_id);

    await db.query(
      `UPDATE organization_tracking_policies
       SET tracking_mode = $1,
           retention_days = $2,
           require_consent = $3,
           allow_precise_coordinate = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [
        parsed.trackingMode ?? pol.tracking_mode,
        parsed.retentionDays ?? pol.retention_days,
        parsed.requireConsent ?? pol.require_consent,
        parsed.allowPreciseCoordinate ?? pol.allow_precise_coordinate,
        policyId,
      ]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYER_POLICY_UPDATED', 'ORGANIZATION_POLICY', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, policyId, JSON.stringify(parsed)]
    );

    const updated = await db.query<any>(
      `SELECT * FROM organization_tracking_policies WHERE id = $1`,
      [policyId]
    );
    res.json({
      success: true,
      data: updated.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetEmployerActiveLocations(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    if (!primaryOrgId) {
      res.json({
        success: true,
        data: {
          organizationId: null,
          activeLocationsCount: 0,
          locations: [],
        },
      });
      return;
    }

    const policyRes = await db.query<any>(
      `SELECT * FROM organization_tracking_policies WHERE organization_id = $1`,
      [primaryOrgId]
    );
    const allowPrecise = Boolean(policyRes.rows[0]?.allow_precise_coordinate);

    const activeJourneysRes = await db.query<any>(
      `SELECT j.*, u.name as employee_name, u.email as employee_email,
              tc.share_precise_coords, tc.purpose as consent_purpose, tc.policy_version
       FROM journeys j
       JOIN tracking_consents tc ON tc.id = j.consent_record_id
       JOIN users u ON u.id = j.employee_id
       WHERE tc.organization_id = $1
         AND tc.revoked_at IS NULL
         AND j.status IN ('ACTIVE', 'DELAYED')
         AND j.ended_at IS NULL
       ORDER BY j.started_at DESC`,
      [primaryOrgId]
    );

    const locations = [];
    for (const j of activeJourneysRes.rows) {
      const latestCpRes = await db.query<any>(
        `SELECT * FROM journey_checkpoints
         WHERE journey_id = $1
         ORDER BY recorded_at DESC LIMIT 1`,
        [j.id]
      );
      const cp = latestCpRes.rows[0] || null;
      const canExposePrecise = allowPrecise && Boolean(j.share_precise_coords);

      locations.push({
        journeyId: j.id,
        employeeId: j.employee_id,
        employeeName: j.employee_name,
        employeeEmail: j.employee_email,
        origin: j.origin,
        destination: j.destination,
        journeyStatus: j.status,
        startedAt: j.started_at,
        estimatedDelayMin: Number(j.estimated_delay_min || 0),
        verifiedDelayMin: Number(j.verified_delay_min || 0),
        verificationLevel: Number(j.verification_level || 1),
        consentPolicyVersion: j.policy_version,
        preciseCoordinatesRedacted: !canExposePrecise,
        latestObservation: cp
          ? {
              recordedAt: cp.recorded_at,
              receivedAt: cp.received_at,
              sourceType: cp.source_type,
              validationStatus: cp.validation_status,
              ...(canExposePrecise
                ? {
                    latitude: Number(cp.latitude),
                    longitude: Number(cp.longitude),
                    accuracy: cp.accuracy !== null ? Number(cp.accuracy) : null,
                    speed: cp.speed !== null ? Number(cp.speed) : null,
                    calculatedSpeed:
                      cp.calculated_speed !== null ? Number(cp.calculated_speed) : null,
                    heading: cp.heading !== null ? Number(cp.heading) : null,
                  }
                : {}),
            }
          : null,
      });
    }

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYER_VIEW_ACTIVE_LOCATIONS', 'ORGANIZATION', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        primaryOrgId,
        JSON.stringify({ activeLocationsRetrieved: locations.length }),
      ]
    );

    res.json({
      success: true,
      data: {
        organizationId: primaryOrgId,
        activeLocationsCount: locations.length,
        locations,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function handleListEmployerDelayReports(req: Request, res: Response, next: NextFunction) {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);

    if (orgIds.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const primaryOrgId = orgIds[0];

    const reportsRes = await db.query<any>(
      `SELECT cdr.*, u.name as employee_name, u.email as employee_email,
              j.origin, j.destination, j.started_at, j.ended_at, j.estimated_delay_min,
              rev.name as reviewer_name
       FROM commute_delay_reports cdr
       JOIN users u ON u.id = cdr.employee_id
       LEFT JOIN journeys j ON j.id = cdr.journey_id
       LEFT JOIN tracking_consents tc ON tc.id = j.consent_record_id
       LEFT JOIN users rev ON rev.id = cdr.reviewer_id
       WHERE tc.organization_id = $1
       ORDER BY cdr.created_at DESC`,
      [primaryOrgId]
    );

    const data = reportsRes.rows.map((r: any) => ({
      id: r.id,
      journeyId: r.journey_id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      employeeEmail: r.employee_email,
      origin: r.origin || 'Commute Route',
      destination: r.destination || 'Workplace',
      startedAt: r.started_at,
      endedAt: r.ended_at,
      delayReason: r.delay_reason,
      delayMinutes: Number(r.delay_minutes || 15),
      status: r.status,
      reviewerId: r.reviewer_id,
      reviewerName: r.reviewer_name,
      reviewerNotes: r.reviewer_notes,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      evidenceUrl: r.evidence_file_path ? `/uploads/${r.evidence_file_path.split(/[\\/]/).pop()}` : null,
      evidenceOriginalName: r.evidence_original_name,
      evidenceMimeType: r.evidence_mime_type,
    }));

    res.json({
      success: true,
      data: {
        reports: data,
        list: data,
      },
      reports: data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleReviewEmployerDelayReport(req: Request, res: Response, next: NextFunction) {
  try {
    const reportId = String(req.params.id);
    const decision = req.body?.decision || req.body?.action;
    const notes = req.body?.notes;

    if (!['APPROVE', 'REQUEST_EVIDENCE', 'DISPUTE', 'EVIDENCE_REQUESTED', 'NEEDS_EVIDENCE'].includes(decision)) {
      throw new ApiError(400, 'INVALID_DECISION', 'Decision must be APPROVE, REQUEST_EVIDENCE, or DISPUTE.');
    }

    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role);
    if (orgIds.length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'No authorized organization found for reviewer.');
    }

    // Verify report belongs to an employee under reviewer's organization
    const reportRes = await db.query<any>(
      `SELECT cdr.*, tc.organization_id, j.id as journey_ref_id
       FROM commute_delay_reports cdr
       LEFT JOIN journeys j ON j.id = cdr.journey_id
       LEFT JOIN tracking_consents tc ON tc.id = j.consent_record_id
       WHERE cdr.id = $1`,
      [reportId]
    );

    if (reportRes.rows.length === 0) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', 'Delay report not found.');
    }

    const report = reportRes.rows[0];
    if (report.organization_id && !orgIds.includes(report.organization_id)) {
      throw new ApiError(403, 'ORGANIZATION_ISOLATION_VIOLATION', 'Cannot review report belonging to another organization.');
    }

    const newStatus =
      decision === 'APPROVE' ? 'APPROVED' :
      (decision === 'REQUEST_EVIDENCE' || decision === 'EVIDENCE_REQUESTED' || decision === 'NEEDS_EVIDENCE') ? 'EVIDENCE_REQUESTED' : 'DISPUTED';

    await db.query(
      `UPDATE commute_delay_reports
       SET status = $1, reviewer_id = $2, reviewer_notes = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [newStatus, req.user!.userId, notes || null, reportId]
    );

    // If approved, update verified_delay_min on the journey record
    if (decision === 'APPROVE' && report.journey_ref_id) {
      await db.query(
        `UPDATE journeys SET verified_delay_min = $1, manual_self_reported = TRUE, manual_status_note = $2
         WHERE id = $3`,
        [Number(report.delay_minutes || 15), `Employer approved delay: ${report.delay_reason}`, report.journey_ref_id]
      );
    }

    // Log audit trail
    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'REVIEW_COMMUTE_DELAY_REPORT', 'COMMUTE_DELAY_REPORT', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        reportId,
        JSON.stringify({ decision, newStatus, reviewerNotes: notes, delayMinutes: Number(report.delay_minutes || 15) }),
      ]
    );

    const updatedReport = {
      id: reportId,
      status: newStatus,
      reviewer_id: req.user!.userId,
      reviewer_notes: notes || null,
      reviewed_at: new Date().toISOString(),
      delay_minutes: Number(report.delay_minutes || 15),
    };

    res.json({
      success: true,
      data: {
        report: updatedReport,
        ...updatedReport,
      },
      report: updatedReport,
    });
  } catch (err) {
    next(err);
  }
}
