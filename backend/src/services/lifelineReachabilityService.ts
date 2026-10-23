import {
  LIFELINE_HOSPITALS,
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  solveGraphShortestPath,
  classifyIncidentVerificationState,
  type LifelineHospital,
  type ReachabilityPathResult,
  type HospitalReachabilitySummary,
} from '@roadalert/shared';
import { haversineDistanceKm } from './verificationEngine.js';
import { db } from '../db/index.js';

/**
 * Maps an incident coordinate [lat, lng] to the closest corridor graph edge
 * if within 1.5 km of the edge geometry.
 */
export function findClosestEdgeForIncident(
  lat: number,
  lng: number,
  roadNameHint?: string
): string | null {
  let closestEdgeId: string | null = null;
  let minDistanceKm = 1.5; // Threshold within 1.5 km of edge polyline

  for (const edge of CORRIDOR_GRAPH_EDGES) {
    // Check road name match hint if present
    const nameMatch =
      roadNameHint &&
      (edge.roadName.toLowerCase().includes(roadNameHint.toLowerCase()) ||
        roadNameHint.toLowerCase().includes(edge.corridorCode.toLowerCase()));

    for (const [pLat, pLng] of edge.geometry) {
      const d = haversineDistanceKm(lat, lng, pLat, pLng);
      const effectiveDist = nameMatch ? d * 0.7 : d; // slight bias if name matches
      if (effectiveDist < minDistanceKm) {
        minDistanceKm = effectiveDist;
        closestEdgeId = edge.id;
      }
    }
  }

  return closestEdgeId;
}

/**
 * Feature 1: Lifeline Reachability Engine
 * Evaluates emergency access from all regional population centers to a hospital under active/simulated road closures.
 */
