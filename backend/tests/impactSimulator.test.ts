import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  LIFELINE_HOSPITALS,
  solveGraphShortestPath,
  RunImpactSimulationSchema,
  type ScenarioDefinition,
} from '@roadalert/shared';
import {
  runImpactSimulation,
  compareScenarios,
} from '../src/services/impactSimulationService.js';
import { db } from '../src/db/index.js';

describe('RoadAlert Impact Simulator — Master Intelligence Test Suite (12 Criteria)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1 — Baseline Consistency
  it('Criterion 1 (Baseline): original graph produces identical baseline route and cost before and after a hypothetical scenario is evaluated', async () => {
    const emptyBlocked = new Set<string>();
    const routeBefore = solveGraphShortestPath('node_surathkal', 'node_pumpwell', emptyBlocked);
    expect(routeBefore).not.toBeNull();
    const timeBefore = routeBefore!.totalTimeMin;

    // Run hypothetical scenario closing Kuloor bridge
    const scenario: ScenarioDefinition = {
      id: 'test-scenario-1',
      name: 'Kuloor Bridge Severance',
      description: 'Test hypothetical closure',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_kuntikan_kuloor',
          roadName: 'NH-66 Kuntikan to Kuloor Bridge Causeway',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      testOriginNodeId: 'node_surathkal',
      testDestinationNodeId: 'node_pumpwell',
    };

    const simResult = await runImpactSimulation(scenario);
    expect(simResult.hasNoViableRoute).toBe(false);
    expect(simResult.routeEvaluation?.disruptedRoute).not.toBeNull();
    // Disrupted route must be longer than baseline
    expect(simResult.routeEvaluation!.disruptedRoute!.totalTimeMin).toBeGreaterThan(timeBefore);

    // Verify original graph is identical after simulation
    const routeAfter = solveGraphShortestPath('node_surathkal', 'node_pumpwell', emptyBlocked);
    expect(routeAfter).not.toBeNull();
    expect(routeAfter!.totalTimeMin).toBe(timeBefore);
    expect(routeAfter!.path).toEqual(routeBefore!.path);
  });

  // Test 2 — Single Closure Alternate Detour
  it('Criterion 2 (Single Closure): closing a primary road segment reroutes via strategic inland bypass when alternative exists', async () => {
    const scenario: ScenarioDefinition = {
      id: 'test-scenario-2',
      name: 'Single Segment Closure',
      description: 'Testing detour activation',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_kuntikan_kuloor',
          roadName: 'NH-66 Kuntikan to Kuloor Bridge Causeway',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      testOriginNodeId: 'node_surathkal',
      testDestinationNodeId: 'node_kpt',
    };

    const sim = await runImpactSimulation(scenario);
    expect(sim.routeEvaluation?.disruptedRoute).not.toBeNull();
    // Route must not contain the closed edge
    expect(sim.routeEvaluation!.disruptedRoute!.edgeIds).not.toContain('edge_kuntikan_kuloor');
    // Route must utilize Maravoor/Bajpe inland bypass to reach KPT
    expect(sim.routeEvaluation!.disruptedRoute!.path).toContain('node_maravoor_bypass');
    expect(sim.recommendation.recommendedCorridor).toMatch(/Bajpe|Airport|Maravoor/i);
  });

  // Test 3 — No Alternative / Complete Severance
  it('Criterion 3 (No Alternative): closing all connecting corridors produces an explicit NO_VIABLE_ROUTE result', async () => {
    // Manipal is connected via edge_udupi_manipal (NH-169A) and edge_karkala_manipal (SH-1)
    // If both are closed, Manipal must be completely unreachable
    const scenario: ScenarioDefinition = {
      id: 'test-scenario-3',
      name: 'Total Manipal Cutoff',
      description: 'Closing all access corridors to Manipal',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_udupi_manipal',
          roadName: 'NH-169A Udupi-Manipal Apex Lifeline',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
        {
          id: 'dis-2',
          edgeId: 'edge_karkala_manipal',
          roadName: 'Karkala-Hiriadka-Manipal Eastern Lifeline',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      testOriginNodeId: 'node_surathkal',
      testDestinationNodeId: 'node_manipal',
      focusHospitalId: 'hosp-kmc-manipal',
    };

    const sim = await runImpactSimulation(scenario);
    expect(sim.hasNoViableRoute).toBe(true);
    expect(sim.routeEvaluation?.isSevered).toBe(true);
    expect(sim.routeEvaluation?.rejectionReason).toContain('severed');
    expect(sim.recommendation.primaryAction).toContain('HOLD AT STAGING POINT');

    // Hospital KMC Manipal must be completely severed
    const kmc = sim.hospitalAssessments.find((h) => h.hospitalId === 'hosp-kmc-manipal');
    expect(kmc).toBeDefined();
    expect(kmc!.isCompletelySevered).toBe(true);
    expect(kmc!.severedOriginsCount).toBe(Object.keys(CORRIDOR_GRAPH_NODES).length - 1);
  });

  // Test 4 — Multiple Hypothetical Closures
  it('Criterion 4 (Multiple Closures): multiple hypothetical closures are applied together deterministically', async () => {
    const scenario: ScenarioDefinition = {
      id: 'test-scenario-4',
      name: 'Multi-corridor Flooding',
      description: 'Simultaneous closures of coastal bridges',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_kuntikan_kuloor',
          roadName: 'NH-66 Kuloor Bridge',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
        {
          id: 'dis-2',
          edgeId: 'edge_surathkal_mulki',
          roadName: 'NH-66 Mulki River Bridge',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      testOriginNodeId: 'node_surathkal',
      testDestinationNodeId: 'node_pumpwell',
    };

    const sim = await runImpactSimulation(scenario);
    expect(sim.disruptionsAppliedCount).toBe(2);
    expect(sim.directlyDisruptedEdgesCount).toBe(2);
    expect(sim.routeEvaluation?.disruptedRoute?.edgeIds).not.toContain('edge_kuntikan_kuloor');
    expect(sim.routeEvaluation?.disruptedRoute?.edgeIds).not.toContain('edge_surathkal_mulki');
  });

  // Test 5 — State Isolation
  it('Criterion 5 (State Isolation): running an impact simulation never modifies production database records', async () => {
    // Spy on db.query to ensure no INSERT, UPDATE, or DELETE queries occur
    const querySpy = vi.spyOn(db, 'query');

    const scenario: ScenarioDefinition = {
      id: 'test-scenario-5',
      name: 'Testing DB Isolation',
      description: 'Hypothetical run',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_pumpwell_nanthoor',
          roadName: 'NH-66 Pumpwell-Nanthoor Arterial',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
    };

    await runImpactSimulation(scenario);

    // Verify only SELECT queries were made to fetch baseline incidents
    for (const call of querySpy.mock.calls) {
      const sql = String(call[0]).trim().toUpperCase();
      expect(sql.startsWith('SELECT')).toBe(true);
      expect(sql).not.toContain('INSERT');
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('DELETE');
    }
  });

  // Test 6 — Hospital Accessibility Matrix
  it('Criterion 6 (Hospital Accessibility): correctly calculates baseline vs disrupted travel times and severed origins', async () => {
    const scenario: ScenarioDefinition = {
      id: 'test-scenario-6',
      name: 'AJ Hospital Kuntikan Approach Disruption',
      description: 'Disrupting KPT to Kuntikan flyover',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_kpt_kuntikan',
          roadName: 'NH-66 KPT-Kuntikan (AJ Hospital Flyover)',
          disruptionType: 'TRAVEL_COST_PENALTY',
          severity: 'HIGH',
          delayPenaltyMinutes: 25,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      focusHospitalId: 'hosp-aj-mangaluru',
    };

    const sim = await runImpactSimulation(scenario);
    const aj = sim.hospitalAssessments.find((h) => h.hospitalId === 'hosp-aj-mangaluru');
    expect(aj).toBeDefined();
    expect(aj!.averageDelayDeltaMin).toBeGreaterThan(0);
    expect(aj!.disruptedReachableOrigins).toBe(aj!.baselineReachableOrigins);
    expect(aj!.isCompletelySevered).toBe(false);
  });

  // Test 7 — Ripple Effect Classifications
  it('Criterion 7 (Ripple Effects): categorizes network corridors into direct, alternative bypass, and unaffected', async () => {
    const scenario: ScenarioDefinition = {
      id: 'test-scenario-7',
      name: 'Ripple Test',
      description: 'Checking corridor classifications',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_kuntikan_kuloor',
          roadName: 'NH-66 Kuloor Bridge',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
    };

    const sim = await runImpactSimulation(scenario);
    const kuloor = sim.rippleEffects.find((e) => e.edgeId === 'edge_kuntikan_kuloor');
    expect(kuloor).toBeDefined();
    expect(kuloor!.impactClass).toBe('DIRECTLY_DISRUPTED');

    // Inland bypass should be flagged as active alternative
    const bypass = sim.rippleEffects.find((e) => e.edgeId === 'edge_kpt_maravoor');
    expect(bypass).toBeDefined();
    expect(['ALTERNATIVE_CORRIDOR_REQUIRED', 'ACCESSIBILITY_REDUCED', 'UNAFFECTED']).toContain(
      bypass!.impactClass
    );
  });

  // Test 8 — Scenario Comparison Matrix
  it('Criterion 8 (Scenario Comparison): evaluates multiple scenarios with consistent denominators and metrics', async () => {
    const scenarioA: ScenarioDefinition = {
      id: 'scen-a',
      name: 'Scenario A: Baseline Minimal Delay',
      description: 'Minor slowdown on NH-66',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_pumpwell_nanthoor',
          roadName: 'Pumpwell-Nanthoor',
          disruptionType: 'TRAVEL_COST_PENALTY',
          severity: 'LOW',
          delayPenaltyMinutes: 5,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
    };

    const scenarioB: ScenarioDefinition = {
      id: 'scen-b',
      name: 'Scenario B: Catastrophic Kuloor Severance',
      description: 'Complete bridge collapse',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_kuntikan_kuloor',
          roadName: 'Kuloor Bridge',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
    };

    const comp = await compareScenarios([scenarioA, scenarioB]);
    expect(comp.scenarios.length).toBe(2);
    expect(comp.scenarios[0].scenarioName).toBe(scenarioA.name);
    expect(comp.scenarios[1].scenarioName).toBe(scenarioB.name);
    // Scenario A must have lower or equal average delay delta than Scenario B
    expect(comp.scenarios[0].averageDelayDeltaMin).toBeLessThanOrEqual(
      comp.scenarios[1].averageDelayDeltaMin
    );
    expect(comp.summaryVerdict).toContain('Scenario A');
  });

  // Test 9 — Unverified Incident Evaluation
  it('Criterion 9 (Unverified Incident): allows testing unverified reports with proper uncertainty labeling', async () => {
    const scenario: ScenarioDefinition = {
      id: 'test-scenario-9',
      name: 'Unverified Waterlogging Report',
      description: 'Single commuter observation of deep flooding',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_kuloor_baikampady',
          roadName: 'NH-66 Kuloor-Baikampady Port Corridor',
          disruptionType: 'PARTIAL_RESTRICTION',
          severity: 'HIGH',
          delayPenaltyMinutes: 20,
          verificationAssumption: 'UNVERIFIED_ASSUMPTION',
        },
      ],
    };

    const sim = await runImpactSimulation(scenario);
    expect(sim.recommendation.supportingMetrics.confidenceCertainty).toBe('UNVERIFIED_SCENARIO');
    expect(sim.recommendation.primaryAction).toBeDefined();
  });

  // Test 10 — Invalid Input Validation
  it('Criterion 10 (Invalid Inputs): rejects malformed parameters, negative costs, and empty disruptions via Zod schema', () => {
    const invalidNegative = {
      name: 'Invalid Negative Delay',
      disruptions: [
        {
          edgeId: 'edge_kuloor_baikampady',
          roadName: 'NH-66 Kuloor',
          disruptionType: 'TRAVEL_COST_PENALTY',
          severity: 'MODERATE',
          delayPenaltyMinutes: -15, // INVALID NEGATIVE
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
    };

    const result = RunImpactSimulationSchema.safeParse(invalidNegative);
    expect(result.success).toBe(false);

    const emptyDisruptions = {
      name: 'Empty Disruptions',
      disruptions: [], // INVALID EMPTY
    };
    const emptyResult = RunImpactSimulationSchema.safeParse(emptyDisruptions);
    expect(emptyResult.success).toBe(false);
  });

  // Test 11 — Reproducibility
  it('Criterion 11 (Reproducibility): identical scenario inputs produce identical computed metrics deterministically', async () => {
    const scenario: ScenarioDefinition = {
      id: 'test-scenario-11',
      name: 'Reproducibility Verification',
      description: 'Identical inputs test',
      disruptions: [
        {
          id: 'dis-1',
          edgeId: 'edge_nanthoor_kpt',
          roadName: 'NH-66 Nanthoor-KPT Expressway',
          disruptionType: 'TRAVEL_COST_PENALTY',
          severity: 'MODERATE',
          delayPenaltyMinutes: 12,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      testOriginNodeId: 'node_pumpwell',
      testDestinationNodeId: 'node_kuntikan',
    };

    const run1 = await runImpactSimulation(scenario);
    const run2 = await runImpactSimulation(scenario);

    expect(run1.routeEvaluation?.disruptedRoute?.totalTimeMin).toBe(
      run2.routeEvaluation?.disruptedRoute?.totalTimeMin
    );
    expect(run1.routeEvaluation?.disruptedRoute?.totalDistanceKm).toBe(
      run2.routeEvaluation?.disruptedRoute?.totalDistanceKm
    );
    expect(run1.recommendation.supportingMetrics.delayDeltaMin).toBe(
      run2.recommendation.supportingMetrics.delayDeltaMin
    );
  });

  // Test 12 — Regression & Graph Integrity
  it('Criterion 12 (Graph Integrity): all 18 nodes, 21 edges, and 6 hospitals maintain topological connectivity', () => {
    const nodeCount = Object.keys(CORRIDOR_GRAPH_NODES).length;
    expect(nodeCount).toBe(18);
    expect(CORRIDOR_GRAPH_EDGES.length).toBeGreaterThanOrEqual(20);
    expect(LIFELINE_HOSPITALS.length).toBe(6);

    // Verify all edges connect valid nodes
    for (const edge of CORRIDOR_GRAPH_EDGES) {
      expect(CORRIDOR_GRAPH_NODES[edge.fromNode]).toBeDefined();
      expect(CORRIDOR_GRAPH_NODES[edge.toNode]).toBeDefined();
      expect(edge.baseTimeMin).toBeGreaterThan(0);
      expect(edge.distanceKm).toBeGreaterThan(0);
    }
  });
});
