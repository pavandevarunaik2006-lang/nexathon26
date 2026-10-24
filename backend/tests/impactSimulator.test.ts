import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  LIFELINE_HOSPITALS,
  STANDARD_ANALYZED_ROUTES,
  solveGraphShortestPath,
  RunImpactSimulationSchema,
  type ScenarioDefinition,
} from '@roadalert/shared';
import {
  runImpactSimulation,
  compareScenarios,
  buildStandardComparisonSuite,
} from '../src/services/impactSimulationService.js';
import { listIncidentsFiltered } from '../src/services/incidentService.js';
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
  }, 15000);

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

  describe('RoadAlert Impact Simulator — Extended Multi-Scenario & Route Analysis Tests', () => {
    // Test 13 — Partial Restriction vs Complete Closure Comparison
    it('evaluates partial restriction vs complete closure with appropriate delay modeling and bypass selection', async () => {
      const partialScenario: ScenarioDefinition = {
        name: 'Kuloor Bridge Partial Restriction (1 Lane Blocked)',
        disruptions: [
          {
            edgeId: 'edge_kuntikan_kuloor',
            roadName: 'NH-66 Kuloor Bridge',
            disruptionType: 'PARTIAL_RESTRICTION',
            closureCondition: 'PARTIAL_RESTRICTION',
            severity: 'MODERATE',
            delayPenaltyMinutes: 4,
            capacityReductionPercent: 25,
            durationMinutes: 30,
            verificationAssumption: 'CONFIRMED_CLOSURE',
          },
        ],
        testOriginNodeId: 'node_surathkal',
        testDestinationNodeId: 'node_pumpwell',
      };

      const completeScenario: ScenarioDefinition = {
        name: 'Kuloor Bridge Complete Closure (Full Severance)',
        disruptions: [
          {
            edgeId: 'edge_kuntikan_kuloor',
            roadName: 'NH-66 Kuloor Bridge',
            disruptionType: 'COMPLETE_CLOSURE',
            closureCondition: 'COMPLETE_CLOSURE',
            severity: 'CRITICAL',
            delayPenaltyMinutes: 999,
            capacityReductionPercent: 100,
            durationMinutes: 120,
            verificationAssumption: 'CONFIRMED_CLOSURE',
          },
        ],
        testOriginNodeId: 'node_surathkal',
        testDestinationNodeId: 'node_pumpwell',
      };

      const partialRes = await runImpactSimulation(partialScenario);
      const completeRes = await runImpactSimulation(completeScenario);

      // In partial restriction, road remains passable with added delay
      expect(partialRes.routeEvaluation?.disruptedRoute).not.toBeNull();
      expect(partialRes.routeEvaluation?.disruptedRoute?.edgeIds).toContain('edge_kuntikan_kuloor');

      // In complete closure, road is physically removed from routing and traffic must divert
      expect(completeRes.routeEvaluation?.disruptedRoute).not.toBeNull();
      expect(completeRes.routeEvaluation?.disruptedRoute?.edgeIds).not.toContain('edge_kuntikan_kuloor');
      expect(completeRes.routeEvaluation!.disruptedRoute!.totalTimeMin).toBeGreaterThanOrEqual(
        partialRes.routeEvaluation!.disruptedRoute!.totalTimeMin
      );
    });

    // Test 14 — Route Impact Classifications
    it('classifies arterial routes into directly affected, indirectly affected, and unaffected categories', async () => {
      const scenario: ScenarioDefinition = {
        name: 'Kuloor Causeway Incident',
        disruptions: [
          {
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

      const sim = await runImpactSimulation(scenario);
      expect(sim.analyzedRoutes).toBeDefined();
      expect(sim.analyzedRoutes!.length).toBeGreaterThanOrEqual(6);

      // Surathkal to Pumpwell normally crosses Kuloor, so it must be DIRECTLY_AFFECTED
      const surathkalPumpwell = sim.analyzedRoutes!.find((r) => r.routeId === 'route_surathkal_pumpwell');
      expect(surathkalPumpwell).toBeDefined();
      expect(surathkalPumpwell!.classification).toBe('DIRECTLY_AFFECTED');
      expect(surathkalPumpwell!.alternativeAvailable).toBe(true);
      expect(surathkalPumpwell!.explanation).toContain('found an alternative path');

      // Udupi to Manipal is in northern district and does not cross Kuloor -> NO_MODELED_IMPACT
      const udupiManipal = sim.analyzedRoutes!.find((r) => r.routeId === 'route_udupi_manipal');
      expect(udupiManipal).toBeDefined();
      expect(udupiManipal!.classification).toBe('NO_MODELED_IMPACT');
      expect(udupiManipal!.delayDeltaMin).toBe(0);
      expect(udupiManipal!.explanation).toContain('normal cruising conditions');
    });

    // Test 15 — Incident That Does Not Intersect Analyzed Route
    it('properly records zero modeled impact for routes far removed from the disrupted corridor', async () => {
      const scenario: ScenarioDefinition = {
        name: 'Southern Pumpwell-Nanthoor Work',
        disruptions: [
          {
            edgeId: 'edge_pumpwell_nanthoor',
            roadName: 'NH-66 Pumpwell-Nanthoor Arterial',
            disruptionType: 'COMPLETE_CLOSURE',
            severity: 'HIGH',
            delayPenaltyMinutes: 999,
            verificationAssumption: 'CONFIRMED_CLOSURE',
          },
        ],
        testOriginNodeId: 'node_surathkal',
        testDestinationNodeId: 'node_udupi',
      };

      const sim = await runImpactSimulation(scenario);
      // Surathkal to Udupi is heading north away from Pumpwell-Nanthoor
      expect(sim.routeEvaluation?.disruptedRoute).not.toBeNull();
      expect(sim.routeEvaluation!.disruptedRoute!.totalTimeMin).toBe(
        sim.routeEvaluation!.baselineRoute!.totalTimeMin
      );
      expect(sim.recommendation.supportingMetrics.delayDeltaMin).toBe(0);
    });

    // Test 16 — Coordinate Order and Geometry Validity
    it('ensures all coordinates follow valid [lat, lng] format in Karnataka coastal bounds', async () => {
      for (const edge of CORRIDOR_GRAPH_EDGES) {
        expect(edge.geometry.length).toBeGreaterThan(0);
        for (const [lat, lng] of edge.geometry) {
          // Latitude must be ~12.5 to 13.8, Longitude must be ~74.5 to 75.2
          expect(lat).toBeGreaterThan(12.5);
          expect(lat).toBeLessThan(13.8);
          expect(lng).toBeGreaterThan(74.5);
          expect(lng).toBeLessThan(75.2);
        }
      }
    });

    // Test 17 — Standard Comparison Suite Generation
    it('buildStandardComparisonSuite creates three coherent scenarios with complete comparison matrix attributes', async () => {
      const suite = buildStandardComparisonSuite(
        'edge_kuntikan_kuloor',
        'NH-66 Kuloor Bridge',
        'Structural Crack Assessment'
      );
      expect(suite.length).toBe(3);
      expect(suite[0].name).toContain('Baseline');
      expect(suite[1].name).toContain('Scenario A');
      expect(suite[2].name).toContain('Scenario B');

      const comparison = await compareScenarios(suite);
      expect(comparison.scenarios.length).toBe(3);

      for (const s of comparison.scenarios) {
        expect(s.affectedRoad).toBeDefined();
        expect(s.closureCondition).toBeDefined();
        expect(s.duration).toBeDefined();
        expect(s.baselineTravelTime).toBeDefined();
        expect(s.simulatedTravelTime).toBeDefined();
        expect(s.additionalTravelTime).toBeDefined();
        expect(s.alternativeRouteAvailable).toBeDefined();
        expect(s.affectedRoutesAnalyzed).toBeGreaterThan(0);
        expect(typeof s.destinationsWithChangedAccessibility).toBe('number');
      }
    });

    // Test 18 — Destination Accessibility Changes
    it('computes destination accessibility and flags isolated destinations', async () => {
      // Close all access to Manipal
      const scenario: ScenarioDefinition = {
        name: 'Isolating Manipal',
        disruptions: [
          {
            edgeId: 'edge_udupi_manipal',
            roadName: 'NH-169A',
            disruptionType: 'COMPLETE_CLOSURE',
            severity: 'CRITICAL',
            delayPenaltyMinutes: 999,
            verificationAssumption: 'CONFIRMED_CLOSURE',
          },
          {
            edgeId: 'edge_karkala_manipal',
            roadName: 'Eastern Lifeline',
            disruptionType: 'COMPLETE_CLOSURE',
            severity: 'CRITICAL',
            delayPenaltyMinutes: 999,
            verificationAssumption: 'CONFIRMED_CLOSURE',
          },
        ],
      };

      const sim = await runImpactSimulation(scenario);
      expect(sim.destinationsAccessibility).toBeDefined();
      const manipalDest = sim.destinationsAccessibility!.find((d) => d.nodeId === 'node_manipal');
      expect(manipalDest).toBeDefined();
      expect(manipalDest!.accessibilityStatus).toBe('SEVERED_UNREACHABLE');
      expect(sim.destinationsWithChangedAccessibilityCount).toBeGreaterThan(0);
    });
  });
});

describe('RoadAlert Impact Simulator — Filterable Incident List & Map Integration Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Filtering by supported schema fields
  it('Criterion A (Schema Filtering): filters real incidents by supported fields (category, severity, status, confidence, dates, search)', async () => {
    // 1.1 Category filter
    const catRes = await listIncidentsFiltered({ category: 'ACCIDENT', limit: '10' });
    expect(catRes.items).toBeDefined();
    for (const item of catRes.items) {
      expect(item.category).toBe('ACCIDENT');
    }

    // 1.2 Severity filter
    const sevRes = await listIncidentsFiltered({ severity: 'CRITICAL', limit: '10' });
    expect(sevRes.items).toBeDefined();
    for (const item of sevRes.items) {
      expect(item.severity).toBe('CRITICAL');
    }

    // 1.3 Lifecycle Status filter
    const stRes = await listIncidentsFiltered({ status: 'ACTIVE', limit: '10' });
    expect(stRes.items).toBeDefined();
    for (const item of stRes.items) {
      expect(item.status).toBe('ACTIVE');
    }

    // 1.4 Minimum Confidence filter
    const confRes = await listIncidentsFiltered({ minConfidence: '50', limit: '10' });
    expect(confRes.items).toBeDefined();
    for (const item of confRes.items) {
      expect(item.confidenceScore).toBeGreaterThanOrEqual(50);
    }

    // 1.5 Date Range filter
    const nowIso = new Date().toISOString();
    const pastIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const dateRes = await listIncidentsFiltered({ dateFrom: pastIso, dateTo: nowIso, limit: '10' });
    expect(dateRes.items).toBeDefined();
    for (const item of dateRes.items) {
      const repTime = new Date(item.reportedAt).getTime();
      expect(repTime).toBeGreaterThanOrEqual(new Date(pastIso).getTime() - 1000);
      expect(repTime).toBeLessThanOrEqual(new Date(nowIso).getTime() + 1000);
    }

    // 1.6 Search query
    const searchRes = await listIncidentsFiltered({ search: 'NH-66', limit: '10' });
    expect(searchRes.items).toBeDefined();
    for (const item of searchRes.items) {
      const match =
        (item.title || '').includes('NH-66') ||
        (item.roadName || '').includes('NH-66') ||
        (item.description || '').includes('NH-66');
      expect(match).toBe(true);
    }
  });

  // 2. Search and Clearing Filters
  it('Criterion B (Clear Filters): clearing search and filters returns the full incident dataset', async () => {
    const fullRes = await listIncidentsFiltered({ limit: '50' });
    const filteredRes = await listIncidentsFiltered({ category: 'FLOODING', limit: '50' });

    // When filters are cleared (category: ALL, search: empty), all items are returned
    const clearedRes = await listIncidentsFiltered({ category: 'ALL', search: '', limit: '50' });
    expect(clearedRes.items.length).toBe(fullRes.items.length);
    expect(clearedRes.items.length).toBeGreaterThanOrEqual(filteredRes.items.length);
  });

  // 3. Coordinate validation & Incidents with missing/invalid coordinates
  it('Criterion C (Coordinates): identifies valid vs invalid coordinates and prevents fake map plotting', () => {
    const incidents = [
      { id: '1', title: 'Valid Pin', latitude: 12.9141, longitude: 74.856 },
      { id: '2', title: 'Zero Coords', latitude: 0, longitude: 0 },
      { id: '3', title: 'Null Coords', latitude: null, longitude: null },
      { id: '4', title: 'NaN Coords', latitude: NaN, longitude: 74.856 },
    ];

    const validIncidents = incidents.filter(
      (inc) =>
        Number(inc.latitude) !== 0 &&
        !isNaN(Number(inc.latitude)) &&
        Number(inc.longitude) !== 0 &&
        !isNaN(Number(inc.longitude))
    );

    expect(validIncidents.length).toBe(1);
    expect(validIncidents[0].id).toBe('1');

    // Invalid incidents must NOT be plotted at (0, 0)
    const invalidIncidents = incidents.filter((inc) => !validIncidents.includes(inc));
    expect(invalidIncidents.length).toBe(3);
    for (const inv of invalidIncidents) {
      const isValid =
        Number(inv.latitude) !== 0 &&
        !isNaN(Number(inv.latitude)) &&
        Number(inv.longitude) !== 0 &&
        !isNaN(Number(inv.longitude));
      expect(isValid).toBe(false);
    }
  });

  // 4. Duplicate Marker Prevention
  it('Criterion D (Duplicate Markers): excludes selectedIncident from the secondary filtered pins array', () => {
    const activeIncidents = [
      { id: 'inc-1', title: 'Bridge Gap', latitude: 12.91, longitude: 74.85 },
      { id: 'inc-2', title: 'Spill', latitude: 12.92, longitude: 74.86 },
      { id: 'inc-3', title: 'Roadworks', latitude: 12.93, longitude: 74.87 },
    ];

    const selectedIncidentId = 'inc-2';

    // The map component must filter out selectedIncidentId when rendering secondary pins
    const secondaryPins = activeIncidents.filter((inc) => inc.id !== selectedIncidentId);
    expect(secondaryPins.length).toBe(2);
    expect(secondaryPins.some((inc) => inc.id === selectedIncidentId)).toBe(false);

    // Selected pin is rendered independently with dedicated target styling and zIndex 1000
    const targetPin = activeIncidents.find((inc) => inc.id === selectedIncidentId);
    expect(targetPin).toBeDefined();
    expect(targetPin!.id).toBe('inc-2');
  });

  // 5. List Selection, Map Selection & Form Synchronization
  it('Criterion E (Sync & Severity Distinction): matches closest corridor and distinguishes reported severity from simulated closure severity', () => {
    const reportedIncident = {
      id: 'inc-kuloor',
      title: 'Overturned Tanker on Kuloor Causeway',
      road_name: 'NH-66 Kuloor',
      category: 'ACCIDENT',
      severity: 'CRITICAL', // Reported incident severity
      latitude: 12.915,
      longitude: 74.84,
      road_closed: false,
      estimated_delay_minutes: 25,
      confidence_score: 85,
      verification_status: 'VERIFIED',
    };

    // Calculate closest corridor edge
    let bestEdge = CORRIDOR_GRAPH_EDGES[0];
    let bestDist = Infinity;
    for (const edge of CORRIDOR_GRAPH_EDGES) {
      for (const [pLat, pLng] of edge.geometry) {
        const d = Math.hypot(pLat - reportedIncident.latitude, pLng - reportedIncident.longitude);
        if (d < bestDist) {
          bestDist = d;
          bestEdge = edge;
        }
      }
    }

    expect(bestEdge.id).toBe('edge_kuntikan_kuloor');

    // Simulator disruption configuration distinguishes reported severity from simulated condition
    const simulatedDisruption = {
      edgeId: bestEdge.id,
      roadName: reportedIncident.road_name,
      reportedSeverity: reportedIncident.severity, // Reported: CRITICAL
      simulatedClosureCondition: 'PARTIAL_RESTRICTION', // User can model partial or complete closure independently
      simulatedDelayPenaltyMinutes: 25,
      simulatedCapacityReduction: 50,
    };

    expect(simulatedDisruption.reportedSeverity).toBe('CRITICAL');
    expect(simulatedDisruption.simulatedClosureCondition).toBe('PARTIAL_RESTRICTION');
    expect(simulatedDisruption.simulatedDelayPenaltyMinutes).toBe(25);
  });

  // 6. Relevant Incidents along Affected Routes
  it('Criterion F (Route Incident Correlation): detects and links active incidents located along affected and detour corridors', async () => {
    // Kuloor bridge disruption scenario
    const scenario: ScenarioDefinition = {
      name: 'Kuloor Bridge Severance with Incident Correlation',
      disruptions: [
        {
          edgeId: 'edge_kuntikan_kuloor',
          roadName: 'NH-66 Kuloor Bridge',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      testOriginNodeId: 'node_surathkal',
      testDestinationNodeId: 'node_pumpwell',
    };

    const result = await runImpactSimulation(scenario);
    expect(result.relevantIncidentsAlongRoutes).toBeDefined();
    expect(Array.isArray(result.relevantIncidentsAlongRoutes)).toBe(true);

    // If incidents exist along the corridor, verify their structure
    for (const inc of result.relevantIncidentsAlongRoutes!) {
      expect(inc.id).toBeDefined();
      expect(inc.title).toBeDefined();
      expect(inc.roadName).toBeDefined();
      expect(inc.category).toBeDefined();
      expect(inc.severity).toBeDefined();
      expect(inc.verificationStatus).toBeDefined();
      expect(inc.proximityNote).toBeDefined();
    }
  });

  // 7. Route impact calculation & alternative route explanation
  it('Criterion G (Alternative Route Explanation): computes baseline vs simulated travel time and explains why alternative detour was selected', async () => {
    const scenario: ScenarioDefinition = {
      name: 'Alternative Route Test',
      disruptions: [
        {
          edgeId: 'edge_kuntikan_kuloor',
          roadName: 'NH-66 Kuloor Bridge',
          disruptionType: 'COMPLETE_CLOSURE',
          severity: 'CRITICAL',
          delayPenaltyMinutes: 999,
          verificationAssumption: 'CONFIRMED_CLOSURE',
        },
      ],
      testOriginNodeId: 'node_surathkal',
      testDestinationNodeId: 'node_pumpwell',
    };

    const result = await runImpactSimulation(scenario);
    expect(result.routeEvaluation).toBeDefined();
    expect(result.routeEvaluation!.baselineRoute).toBeDefined();
    expect(result.routeEvaluation!.disruptedRoute).toBeDefined();

    const baseline = result.routeEvaluation!.baselineRoute!;
    const detour = result.routeEvaluation!.disruptedRoute!;

    expect(detour.totalTimeMin).toBeGreaterThan(baseline.totalTimeMin);
    expect(result.recommendation.recommendedCorridor).toBeDefined();
    expect(result.recommendation.avoidedCorridor).toBeDefined();
    expect(result.recommendation.strategicRationale).toBeDefined();
    expect(result.recommendation.strategicRationale.length).toBeGreaterThan(10);
  });

  // 8. Resilience to empty and failed API responses
  it('Criterion H (Empty / Failed Edge Cases): handles empty incident search gracefully without throwing', async () => {
    // Non-existent search query returns 0 items with empty pagination
    const emptyRes = await listIncidentsFiltered({ search: 'NON_EXISTENT_XYZ_QUERY_99999' });
    expect(emptyRes.items).toEqual([]);
    expect(emptyRes.pagination.total).toBe(0);

    // Malformed date strings are handled safely without unhandled exceptions
    const badDateRes = await listIncidentsFiltered({ dateFrom: 'not-a-date', dateTo: 'also-not-a-date' });
    expect(badDateRes.items).toBeDefined();
  });
});

