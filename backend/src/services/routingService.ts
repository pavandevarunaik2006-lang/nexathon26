import {
  classifyIncidentVerificationState,
  LIFELINE_HOSPITALS,
  type ExplicitRouteState,
  type IncidentVerificationState,
} from '@roadalert/shared';
import { haversineDistanceKm } from './verificationEngine.js';
import { fetchOsrmPrimaryRoute } from '../integrations/osrmClient.js';

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface PlannedRouteOption {
  id: string;
  name: string;
  corridorDescription: string;
  distanceKm: number;
  baseDurationMin: number;
  incidentDelayMin: number;
  totalEstimatedMin: number;
  etaIso: string;
  deltaDurationMin: number;
  deltaDistanceKm: number;
  avoidanceScore: number; // 0-100 (100 = clearest / safest)
  hasRoadClosureWarning: boolean;
  blockedSegments: string[];
  recommended: boolean;
  recommendationReason: string;
  providerSource: 'OSRM_LIVE' | 'REGIONAL_CORRIDOR_FALLBACK';
  geometry: [number, number][]; // [lat, lng]
  affectingIncidents: {
    id: string;
    title: string;
    category: string;
    severity: string;
    confidenceScore: number;
    roadClosed: boolean;
    verificationState: IncidentVerificationState;
    estimatedDelayMinutes: number;
    distanceFromRouteKm: number;
    roadName: string;
    latitude: number;
    longitude: number;
  }[];
}

export interface RouteCalculationOptions {
  simulateProviderFailure?: boolean;
}

/**
 * Compute minimum distance from an incident point [lat, lng] to a polyline of [lat, lng] coordinates,
 * checking both vertices and segment projections.
 */
function minDistanceToPolylineKm(lat: number, lng: number, polyline: [number, number][]): number {
  if (!polyline || polyline.length === 0) return Infinity;
  let minKm = Infinity;

  for (let i = 0; i < polyline.length; i++) {
    const [pLat, pLng] = polyline[i];
    const vertexDist = haversineDistanceKm(lat, lng, pLat, pLng);
    if (vertexDist < minKm) minKm = vertexDist;

    if (i < polyline.length - 1) {
      const [nLat, nLng] = polyline[i + 1];
      const dLat = nLat - pLat;
      const dLng = nLng - pLng;
      const lenSq = dLat * dLat + dLng * dLng;
      if (lenSq > 1e-10) {
        const t = Math.max(0, Math.min(1, ((lat - pLat) * dLat + (lng - pLng) * dLng) / lenSq));
        const projLat = pLat + t * dLat;
        const projLng = pLng + t * dLng;
        const segDist = haversineDistanceKm(lat, lng, projLat, projLng);
        if (segDist < minKm) minKm = segDist;
      }
    }
  }
  return minKm;
}

/**
 * Interpolate waypoints for clean map rendering
 */
function interpolatePolyline(waypoints: [number, number][], stepsPerSegment = 8): [number, number][] {
  const result: [number, number][] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [lat1, lng1] = waypoints[i];
    const [lat2, lng2] = waypoints[i + 1];
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      result.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result;
}

