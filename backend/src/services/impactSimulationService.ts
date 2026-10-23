import {
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  LIFELINE_HOSPITALS,
  solveGraphShortestPath,
  classifyIncidentVerificationState,
  type ScenarioDefinition,
  type SimulationResult,
  type RippleEffectSegment,
  type HospitalImpactAssessment,
  type ExplainableRecommendation,
  type ScenarioComparisonMatrix,
  type GraphEdge,
} from '@roadalert/shared';
import { db } from '../db/index.js';
import { findClosestEdgeForIncident } from './lifelineReachabilityService.js';

export const SIMULATION_ENGINE_VERSION = 'v1.4.0-deterministic-network';

/**
 * Common limitations and assumptions notice for decision intelligence
 */
export const MODEL_ASSUMPTIONS_AND_LIMITATIONS = [
  'Simulations utilize the calibrated Mangaluru–Udupi 18-node, 21-corridor emergency network topology with deterministic Dijkstra path solving.',
  'Hypothetical disruptions are evaluated in an isolated graph sandbox; real production incident records and live telemetry are never modified.',
  'Travel times represent baseline cruising speeds under normal geometry; detour penalties model secondary road and signal delay constraints.',
  'Ripple effect classifications reflect structural graph reachability and capacity reallocation, not micro-traffic queue physics.',
  'Hospital accessibility reflects geometric network connectivity and does not guarantee bed availability or active triage capacity.',
];

/**
 * Runs a complete Impact Simulation for a given scenario definition.
 */
