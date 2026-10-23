import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { REGIONAL_DESTINATIONS, classifyIncidentVerificationState } from '@roadalert/shared';
import { RoutePlanRequestSchema } from '../validators/index.js';
import { calculateRoutesWithIncidents } from '../services/routingService.js';
import {
  searchLocations,
  reverseGeocodeLocation,
  resolveRouteEndpoint,
} from '../services/geocodingService.js';
import { haversineDistanceKm } from '../services/verificationEngine.js';
import { ApiError } from '../middleware/errorHandler.js';

// In-memory store for recently planned routes so GET /api/v1/routes/:id works seamlessly
const plannedRouteCache = new Map<string, any>();

export async function handleSearchLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limitRaw = req.query.limit ? Number(req.query.limit) : 8;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(15, limitRaw)) : 8;

    const suggestions = await searchLocations(q, limit);
    res.json({
      success: true,
      data: {
        query: q,
        suggestions,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function handleReverseGeocode(req: Request, res: Response, next: NextFunction) {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (
      req.query.lat === undefined ||
      req.query.lng === undefined ||
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      throw new ApiError(
        400,
        'INVALID_COORDINATES',
        'Valid numeric lat and lng query parameters are required.'
      );
    }

    const resolved = await reverseGeocodeLocation(lat, lng);
    res.json({
      success: true,
      data: resolved,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetMapIncidents(req: Request, res: Response, next: NextFunction) {
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
      verificationState: classifyIncidentVerificationState(r),
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
}

export async function handlePlanRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = RoutePlanRequestSchema.parse(req.body);

    const originResolved = await resolveRouteEndpoint(
      {
        text: parsed.origin,
        lat: parsed.originLat,
        lng: parsed.originLng,
      },
      'origin'
    );

    const destResolved = await resolveRouteEndpoint(
      {
        text: parsed.destination,
        lat: parsed.destLat,
        lng: parsed.destLng,
      },
      'destination'
    );

    const endpointDistKm = haversineDistanceKm(
      originResolved.lat,
      originResolved.lng,
      destResolved.lat,
      destResolved.lng
    );

    if (endpointDistKm < 0.05) {
      throw new ApiError(
        400,
        'SAME_ORIGIN_DESTINATION',
        'Origin and destination resolve to the same location. Please choose two distinct points to calculate a route.'
      );
    }

    const activeIncidentsRes = await db.query<any>(
      `SELECT * FROM incidents WHERE status NOT IN ('RESOLVED', 'REJECTED')`
    );

    const result = await calculateRoutesWithIncidents(
      originResolved.label,
      destResolved.label,
      { lat: originResolved.lat, lng: originResolved.lng },
      { lat: destResolved.lat, lng: destResolved.lng },
      parsed.avoidIncidentZones,
      activeIncidentsRes.rows,
      { simulateProviderFailure: parsed.simulateProviderFailure }
    );

    const planId = `plan-${Date.now()}`;
    const payload = {
      id: planId,
      createdAt: new Date().toISOString(),
      originLocation: originResolved,
      destinationLocation: destResolved,
      ...result,
    };
    plannedRouteCache.set(planId, payload);

    res.json({
      success: true,
      data: payload,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetPlannedRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const cached = plannedRouteCache.get(String(req.params.id));
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
}
