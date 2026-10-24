import type { GraphEdge, LifelineHospital } from './emergencyNetworkGraph';

export type DisruptionType =
  | 'COMPLETE_CLOSURE'
  | 'PARTIAL_RESTRICTION'
  | 'CAPACITY_REDUCTION'
  | 'TRAVEL_COST_PENALTY';

export type DisruptionSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

export type RippleImpactClass =
  | 'DIRECTLY_DISRUPTED'
  | 'ACCESSIBILITY_REDUCED'
  | 'MODELED_DELAY_INCREASED'
  | 'ALTERNATIVE_CORRIDOR_REQUIRED'
  | 'ISOLATED_NO_ACCESS'
  | 'UNAFFECTED';

export interface HypotheticalDisruption {
  id?: string;
  edgeId: string;
  roadName: string;
  disruptionType: DisruptionType;
  severity: DisruptionSeverity;
  delayPenaltyMinutes: number; // e.g. 15, 30, 45, or 999 for complete closure
  verificationAssumption: 'CONFIRMED_CLOSURE' | 'UNVERIFIED_ASSUMPTION';
  associatedIncidentId?: string | null;
  notes?: string;
  incidentType?: string;
  closureCondition?: 'COMPLETE_CLOSURE' | 'PARTIAL_RESTRICTION';
  capacityReductionPercent?: number;
  durationMinutes?: number;
  direction?: 'BOTH' | 'NORTHBOUND_ONLY' | 'SOUTHBOUND_ONLY';
  startTime?: string;
}

export interface ScenarioDefinition {
  id?: string;
  name: string;
  description?: string;
  disruptions: HypotheticalDisruption[];
  focusHospitalId?: string;
  testOriginNodeId?: string;
  testDestinationNodeId?: string;
  alternateInterventionEdgeId?: string; // Optional intervention edge tested
  durationMinutes?: number;
  direction?: 'BOTH' | 'NORTHBOUND_ONLY' | 'SOUTHBOUND_ONLY';
  timeHorizonMinutes?: number;
  selectedIncidentId?: string | null;
}

export interface RippleEffectSegment {
  edgeId: string;
  roadName: string;
  corridorCode: string;
  impactClass: RippleImpactClass;
  baselineTimeMin: number;
  disruptedTimeMin: number;
  delayDeltaMin: number;
  isPrimaryCorridor: boolean;
  isBridgeOrEstuary: boolean;
  absorptionRole?: string; // e.g., 'Primary Detour Bypass for NH-66 traffic'
  geometry: [number, number][];
}

export interface AnalyzedRouteImpact {
  routeId: string;
  name: string;
  originNodeId: string;
  destinationNodeId: string;
  originName: string;
  destinationName: string;
  baselineTimeMin: number;
  simulatedTimeMin: number;
  delayDeltaMin: number;
  baselineDistanceKm: number;
  simulatedDistanceKm: number;
  classification:
    | 'DIRECTLY_AFFECTED'
    | 'INDIRECTLY_AFFECTED'
    | 'POTENTIALLY_AFFECTED'
    | 'NO_MODELED_IMPACT'
    | 'SEVERED';
  alternativeAvailable: boolean;
  alternativeRouteName?: string;
  explanation: string;
  baselinePath: string[];
  simulatedPath: string[];
  baselineEdgeIds: string[];
  simulatedEdgeIds: string[];
  geometry?: [number, number][];
}

export interface DestinationAccessibilitySummary {
  nodeId: string;
  name: string;
  populationZone: string;
  corridor: string;
  baselineAvgTimeMin: number;
  simulatedAvgTimeMin: number;
  delayDeltaMin: number;
  accessibilityStatus: 'REACHABLE_NORMAL' | 'REACHABLE_DELAYED' | 'SEVERED_UNREACHABLE';
  isSevered: boolean;
  reachableOriginsCount: number;
  totalOriginsCount: number;
}