export async function runImpactSimulation(
  scenario: ScenarioDefinition
): Promise<SimulationResult> {
  const originNodeIds = Object.keys(CORRIDOR_GRAPH_NODES);
  const hospitals = LIFELINE_HOSPITALS;

  // 1. Fetch real active database incidents to establish the ground-truth baseline
  let activeDbIncidents: any[] = [];
  try {
    const res = await db.query<any>(
      `SELECT * FROM incidents WHERE status NOT IN ('RESOLVED', 'REJECTED')`
    );
    activeDbIncidents = res.rows || [];
  } catch (err) {
    // If DB query fails in isolated test runner, proceed with clean baseline
    activeDbIncidents = [];
  }

  // Map real database incidents to baseline blocked edges and delays
  const baselineBlockedEdges = new Set<string>();
  const baselineEdgeDelays = new Map<string, number>();

  for (const inc of activeDbIncidents) {
    const verState = classifyIncidentVerificationState(inc);
    const edgeId = findClosestEdgeForIncident(
      Number(inc.latitude),
      Number(inc.longitude),
      inc.road_name
    );
    if (edgeId) {
      if (verState === 'CONFIRMED_OBSTRUCTION' || (inc.road_closed && inc.confidence_score >= 60)) {
        baselineBlockedEdges.add(edgeId);
      } else if (verState === 'VERIFIED_INCIDENT' || inc.confidence_score >= 35) {
        const cur = baselineEdgeDelays.get(edgeId) || 0;
        baselineEdgeDelays.set(edgeId, cur + Math.min(30, Number(inc.estimated_delay_minutes || 10)));
      }
    }
  }

  // 2. Build the Disrupted Scenario Graph (Immutable sandbox)
  const disruptedBlockedEdges = new Set<string>(baselineBlockedEdges);
  const disruptedEdgeDelays = new Map<string, number>(baselineEdgeDelays);

  for (const disruption of scenario.disruptions) {
    // Validate edge existence
    const edgeExists = CORRIDOR_GRAPH_EDGES.some((e) => e.id === disruption.edgeId);
    if (!edgeExists) continue;

    if (disruption.disruptionType === 'COMPLETE_CLOSURE') {
      disruptedBlockedEdges.add(disruption.edgeId);
    } else {
      // Partial restriction, capacity reduction, or cost penalty
      const cur = disruptedEdgeDelays.get(disruption.edgeId) || 0;
      disruptedEdgeDelays.set(disruption.edgeId, cur + Math.max(0, disruption.delayPenaltyMinutes));
    }
  }

  // If an alternate intervention corridor is designated, apply priority enhancement (reduce delay)
  if (scenario.alternateInterventionEdgeId) {
    disruptedBlockedEdges.delete(scenario.alternateInterventionEdgeId);
    const cur = disruptedEdgeDelays.get(scenario.alternateInterventionEdgeId) || 0;
    disruptedEdgeDelays.set(scenario.alternateInterventionEdgeId, Math.max(0, cur - 5));
  }

  // 3. Route Evaluation (between specific origin & destination if requested)
  let routeEvaluation: SimulationResult['routeEvaluation'] = undefined;
  let hasNoViableRoute = false;

  const testOrigin = scenario.testOriginNodeId || 'node_surathkal';
  const testDest = scenario.testDestinationNodeId || 'node_pumpwell';

  const baselineRoute = solveGraphShortestPath(testOrigin, testDest, baselineBlockedEdges, baselineEdgeDelays);
  const disruptedRoute = solveGraphShortestPath(testOrigin, testDest, disruptedBlockedEdges, disruptedEdgeDelays);

  if (!disruptedRoute) {
    hasNoViableRoute = true;
  }

  routeEvaluation = {
    originNodeId: testOrigin,
    destinationNodeId: testDest,
    baselineRoute,
    disruptedRoute,
    isSevered: !disruptedRoute,
    rejectionReason: !disruptedRoute
      ? `All modeled corridors connecting ${CORRIDOR_GRAPH_NODES[testOrigin]?.name || testOrigin} to ${
          CORRIDOR_GRAPH_NODES[testDest]?.name || testDest
        } are severed by closures with no remaining passable bypass.`
      : undefined,
  };

  // 4. Hospital Lifeline Reachability Assessment
  const hospitalAssessments: HospitalImpactAssessment[] = [];
  let totalSeveredZones = 0;

  for (const hosp of hospitals) {
    let baselineReachable = 0;
    let disruptedReachable = 0;
    let severedCount = 0;
    let totalDelayDelta = 0;
    let maxDelayDelta = 0;

    const affectedOrigins: HospitalImpactAssessment['affectedOrigins'] = [];

    for (const originId of originNodeIds) {
      const originNode = CORRIDOR_GRAPH_NODES[originId];
      const baseResult = solveGraphShortestPath(originId, hosp.nearestNodeId, baselineBlockedEdges, baselineEdgeDelays);
      const disResult = solveGraphShortestPath(originId, hosp.nearestNodeId, disruptedBlockedEdges, disruptedEdgeDelays);

      const baseTime = baseResult ? baseResult.totalTimeMin : Infinity;
      const disTime = disResult ? disResult.totalTimeMin : Infinity;

      if (baseResult) baselineReachable++;

      if (!disResult) {
        severedCount++;
        totalSeveredZones++;
        affectedOrigins.push({
          originNodeId: originId,
          originName: originNode.name,
          populationZone: originNode.populationZone,
          baselineTimeMin: baseTime === Infinity ? 0 : baseTime,
          disruptedTimeMin: Infinity,
          delayDeltaMin: 999,
          status: 'SEVERED',
        });
      } else {
        disruptedReachable++;
        const delta = Math.max(0, Math.round((disTime - baseTime) * 10) / 10);
        totalDelayDelta += delta;
        if (delta > maxDelayDelta) maxDelayDelta = delta;

        affectedOrigins.push({
          originNodeId: originId,
          originName: originNode.name,
          populationZone: originNode.populationZone,
          baselineTimeMin: baseTime,
          disruptedTimeMin: disTime,
          delayDeltaMin: delta,
          status: delta > 2 ? 'DELAYED' : 'ACCESSIBLE',
        });
      }
    }

    const avgDelayDelta =
      disruptedReachable > 0 ? Math.round((totalDelayDelta / disruptedReachable) * 10) / 10 : 0;

    hospitalAssessments.push({
      hospitalId: hosp.id,
      hospitalName: hosp.name,
      shortName: hosp.shortName,
      traumaLevel: hosp.traumaLevel,
      emergencyBeds: hosp.emergencyBeds,
      baselineReachableOrigins: baselineReachable,
      disruptedReachableOrigins: disruptedReachable,
      severedOriginsCount: severedCount,
      averageDelayDeltaMin: avgDelayDelta,
      maxDelayDeltaMin: Math.round(maxDelayDelta * 10) / 10,
      isCompletelySevered: disruptedReachable <= 1,
      affectedOrigins: affectedOrigins.sort((a, b) => b.delayDeltaMin - a.delayDeltaMin),
    });
  }

  // 5. Traffic Ripple Effect Analysis across all Corridor Edges
  // Determine detour path usage in the disrupted network
  const detourPathEdges = new Set<string>();
  if (disruptedRoute && disruptedRoute.edgeIds) {
    disruptedRoute.edgeIds.forEach((eId) => detourPathEdges.add(eId));
  }

  // Also check paths to hospitals that shifted
  for (const hosp of hospitals) {
    for (const originId of originNodeIds) {
      const path = solveGraphShortestPath(originId, hosp.nearestNodeId, disruptedBlockedEdges, disruptedEdgeDelays);
      if (path && path.edgeIds) {
        path.edgeIds.forEach((eId) => detourPathEdges.add(eId));
      }
    }
  }

  const rippleEffects: RippleEffectSegment[] = [];
  let directlyDisruptedCount = 0;
  let indirectlyAffectedCount = 0;
  let alternativeBypassesCount = 0;

  for (const edge of CORRIDOR_GRAPH_EDGES) {
    const isDirectlyDisrupted = scenario.disruptions.some((d) => d.edgeId === edge.id);
    const isBlocked = disruptedBlockedEdges.has(edge.id);
    const addedDelay = disruptedEdgeDelays.get(edge.id) || 0;
    const baseTime = edge.baseTimeMin + (baselineEdgeDelays.get(edge.id) || 0);
    const disruptedTime = isBlocked ? 999 : edge.baseTimeMin + addedDelay;
    const delayDelta = isBlocked ? 999 : Math.max(0, Math.round((disruptedTime - baseTime) * 10) / 10);

    let impactClass: RippleEffectSegment['impactClass'] = 'UNAFFECTED';
    let absorptionRole: string | undefined = undefined;

    if (isDirectlyDisrupted) {
      impactClass = isBlocked ? 'DIRECTLY_DISRUPTED' : 'MODELED_DELAY_INCREASED';
      directlyDisruptedCount++;
    } else if (isBlocked) {
      impactClass = 'DIRECTLY_DISRUPTED';
      directlyDisruptedCount++;
    } else if (!edge.isPrimaryCorridor && detourPathEdges.has(edge.id)) {
      impactClass = 'ALTERNATIVE_CORRIDOR_REQUIRED';
      absorptionRole = `Absorbs diverted corridor traffic bypassing ${
        scenario.disruptions[0]?.roadName || 'primary closure'
      }`;
      alternativeBypassesCount++;
      indirectlyAffectedCount++;
    } else if (delayDelta > 1) {
      impactClass = 'MODELED_DELAY_INCREASED';
      indirectlyAffectedCount++;
    } else if (detourPathEdges.has(edge.id)) {
      impactClass = 'ACCESSIBILITY_REDUCED';
      absorptionRole = 'Carrying elevated emergency vehicle load';
      indirectlyAffectedCount++;
    }

    rippleEffects.push({
      edgeId: edge.id,
      roadName: edge.roadName,
      corridorCode: edge.corridorCode,
      impactClass,
      baselineTimeMin: Math.round(baseTime * 10) / 10,
      disruptedTimeMin: Math.round(disruptedTime * 10) / 10,
      delayDeltaMin: delayDelta,
      isPrimaryCorridor: edge.isPrimaryCorridor,
      isBridgeOrEstuary: edge.isBridgeOrEstuary,
      absorptionRole,
      geometry: edge.geometry,
    });
  }

  // 6. Generate Explainable Recommendations
  const primaryDisruption = scenario.disruptions[0];
  const primaryEdge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === primaryDisruption?.edgeId);
  const targetHospital =
    hospitalAssessments.find((h) => h.hospitalId === scenario.focusHospitalId) ||
    hospitalAssessments[0];

  let primaryAction = '';
  let strategicRationale = '';
  let recommendedCorridor = '';
  let avoidedCorridor = primaryDisruption ? primaryDisruption.roadName : 'Primary Corridor';

  const baselineTimeMin = baselineRoute ? baselineRoute.totalTimeMin : 0;
  const disruptedTimeMin = disruptedRoute ? disruptedRoute.totalTimeMin : 0;
  const delayDeltaMin =
    disruptedRoute && baselineRoute
      ? Math.round((disruptedRoute.totalTimeMin - baselineRoute.totalTimeMin) * 10) / 10
      : 0;
  const distanceDeltaKm =
    disruptedRoute && baselineRoute
      ? Math.round((disruptedRoute.totalDistanceKm - baselineRoute.totalDistanceKm) * 10) / 10
      : 0;

  if (hasNoViableRoute) {
    primaryAction = `HOLD AT STAGING POINT: No passable alternative corridor exists between ${
      CORRIDOR_GRAPH_NODES[testOrigin]?.name || testOrigin
    } and ${CORRIDOR_GRAPH_NODES[testDest]?.name || testDest}.`;
    strategicRationale = `The simulated closure of ${avoidedCorridor} completely severs the modeled road network with zero viable detours. Direct emergency vehicles to stage at designated holding areas until civil clearance is confirmed.`;
    recommendedCorridor = 'Designated Regional Emergency Staging Point';
  } else if (disruptedRoute && disruptedRoute.path.length > 0) {
    // Find the primary detour road
    const bypassEdgeId = disruptedRoute.edgeIds.find((id) => !baselineRoute?.edgeIds.includes(id));
    const bypassEdge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === bypassEdgeId);

    recommendedCorridor = bypassEdge ? bypassEdge.roadName : 'Designated Inland Bypass Network';
    primaryAction = `Divert ambulance traffic via ${recommendedCorridor}.`;
    strategicRationale = `Hypothetical obstruction on ${avoidedCorridor} is bypassed with an acceptable modeled travel time of ${disruptedTimeMin} min (+${delayDeltaMin} min detour, +${distanceDeltaKm} km). Preserves critical access to ${targetHospital.hospitalName}.`;
  } else {
    primaryAction = 'Maintain baseline routing protocols.';
    strategicRationale = 'No critical severances detected in current simulation scenario.';
    recommendedCorridor = 'NH-66 Primary Spine';
  }

  const certaintyLevel =
    scenario.disruptions.every((d) => d.verificationAssumption === 'CONFIRMED_CLOSURE')
      ? 'HIGH_CERTAINTY'
      : 'UNVERIFIED_SCENARIO';

  const recommendation: ExplainableRecommendation = {
    primaryAction,
    strategicRationale,
    recommendedCorridor,
    avoidedCorridor,
    supportingMetrics: {
      baselineTimeMin,
      disruptedTimeMin,
      delayDeltaMin,
      distanceDeltaKm,
      isolatedOriginsCount: targetHospital ? targetHospital.severedOriginsCount : 0,
      hospitalReachable: !targetHospital?.isCompletelySevered,
      confidenceCertainty: certaintyLevel,
    },
    assumptionsAndLimitations: [
      `Assumes vehicle fleet adheres to bypass speed limits along secondary roads.`,
      `Does not account for unplanned localized flooding on unmodeled tertiary feeder lanes.`,
      `Simulation relies on verified graph topology with non-negative traversal weights.`,
    ],
    triggerConditionsForChange: `This recommendation will be invalidated if the designated alternative corridor (${recommendedCorridor}) incurs a secondary obstruction or if river levels exceed safety thresholds.`,
  };

  return {
    scenarioId: scenario.id || `sim_${Date.now()}`,
    scenarioName: scenario.name,
    simulatedAtIso: new Date().toISOString(),
    modelEngineVersion: SIMULATION_ENGINE_VERSION,
    totalNetworkNodesEvaluated: originNodeIds.length,
    totalNetworkEdgesEvaluated: CORRIDOR_GRAPH_EDGES.length,
    disruptionsAppliedCount: scenario.disruptions.length,
    hasNoViableRoute,
    routeEvaluation,
    rippleEffects,
    directlyDisruptedEdgesCount: directlyDisruptedCount,
    indirectlyAffectedEdgesCount: indirectlyAffectedCount,
    alternativeBypassesActiveCount: alternativeBypassesCount,
    hospitalAssessments,
    severedPopulationZonesCount: totalSeveredZones,
    recommendation,
    limitationsNotice: MODEL_ASSUMPTIONS_AND_LIMITATIONS,
  };
}

