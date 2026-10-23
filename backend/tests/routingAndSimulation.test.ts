import { describe, it, expect } from 'vitest';
import {
  classifyIncidentVerificationState,
  createInitialSimulatedVehicles,
  evaluateVehiclesForIncident,
  resolveIncidentForVehicles,
  computeCorridorTrafficSegments,
  stepSimulatedVehicle,
} from '@roadalert/shared';
import { calculateRoutesWithIncidents } from '../src/services/routingService.js';

describe('Emergency Traffic Intelligence: Verification, Obstruction, Routing & Multi-Vehicle Simulation', () => {
  const originPumpwell = { lat: 12.8669, lng: 74.8692 };
  const destUdupi = { lat: 13.3409, lng: 74.7351 };

  it('1. Distinguishes unverified reports, verified passable incidents, confirmed obstructions, and resolved obstructions', () => {
    const unverified = classifyIncidentVerificationState({
      status: 'REPORTED',
      confidenceScore: 34,
      authorityConfirmed: false,
      roadClosed: false,
      category: 'Road closure',
    });
    expect(unverified).toBe('UNVERIFIED_REPORT');

    const verifiedPassable = classifyIncidentVerificationState({
      status: 'VERIFIED',
      confidenceScore: 82,
      authorityConfirmed: true,
      roadClosed: false,
      category: 'Accident',
    });
    expect(verifiedPassable).toBe('VERIFIED_INCIDENT');

    const confirmedObstruction = classifyIncidentVerificationState({
      status: 'VERIFIED',
      confidenceScore: 95,
      authorityConfirmed: true,
      roadClosed: true,
      category: 'Accident',
    });
    expect(confirmedObstruction).toBe('CONFIRMED_OBSTRUCTION');

    const resolvedObstruction = classifyIncidentVerificationState({
      status: 'RESOLVED',
      confidenceScore: 95,
      authorityConfirmed: true,
      roadClosed: false,
    });
    expect(resolvedObstruction).toBe('RESOLVED_OBSTRUCTION');
  });

  it('2. Unverified reports never automatically block a road or force mandatory route closure', async () => {
    const unverifiedClosureClaim = {
      id: 'inc-unverified-1',
      title: 'Single unverified claim of road blockage at Kuloor',
      category: 'Road closure',
      severity: 'CRITICAL',
      status: 'REPORTED',
      latitude: 12.9261,
      longitude: 74.8267,
      road_name: 'NH-66 Kuloor Bridge',
      confidence_score: 34,
      authority_confirmed: false,
      road_closed: false,
      estimated_delay_minutes: 25,
    };

    const plan = await calculateRoutesWithIncidents(
      'Pumpwell Circle, Mangaluru',
      'Udupi Karavali Bypass',
      originPumpwell,
      destUdupi,
      true,
      [unverifiedClosureClaim]
    );

    const primary = plan.routes.find((r) => r.id === 'route-nh66-primary')!;
    expect(primary.hasRoadClosureWarning).toBe(false);
    expect(primary.recommended).toBe(true);
    expect(plan.routeState).toBe('NORMAL');
    expect(primary.affectingIncidents[0].verificationState).toBe('UNVERIFIED_REPORT');

    // Also verify simulated vehicles only slow down with caution and do not reroute
    const fleet = createInitialSimulatedVehicles();
    const impact = evaluateVehiclesForIncident(fleet, unverifiedClosureClaim, [
      unverifiedClosureClaim,
    ]);
    expect(impact.reroutedVehicleIds.length).toBe(0);
    expect(impact.heldVehicleIds.length).toBe(0);
    expect(impact.slowedVehicleIds.length).toBeGreaterThan(0);
  });

  it('3. Verified incident without road closure adds delay and recommends faster bypass without marking road closed', async () => {
    const verifiedSevereSlowdown = {
      id: 'inc-verified-passable-1',
      title: 'Verified multi-lane congestion at Surathkal',
      category: 'Heavy traffic',
      severity: 'HIGH',
      status: 'VERIFIED',
      latitude: 13.0108,
      longitude: 74.7943,
      road_name: 'NH-66 Surathkal NITK',
      confidence_score: 85,
      authority_confirmed: true,
      road_closed: false,
      estimated_delay_minutes: 35,
    };

    const plan = await calculateRoutesWithIncidents(
      'Pumpwell Circle, Mangaluru',
      'Udupi Karavali Bypass',
      originPumpwell,
      destUdupi,
      true,
      [verifiedSevereSlowdown]
    );

    const primary = plan.routes.find((r) => r.id === 'route-nh66-primary')!;
    expect(primary.hasRoadClosureWarning).toBe(false);
    expect(primary.incidentDelayMin).toBeGreaterThan(0);
    expect(plan.routeState).toBe('ALTERNATE_ROUTE_FOUND');
    expect(plan.recommendedRouteId).not.toBe('route-nh66-primary');
  });

  it('4. Confirmed road obstruction blocks primary route and selects validated alternative bypass', async () => {
    const confirmedClosure = {
      id: 'inc-confirmed-closure-1',
      title: 'Authority-Confirmed Tanker Blockage at Kuloor Bridge',
      category: 'Road closure',
      severity: 'CRITICAL',
      status: 'VERIFIED',
      latitude: 12.9261,
      longitude: 74.8267,
      road_name: 'NH-66 Kuloor Bridge',
      confidence_score: 96,
      authority_confirmed: true,
      road_closed: true,
      estimated_delay_minutes: 55,
    };

    const plan = await calculateRoutesWithIncidents(
      'Pumpwell Circle, Mangaluru',
      'Udupi Karavali Bypass',
      originPumpwell,
      destUdupi,
      true,
      [confirmedClosure]
    );

    const primary = plan.routes.find((r) => r.id === 'route-nh66-primary')!;
    expect(primary.hasRoadClosureWarning).toBe(true);
    expect(primary.recommended).toBe(false);
    expect(primary.blockedSegments).toContain('NH-66 Kuloor Bridge');
    expect(plan.routeState).toBe('ALTERNATE_ROUTE_FOUND');
    expect(plan.recommendedRouteId).toBeTruthy();
    expect(plan.recommendedRouteId).not.toBe('route-nh66-primary');
  });

  it('5. Returns NO_VIABLE_ROUTE_FOUND and holding point when all candidate routes intersect confirmed obstructions', async () => {
    // Place confirmed obstructions across all 3 candidate corridors near midpoint
    const totalBlockade = [
      {
        id: 'block-primary',
        title: 'NH-66 Primary Blocked',
        category: 'Road closure',
        severity: 'CRITICAL',
        status: 'VERIFIED',
        latitude: 13.0908,
        longitude: 74.7864,
        road_name: 'NH-66 Mulki Bridge',
        confidence_score: 95,
        authority_confirmed: true,
        road_closed: true,
      },
      {
        id: 'block-inland',
        title: 'SH-1 Inland Bypass Blocked',
        category: 'Road closure',
        severity: 'CRITICAL',
        status: 'VERIFIED',
        latitude: 13.1039,
        longitude: 74.8701,
        road_name: 'SH-1 Kinnigoli Bypass',
        confidence_score: 95,
        authority_confirmed: true,
        road_closed: true,
      },
      {
        id: 'block-connector',
        title: 'Inner Coastal Connector Blocked',
        category: 'Road closure',
        severity: 'CRITICAL',
        status: 'VERIFIED',
        latitude: 13.1039,
        longitude: 74.8301,
        road_name: 'Haleyangadi Connector',
        confidence_score: 95,
        authority_confirmed: true,
        road_closed: true,
      },
    ];

    const plan = await calculateRoutesWithIncidents(
      'Pumpwell Circle, Mangaluru',
      'Udupi Karavali Bypass',
      originPumpwell,
      destUdupi,
      true,
      totalBlockade
    );

    expect(plan.allRoutesClosedWarning).toBe(true);
    expect(plan.routeState).toBe('NO_VIABLE_ROUTE_FOUND');
    expect(plan.recommendedRouteId).toBeNull();
    expect(plan.holdingPointSuggestion).toBeDefined();
    expect(plan.routes.every((r) => !r.recommended)).toBe(true);
  });

  it('6. Returns ROUTING_UNAVAILABLE honestly without fabricating a route when routing provider fails', async () => {
    const plan = await calculateRoutesWithIncidents(
      'Pumpwell Circle, Mangaluru',
      'Udupi Karavali Bypass',
      originPumpwell,
      destUdupi,
      true,
      [],
      { simulateProviderFailure: true }
    );

    expect(plan.routeState).toBe('ROUTING_UNAVAILABLE');
    expect(plan.routes.length).toBe(0);
    expect(plan.recommendedRouteId).toBeNull();
  });

  it('7. Transitions simulated vehicles to HELD_AT_CLOSURE when both primary and bypass corridors are blocked, and restores them on resolution', () => {
    const fleet = createInitialSimulatedVehicles();
    const nh66Veh = fleet.find((v) => v.id === 'sim-veh-1')!;

    const closurePrimary = {
      id: 'closure-nh66-kuloor',
      title: 'Confirmed Closure on NH-66 Kuloor Bridge',
      category: 'Road closure',
      severity: 'CRITICAL',
      status: 'VERIFIED',
      latitude: 12.9261,
      longitude: 74.8267,
      roadName: 'NH-66 Kuloor Bridge',
      confidenceScore: 95,
      authorityConfirmed: true,
      roadClosed: true,
    };
    const closureBypass = {
      id: 'closure-sh1-bajpe',
      title: 'Confirmed Closure on SH-1 Bajpe–Kinnigoli Bypass',
      category: 'Road closure',
      severity: 'CRITICAL',
      status: 'VERIFIED',
      latitude: 12.9542,
      longitude: 74.892,
      roadName: 'SH-1 Bajpe–Kinnigoli Bypass',
      confidenceScore: 95,
      authorityConfirmed: true,
      roadClosed: true,
    };
    const closureInnerConnector = {
      id: 'closure-bondel-inner',
      title: 'Confirmed Closure on Bondel–Maravoor Inner Connector',
      category: 'Road closure',
      severity: 'CRITICAL',
      status: 'VERIFIED',
      latitude: 12.9185,
      longitude: 74.8588,
      roadName: 'Bondel–Maravoor Connector',
      confidenceScore: 95,
      authorityConfirmed: true,
      roadClosed: true,
    };

    const impact = evaluateVehiclesForIncident(fleet, closurePrimary, [
      closurePrimary,
      closureBypass,
      closureInnerConnector,
    ]);

    expect(impact.heldVehicleIds).toContain(nh66Veh.id);
    expect(nh66Veh.status).toBe('HELD_AT_CLOSURE');
    expect(nh66Veh.currentSpeedKmh).toBe(0);

    // Held vehicle does not move when stepped
    const heldLat = nh66Veh.lat;
    const heldLng = nh66Veh.lng;
    stepSimulatedVehicle(nh66Veh, 5.0, 18);
    expect(nh66Veh.lat).toBe(heldLat);
    expect(nh66Veh.lng).toBe(heldLng);

    // Resolving the obstruction restores the held vehicle to normal flow
    const resolved = resolveIncidentForVehicles(fleet, closurePrimary.id);
    expect(resolved.restoredVehicleIds).toContain(nh66Veh.id);
    expect(nh66Veh.status).not.toBe('HELD_AT_CLOSURE');
    expect(nh66Veh.currentSpeedKmh).toBeGreaterThan(0);
  });

  it('8. Computes segment-level traffic congestion distinctly from confirmed road closures', () => {
    const fleet = createInitialSimulatedVehicles();
    const congestionIncident = {
      id: 'inc-congestion-only',
      title: 'Heavy evening congestion at KPT Junction',
      category: 'Heavy traffic',
      severity: 'HIGH',
      status: 'VERIFIED',
      latitude: 12.8935,
      longitude: 74.8594,
      roadName: 'NH-66 KPT Junction',
      confidenceScore: 80,
      authorityConfirmed: false,
      roadClosed: false,
      estimatedDelayMinutes: 25,
    };
    const closureIncident = {
      id: 'inc-closure-padubidri',
      title: 'Confirmed Bridge Closure at Padubidri',
      category: 'Road closure',
      severity: 'CRITICAL',
      status: 'VERIFIED',
      latitude: 13.1422,
      longitude: 74.7731,
      roadName: 'NH-66 Padubidri',
      confidenceScore: 95,
      authorityConfirmed: true,
      roadClosed: true,
      estimatedDelayMinutes: 50,
    };

    const segments = computeCorridorTrafficSegments(
      [congestionIncident, closureIncident],
      fleet
    );

    const kptSeg = segments.find((s) => s.id === 'seg-pumpwell-nanthoor-kpt')!;
    const padubidriSeg = segments.find((s) => s.id === 'seg-mulki-padubidri-kaup')!;

    // Congestion without road closure is SEVERE/HEAVY, never CONFIRMED_CLOSURE
    expect(['HEAVY', 'SEVERE']).toContain(kptSeg.congestionLevel);
    expect(kptSeg.congestionLevel).not.toBe('CONFIRMED_CLOSURE');

    // Confirmed road closure is explicitly CONFIRMED_CLOSURE
    expect(padubidriSeg.congestionLevel).toBe('CONFIRMED_CLOSURE');
    expect(padubidriSeg.averageSpeedKmh).toBe(0);
  });
});
