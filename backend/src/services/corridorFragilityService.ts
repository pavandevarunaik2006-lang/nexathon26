import {
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  LIFELINE_HOSPITALS,
  solveGraphShortestPath,
  type CorridorFragilityRank,
} from '@roadalert/shared';

export interface CorridorFragilityOverview {
  evaluatedAtIso: string;
  totalSegmentsEvaluated: number;
  highestFragilitySegment: string;
  criticalChokepointsCount: number;
  segments: CorridorFragilityRank[];
  assumptions: string[];
}

// In-memory cache for fragility calculations since graph structure is static
let cachedFragilityOverview: CorridorFragilityOverview | null = null;
let lastCalculatedTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Feature 5: Corridor Fragility Index Engine
 * Evaluates the systemic vulnerability of regional road network segments
 * by simulating edge removal and measuring hospital reachability degradation.
 */
export function calculateCorridorFragilityIndex(forceRecalculate = false): CorridorFragilityOverview {
  const now = Date.now();
  if (!forceRecalculate && cachedFragilityOverview && now - lastCalculatedTime < CACHE_TTL_MS) {
    return cachedFragilityOverview;
  }

  const originNodeIds = Object.keys(CORRIDOR_GRAPH_NODES);
  const hospitals = LIFELINE_HOSPITALS;

  // 1. Calculate baseline travel times between all origin nodes and hospital nodes
  const baselineMatrix = new Map<string, number>(); // key: `${originId}->${hospitalId}`
  const emptyBlocked = new Set<string>();

  for (const originId of originNodeIds) {
    for (const hosp of hospitals) {
      const res = solveGraphShortestPath(originId, hosp.nearestNodeId, emptyBlocked);
      const key = `${originId}->${hosp.id}`;
      baselineMatrix.set(key, res ? res.totalTimeMin : Infinity);
    }
  }

  // 2. Iterate through each edge in the corridor graph and simulate its failure
  const segmentRanks: CorridorFragilityRank[] = [];

  for (const edge of CORRIDOR_GRAPH_EDGES) {
    const blocked = new Set<string>([edge.id]);
    let totalDetourMin = 0;
    let affectedPairsCount = 0;
    let severedPairs = 0;
    const isolatedOrigins = new Set<string>();
    const affectedHospitals = new Set<string>();

    for (const originId of originNodeIds) {
      for (const hosp of hospitals) {
        const key = `${originId}->${hosp.id}`;
        const baseTime = baselineMatrix.get(key);
        if (baseTime === undefined || baseTime === Infinity) continue;

        const altRes = solveGraphShortestPath(originId, hosp.nearestNodeId, blocked);

        if (!altRes) {
          // Complete severance of access from this origin to this hospital
          severedPairs++;
          isolatedOrigins.add(originId);
          affectedHospitals.add(hosp.shortName);
        } else {
          const delta = altRes.totalTimeMin - baseTime;
          if (delta > 0.1) {
            totalDetourMin += delta;
            affectedPairsCount++;
            affectedHospitals.add(hosp.shortName);
          }
        }
      }
    }

    const averageDetourMinutes =
      affectedPairsCount > 0 ? Math.round((totalDetourMin / affectedPairsCount) * 10) / 10 : 0;
    const isolatedOriginsCount = isolatedOrigins.size;

    // Explainable Fragility Score Formula (0-100):
    // - Edge baseline structural criticality: up to 52 pts
    // - Detour penalty across affected hospital paths: up to 25 pts
    // - Complete severance factor: up to 30 pts
    // - Bridge/estuary failure bonus: +10 pts
    let score = edge.fragilityCriticality * 0.52;

    if (isolatedOriginsCount > 0) {
      score += Math.min(30, isolatedOriginsCount * 12);
    }

    if (averageDetourMinutes > 0) {
      score += Math.min(25, averageDetourMinutes * 1.8);
    }

    if (edge.isBridgeOrEstuary) {
      score += 10;
    }

    const fragilityScore = Math.max(10, Math.min(99, Math.round(score)));

    // Impact classification
    let impactClassification: CorridorFragilityRank['impactClassification'] = 'RESILIENT';
    if (fragilityScore >= 80 || isolatedOriginsCount >= 2) {
      impactClassification = 'CATASTROPHIC_SEVERANCE';
    } else if (fragilityScore >= 65) {
      impactClassification = 'HIGH_VULNERABILITY';
    } else if (fragilityScore >= 45) {
      impactClassification = 'MODERATE_DETOUR';
    }

    // Generate explainable reason
    const affectedHospitalList = Array.from(affectedHospitals);
    let explanation = '';
    if (impactClassification === 'CATASTROPHIC_SEVERANCE') {
      explanation = `Single point of failure on ${edge.roadName}. Failure isolates ${isolatedOriginsCount} population zone(s) with no viable bridge or arterial bypass. Disrupts emergency reachability to ${affectedHospitalList.slice(0, 3).join(', ')}.`;
    } else if (impactClassification === 'HIGH_VULNERABILITY') {
      explanation = `Severe bottleneck on ${edge.roadName}. Causes substantial rerouting delays (+${averageDetourMinutes} min average transit increase) via inland bypass routes for ${affectedHospitalList.slice(0, 3).join(', ')}.`;
    } else if (impactClassification === 'MODERATE_DETOUR') {
      explanation = `Moderate corridor vulnerability. Nearby parallel bypass routes accommodate diverted traffic with acceptable detour delay (+${averageDetourMinutes} min).`;
    } else {
      explanation = `High network redundancy exists around ${edge.roadName}. Disruption has minimal systemic impact on hospital access.`;
    }

    segmentRanks.push({
      edgeId: edge.id,
      roadName: edge.roadName,
      corridorCode: edge.corridorCode,
      distanceKm: edge.distanceKm,
      isPrimaryCorridor: edge.isPrimaryCorridor,
      isBridgeOrEstuary: edge.isBridgeOrEstuary,
      fragilityScore,
      isolatedOriginsCount,
      averageDetourMinutes,
      impactClassification,
      explanation,
      affectedHospitalNames: affectedHospitalList,
      geometry: edge.geometry,
    });
  }

  // Sort descending by fragility score
  segmentRanks.sort((a, b) => b.fragilityScore - a.fragilityScore);

  const highest = segmentRanks[0]?.roadName || 'Kuloor Bridge / NH-66';
  const criticalCount = segmentRanks.filter(
    (s) => s.impactClassification === 'CATASTROPHIC_SEVERANCE' || s.impactClassification === 'HIGH_VULNERABILITY'
  ).length;

  const overview: CorridorFragilityOverview = {
    evaluatedAtIso: new Date().toISOString(),
    totalSegmentsEvaluated: segmentRanks.length,
    highestFragilitySegment: highest,
    criticalChokepointsCount: criticalCount,
    segments: segmentRanks,
    assumptions: [
      'Fragility scores are computed by systematically simulating individual segment severances across the regional network graph.',
      'Bridge and estuary crossings (Kuloor Gurupura River, Maravoor River, Mulki River) exhibit heightened fragility due to water barrier detour constraints.',
      'Detour times assume standard road speed capabilities along inland bypass corridors (Bajpe, Kinnigoli, Belman SH-1).',
    ],
  };

  cachedFragilityOverview = overview;
  lastCalculatedTime = now;
  return overview;
}