/**
 * Compares multiple scenarios against the baseline network.
 */
export async function compareScenarios(
  scenarios: ScenarioDefinition[]
): Promise<ScenarioComparisonMatrix> {
  const results: ScenarioComparisonMatrix['scenarios'] = [];

  for (const sc of scenarios) {
    const sim = await runImpactSimulation(sc);
    const totalOrigins = sim.totalNetworkNodesEvaluated;
    const targetHospital = sim.hospitalAssessments[0];
    const reachableOrigins = targetHospital ? targetHospital.disruptedReachableOrigins : totalOrigins;
    const reachablePct = totalOrigins > 0 ? Math.round((reachableOrigins / totalOrigins) * 100) : 0;

    results.push({
      scenarioId: sim.scenarioId,
      scenarioName: sim.scenarioName,
      description: sc.description,
      reachableOriginsPercentage: reachablePct,
      severedOriginsCount: targetHospital ? targetHospital.severedOriginsCount : 0,
      averageDelayDeltaMin: targetHospital ? targetHospital.averageDelayDeltaMin : 0,
      maxDelayDeltaMin: targetHospital ? targetHospital.maxDelayDeltaMin : 0,
      directlyDisruptedCount: sim.directlyDisruptedEdgesCount,
      hospitalsImpactedCount: sim.hospitalAssessments.filter((h) => h.averageDelayDeltaMin > 1 || h.isCompletelySevered).length,
      viableRouteExists: !sim.hasNoViableRoute,
      recommendedIntervention: sim.recommendation.recommendedCorridor,
    });
  }

  // Determine best comparative outcome
  const viable = results.filter((r) => r.viableRouteExists);
  const best = viable.sort((a, b) => a.averageDelayDeltaMin - b.averageDelayDeltaMin)[0] || results[0];

  const summaryVerdict = best
    ? `Scenario "${best.scenarioName}" achieves the most resilient operational outcome with ${best.reachableOriginsPercentage}% regional hospital reachability and an average delay delta of +${best.averageDelayDeltaMin} min.`
    : 'All evaluated scenarios present severe network severance.';

  return {
    scenarios: results,
    summaryVerdict,
  };
}