export async function evaluateHospitalReachability(
  hospitalId: string,
  simulatedClosureIncident?: {
    latitude: number;
    longitude: number;
    roadName?: string;
    roadClosed?: boolean;
    title?: string;
  }
): Promise<HospitalReachabilitySummary> {
  const hospital = LIFELINE_HOSPITALS.find((h) => h.id === hospitalId) || LIFELINE_HOSPITALS[0];

  // Fetch all active incidents from the database
  const res = await db.query<any>(
    `SELECT * FROM incidents WHERE status NOT IN ('RESOLVED', 'REJECTED') ORDER BY reported_at DESC`
  );
  const activeIncidents = res.rows || [];

  const blockedEdgeIds = new Set<string>();
  const edgeDelayMinutes = new Map<string, number>();
  const edgeResponsibleIncident = new Map<string, { id: string; title: string }>();

  // Process live database incidents
  for (const inc of activeIncidents) {
    const verState = classifyIncidentVerificationState(inc);
    const edgeId = findClosestEdgeForIncident(
      Number(inc.latitude),
      Number(inc.longitude),
      inc.road_name
    );

    if (edgeId) {
      // Confirmed obstruction blocks the road edge entirely
      if (verState === 'CONFIRMED_OBSTRUCTION' || (inc.road_closed && inc.confidence_score >= 60)) {
        blockedEdgeIds.add(edgeId);
        edgeResponsibleIncident.set(edgeId, {
          id: inc.id,
          title: inc.title || inc.road_name,
        });
      } else if (verState === 'VERIFIED_INCIDENT' || inc.confidence_score >= 35) {
        // Slowdown delay penalty
        const currentDelay = edgeDelayMinutes.get(edgeId) || 0;
        const add = Math.min(45, Number(inc.estimated_delay_minutes || 10));
        edgeDelayMinutes.set(edgeId, currentDelay + add);
        if (!edgeResponsibleIncident.has(edgeId)) {
          edgeResponsibleIncident.set(edgeId, {
            id: inc.id,
            title: inc.title || inc.road_name,
          });
        }
      }
    }
  }

  // Inject user simulated closure if provided (e.g. interactive test scenario)
  if (simulatedClosureIncident) {
    const simEdgeId = findClosestEdgeForIncident(
      simulatedClosureIncident.latitude,
      simulatedClosureIncident.longitude,
      simulatedClosureIncident.roadName
    );
    if (simEdgeId) {
      blockedEdgeIds.add(simEdgeId);
      edgeResponsibleIncident.set(simEdgeId, {
        id: 'sim-closure-demo',
        title: simulatedClosureIncident.title || 'Interactive Test Road Closure',
      });
    }
  }

  // Origins to test: all population zone nodes except the hospital node itself
  const originNodeIds = Object.keys(CORRIDOR_GRAPH_NODES).filter(
    (nid) => nid !== hospital.nearestNodeId
  );

  const originAssessments: ReachabilityPathResult[] = [];
  let totalDelayDelta = 0;
  let severedCount = 0;
  const criticalCutSet = new Set<string>();

  for (const originId of originNodeIds) {
    // 1. Calculate baseline route (zero closures, zero delays)
    const baseline = solveGraphShortestPath(originId, hospital.nearestNodeId, new Set());
    const baselineMin = baseline?.totalTimeMin || 0;

    // 2. Calculate current route with blocked edges and delays
    const current = solveGraphShortestPath(
      originId,
      hospital.nearestNodeId,
      blockedEdgeIds,
      edgeDelayMinutes
    );

    if (!current) {
      // Completely isolated / severed
      severedCount++;
      // Determine which blocked edge caused the cut
      let cutEdgeTitle = 'Corridor Road Closure';
      let cutIncId: string | null = null;
      for (const edgeId of baseline?.edgeIds || []) {
        if (blockedEdgeIds.has(edgeId)) {
          criticalCutSet.add(edgeId);
          const incInfo = edgeResponsibleIncident.get(edgeId);
          if (incInfo) {
            cutEdgeTitle = incInfo.title;
            cutIncId = incInfo.id;
          }
          break;
        }
      }

      originAssessments.push({
        fromNodeId: originId,
        toHospitalId: hospital.id,
        hospitalName: hospital.name,
        reachable: false,
        baselineTimeMin: baselineMin,
        currentTimeMin: Infinity,
        delayDeltaMin: 999,
        deteriorationLevel: 'ISOLATED_NO_ACCESS',
        responsibleIncidentId: cutIncId,
        responsibleIncidentTitle: cutEdgeTitle,
        pathEdgeIds: [],
        pathNodeIds: [],
        rejectionReason: `No viable emergency access route from ${CORRIDOR_GRAPH_NODES[originId]?.name} to ${hospital.shortName}. All arterial and bypass corridors blocked.`,
      });
    } else {
      const currentMin = current.totalTimeMin;
      const deltaMin = Math.max(0, Math.round((currentMin - baselineMin) * 10) / 10);
      totalDelayDelta += deltaMin;

      // Identify which incident contributed to detour or slowdown
      let responsibleIncident: { id: string; title: string } | null = null;
      for (const edgeId of baseline?.edgeIds || []) {
        if (blockedEdgeIds.has(edgeId) || edgeDelayMinutes.has(edgeId)) {
          responsibleIncident = edgeResponsibleIncident.get(edgeId) || null;
          break;
        }
      }

      let deteriorationLevel: 'NORMAL' | 'MODERATE_DELAY' | 'CRITICAL_DELAY' = 'NORMAL';
      if (deltaMin >= 15) {
        deteriorationLevel = 'CRITICAL_DELAY';
      } else if (deltaMin >= 5) {
        deteriorationLevel = 'MODERATE_DELAY';
      }

      originAssessments.push({
        fromNodeId: originId,
        toHospitalId: hospital.id,
        hospitalName: hospital.name,
        reachable: true,
        baselineTimeMin: baselineMin,
        currentTimeMin: currentMin,
        delayDeltaMin: deltaMin,
        deteriorationLevel,
        responsibleIncidentId: responsibleIncident?.id || null,
        responsibleIncidentTitle: responsibleIncident?.title || null,
        pathEdgeIds: current.edgeIds,
        pathNodeIds: current.path,
      });
    }
  }

  const reachableCount = originNodeIds.length - severedCount;
  const avgDelta =
    reachableCount > 0 ? Math.round((totalDelayDelta / reachableCount) * 10) / 10 : 0;

  return {
    hospital,
    evaluatedAtIso: new Date().toISOString(),
    activeObstructionCount: blockedEdgeIds.size,
    networkOriginsEvaluated: originNodeIds.length,
    reachableOriginsCount: reachableCount,
    severedOriginsCount: severedCount,
    averageDelayDeltaMin: avgDelta,
    originAssessments: originAssessments.sort((a, b) => b.delayDeltaMin - a.delayDeltaMin),
    criticalCutPoints: Array.from(criticalCutSet),
    assumptionsAndLimitations: [
      'Calculations use the calibrated Mangaluru-Udupi emergency road network graph topology with Dijkstra path solving.',
      'Unverified reports never close roads; only verified incidents with confirmed obstruction flags sever edges.',
      'Detour travel times account for speed constraints on secondary state highways and inland bypasses.',
      'Estimates represent emergency vehicle cruising speeds without active sirens/traffic-clearing guarantees.',
    ],
  };
}

/**
 * Returns baseline hospital details with live summary
 */
export function getLifelineHospitals(): LifelineHospital[] {
  return LIFELINE_HOSPITALS;
}
