import {
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  LIFELINE_HOSPITALS,
  STANDARD_ANALYZED_ROUTES,
  solveGraphShortestPath,
  classifyIncidentVerificationState,
  type ScenarioDefinition,
  type SimulationResult,
  type RippleEffectSegment,
  type HospitalImpactAssessment,
  type ExplainableRecommendation,
  type ScenarioComparisonMatrix,
  type AnalyzedRouteImpact,
  type DestinationAccessibilitySummary,
  type GraphEdge,
} from '@roadalert/shared';
import { db } from '../db/index.js';
import { findClosestEdgeForIncident } from './lifelineReachabilityService.js';

export const SIMULATION_ENGINE_VERSION = 'v1.5.0-deterministic-network';

/**
 * Common limitations and assumptions notice for decision intelligence
 */
export const MODEL_ASSUMPTIONS_AND_LIMITATIONS = [
  'Simulations utilize the calibrated Mangaluru–Udupi 18-node, 21-corridor emergency network topology with deterministic Dijkstra path solving.',
  'Hypothetical disruptions are evaluated in an isolated graph sandbox; real production incident records and live telemetry are never modified.',
  'Travel times represent baseline cruising speeds under normal geometry; detour penalties model secondary road and signal delay constraints.',
  'Ripple effect classifications reflect structural graph reachability and capacity reallocation, not micro-traffic queue physics.',
  'Hospital accessibility reflects geometric network connectivity and does not guarantee bed availability or active triage capacity.',
  'Simulated results represent static what-if routing estimates and do not claim that traffic will definitely shift without real-time vehicular flow sensors.',
];

/**
 * Runs a complete Impact Simulation for a given scenario definition.
 */