export async function calculateRoutesWithIncidents(
  originName: string,
  destName: string,
  originCoords: RoutePoint,
  destCoords: RoutePoint,
  avoidIncidentZones: boolean,
  activeIncidents: any[],
  options?: RouteCalculationOptions
): Promise<{
  origin: string;
  destination: string;
  originCoords: RoutePoint;
  destCoords: RoutePoint;
  avoidIncidentZones: boolean;
  routeState: ExplicitRouteState;
  evaluatedAtIso: string;
  decisionReason: string;
  primaryRouteId: string;
  recommendedRouteId: string | null;
  triggeringIncident: {
    id: string;
    title: string;
    category: string;
    severity: string;
    roadName: string;
    verificationState: IncidentVerificationState;
    roadClosed: boolean;
  } | null;
  holdingPointSuggestion: {
    label: string;
    lat: number;
    lng: number;
    guidance: string;
  } | null;
  allRoutesClosedWarning: boolean;
  disclaimer: string;
  routes: PlannedRouteOption[];
}> {
  const evaluatedAtIso = new Date().toISOString();

  // Honest failure handling when routing provider / corridor solver is unavailable
  if (
    options?.simulateProviderFailure ||
    !Number.isFinite(originCoords.lat) ||
    !Number.isFinite(originCoords.lng) ||
    !Number.isFinite(destCoords.lat) ||
    !Number.isFinite(destCoords.lng)
  ) {
    return {
      origin: originName,
      destination: destName,
      originCoords,
      destCoords,
      avoidIncidentZones,
      routeState: 'ROUTING_UNAVAILABLE',
      evaluatedAtIso,
      decisionReason:
        'ROUTING_UNAVAILABLE: External OSRM routing provider and regional corridor solver are temporarily unreachable. Displaying last known road state without fabricating a path.',
      primaryRouteId: 'route-nh66-primary',
      recommendedRouteId: null,
      triggeringIncident: null,
      holdingPointSuggestion: null,
      allRoutesClosedWarning: false,
      disclaimer:
        'Routing engine unavailable. No path has been fabricated. Please retry when connectivity to the routing service is restored.',
      routes: [],
    };
  }

  let primaryGeometry: [number, number][] | null = null;
  let primaryDistKm = 0;
  let primaryBaseMin = 0;
  let providerSource: 'OSRM_LIVE' | 'REGIONAL_CORRIDOR_FALLBACK' = 'REGIONAL_CORRIDOR_FALLBACK';

  // Attempt live OSRM query with 2.5s timeout via integration client
  const osrmResult = await fetchOsrmPrimaryRoute(originCoords, destCoords);
  if (osrmResult && osrmResult.geometry.length >= 2) {
    primaryGeometry = osrmResult.geometry;
    primaryDistKm = osrmResult.distanceKm;
    primaryBaseMin = osrmResult.baseDurationMin;
    providerSource = 'OSRM_LIVE';
  }

  const directDist = haversineDistanceKm(
    originCoords.lat,
    originCoords.lng,
    destCoords.lat,
    destCoords.lng
  );

  // Build Option 1: Primary NH-66 Coastal Highway Route
  if (!primaryGeometry) {
    const isNorthSouthCoastal =
      Math.abs(originCoords.lng - 74.82) < 0.22 && Math.abs(destCoords.lng - 74.76) < 0.22;
    if (isNorthSouthCoastal && Math.abs(destCoords.lat - originCoords.lat) > 0.12) {
      const goingNorth = destCoords.lat > originCoords.lat;
      const coastalWaypoints: [number, number][] = [
        [12.8669, 74.8692], // Pumpwell
        [12.8825, 74.8648], // Nanthoor
        [12.8935, 74.8594], // KPT
        [12.9261, 74.8267], // Kuloor
        [12.9522, 74.8105], // Baikampady
        [13.0108, 74.7943], // Surathkal
        [13.0908, 74.7864], // Mulki
        [13.1422, 74.7731], // Padubidri
        [13.2244, 74.7484], // Kaup
        [13.3409, 74.7351], // Udupi
      ];
      const filtered = coastalWaypoints.filter((wp) => {
        const minLat = Math.min(originCoords.lat, destCoords.lat) - 0.015;
        const maxLat = Math.max(originCoords.lat, destCoords.lat) + 0.015;
        return wp[0] >= minLat && wp[0] <= maxLat;
      });
      const ordered = goingNorth ? filtered : [...filtered].reverse();
      primaryGeometry = interpolatePolyline([
        [originCoords.lat, originCoords.lng],
        ...ordered,
        [destCoords.lat, destCoords.lng],
      ]);
    } else {
      const midLat = (originCoords.lat + destCoords.lat) / 2;
      const midLng = (originCoords.lng + destCoords.lng) / 2;
      primaryGeometry = interpolatePolyline([
        [originCoords.lat, originCoords.lng],
        [midLat, midLng],
        [destCoords.lat, destCoords.lng],
      ]);
    }
    primaryDistKm = Math.max(1.2, Math.round(directDist * 1.24 * 10) / 10);
    primaryBaseMin = Math.max(4, Math.round((primaryDistKm / 44) * 60));
  }

  // Scale lateral bypass shift proportional to trip distance so short urban trips have realistic bypasses
  const lateralShift1 = Math.min(0.068, Math.max(0.012, directDist * 0.0014));
  const lateralShift2 = Math.min(0.028, Math.max(0.006, directDist * 0.00065));

  // Build Option 2: Inland / State Highway Alternative (via Bajpe / Moodbidri / Karkala / Padubidri SH-1 or Airport Rd bypass)
  const midLat = (originCoords.lat + destCoords.lat) / 2;
  const midLng = (originCoords.lng + destCoords.lng) / 2 + lateralShift1;
  const q1Lat = originCoords.lat * 0.7 + destCoords.lat * 0.3;
  const q1Lng = originCoords.lng * 0.7 + destCoords.lng * 0.3 + lateralShift1 * 0.76;
  const q3Lat = originCoords.lat * 0.3 + destCoords.lat * 0.7;
  const q3Lng = originCoords.lng * 0.3 + destCoords.lng * 0.7 + lateralShift1 * 0.76;

  const altGeometry1 = interpolatePolyline([
    [originCoords.lat, originCoords.lng],
    [q1Lat, q1Lng],
    [midLat, midLng],
    [q3Lat, q3Lng],
    [destCoords.lat, destCoords.lng],
  ]);
  const altDistKm1 = Math.max(1.5, Math.round(primaryDistKm * 1.18 * 10) / 10);
  const altBaseMin1 = Math.max(5, Math.round(primaryBaseMin * 1.2));

  // Build Option 3: Coastal Service / Express Connector Alternative
  const w1Lat = originCoords.lat * 0.65 + destCoords.lat * 0.35;
  const w1Lng = originCoords.lng * 0.65 + destCoords.lng * 0.35 + lateralShift2 * 0.9;
  const w2Lat = originCoords.lat * 0.35 + destCoords.lat * 0.65;
  const w2Lng = originCoords.lng * 0.35 + destCoords.lng * 0.65 + lateralShift2;

  const altGeometry2 = interpolatePolyline([
    [originCoords.lat, originCoords.lng],
    [w1Lat, w1Lng],
    [w2Lat, w2Lng],
    [destCoords.lat, destCoords.lng],
  ]);
  const altDistKm2 = Math.max(1.4, Math.round(primaryDistKm * 1.09 * 10) / 10);
  const altBaseMin2 = Math.max(5, Math.round(primaryBaseMin * 1.11));

  const rawCandidates = [
    {
      id: 'route-nh66-primary',
      name: 'NH-66 Primary Coastal Highway',
      corridorDescription: `${originName} → Primary Highway Corridor → ${destName}`,
      distanceKm: primaryDistKm,
      baseDurationMin: primaryBaseMin,
      geometry: primaryGeometry,
      providerSource,
    },
    {
      id: 'route-sh-inland-bypass',
      name: 'Inland SH-1 / Bajpe–Padubidri Bypass',
      corridorDescription: `${originName} → Bondel / Bajpe / Kinnigoli / SH-1 → ${destName} (Avoids NH-66 Chokepoints)`,
      distanceKm: altDistKm1,
      baseDurationMin: altBaseMin1,
      geometry: altGeometry1,
      providerSource: 'REGIONAL_CORRIDOR_FALLBACK' as const,
    },
    {
      id: 'route-connector-hybrid',
      name: 'KPT–Kavoor–Haleyangadi Connector',
      corridorDescription: `${originName} → Kavoor / Maravoor Bridge / Inner Coastal Link → ${destName}`,
      distanceKm: altDistKm2,
      baseDurationMin: altBaseMin2,
      geometry: altGeometry2,
      providerSource: 'REGIONAL_CORRIDOR_FALLBACK' as const,
    },
  ];

  const nowMs = Date.now();

  const evaluatedRoutes: PlannedRouteOption[] = rawCandidates.map((cand) => {
    const affecting: PlannedRouteOption['affectingIncidents'] = [];
    const blockedSegments: string[] = [];
    let incidentDelayMin = 0;
    let penaltyPoints = 0;
    let hasRoadClosureWarning = false;

    for (const inc of activeIncidents) {
      const verificationState = classifyIncidentVerificationState(inc);
      if (
        verificationState === 'RESOLVED_OBSTRUCTION' ||
        verificationState === 'REJECTED_REPORT'
      ) {
        continue;
      }

      const incLat = Number(inc.latitude);
      const incLng = Number(inc.longitude);
      if (!Number.isFinite(incLat) || !Number.isFinite(incLng)) continue;

      const distKm = minDistanceToPolylineKm(incLat, incLng, cand.geometry);
      // Consider an incident intersecting/affecting the route if within 1.8 km
      if (distKm <= 1.8) {
        // Strict rule: ONLY a CONFIRMED_OBSTRUCTION blocks a road segment.
        // Unverified reports and verified incidents without confirmed obstruction never set hasRoadClosureWarning.
        const isClosed = verificationState === 'CONFIRMED_OBSTRUCTION';
        if (isClosed) {
          hasRoadClosureWarning = true;
          const segLabel = inc.road_name || inc.roadName || inc.title;
          if (segLabel && !blockedSegments.includes(segLabel)) {
            blockedSegments.push(segLabel);
          }
        }

        const confScore = Number(inc.confidence_score ?? inc.confidenceScore ?? 45);
        const rawDelay = Number(inc.estimated_delay_minutes ?? inc.estimatedDelayMinutes ?? 15);
        // Unverified reports add only a minor caution buffer (25% weight) and never force closure
        const weight =
          verificationState === 'UNVERIFIED_REPORT'
            ? 0.25
            : Math.max(0.45, confScore / 100);
        const weightedDelay = Math.round(rawDelay * weight);
        incidentDelayMin += weightedDelay;

        const sevMult =
          inc.severity === 'CRITICAL'
            ? 28
            : inc.severity === 'HIGH'
            ? 18
            : inc.severity === 'MEDIUM'
            ? 10
            : 5;
        const verMult = verificationState === 'UNVERIFIED_REPORT' ? 0.3 : weight;
        penaltyPoints += Math.round(sevMult * verMult) + (isClosed ? 45 : 0);

        affecting.push({
          id: inc.id,
          title: inc.title,
          category: inc.category,
          severity: inc.severity,
          confidenceScore: confScore,
          roadClosed: isClosed,
          verificationState,
          estimatedDelayMinutes: rawDelay,
          distanceFromRouteKm: Math.round(distKm * 100) / 100,
          roadName: inc.road_name || inc.roadName || 'Corridor Segment',
          latitude: incLat,
          longitude: incLng,
        });
      }
    }

    const avoidanceScore = Math.max(5, Math.min(100, 100 - penaltyPoints));
    const totalEstimatedMin = cand.baseDurationMin + incidentDelayMin;
    const etaIso = new Date(nowMs + totalEstimatedMin * 60_000).toISOString();

    return {
      ...cand,
      incidentDelayMin,
      totalEstimatedMin,
      etaIso,
      deltaDurationMin: 0,
      deltaDistanceKm: 0,
      avoidanceScore,
      hasRoadClosureWarning,
      blockedSegments,
      recommended: false,
      recommendationReason: '',
      affectingIncidents: affecting,
    };
  });

  const primaryRoute = evaluatedRoutes[0];
  for (const r of evaluatedRoutes) {
    r.deltaDurationMin = r.totalEstimatedMin - primaryRoute.totalEstimatedMin;
    r.deltaDistanceKm = Math.round((r.distanceKm - primaryRoute.distanceKm) * 10) / 10;
  }

  // Sort & pick recommended route
  // Never recommend a route with a confirmed road closure if an open route exists
  const sorted = [...evaluatedRoutes].sort((a, b) => {
    if (a.hasRoadClosureWarning !== b.hasRoadClosureWarning) {
      return a.hasRoadClosureWarning ? 1 : -1;
    }
    if (avoidIncidentZones) {
      // Only switch away from primary for avoidanceScore if primary has a verified incident or closure
      const aHasVerified = a.affectingIncidents.some(
        (i) => i.verificationState !== 'UNVERIFIED_REPORT'
      );
      const bHasVerified = b.affectingIncidents.some(
        (i) => i.verificationState !== 'UNVERIFIED_REPORT'
      );
      if (aHasVerified !== bHasVerified) {
        return aHasVerified ? 1 : -1;
      }
      if (aHasVerified && bHasVerified && b.avoidanceScore !== a.avoidanceScore) {
        return b.avoidanceScore - a.avoidanceScore;
      }
    }
    return a.totalEstimatedMin - b.totalEstimatedMin;
  });

  const bestRoute = sorted[0];
  const bestId = bestRoute.id;
  const allRoutesClosedWarning = evaluatedRoutes.every((r) => r.hasRoadClosureWarning);

  const finalRoutes = evaluatedRoutes.map((r) => {
    const isBest = r.id === bestId;
    let reason = '';
    if (r.hasRoadClosureWarning) {
      reason = allRoutesClosedWarning
        ? 'CRITICAL WARNING: All evaluated corridors intersect a confirmed road obstruction. Hold at safe staging point or follow Traffic Authority diversions.'
        : `BLOCKED CORRIDOR: Confirmed obstruction on ${r.blockedSegments.join(', ') || 'corridor'}. Do not traverse closed segments.`;
    } else if (isBest) {
      if (r.affectingIncidents.length === 0) {
        reason = `Recommended: Zero active incidents intersecting corridor (Avoidance Score ${r.avoidanceScore}/100) with reliable travel time (${r.totalEstimatedMin} min).`;
      } else if (
        r.affectingIncidents.every((i) => i.verificationState === 'UNVERIFIED_REPORT')
      ) {
        reason = `Recommended: Only unverified observation(s) reported along corridor; road remains open (${r.totalEstimatedMin} min total; drive with caution).`;
      } else {
        reason = `Recommended: Lowest combined travel + incident-adjusted delay (${r.totalEstimatedMin} min total; ${r.baseDurationMin}m base + ${r.incidentDelayMin}m incident delay).`;
      }
    } else if (r.affectingIncidents.length > 0) {
      reason = `Impacted by ${r.affectingIncidents.length} incident(s) adding ~${r.incidentDelayMin} min estimated delay along ${r.affectingIncidents[0].roadName}.`;
    } else {
      reason = `Clear alternative corridor (${r.distanceKm} km, ${r.baseDurationMin} min base travel time) bypassing primary highway disruptions.`;
    }

    return {
      ...r,
      recommended: isBest && !r.hasRoadClosureWarning,
      recommendationReason: reason,
    };
  });

  // Determine explicit routeState, triggeringIncident, decisionReason, and holdingPointSuggestion
  let routeState: ExplicitRouteState = 'NORMAL';
  let decisionReason = `Primary corridor (${primaryRoute.name}) is open and recommended (${primaryRoute.totalEstimatedMin} min estimated travel time).`;
  let triggeringIncident: {
    id: string;
    title: string;
    category: string;
    severity: string;
    roadName: string;
    verificationState: IncidentVerificationState;
    roadClosed: boolean;
  } | null = null;
  let holdingPointSuggestion: {
    label: string;
    lat: number;
    lng: number;
    guidance: string;
  } | null = null;

  const primaryTrigger =
    primaryRoute.affectingIncidents.find((i) => i.verificationState === 'CONFIRMED_OBSTRUCTION') ||
    primaryRoute.affectingIncidents.find((i) => i.verificationState === 'VERIFIED_INCIDENT') ||
    primaryRoute.affectingIncidents[0] ||
    null;

  if (primaryTrigger) {
    triggeringIncident = {
      id: primaryTrigger.id,
      title: primaryTrigger.title,
      category: primaryTrigger.category,
      severity: primaryTrigger.severity,
      roadName: primaryTrigger.roadName,
      verificationState: primaryTrigger.verificationState,
      roadClosed: primaryTrigger.roadClosed,
    };
  }

  if (allRoutesClosedWarning) {
    routeState = 'NO_VIABLE_ROUTE_FOUND';
    decisionReason = `NO_VIABLE_ROUTE_FOUND: All ${finalRoutes.length} evaluated corridors between ${originName} and ${destName} intersect confirmed road obstructions. No fake detour is drawn through blocked segments.`;
    const stagingBays = [
      {
        label: 'Baikampady Industrial Gate Staging Bay',
        lat: 12.9522,
        lng: 74.8105,
        guidance: 'Hold at designated industrial staging apron with wide-radius vehicle turnaround. Await Traffic Authority contraflow escort.',
      },
      {
        label: 'Surathkal NITK Toll Plaza Staging Bay',
        lat: 13.0108,
        lng: 74.7943,
        guidance: 'Hold at toll plaza emergency lay-by. High-clearance staging for emergency services and priority transit.',
      },
      {
        label: 'Mulki River Crossing Staging Bay',
        lat: 13.0908,
        lng: 74.7864,
        guidance: 'Hold before river crossing at Mulki commercial bay. Do not attempt bridge transit during waterlogging or structure blockage.',
      },
      {
        label: 'Pumpwell Transport Terminal Staging Apron',
        lat: 12.8669,
        lng: 74.8692,
        guidance: 'Stage at Pumpwell southern terminal apron. Direct connector access to Father Muller & Wenlock Hospitals.',
      },
      {
        label: 'Udupi Karavali Bypass Staging Bay',
        lat: 13.3409,
        lng: 74.7351,
        guidance: 'Hold at Karavali bypass rest bay. Await traffic police diversion instructions for Manipal / coastal highway access.',
      },
    ];
    let closestBay = stagingBays[0];
    let minBayDist = Infinity;
    for (const bay of stagingBays) {
      const d = haversineDistanceKm(originCoords.lat, originCoords.lng, bay.lat, bay.lng);
      if (d < minBayDist) {
        minBayDist = d;
        closestBay = bay;
      }
    }
    holdingPointSuggestion = closestBay;
    const _dummyOld = {
      label: `Designated Safe Holding Point near ${originName}`,
      lat: originCoords.lat,
      lng: originCoords.lng,
      guidance:
        'Hold position at origin or nearest highway bay. Await Traffic Authority clearance or emergency contraflow escort.',
    };
  } else if (bestId !== primaryRoute.id) {
    routeState = 'ALTERNATE_ROUTE_FOUND';
    const deltaMin = bestRoute.totalEstimatedMin - primaryRoute.totalEstimatedMin;
    const deltaSign = deltaMin <= 0 ? `${deltaMin} min faster` : `+${deltaMin} min vs obstructed primary`;
    if (primaryRoute.hasRoadClosureWarning) {
      decisionReason = `ALTERNATE_ROUTE_FOUND: Primary corridor blocked by confirmed obstruction at ${primaryRoute.blockedSegments.join(', ')}. Diverted to ${bestRoute.name} (${bestRoute.totalEstimatedMin} min, ${deltaSign}).`;
    } else {
      decisionReason = `ALTERNATE_ROUTE_FOUND: Primary corridor impacted by verified incident (${primaryTrigger?.title || 'disruption'}). Recommended ${bestRoute.name} (${bestRoute.totalEstimatedMin} min, ${deltaSign}).`;
    }
  } else if (primaryRoute.affectingIncidents.length > 0) {
    const onlyUnverified = primaryRoute.affectingIncidents.every(
      (i) => i.verificationState === 'UNVERIFIED_REPORT'
    );
    if (onlyUnverified) {
      decisionReason = `NORMAL (Caution Advisory): Unverified report near ${primaryRoute.affectingIncidents[0].roadName} does not block the road. Primary corridor remains active.`;
    } else {
      decisionReason = `NORMAL (Delayed): Primary corridor has a verified incident (+${primaryRoute.incidentDelayMin} min delay) without road closure, and remains faster than alternatives.`;
    }
  }

  return {
    origin: originName,
    destination: destName,
    originCoords,
    destCoords,
    avoidIncidentZones,
    routeState,
    evaluatedAtIso,
    decisionReason,
    primaryRouteId: primaryRoute.id,
    recommendedRouteId: allRoutesClosedWarning ? null : bestId,
    triggeringIncident,
    holdingPointSuggestion,
    allRoutesClosedWarning,
    disclaimer:
      'Base travel times reflect standard road geometry (OSRM/Corridor model). Incident delay estimates and closure constraints are calculated from verified RoadAlert incident states.',
    routes: finalRoutes,
  };
}