export interface HospitalImpactAssessment {
  hospitalId: string;
  hospitalName: string;
  shortName: string;
  traumaLevel: number;
  emergencyBeds: number;
  baselineReachableOrigins: number;
  disruptedReachableOrigins: number;
  severedOriginsCount: number;
  averageDelayDeltaMin: number;
  maxDelayDeltaMin: number;
  isCompletelySevered: boolean;
  affectedOrigins: Array<{
    originNodeId: string;
    originName: string;
    populationZone: string;
    baselineTimeMin: number;
    disruptedTimeMin: number;
    delayDeltaMin: number;
    status: 'ACCESSIBLE' | 'DELAYED' | 'SEVERED';
  }>;
}

export interface ExplainableRecommendation {
  primaryAction: string;
  strategicRationale: string;
  recommendedCorridor: string;
  avoidedCorridor: string;
  supportingMetrics: {
    baselineTimeMin: number;
    disruptedTimeMin: number;
    delayDeltaMin: number;
    distanceDeltaKm: number;
    isolatedOriginsCount: number;
    hospitalReachable: boolean;
    confidenceCertainty: 'HIGH_CERTAINTY' | 'MODERATE_ASSUMPTION' | 'UNVERIFIED_SCENARIO';
  };
  assumptionsAndLimitations: string[];
  triggerConditionsForChange: string;
}

export interface RelevantIncidentSummary {
  id: string;
  title: string;
  category: string;
  severity: string;
  roadName: string;
  verificationStatus: string;
  proximityNote: string;
  latitude?: number;
  longitude?: number;
}

export interface SimulationResult {
  scenarioId: string;
  scenarioName: string;
  simulatedAtIso: string;
  modelEngineVersion: string;
  totalNetworkNodesEvaluated: number;
  totalNetworkEdgesEvaluated: number;
  disruptionsAppliedCount: number;
  hasNoViableRoute: boolean;
  routeEvaluation?: {
    originNodeId: string;
    destinationNodeId: string;
    baselineRoute: {
      path: string[];
      edgeIds: string[];
      totalTimeMin: number;
      totalDistanceKm: number;
    } | null;
    disruptedRoute: {
      path: string[];
      edgeIds: string[];
      totalTimeMin: number;
      totalDistanceKm: number;
    } | null;
    isSevered: boolean;
    rejectionReason?: string;
  };
  rippleEffects: RippleEffectSegment[];
  directlyDisruptedEdgesCount: number;
  indirectlyAffectedEdgesCount: number;
  alternativeBypassesActiveCount: number;
  hospitalAssessments: HospitalImpactAssessment[];
  severedPopulationZonesCount: number;
  recommendation: ExplainableRecommendation;
  limitationsNotice: string[];
  // Extended Impact Intelligence metrics
  analyzedRoutes?: AnalyzedRouteImpact[];
  destinationsAccessibility?: DestinationAccessibilitySummary[];
  affectedRoutesAnalyzedCount?: number;
  destinationsWithChangedAccessibilityCount?: number;
  relevantIncidentsAlongRoutes?: RelevantIncidentSummary[];
}

export interface ScenarioComparisonMatrix {
  scenarios: Array<{
    scenarioId: string;
    scenarioName: string;
    description: string;
    reachableOriginsPercentage: number;
    severedOriginsCount: number;
    averageDelayDeltaMin: number;
    maxDelayDeltaMin: number;
    directlyDisruptedCount: number;
    hospitalsImpactedCount: number;
    viableRouteExists: boolean;
    recommendedIntervention: string;
    // Decision Intelligence Comparison Table Fields
    affectedRoad?: string;
    closureCondition?: string;
    duration?: string;
    baselineTravelTime?: string;
    simulatedTravelTime?: string;
    additionalTravelTime?: string;
    alternativeRouteAvailable?: string;
    affectedRoutesAnalyzed?: number;
    destinationsWithChangedAccessibility?: number;
  }>;
  summaryVerdict: string;
}

