import { Router, Request, Response, NextFunction } from 'express';
import { LIFELINE_HOSPITALS } from '@roadalert/shared';
import { evaluateHospitalReachability } from '../services/lifelineReachabilityService.js';
import {
  getDecisionCriticalVerificationQueue,
  executeQueueAction,
} from '../services/verificationQueueService.js';
import { calculateCorridorFragilityIndex } from '../services/corridorFragilityService.js';
import { getIncidentDetailById } from '../services/incidentService.js';
import { evaluateIncidentTrust } from '../services/incidentTrustService.js';

export const emergencyIntelligenceRouter = Router();

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
