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
  id: string;
  edgeId: string;
  roadName: string;
  disruptionType: DisruptionType;
  severity: DisruptionSeverity;
  delayPenaltyMinutes: number; // e.g. 15, 30, 45, or 999 for complete closure
  verificationAssumption: 'CONFIRMED_CLOSURE' | 'UNVERIFIED_ASSUMPTION';
  associatedIncidentId?: string | null;
  notes?: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  disruptions: HypotheticalDisruption[];
  focusHospitalId?: string;
  testOriginNodeId?: string;
  testDestinationNodeId?: string;
  alternateInterventionEdgeId?: string; // Optional intervention edge tested
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
  }>;
  summaryVerdict: string;
}
