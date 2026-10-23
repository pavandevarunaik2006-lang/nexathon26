import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { REGIONAL_DESTINATIONS } from '@roadalert/shared';
import { calculateRoutesWithIncidents } from '../services/routingService.js';
import { ApiError } from '../middleware/errorHandler.js';

export const mapAndRoutesRouter = Router();

// In-memory store for recently planned routes so GET /api/v1/routes/:id works seamlessly
const plannedRouteCache = new Map<string, any>();

// GET /api/v1/map/incidents — Optimized map incident feed with filters and lastUpdated timestamp
mapAndRoutesRouter.get('/map/incidents', async (req, res, next) => {
  try {
    const { category, severity, verificationStatus, hoursWindow } = req.query;
    const conditions: string[] = [`i.status != 'REJECTED'`];
    const params: any[] = [];

    if (category && category !== 'ALL') {
      params.push(String(category));
      conditions.push(`i.category = $${params.length}`);
    }
    if (severity && severity !== 'ALL') {
      params.push(String(severity));
      conditions.push(`i.severity = $${params.length}`);
    }
    if (verificationStatus && verificationStatus !== 'ALL') {
      if (verificationStatus === 'HIGH_CONFIDENCE') {
        conditions.push(`i.confidence_score >= 80`);
      } else if (verificationStatus === 'CORROBORATED') {
        conditions.push(`i.confidence_score >= 60`);
      } else if (verificationStatus === 'AUTHORITY_CONFIRMED') {
        conditions.push(`i.authority_confirmed = TRUE`);
      } else if (verificationStatus === 'UNVERIFIED') {
        conditions.push(`i.confidence_score < 60`);
      }
    }
    if (hoursWindow && Number(hoursWindow) > 0) {
      const cutoff = new Date(Date.now() - Number(hoursWindow) * 3600 * 1000).toISOString();
      params.push(cutoff);
      conditions.push(`i.reported_at >= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const rowsRes = await db.query<any>(
      `SELECT i.*,
              u.name as reporter_name,
              (SELECT COUNT(*) FROM incident_corroborations ic WHERE ic.incident_id = i.id AND ic.corroboration_type != 'DISPUTE') as corroboration_count,
              (SELECT COUNT(*) FROM incident_evidences ie WHERE ie.incident_id = i.id) as evidence_count
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reporter_id
       ${whereClause}
       ORDER BY i.reported_at DESC`,
      params
    );

    const items = rowsRes.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      severity: r.severity,
      status: r.status,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      roadName: r.road_name,
      occurrenceTime: r.occurrence_time,
      reportedAt: r.reported_at,
      updatedAt: r.updated_at,
      confidenceScore: Number(r.confidence_score),
      verificationLevel: Number(r.verification_level),
      authorityConfirmed: Boolean(r.authority_confirmed),
      roadClosed: Boolean(r.road_closed),
      estimatedDelayMinutes: Number(r.estimated_delay_minutes || 15),
      demoData: Boolean(r.demo_data),
      corroborationCount: Number(r.corroboration_count || 0),
      evidenceCount: Number(r.evidence_count || 0),
      reporterName: r.anonymous_public_display
        ? 'Anonymous Commuter'
        : r.reporter_name || 'Commuter',
    }));

    res.json({
      success: true,
      data: {
        lastUpdated: new Date().toISOString(),
        totalCount: items.length,
        landmarks: REGIONAL_DESTINATIONS,
        incidents: items,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/routes/plan — Origin/Destination Route Planning with Incident Avoidance
mapAndRoutesRouter.post('/routes/plan', async (req, res, next) => {
  try {
    const PlanSchema = z.object({
      origin: z.string().min(2),
      destination: z.string().min(2),
      originLat: z.number().min(-90).max(90).optional(),
      originLng: z.number().min(-180).max(180).optional(),
      destLat: z.number().min(-90).max(90).optional(),
      destLng: z.number().min(-180).max(180).optional(),
      avoidIncidentZones: z.boolean().optional().default(true),
    });

    const parsed = PlanSchema.parse(req.body);

    // Resolve coordinates from REGIONAL_DESTINATIONS if not explicitly passed
    const originMatch = REGIONAL_DESTINATIONS.find((d) =>
      d.name.toLowerCase().includes(parsed.origin.toLowerCase())
    );
    const destMatch = REGIONAL_DESTINATIONS.find((d) =>
      d.name.toLowerCase().includes(parsed.destination.toLowerCase())
    );

    const originCoords = {
      lat: parsed.originLat ?? originMatch?.lat ?? 12.8669, // default Pumpwell Mangaluru
      lng: parsed.originLng ?? originMatch?.lng ?? 74.8692,
    };
    const destCoords = {
      lat: parsed.destLat ?? destMatch?.lat ?? 13.3409, // default Udupi Bypass
      lng: parsed.destLng ?? destMatch?.lng ?? 74.7351,
    };

    const activeIncidentsRes = await db.query<any>(
      `SELECT * FROM incidents WHERE status NOT IN ('RESOLVED', 'REJECTED')`
    );

    const result = await calculateRoutesWithIncidents(
      parsed.origin,
      parsed.destination,
      originCoords,
      destCoords,
      parsed.avoidIncidentZones,
      activeIncidentsRes.rows
    );

    const planId = `plan-${Date.now()}`;
    const payload = { id: planId, createdAt: new Date().toISOString(), ...result };
    plannedRouteCache.set(planId, payload);

    res.json({
      success: true,
      data: payload,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/routes/:id
mapAndRoutesRouter.get('/routes/:id', async (req, res, next) => {
  try {
    const cached = plannedRouteCache.get(req.params.id);
    if (!cached) {
      throw new ApiError(404, 'ROUTE_PLAN_NOT_FOUND', 'Planned route session not found');
    }
    res.json({
      success: true,
      data: cached,
    });
  } catch (err) {
    next(err);
  }
});
