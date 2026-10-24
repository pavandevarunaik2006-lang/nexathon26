import { Router, Request, Response, NextFunction } from 'express';
import {
  LIFELINE_HOSPITALS,
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  RunImpactSimulationSchema,
} from '@roadalert/shared';
import {
  runImpactSimulation,
  compareScenarios,
  buildStandardComparisonSuite,
} from '../services/impactSimulationService.js';
import { evaluateHospitalReachability } from '../services/lifelineReachabilityService.js';
import {
  getDecisionCriticalVerificationQueue,
  executeQueueAction,
} from '../services/verificationQueueService.js';
import { calculateCorridorFragilityIndex } from '../services/corridorFragilityService.js';
import { getIncidentDetailById } from '../services/incidentService.js';
import { evaluateIncidentTrust } from '../services/incidentTrustService.js';
import { optionalAuthenticate } from '../middleware/auth.js';

export const emergencyIntelligenceRouter = Router();

export const SIMULATION_PRESETS = [
  {
    id: 'kuloor-bridge-severance',
    name: 'Kuloor Bridge Severance (NH-66 Coastal Link)',
    description: 'Structural failure / emergency closure of the primary Gurupura River crossing.',
    category: 'INFRASTRUCTURE',
    disruptions: [
      {
        id: 'dis-kuloor',
        edgeId: 'edge_kuntikan_kuloor',
        roadName: 'NH-66 Kuntikan to Kuloor Bridge Causeway',
        disruptionType: 'COMPLETE_CLOSURE',
        closureCondition: 'COMPLETE_CLOSURE',
        severity: 'CRITICAL',
        delayPenaltyMinutes: 999,
        durationMinutes: 120,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
    ],
    testOriginNodeId: 'node_surathkal',
    testDestinationNodeId: 'node_nanthoor',
    focusHospitalId: 'hosp-aj-mangaluru',
  },
  {
    id: 'mulki-estuary-flood',
    name: 'Mulki Estuary Inundation (Monsoon Flooding)',
    description: 'High-tide coastal storm surge submerges the NH-66 Shambhavi river causeway.',
    category: 'FLOODING',
    disruptions: [
      {
        id: 'dis-mulki',
        edgeId: 'edge_surathkal_mulki',
        roadName: 'NH-66 Surathkal to Mulki River Bridge',
        disruptionType: 'PARTIAL_RESTRICTION',
        closureCondition: 'PARTIAL_RESTRICTION',
        severity: 'HIGH',
        delayPenaltyMinutes: 45,
        capacityReductionPercent: 60,
        durationMinutes: 60,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
    ],
    testOriginNodeId: 'node_surathkal',
    testDestinationNodeId: 'node_udupi',
    focusHospitalId: 'hosp-kmc-manipal',
  },
  {
    id: 'surathkal-chokepoint',
    name: 'Surathkal Chokepoint & Petrochemical Spill',
    description: 'Hazardous tanker spill restricts coastal expressway to single lane alternating traffic.',
    category: 'OBSTRUCTION',
    disruptions: [
      {
        id: 'dis-surathkal',
        edgeId: 'edge_baikampady_surathkal',
        roadName: 'NH-66 Baikampady to Surathkal NITK',
        disruptionType: 'PARTIAL_RESTRICTION',
        closureCondition: 'PARTIAL_RESTRICTION',
        severity: 'MODERATE',
        delayPenaltyMinutes: 25,
        capacityReductionPercent: 50,
        durationMinutes: 30,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
    ],
    testOriginNodeId: 'node_pumpwell',
    testDestinationNodeId: 'node_padubidri',
    focusHospitalId: 'hosp-wenlock-mangaluru',
  },
  {
    id: 'manipal-dual-severance',
    name: 'Udupi-Manipal Dual Severance (Lifeline Isolation)',
    description: 'Simultaneous landslip on NH-169A and bridge damage on Eastern Karkala Lifeline.',
    category: 'DISASTER',
    disruptions: [
      {
        id: 'dis-manipal-1',
        edgeId: 'edge_udupi_manipal',
        roadName: 'NH-169A Udupi-Manipal Apex Lifeline',
        disruptionType: 'COMPLETE_CLOSURE',
        closureCondition: 'COMPLETE_CLOSURE',
        severity: 'CRITICAL',
        delayPenaltyMinutes: 999,
        durationMinutes: 120,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
      {
        id: 'dis-manipal-2',
        edgeId: 'edge_karkala_manipal',
        roadName: 'Karkala-Hiriadka-Manipal Eastern Lifeline',
        disruptionType: 'COMPLETE_CLOSURE',
        closureCondition: 'COMPLETE_CLOSURE',
        severity: 'CRITICAL',
        delayPenaltyMinutes: 999,
        durationMinutes: 120,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
    ],
    testOriginNodeId: 'node_surathkal',
    testDestinationNodeId: 'node_manipal',
    focusHospitalId: 'hosp-kmc-manipal',
  },
];


/**
 * Feature 1: Lifeline Hospitals List
 */
emergencyIntelligenceRouter.get(
  '/lifeline/hospitals',
  (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        hospitals: LIFELINE_HOSPITALS,
      },
    });
  }
);

/**
 * Feature 1: Lifeline Reachability Evaluation
 */
emergencyIntelligenceRouter.get(
  '/lifeline/reachability',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hospitalId = String(req.query.hospitalId || LIFELINE_HOSPITALS[0].id);
      let simulatedClosure: any = undefined;

      if (req.query.simLat && req.query.simLng) {
        simulatedClosure = {
          latitude: parseFloat(String(req.query.simLat)),
          longitude: parseFloat(String(req.query.simLng)),
          roadName: req.query.simRoad ? String(req.query.simRoad) : undefined,
          roadClosed: req.query.simClosed !== 'false',
          title: req.query.simTitle ? String(req.query.simTitle) : 'Simulated Choke Obstruction',
        };
      }

      const reachability = await evaluateHospitalReachability(hospitalId, simulatedClosure);
      res.json({
        success: true,
        data: reachability,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Feature 2: Decision-Critical Verification Queue
 */
emergencyIntelligenceRouter.get(
  '/verification/critical-queue',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const queue = await getDecisionCriticalVerificationQueue();
      res.json({
        success: true,
        data: {
          items: queue,
          total: queue.length,
          urgentCount: queue.filter((i) => i.priorityBand === 'URGENT_EMERGENCY_IMPACT').length,
          highRiskCount: queue.filter((i) => i.priorityBand === 'HIGH_CORRIDOR_RISK').length,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Feature 2: Operator Action on Verification Queue Item
 */
emergencyIntelligenceRouter.post(
  '/verification/critical-queue/:incidentId/action',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incidentId = String(req.params.incidentId);
      const { action, notes } = req.body;

      if (!action) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_ACTION', message: 'Action is required' },
        });
        return;
      }

      const actorId = req.user?.userId;
      const result = await executeQueueAction(
        incidentId,
        action,
        actorId,
        notes
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Feature 5: Corridor Fragility Index
 */
emergencyIntelligenceRouter.get(
  '/corridor/fragility',
  (req: Request, res: Response) => {
    const forceRecalculate = req.query.refresh === 'true';
    const overview = calculateCorridorFragilityIndex(forceRecalculate);
    res.json({
      success: true,
      data: overview,
    });
  }
);

/**
 * Feature 3: Multi-Evidence Incident Trust Layer Evaluation
 */
emergencyIntelligenceRouter.get(
  '/incidents/:id/trust-evaluation',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const details = await getIncidentDetailById(id);
      const trustEvaluation = evaluateIncidentTrust(
        details.incident,
        details.confidenceBreakdown,
        details.corroborations,
        details.auditTrail
      );
      res.json({
        success: true,
        data: {
          incidentId: id,
          trustEvaluation,
          confidenceBreakdown: details.confidenceBreakdown,
          evidences: details.evidences,
          corroborations: details.corroborations,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);


/**
 * Flagship Feature: RoadAlert Impact Simulator
 * Returns available road network corridors, nodes, and hospitals for scenario modeling
 */
emergencyIntelligenceRouter.get(
  '/simulation/corridors',
  (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        corridors: CORRIDOR_GRAPH_EDGES,
        nodes: Object.values(CORRIDOR_GRAPH_NODES),
        hospitals: LIFELINE_HOSPITALS,
      },
    });
  }
);

/**
 * Flagship Feature: Preset What-If Scenarios
 */
emergencyIntelligenceRouter.get(
  '/simulation/presets',
  (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        presets: SIMULATION_PRESETS,
      },
    });
  }
);

/**
 * Flagship Feature: Run Impact Simulation
 * Evaluates hypothetical network closures and returns ripple effect & hospital accessibility intelligence
 */
emergencyIntelligenceRouter.post(
  '/simulation/impact',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = RunImpactSimulationSchema.parse(req.body);
      const result = await runImpactSimulation({
        id: parsed.scenarioId || `sim_${Date.now()}`,
        name: parsed.name,
        description: parsed.description || '',
        disruptions: parsed.disruptions as any,
        focusHospitalId: parsed.focusHospitalId,
        testOriginNodeId: parsed.testOriginNodeId,
        testDestinationNodeId: parsed.testDestinationNodeId,
        alternateInterventionEdgeId: parsed.alternateInterventionEdgeId,
        durationMinutes: parsed.durationMinutes,
        direction: parsed.direction,
        timeHorizonMinutes: parsed.timeHorizonMinutes,
        selectedIncidentId: parsed.selectedIncidentId,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Flagship Feature: Scenario Comparison Matrix
 * Evaluates multiple scenarios side-by-side against the baseline network
 */
emergencyIntelligenceRouter.post(
  '/simulation/compare',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { scenarios } = req.body;
      if (!Array.isArray(scenarios) || scenarios.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SCENARIOS',
            message: 'An array of at least one scenario is required for comparison',
          },
        });
        return;
      }

      const comparison = await compareScenarios(scenarios);
      res.json({
        success: true,
        data: comparison,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Flagship Feature: Compare Standard Preset Suite (Baseline vs Scenario A vs Scenario B)
 * For a given corridor or incident
 */
emergencyIntelligenceRouter.post(
  '/simulation/compare-presets',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { edgeId, roadName, incidentTitle } = req.body;
      if (!edgeId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_EDGE_ID',
            message: 'edgeId is required to generate a comparison suite',
          },
        });
        return;
      }

      const targetEdge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === edgeId);
      const effectiveRoad = roadName || targetEdge?.roadName || 'Primary Corridor';

      const suite = buildStandardComparisonSuite(edgeId, effectiveRoad, incidentTitle);
      const comparison = await compareScenarios(suite);

      res.json({
        success: true,
        data: {
          scenariosEvaluated: suite,
          matrix: comparison,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

