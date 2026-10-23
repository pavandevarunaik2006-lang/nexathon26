import { describe, it, expect } from 'vitest';
import {
  LIFELINE_HOSPITALS,
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  solveGraphShortestPath,
} from '@roadalert/shared';
import { calculateCorridorFragilityIndex } from '../src/services/corridorFragilityService.js';
import { evaluateIncidentTrust } from '../src/services/incidentTrustService.js';

describe('Emergency Access Intelligence Engines', () => {
  describe('Lifeline Road Graph & Dijkstra Solver', () => {
    it('finds open path between Pumpwell and KMC Manipal when corridors are open', () => {
      const result = solveGraphShortestPath(
        'node_pumpwell',
        'node_manipal',
        new Set<string>()
      );

      expect(result).not.toBeNull();
      expect(result!.path).toContain('node_pumpwell');
      expect(result!.path).toContain('node_manipal');
      expect(result!.totalTimeMin).toBeGreaterThan(0);
      expect(result!.totalDistanceKm).toBeGreaterThan(40);
    });

    it('reroutes via inland Maravoor/Bajpe bypass when Kuloor Bridge is blocked', () => {
      const blocked = new Set<string>(['edge_kuntikan_kuloor', 'edge_kuloor_baikampady']);
      const baseline = solveGraphShortestPath(
        'node_kpt',
        'node_surathkal',
        new Set<string>()
      );
      const rerouted = solveGraphShortestPath(
        'node_kpt',
        'node_surathkal',
        blocked
      );

      expect(baseline).not.toBeNull();
      expect(rerouted).not.toBeNull();
      // Rerouted path must bypass kuloor and use maravoor/bajpe
      expect(rerouted!.path).not.toContain('node_kuloor');
      expect(rerouted!.totalTimeMin).toBeGreaterThan(baseline!.totalTimeMin);
    });

    it('returns null (no viable route) when both coastal and inland bypasses are severed', () => {
      // Block all paths out of KPT northward
      const blocked = new Set<string>([
        'edge_kpt_kuntikan',
        'edge_kpt_maravoor',
        'edge_nanthoor_kpt',
      ]);
      const result = solveGraphShortestPath(
        'node_pumpwell',
        'node_manipal',
        blocked
      );

      expect(result).toBeNull();
    });
  });

  describe('Corridor Fragility Index Engine', () => {
    it('computes fragility scores across all regional corridor edges', () => {
      const overview = calculateCorridorFragilityIndex(true);

      expect(overview.totalSegmentsEvaluated).toBe(CORRIDOR_GRAPH_EDGES.length);
      expect(overview.segments.length).toBe(CORRIDOR_GRAPH_EDGES.length);
      expect(overview.highestFragilitySegment).toBeTruthy();

      // Top segments should have high fragility score
      const topSegment = overview.segments[0];
      expect(topSegment.fragilityScore).toBeGreaterThanOrEqual(75);
    });

    it('flags Kuloor Bridge or Kuntikan-Kuloor causeway as critical chokepoint', () => {
      const overview = calculateCorridorFragilityIndex(false);
      const kuloor = overview.segments.find((s) => s.edgeId === 'edge_kuntikan_kuloor');

      expect(kuloor).toBeDefined();
      expect(kuloor!.fragilityScore).toBeGreaterThanOrEqual(80);
      expect(kuloor!.impactClassification).toBe('CATASTROPHIC_SEVERANCE');
    });
  });

  describe('Multi-Evidence Incident Trust Layer', () => {
    it('never closes roads for unverified citizen reports', () => {
      const mockIncident = {
        id: 'inc-unver-1',
        status: 'REPORTED',
        confidence_score: 30,
        road_closed: false,
        authority_confirmed: false,
        reported_at: new Date().toISOString(),
      };
      const mockBreakdown = {
        totalScore: 30,
        band: 'Low',
        verificationLevel: 1,
        verificationLevelLabel: 'Level 1: User reported',
        authorityConfirmed: false,
        components: {
          independentReports: 10,
          locationTimeProximity: 10,
          gpsCorroboration: 0,
          mediaEvidence: 0,
          authorityConfirmation: 0,
        },
        counts: {
          distinctReporters: 1,
          corroboratingCount: 0,
          disputingCount: 0,
          gpsSpeedDropsCount: 0,
          validatedMediaCount: 0,
        },
        missingFactors: [],
        explanation: [],
      };

      const evaluation = evaluateIncidentTrust(mockIncident, mockBreakdown);

      expect(evaluation.trustState).toBe('UNVERIFIED');
      expect(evaluation.routingPolicy).toBe('NORMAL_PASSABLE');
    });

    it('enforces road closure only when verified/confirmed by authority or high confidence consensus', () => {
      const mockConfirmedIncident = {
        id: 'inc-conf-1',
        status: 'VERIFIED',
        confidence_score: 90,
        road_closed: true,
        authority_confirmed: true,
        reported_at: new Date().toISOString(),
      };
      const mockBreakdown = {
        totalScore: 90,
        band: 'High',
        verificationLevel: 6,
        verificationLevelLabel: 'Level 6: Authority confirmed',
        authorityConfirmed: true,
        components: {
          independentReports: 30,
          locationTimeProximity: 20,
          gpsCorroboration: 20,
          mediaEvidence: 5,
          authorityConfirmation: 15,
        },
        counts: {
          distinctReporters: 3,
          corroboratingCount: 2,
          disputingCount: 0,
          gpsSpeedDropsCount: 2,
          validatedMediaCount: 1,
        },
        missingFactors: [],
        explanation: [],
      };

      const evaluation = evaluateIncidentTrust(mockConfirmedIncident, mockBreakdown);

      expect(evaluation.trustState).toBe('CONFIRMED');
      expect(evaluation.routingPolicy).toBe('CONFIRMED_CLOSURE_AVOID');
    });
  });
});