export async function runImpactSimulation(
  scenario: ScenarioDefinition
): Promise<SimulationResult> {
  const originNodeIds = Object.keys(CORRIDOR_GRAPH_NODES);
  const hospitals = LIFELINE_HOSPITALS;

  // 1. Fetch real active database incidents to establish the ground-truth baseline (Strictly read-only SELECT)
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
  const baselineBlockedDirected = new Set<string>();
  const disruptedBlockedDirected = new Set<string>();

  for (const disruption of scenario.disruptions) {
    // Validate edge existence
    const edge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === disruption.edgeId);
    if (!edge) continue;

    const dir = disruption.direction || scenario.direction || 'BOTH';
    const isComplete =
      disruption.disruptionType === 'COMPLETE_CLOSURE' ||
      disruption.closureCondition === 'COMPLETE_CLOSURE';

    if (isComplete) {
      if (dir === 'NORTHBOUND_ONLY') {
        disruptedBlockedDirected.add(`${edge.fromNode}->${edge.toNode}`);
      } else if (dir === 'SOUTHBOUND_ONLY') {
        disruptedBlockedDirected.add(`${edge.toNode}->${edge.fromNode}`);
      } else {
        disruptedBlockedEdges.add(disruption.edgeId);
      }
    } else {
      // Partial restriction, capacity reduction, or cost penalty
      const cur = disruptedEdgeDelays.get(disruption.edgeId) || 0;
      let penalty = disruption.delayPenaltyMinutes;
      if (!penalty && disruption.capacityReductionPercent) {
        penalty = Math.max(5, Math.round(edge.baseTimeMin * (disruption.capacityReductionPercent / 20)));
      }
      disruptedEdgeDelays.set(disruption.edgeId, cur + Math.max(0, penalty || 15));
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

  const baselineRoute = solveGraphShortestPath(
    testOrigin,
    testDest,
    baselineBlockedEdges,
    baselineEdgeDelays,
    baselineBlockedDirected
  );
  const disruptedRoute = solveGraphShortestPath(
    testOrigin,
    testDest,
    disruptedBlockedEdges,
    disruptedEdgeDelays,
    disruptedBlockedDirected
  );

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
      const baseResult = solveGraphShortestPath(
        originId,
        hosp.nearestNodeId,
        baselineBlockedEdges,
        baselineEdgeDelays,
        baselineBlockedDirected
      );
      const disResult = solveGraphShortestPath(
        originId,
        hosp.nearestNodeId,
        disruptedBlockedEdges,
        disruptedEdgeDelays,
        disruptedBlockedDirected
      );

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
  const detourPathEdges = new Set<string>();
  if (disruptedRoute && disruptedRoute.edgeIds) {
    disruptedRoute.edgeIds.forEach((eId) => detourPathEdges.add(eId));
  }

  for (const hosp of hospitals) {
    for (const originId of originNodeIds) {
      const path = solveGraphShortestPath(
        originId,
        hosp.nearestNodeId,
        disruptedBlockedEdges,
        disruptedEdgeDelays,
        disruptedBlockedDirected
      );
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

  // 6. Detailed Analyzed Routes Evaluation (Direct, Indirect, Potentially Affected, Unaffected, Severed)
  const analyzedRoutes: AnalyzedRouteImpact[] = [];
  const disruptedEdgeIdsSet = new Set(scenario.disruptions.map((d) => d.edgeId));
  const adjacentNodeIds = new Set<string>();
  for (const d of scenario.disruptions) {
    const edge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === d.edgeId);
    if (edge) {
      adjacentNodeIds.add(edge.fromNode);
      adjacentNodeIds.add(edge.toNode);
    }
  }

  for (const rDef of STANDARD_ANALYZED_ROUTES) {
    const baseR = solveGraphShortestPath(
      rDef.originNodeId,
      rDef.destinationNodeId,
      baselineBlockedEdges,
      baselineEdgeDelays,
      baselineBlockedDirected
    );
    const disR = solveGraphShortestPath(
      rDef.originNodeId,
      rDef.destinationNodeId,
      disruptedBlockedEdges,
      disruptedEdgeDelays,
      disruptedBlockedDirected
    );

    const baseTime = baseR ? baseR.totalTimeMin : 0;
    const baseDist = baseR ? baseR.totalDistanceKm : 0;
    const disTime = disR ? disR.totalTimeMin : 999;
    const disDist = disR ? disR.totalDistanceKm : 0;
    const delayDelta = disR && baseR ? Math.max(0, Math.round((disTime - baseTime) * 10) / 10) : 999;

    let classification: AnalyzedRouteImpact['classification'] = 'NO_MODELED_IMPACT';
    const usesDisruptedEdge = baseR?.edgeIds.some((id) => disruptedEdgeIdsSet.has(id));

    if (!disR) {
      classification = 'SEVERED';
    } else if (usesDisruptedEdge) {
      classification = 'DIRECTLY_AFFECTED';
    } else if (delayDelta > 0.5) {
      classification = 'INDIRECTLY_AFFECTED';
    } else if (baseR?.path.some((nId) => adjacentNodeIds.has(nId))) {
      classification = 'POTENTIALLY_AFFECTED';
    } else {
      classification = 'NO_MODELED_IMPACT';
    }

    let alternativeRouteName: string | undefined = undefined;
    let explanation = '';
    const originName = CORRIDOR_GRAPH_NODES[rDef.originNodeId]?.name || rDef.originNodeId;
    const destinationName = CORRIDOR_GRAPH_NODES[rDef.destinationNodeId]?.name || rDef.destinationNodeId;

    if (!disR) {
      explanation = `Route "${rDef.name}" is completely severed. All connecting corridors between ${originName} and ${destinationName} are blocked with no viable detours.`;
    } else if (usesDisruptedEdge) {
      const bypassEdgeId = disR.edgeIds.find((id) => !baseR?.edgeIds.includes(id));
      const bypassEdge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === bypassEdgeId);
      alternativeRouteName = bypassEdge ? bypassEdge.roadName : 'Designated Inland Bypass Network';
      explanation = `Route "${rDef.name}" uses the selected road segment (${
        scenario.disruptions[0]?.roadName || 'blocked corridor'
      }). Under the ${
        scenario.disruptions[0]?.disruptionType === 'COMPLETE_CLOSURE' ? 'complete-closure' : 'partial-restriction'
      } scenario, the routing engine found an alternative path via ${alternativeRouteName} with an additional estimated ${delayDelta} minutes.`;
    } else if (classification === 'INDIRECTLY_AFFECTED') {
      explanation = `Route "${rDef.name}" incurs an indirect travel-time increase (+${delayDelta} min) due to diverted traffic and elevated vehicle load across secondary connectors.`;
    } else if (classification === 'POTENTIALLY_AFFECTED') {
      explanation = `Route "${rDef.name}" traverses junction nodes adjacent to the simulated disruption zone. Impact is plausible but no direct detour was required.`;
    } else {
      explanation = `Route "${rDef.name}" does not intersect the simulated disruption zone and operates under normal cruising conditions (${baseTime} min).`;
    }

    const routeGeom: [number, number][] = [];
    if (disR) {
      for (const eId of disR.edgeIds) {
        const edge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === eId);
        if (edge?.geometry) {
          routeGeom.push(...edge.geometry);
        }
      }
    }

    analyzedRoutes.push({
      routeId: rDef.routeId,
      name: rDef.name,
      originNodeId: rDef.originNodeId,
      destinationNodeId: rDef.destinationNodeId,
      originName,
      destinationName,
      baselineTimeMin: baseTime,
      simulatedTimeMin: disR ? disTime : 999,
      delayDeltaMin: delayDelta,
      baselineDistanceKm: baseDist,
      simulatedDistanceKm: disDist,
      classification,
      alternativeAvailable: Boolean(disR),
      alternativeRouteName,
      explanation,
      baselinePath: baseR?.path || [],
      simulatedPath: disR?.path || [],
      baselineEdgeIds: baseR?.edgeIds || [],
      simulatedEdgeIds: disR?.edgeIds || [],
      geometry: routeGeom,
    });
  }

  // 7. Destination Accessibility Evaluation across all 18 Regional Nodes
  const destinationsAccessibility: DestinationAccessibilitySummary[] = [];
  let destinationsWithChangedAccessibilityCount = 0;

  for (const destId of originNodeIds) {
    const destNode = CORRIDOR_GRAPH_NODES[destId];
    let baseReachable = 0;
    let disReachable = 0;
    let baseTotalTime = 0;
    let disTotalTime = 0;

    for (const originId of originNodeIds) {
      if (originId === destId) continue;
      const bRes = solveGraphShortestPath(
        originId,
        destId,
        baselineBlockedEdges,
        baselineEdgeDelays,
        baselineBlockedDirected
      );
      const dRes = solveGraphShortestPath(
        originId,
        destId,
        disruptedBlockedEdges,
        disruptedEdgeDelays,
        disruptedBlockedDirected
      );
      if (bRes) {
        baseReachable++;
        baseTotalTime += bRes.totalTimeMin;
      }
      if (dRes) {
        disReachable++;
        disTotalTime += dRes.totalTimeMin;
      }
    }

    const baseAvg = baseReachable > 0 ? Math.round((baseTotalTime / baseReachable) * 10) / 10 : 0;
    const disAvg = disReachable > 0 ? Math.round((disTotalTime / disReachable) * 10) / 10 : 999;
    const delta = disReachable > 0 ? Math.max(0, Math.round((disAvg - baseAvg) * 10) / 10) : 999;

    let accessibilityStatus: DestinationAccessibilitySummary['accessibilityStatus'] = 'REACHABLE_NORMAL';
    if (disReachable === 0 || disReachable < baseReachable) {
      accessibilityStatus = 'SEVERED_UNREACHABLE';
      destinationsWithChangedAccessibilityCount++;
    } else if (delta > 2) {
      accessibilityStatus = 'REACHABLE_DELAYED';
      destinationsWithChangedAccessibilityCount++;
    }

    destinationsAccessibility.push({
      nodeId: destId,
      name: destNode.name,
      populationZone: destNode.populationZone,
      corridor: destNode.corridor,
      baselineAvgTimeMin: baseAvg,
      simulatedAvgTimeMin: disAvg,
      delayDeltaMin: delta,
      accessibilityStatus,
      isSevered: disReachable === 0,
      reachableOriginsCount: disReachable,
      totalOriginsCount: originNodeIds.length - 1,
    });
  }

  // 8. Generate Explainable Recommendations
  const primaryDisruption = scenario.disruptions[0];
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

  const directlyOrIndirectlyCount = analyzedRoutes.filter(
    (r) => r.classification === 'DIRECTLY_AFFECTED' || r.classification === 'INDIRECTLY_AFFECTED' || r.classification === 'SEVERED'
  ).length;

  // 9. Correlate active database incidents along the affected & detour corridors
  const relevantIncidentsAlongRoutes: any[] = [];
  const affectedAndDetourEdgeIds = new Set<string>();
  scenario.disruptions.forEach((d) => affectedAndDetourEdgeIds.add(d.edgeId));
  detourPathEdges.forEach((eId) => affectedAndDetourEdgeIds.add(eId));
  if (routeEvaluation?.disruptedRoute?.edgeIds) {
    routeEvaluation.disruptedRoute.edgeIds.forEach((eId) => affectedAndDetourEdgeIds.add(eId));
  }

  for (const inc of activeDbIncidents) {
    const incId = String(inc.id);
    const incRoad = String(inc.road_name || inc.roadName || '');
    const incLat = Number(inc.latitude);
    const incLng = Number(inc.longitude);

    let matchedEdge = CORRIDOR_GRAPH_EDGES.find(
      (e) =>
        affectedAndDetourEdgeIds.has(e.id) &&
        (e.roadName.toLowerCase().includes(incRoad.toLowerCase()) ||
          incRoad.toLowerCase().includes(e.roadName.toLowerCase()))
    );

    if (!matchedEdge && incLat && incLng) {
      for (const eId of affectedAndDetourEdgeIds) {
        const edge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === eId);
        if (edge && edge.geometry) {
          for (const [ptLat, ptLng] of edge.geometry) {
            const dist = haversineDistanceKm(incLat, incLng, ptLat, ptLng);
            if (dist <= 2.0) {
              matchedEdge = edge;
              break;
            }
          }
        }
        if (matchedEdge) break;
      }
    }

    if (matchedEdge) {
      relevantIncidentsAlongRoutes.push({
        id: incId,
        title: inc.title || 'Reported Incident',
        category: inc.category || 'General Disruption',
        severity: inc.severity || 'MEDIUM',
        roadName: inc.road_name || inc.roadName || matchedEdge.roadName,
        verificationStatus:
          inc.verification_status ||
          inc.verificationState ||
          (Number(inc.confidence_score || inc.confidenceScore || 0) >= 50
            ? 'VERIFIED'
            : 'UNVERIFIED'),
        proximityNote: affectedAndDetourEdgeIds.has(matchedEdge.id)
          ? `On corridor segment: ${matchedEdge.roadName}`
          : `Within 2.0 km of affected transit corridor`,
        latitude: !isNaN(lat) && lat !== 0 ? lat : undefined,
        longitude: !isNaN(lng) && lng !== 0 ? lng : undefined,
      });
    }
  }

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
    analyzedRoutes,
    destinationsAccessibility,
    affectedRoutesAnalyzedCount: directlyOrIndirectlyCount,
    destinationsWithChangedAccessibilityCount,
    relevantIncidentsAlongRoutes,
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

    const primDis = sc.disruptions[0];
    const closureDesc =
      primDis?.disruptionType === 'COMPLETE_CLOSURE' || primDis?.closureCondition === 'COMPLETE_CLOSURE'
        ? 'Complete Closure (100% capacity blocked)'
        : primDis?.delayPenaltyMinutes
        ? `Partial Restriction (+${primDis.delayPenaltyMinutes}m delay)`
        : 'Baseline Network';

    const baseMin = sim.routeEvaluation?.baselineRoute?.totalTimeMin ?? 0;
    const disMin = sim.routeEvaluation?.disruptedRoute?.totalTimeMin ?? (sim.hasNoViableRoute ? 'Severed' : 'Unavailable');
    const addMin =
      sim.hasNoViableRoute
        ? 'Severed'
        : typeof disMin === 'number' && typeof baseMin === 'number'
        ? `+${Math.max(0, Math.round((disMin - baseMin) * 10) / 10)} min`
        : '0 min';

    const altAvailable = sim.hasNoViableRoute
      ? 'None (Severed)'
      : sim.alternativeBypassesActiveCount > 0
      ? `Yes (${sim.recommendation.recommendedCorridor})`
      : 'Baseline Corridor Available';

    results.push({
      scenarioId: sim.scenarioId,
      scenarioName: sim.scenarioName,
      description: sc.description || '',
      reachableOriginsPercentage: reachablePct,
      severedOriginsCount: targetHospital ? targetHospital.severedOriginsCount : 0,
      averageDelayDeltaMin: targetHospital ? targetHospital.averageDelayDeltaMin : 0,
      maxDelayDeltaMin: targetHospital ? targetHospital.maxDelayDeltaMin : 0,
      directlyDisruptedCount: sim.directlyDisruptedEdgesCount,
      hospitalsImpactedCount: sim.hospitalAssessments.filter(
        (h) => h.averageDelayDeltaMin > 1 || h.isCompletelySevered
      ).length,
      viableRouteExists: !sim.hasNoViableRoute,
      recommendedIntervention: sim.recommendation.recommendedCorridor,
      // Comprehensive Comparison Table Attributes
      affectedRoad: primDis?.roadName || 'Regional Highway Spine',
      closureCondition: closureDesc,
      duration: `${sc.durationMinutes || primDis?.durationMinutes || 60} min`,
      baselineTravelTime: `${baseMin} min`,
      simulatedTravelTime: typeof disMin === 'number' ? `${disMin} min` : String(disMin),
      additionalTravelTime: addMin,
      alternativeRouteAvailable: altAvailable,
      affectedRoutesAnalyzed: sim.analyzedRoutes?.length || 8,
      destinationsWithChangedAccessibility: sim.destinationsWithChangedAccessibilityCount ?? 0,
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

/**
 * Builds the standard Baseline vs Scenario A vs Scenario B comparison suite
 * for any given edge or incident.
 */
export function buildStandardComparisonSuite(
  edgeId: string,
  roadName: string,
  incidentTitle?: string
): ScenarioDefinition[] {
  return [
    {
      id: 'scen-baseline',
      name: 'Baseline Operational State',
      description: 'Standard cruising conditions with zero additional blockage or capacity reduction.',
      disruptions: [],
      durationMinutes: 0,
      testOriginNodeId: 'node_surathkal',
      testDestinationNodeId: 'node_pumpwell',
    },
    {
      id: 'scen-partial-a',
      name: `Scenario A: Partial Restriction on ${roadName}`,
      description: `Single-lane restriction / speed penalty modeling ${incidentTitle || 'incident'} with 50% capacity reduction for 30 minutes.`,
      disruptions: [
        {
          id: 'dis-partial',
          edgeId,
          roadName,
          disruptionType: 'PARTIAL_RESTRICTION',
          closureCondition: 'PARTIAL_RESTRICTION',
          severity: 'MODERATE',
          delayPenaltyMinutes: 15,
          capacityReductionPercent: 50,
          durationMinutes: 30,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      durationMinutes: 30,
      testOriginNodeId: 'node_surathkal',
      testDestinationNodeId: 'node_pumpwell',
    },
    {
      id: 'scen-complete-b',
      name: `Scenario B: Complete Closure on ${roadName}`,
      description: `Complete dual-carriageway shutdown modeling major catastrophe / bridge severance for 120 minutes.`,
      disruptions: [
        {
          id: 'dis-complete',
          edgeId,
          roadName,
          disruptionType: 'COMPLETE_CLOSURE',
          closureCondition: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          capacityReductionPercent: 100,
          durationMinutes: 120,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      durationMinutes: 120,
      testOriginNodeId: 'node_surathkal',
      testDestinationNodeId: 'node_pumpwell',
    },
  ];
}
