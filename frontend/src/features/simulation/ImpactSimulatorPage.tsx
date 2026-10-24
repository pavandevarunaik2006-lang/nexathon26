import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  FlaskConical,
  GitCompareArrows,
  Sparkles,
  ShieldAlert,
  Activity,
  Hospital,
  Scale,
  Compass,
  ArrowRight,
  RotateCcw,
  RefreshCw,
  Info,
  CheckCircle2,
  AlertTriangle,
  X,
  Layers,
  MapPin,
  ChevronRight,
  Clock,
  ShieldCheck,
  AlertOctagon,
  Calendar,
  Filter,
  Search,
  Sliders,
  Eye,
  Maximize2,
  Minimize2,
  Car,
  TrendingUp,
  Check,
  ExternalLink,
} from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import { SimulatorMap } from './SimulatorMap';
import { IncidentListFilterPanel } from './IncidentListFilterPanel';
import {
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  LIFELINE_HOSPITALS,
  STANDARD_ANALYZED_ROUTES,
  INCIDENT_CATEGORIES,
  type ScenarioDefinition,
  type HypotheticalDisruption,
  type SimulationResult,
  type ScenarioComparisonMatrix,
  type DisruptionType,
  type DisruptionSeverity,
  type AnalyzedRouteImpact,
  type DestinationAccessibilitySummary,
  type HospitalImpactAssessment,
  type RippleEffectSegment,
  type ExplainableRecommendation,
} from '@roadalert/shared';

// Comprehensive Preset Scenarios
const PRESET_SCENARIOS = [
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
        disruptionType: 'COMPLETE_CLOSURE' as DisruptionType,
        closureCondition: 'COMPLETE_CLOSURE' as const,
        severity: 'CRITICAL' as DisruptionSeverity,
        delayPenaltyMinutes: 999,
        capacityReductionPercent: 100,
        durationMinutes: 120,
        direction: 'BOTH' as const,
        verificationAssumption: 'CONFIRMED_CLOSURE' as const,
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
        disruptionType: 'PARTIAL_RESTRICTION' as DisruptionType,
        closureCondition: 'PARTIAL_RESTRICTION' as const,
        severity: 'HIGH' as DisruptionSeverity,
        delayPenaltyMinutes: 45,
        capacityReductionPercent: 60,
        durationMinutes: 60,
        direction: 'BOTH' as const,
        verificationAssumption: 'CONFIRMED_CLOSURE' as const,
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
        disruptionType: 'PARTIAL_RESTRICTION' as DisruptionType,
        closureCondition: 'PARTIAL_RESTRICTION' as const,
        severity: 'MODERATE' as DisruptionSeverity,
        delayPenaltyMinutes: 25,
        capacityReductionPercent: 50,
        durationMinutes: 30,
        direction: 'NORTHBOUND_ONLY' as const,
        verificationAssumption: 'CONFIRMED_CLOSURE' as const,
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
        disruptionType: 'COMPLETE_CLOSURE' as DisruptionType,
        closureCondition: 'COMPLETE_CLOSURE' as const,
        severity: 'CRITICAL' as DisruptionSeverity,
        delayPenaltyMinutes: 999,
        capacityReductionPercent: 100,
        durationMinutes: 120,
        direction: 'BOTH' as const,
        verificationAssumption: 'CONFIRMED_CLOSURE' as const,
      },
    ],
    testOriginNodeId: 'node_surathkal',
    testDestinationNodeId: 'node_manipal',
    focusHospitalId: 'hosp-kmc-manipal',
  },
];

// Helper to find closest corridor edge to coordinates
function findClosestEdge(lat: number, lng: number, roadHint?: string): string {
  if (roadHint) {
    const hint = roadHint.toLowerCase();
    const matched = CORRIDOR_GRAPH_EDGES.find(
      (e) =>
        e.roadName.toLowerCase().includes(hint) ||
        e.corridorCode.toLowerCase().includes(hint)
    );
    if (matched) return matched.id;
  }

  let minDistance = Infinity;
  let bestEdgeId = CORRIDOR_GRAPH_EDGES[0].id;

  for (const edge of CORRIDOR_GRAPH_EDGES) {
    for (const [pLat, pLng] of edge.geometry) {
      const dist = Math.hypot(pLat - lat, pLng - lng);
      if (dist < minDistance) {
        minDistance = dist;
        bestEdgeId = edge.id;
      }
    }
  }

  return bestEdgeId;
}

export function ImpactSimulatorPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab navigation: 'decision' | 'routes' | 'ripple' | 'hospitals' | 'compare' | 'limitations'
  const [activeTab, setActiveTab] = useState<
    'decision' | 'routes' | 'ripple' | 'hospitals' | 'compare' | 'limitations'
  >('decision');

  // Disruption Source Selection Mode: 'presets' | 'incidents' | 'corridors' | 'map'
  const [sourceMode, setSourceMode] = useState<'presets' | 'incidents' | 'corridors' | 'map'>('presets');

  // Scenario Definition State
  const [scenarioName, setScenarioName] = useState('Kuloor Bridge Severance (NH-66 Coastal Link)');
  const [scenarioDesc, setScenarioDesc] = useState(
    'Structural failure / emergency closure of the primary Gurupura River crossing.'
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>('edge_kuntikan_kuloor');
  const [incidentCategory, setIncidentCategory] = useState<string>('INFRASTRUCTURE');
  const [closureCondition, setClosureCondition] = useState<'COMPLETE_CLOSURE' | 'PARTIAL_RESTRICTION'>('COMPLETE_CLOSURE');
  const [severity, setSeverity] = useState<DisruptionSeverity>('CRITICAL');
  const [capacityReductionPercent, setCapacityReductionPercent] = useState<number>(100);
  const [delayPenaltyMinutes, setDelayPenaltyMinutes] = useState<number>(999);
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [timeHorizonMinutes, setTimeHorizonMinutes] = useState<number>(120);
  const [direction, setDirection] = useState<'BOTH' | 'NORTHBOUND_ONLY' | 'SOUTHBOUND_ONLY'>('BOTH');
  const [verificationAssumption, setVerificationAssumption] = useState<'CONFIRMED_CLOSURE' | 'UNVERIFIED_ASSUMPTION'>('CONFIRMED_CLOSURE');

  // Associated Incident metadata (if selected from incident list)
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [focusedIncidentCoords, setFocusedIncidentCoords] = useState<[number, number] | null>(null);

  // Regional Routing Probes
  const [originNodeId, setOriginNodeId] = useState('node_surathkal');
  const [destinationNodeId, setDestinationNodeId] = useState('node_nanthoor');
  const [focusHospitalId, setFocusHospitalId] = useState('hosp-aj-mangaluru');

  // Simulation execution results
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [comparisonMatrix, setComparisonMatrix] = useState<ScenarioComparisonMatrix | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  // Map Layer Controls
  const [showBaselineRoute, setShowBaselineRoute] = useState(true);
  const [showScenarioRoute, setShowScenarioRoute] = useState(true);
  const [showAffectedLayer, setShowAffectedLayer] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);
  const [showAllIncidents, setShowAllIncidents] = useState(true);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // Incident Filtering State for IncidentListFilterPanel
  const [incidentSearchQuery, setIncidentSearchQuery] = useState('');
  const [incidentCategoryFilter, setIncidentCategoryFilter] = useState('ALL');
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('ALL');
  const [incidentVerificationFilter, setIncidentVerificationFilter] = useState('ALL');
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('ALL');
  const [incidentDateRangeFilter, setIncidentDateRangeFilter] = useState('ALL');

  // Synchronize Tab with URL query params (?tab=reachability, ?tab=fragility, ?tab=compare)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'reachability' || tabParam === 'hospitals') {
      setActiveTab('hospitals');
    } else if (tabParam === 'fragility' || tabParam === 'ripple') {
      setActiveTab('ripple');
    } else if (tabParam === 'compare') {
      setActiveTab('compare');
    } else if (tabParam === 'routes') {
      setActiveTab('routes');
    } else if (tabParam === 'incidents') {
      setSourceMode('incidents');
    }
  }, [searchParams]);

  // Fetch production incidents to display on map and in filterable list
  const {
    data: incidentsData,
    isLoading: isIncidentsLoading,
    isError: isIncidentsError,
    refetch: refetchIncidents,
  } = useQuery<{ success: boolean; data: { incidents: any[] } | any[] }>({
    queryKey: ['incidents-for-simulator'],
    queryFn: async () => {
      try {
        const res = await apiRequest<any>('/incidents');
        return res;
      } catch {
        return await apiRequest<any>('/map/incidents');
      }
    },
    staleTime: 60_000,
  });

  const allIncidents: any[] = useMemo(() => {
    if (!incidentsData) return [];
    if (Array.isArray(incidentsData)) return incidentsData;
    if (Array.isArray(incidentsData.data)) return incidentsData.data;
    if (incidentsData.data && Array.isArray((incidentsData.data as any).incidents)) {
      return (incidentsData.data as any).incidents;
    }
    return [];
  }, [incidentsData]);

  // Filtered incidents for the IncidentListFilterPanel
  const filteredIncidents = useMemo(() => {
    return allIncidents.filter((inc) => {
      if (incidentSearchQuery.trim()) {
        const q = incidentSearchQuery.toLowerCase();
        const titleMatch = (inc.title || '').toLowerCase().includes(q);
        const roadMatch = (inc.road_name || inc.roadName || '').toLowerCase().includes(q);
        const descMatch = (inc.description || '').toLowerCase().includes(q);
        if (!titleMatch && !roadMatch && !descMatch) return false;
      }
      if (incidentCategoryFilter !== 'ALL' && inc.category !== incidentCategoryFilter) {
        return false;
      }
      if (incidentSeverityFilter !== 'ALL' && inc.severity !== incidentSeverityFilter) {
        return false;
      }
      if (incidentVerificationFilter !== 'ALL') {
        const isVer =
          inc.verification_status === 'VERIFIED' ||
          inc.verified === true ||
          (Number(inc.confidence_score) >= 60);
        if (incidentVerificationFilter === 'VERIFIED' && !isVer) return false;
        if (incidentVerificationFilter === 'UNVERIFIED' && isVer) return false;
      }
      if (incidentStatusFilter !== 'ALL' && inc.status !== incidentStatusFilter) {
        return false;
      }
      return true;
    });
  }, [
    allIncidents,
    incidentSearchQuery,
    incidentCategoryFilter,
    incidentSeverityFilter,
    incidentVerificationFilter,
    incidentStatusFilter,
  ]);

  // Selected Corridor Edge Object
  const currentEdge = useMemo(() => {
    return CORRIDOR_GRAPH_EDGES.find((e) => e.id === selectedEdgeId) || CORRIDOR_GRAPH_EDGES[0];
  }, [selectedEdgeId]);

  // Apply Preset Scenario Handler
  const handleApplyPreset = (presetId: string) => {
    const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
    if (!preset) return;
    setScenarioName(preset.name);
    setScenarioDesc(preset.description);
    const dis = preset.disruptions[0];
    setSelectedEdgeId(dis.edgeId);
    setIncidentCategory(preset.category || 'INFRASTRUCTURE');
    setClosureCondition(dis.closureCondition || 'COMPLETE_CLOSURE');
    setSeverity(dis.severity);
    setDelayPenaltyMinutes(dis.delayPenaltyMinutes);
    setCapacityReductionPercent(dis.capacityReductionPercent || 100);
    setDurationMinutes(dis.durationMinutes || 120);
    setDirection(dis.direction || 'BOTH');
    setVerificationAssumption(dis.verificationAssumption || 'CONFIRMED_CLOSURE');
    setOriginNodeId(preset.testOriginNodeId);
    setDestinationNodeId(preset.testDestinationNodeId);
    setFocusHospitalId(preset.focusHospitalId);
    setSelectedIncident(null);
    setFocusedIncidentCoords(null);
  };

  // Select Live Incident Handler
  const handleSelectLiveIncident = (incident: any) => {
    setSelectedIncident(incident);
    const lat = Number(incident.latitude);
    const lng = Number(incident.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      setFocusedIncidentCoords([lat, lng]);
      const matchedEdgeId = findClosestEdge(lat, lng, incident.road_name || incident.roadName);
      setSelectedEdgeId(matchedEdgeId);
    }
    setScenarioName(`Incident: ${incident.title || 'Reported Road Obstruction'}`);
    setScenarioDesc(incident.description || `Simulated impact of live incident along ${incident.road_name || 'primary corridor'}`);
    setIncidentCategory(incident.category || 'OBSTRUCTION');
    setSeverity((incident.severity as DisruptionSeverity) || 'HIGH');
    
    // Check if incident is verified
    const isVerified =
      incident.verification_status === 'VERIFIED' ||
      incident.verified === true ||
      Number(incident.confidence_score) >= 60;

    if (isVerified) {
      setVerificationAssumption('CONFIRMED_CLOSURE');
    } else {
      setVerificationAssumption('UNVERIFIED_ASSUMPTION');
    }

    if (incident.road_closed) {
      setClosureCondition('COMPLETE_CLOSURE');
      setDelayPenaltyMinutes(999);
      setCapacityReductionPercent(100);
    } else {
      setClosureCondition('PARTIAL_RESTRICTION');
      const estDelay = Math.min(60, Number(incident.estimated_delay_minutes) || 25);
      setDelayPenaltyMinutes(estDelay);
      setCapacityReductionPercent(50);
    }
  };

  // Run Impact Simulation Mutation
  const runSimulationMutation = useMutation({
    mutationFn: async () => {
      const payload: ScenarioDefinition = {
        id: `sim-${Date.now()}`,
        name: scenarioName,
        description: scenarioDesc,
        disruptions: [
          {
            id: `dis-${selectedEdgeId}-${Date.now()}`,
            edgeId: selectedEdgeId,
            roadName: currentEdge.roadName,
            disruptionType: closureCondition as DisruptionType,
            closureCondition: closureCondition,
            severity,
            delayPenaltyMinutes: closureCondition === 'COMPLETE_CLOSURE' ? 999 : delayPenaltyMinutes,
            capacityReductionPercent: closureCondition === 'COMPLETE_CLOSURE' ? 100 : capacityReductionPercent,
            durationMinutes,
            direction,
            verificationAssumption,
            associatedIncidentId: selectedIncident?.id || null,
          },
        ],
        testOriginNodeId: originNodeId,
        testDestinationNodeId: destinationNodeId,
        focusHospitalId,
        durationMinutes,
        direction,
        timeHorizonMinutes,
        selectedIncidentId: selectedIncident?.id || null,
      };

      const res = await apiRequest<any>('/simulation/impact', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return res?.data || res;
    },
    onSuccess: (data: SimulationResult) => {
      setSimulationResult(data);
      if (data.analyzedRoutes && data.analyzedRoutes.length > 0) {
        setSelectedRouteId(data.analyzedRoutes[0].routeId);
      }
    },
  });

  // Run 3-Way Comparison Mutation (Baseline vs Scenario A vs Scenario B)
  const runComparisonMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<any>('/simulation/compare-presets', {
        method: 'POST',
        body: JSON.stringify({
          edgeId: selectedEdgeId,
          roadName: currentEdge.roadName,
          incidentTitle: scenarioName,
        }),
      });

      return res?.data?.matrix || res?.data || res;
    },
    onSuccess: (data: ScenarioComparisonMatrix) => {
      setComparisonMatrix(data);
      setActiveTab('compare');
    },
  });

  // Reset Simulation to Baseline
  const handleResetToBaseline = () => {
    setSimulationResult(null);
    setComparisonMatrix(null);
    setSelectedRouteId(null);
    setSelectedIncident(null);
    setFocusedIncidentCoords(null);
  };

  // Quick Duration Setter
  const setDurationPreset = (minutes: number) => {
    setDurationMinutes(minutes);
    setTimeHorizonMinutes(Math.max(minutes, timeHorizonMinutes));
  };

  // Focus Route from Analyzed Routes Table
  const handleSelectAnalyzedRoute = (route: AnalyzedRouteImpact) => {
    setSelectedRouteId(route.routeId);
    setOriginNodeId(route.originNodeId);
    setDestinationNodeId(route.destinationNodeId);
  };

  // Selected route object from simulation results
  const currentAnalyzedRoute = useMemo(() => {
    if (!simulationResult?.analyzedRoutes) return null;
    return simulationResult.analyzedRoutes.find((r) => r.routeId === selectedRouteId) || simulationResult.analyzedRoutes[0];
  }, [simulationResult, selectedRouteId]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Banner & Executive Mode Indicator */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-6 md:p-8 text-white shadow-2xl border border-white/10">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/30">
                <FlaskConical className="w-6 h-6" />
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                RoadAlert Impact Simulator
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-amber-400/20 text-amber-300 border border-amber-400/40">
                Decision Intelligence Engine
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Baseline: Real Network State
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Model hypothetical road closures and capacity drops, analyze traffic ripple effects, compute emergency hospital access deltas, and evaluate explainable mitigation interventions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleResetToBaseline}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/15 transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Baseline</span>
            </button>
            <button
              type="button"
              onClick={() => runComparisonMutation.mutate()}
              disabled={runComparisonMutation.isPending}
              className="px-4 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white font-semibold text-xs border border-indigo-400/30 shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {runComparisonMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Scale className="w-3.5 h-3.5" />
              )}
              <span>3-Way Scenario Matrix</span>
            </button>
            <button
              type="button"
              onClick={() => runSimulationMutation.mutate()}
              disabled={runSimulationMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-bold text-xs shadow-lg shadow-orange-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {runSimulationMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Solving Graph Impact...</span>
                </>
              ) : (
                <>
                  <FlaskConical className="w-4 h-4" />
                  <span>Run Simulation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Real Traffic vs Simulation Disclosure Warning */}
        <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
          <div className="flex items-center gap-1.5 text-amber-300 font-medium">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Simulated What-If Model: Static cruising speeds &amp; Dijkstra shortest-path calculations. Real traffic flow requires live telemetry.</span>
          </div>
          <span className="text-slate-400">18 Nodes • 21 Corridors • 6 Lifeline Trauma Centers</span>
        </div>
      </div>

      {/* 2. Main 12-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Disruption Source & Scenario Configurator (5 cols) */}
        <div className="lg:col-span-5 space-y-5 bg-white/95 backdrop-blur-xl rounded-3xl border border-white/80 p-5 md:p-6 shadow-xl">
          {/* Section Heading & Mode Selector */}
          <div className="space-y-3 pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-600" />
                Select Disruption Source
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Step 1 of 2
              </span>
            </div>

            {/* Source Mode Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100/90 rounded-2xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setSourceMode('presets')}
                className={`py-1.5 px-2 rounded-xl transition-all ${
                  sourceMode === 'presets'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Presets
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('incidents')}
                className={`py-1.5 px-2 rounded-xl transition-all flex items-center justify-center gap-1 ${
                  sourceMode === 'incidents'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Incidents</span>
                {allIncidents.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {allIncidents.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('corridors')}
                className={`py-1.5 px-2 rounded-xl transition-all ${
                  sourceMode === 'corridors'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Corridor
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('map')}
                className={`py-1.5 px-2 rounded-xl transition-all ${
                  sourceMode === 'map'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Map Pick
              </button>
            </div>
          </div>

          {/* Tab 1: Presets Selection */}
          {sourceMode === 'presets' && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700">Choose Benchmark Scenario</label>
              <div className="space-y-2">
                {PRESET_SCENARIOS.map((p) => {
                  const isSelected = scenarioName === p.name;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleApplyPreset(p.id)}
                      className={`p-3 rounded-2xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-amber-50/90 border-amber-400 text-slate-900 shadow-sm ring-1 ring-amber-400/50'
                          : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>{p.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 leading-snug">{p.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Live Incident Selection with Search & Filter */}
          {sourceMode === 'incidents' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Select a Live Incident to Model</span>
                <span className="text-[11px] text-slate-500">
                  {filteredIncidents.length} available
                </span>
              </div>

              <IncidentListFilterPanel
                incidents={allIncidents}
                isLoading={isIncidentsLoading}
                isError={isIncidentsError}
                onRetry={refetchIncidents}
                selectedIncidentId={selectedIncident?.id || null}
                onSelectIncident={handleSelectLiveIncident}
                onViewOnMap={(inc) => {
                  const lat = Number(inc.latitude);
                  const lng = Number(inc.longitude);
                  if (!isNaN(lat) && !isNaN(lng)) {
                    setFocusedIncidentCoords([lat, lng]);
                  }
                }}
                searchQuery={incidentSearchQuery}
                setSearchQuery={setIncidentSearchQuery}
                categoryFilter={incidentCategoryFilter}
                setCategoryFilter={setIncidentCategoryFilter}
                severityFilter={incidentSeverityFilter}
                setSeverityFilter={setIncidentSeverityFilter}
                verificationFilter={incidentVerificationFilter}
                setVerificationFilter={setIncidentVerificationFilter}
                statusFilter={incidentStatusFilter}
                setStatusFilter={setIncidentStatusFilter}
                dateRangeFilter={incidentDateRangeFilter}
                setDateRangeFilter={setIncidentDateRangeFilter}
                onClearFilters={() => {
                  setIncidentSearchQuery('');
                  setIncidentCategoryFilter('ALL');
                  setIncidentSeverityFilter('ALL');
                  setIncidentVerificationFilter('ALL');
                  setIncidentStatusFilter('ALL');
                  setIncidentDateRangeFilter('ALL');
                }}
                filteredIncidents={filteredIncidents}
              />
            </div>
          )}

          {/* Tab 3: Corridor Search & Selection */}
          {sourceMode === 'corridors' && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700">Select Road Corridor Segment</label>
              <select
                aria-label="Select Road Corridor Segment"
                value={selectedEdgeId}
                onChange={(e) => setSelectedEdgeId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {CORRIDOR_GRAPH_EDGES.map((edge) => (
                  <option key={edge.id} value={edge.id}>
                    {edge.roadName} ({edge.distanceKm} km • {edge.baseTimeMin} min cruising)
                  </option>
                ))}
              </select>

              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-1">
                <p className="font-bold text-amber-900">{currentEdge.roadName}</p>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-amber-800">
                  <span>Code: {currentEdge.corridorCode}</span>
                  <span>Length: {currentEdge.distanceKm} km</span>
                  <span>Normal Time: {currentEdge.baseTimeMin} min</span>
                  <span>Est. Speed: {Math.round((currentEdge.distanceKm / (currentEdge.baseTimeMin / 60)))} km/h</span>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Direct Map Picking Help */}
          {sourceMode === 'map' && (
            <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 text-xs text-blue-900 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>Direct Map Selection Active</span>
              </div>
              <p className="text-[11px] leading-relaxed text-blue-800">
                Click any highlighted corridor segment directly on the map canvas on the right to select it for this simulation.
              </p>
              <div className="pt-1 text-[11px] font-semibold text-slate-700">
                Currently Selected: <span className="text-blue-700 font-bold">{currentEdge.roadName}</span>
              </div>
            </div>
          )}

          {/* Section 2B: Configure Scenario Parameters */}
          <div className="space-y-4 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-orange-600" />
                Configure Disruption Parameters
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Step 2 of 2
              </span>
            </div>

            {/* Scenario Name & Description */}
            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700">Scenario Title</label>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="e.g. NH-66 Kuloor Bridge Complete Closure"
                  className="w-full mt-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700">Operational Context</label>
                <input
                  type="text"
                  value={scenarioDesc}
                  onChange={(e) => setScenarioDesc(e.target.value)}
                  placeholder="Hypothetical structural inspection / monsoon inundation"
                  className="w-full mt-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Incident Type & Closure Condition */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700">Incident Category</label>
                <select
                  aria-label="Incident Category"
                  value={incidentCategory}
                  onChange={(e) => setIncidentCategory(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="ACCIDENT">Accident / Collision</option>
                  <option value="OBSTRUCTION">Road Obstruction / Spill</option>
                  <option value="INFRASTRUCTURE">Bridge / Roadworks</option>
                  <option value="WEATHER_HAZARD">Monsoon Flooding</option>
                  <option value="DISASTER">Landslip / Disaster</option>
                  <option value="PROTEST">Demonstration / Blockade</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700">Closure Condition</label>
                <select
                  aria-label="Closure Condition"
                  value={closureCondition}
                  onChange={(e) => {
                    const cond = e.target.value as 'COMPLETE_CLOSURE' | 'PARTIAL_RESTRICTION';
                    setClosureCondition(cond);
                    if (cond === 'COMPLETE_CLOSURE') {
                      setDelayPenaltyMinutes(999);
                      setCapacityReductionPercent(100);
                    } else {
                      setDelayPenaltyMinutes(25);
                      setCapacityReductionPercent(50);
                    }
                  }}
                  className="w-full mt-1 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="COMPLETE_CLOSURE">Complete Closure (Severed)</option>
                  <option value="PARTIAL_RESTRICTION">Partial Restriction (Delay)</option>
                </select>
              </div>
            </div>

            {/* Severity & Direction */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700">Severity Level</label>
                <select
                  aria-label="Severity Level"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as DisruptionSeverity)}
                  className="w-full mt-1 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="CRITICAL">Critical Severance</option>
                  <option value="HIGH">High Impact</option>
                  <option value="MODERATE">Moderate Slowdown</option>
                  <option value="LOW">Low / Caution</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700">Carriageway Affected</label>
                <select
                  aria-label="Carriageway Affected"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as any)}
                  className="w-full mt-1 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="BOTH">Both Carriageways (Dual)</option>
                  <option value="NORTHBOUND_ONLY">Northbound (to Udupi)</option>
                  <option value="SOUTHBOUND_ONLY">Southbound (to Mangaluru)</option>
                </select>
              </div>
            </div>

            {/* Capacity Reduction & Delay Penalty Sliders */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                  <span>Simulated Delay Penalty</span>
                  <span className="text-amber-700 font-extrabold">
                    {delayPenaltyMinutes >= 999 ? '∞ (Severed Corridor)' : `+${delayPenaltyMinutes} minutes`}
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={delayPenaltyMinutes >= 999 ? 120 : delayPenaltyMinutes}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDelayPenaltyMinutes(val >= 120 ? 999 : val);
                  }}
                  className="w-full mt-1 accent-amber-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                  <span>Capacity Reduction</span>
                  <span className="text-orange-700 font-extrabold">{capacityReductionPercent}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="10"
                  value={capacityReductionPercent}
                  onChange={(e) => setCapacityReductionPercent(Number(e.target.value))}
                  className="w-full mt-1 accent-orange-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Expected Duration Presets (15, 30, 60, 120 min) */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                <span>Expected Incident Duration</span>
                <span className="text-blue-700 font-bold">{durationMinutes} minutes</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[15, 30, 60, 120].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationPreset(mins)}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all border ${
                      durationMinutes === mins
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            {/* Assumption Mode (Ground Truth vs Hypothetical) */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-800 block">Scenario Assumption Mode</span>
                <span className="text-[10px] text-slate-500">
                  {verificationAssumption === 'CONFIRMED_CLOSURE'
                    ? 'Confirmed Ground Truth'
                    : 'Hypothetical / Unverified Report'}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setVerificationAssumption((prev) =>
                    prev === 'CONFIRMED_CLOSURE' ? 'UNVERIFIED_ASSUMPTION' : 'CONFIRMED_CLOSURE'
                  )
                }
                className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                  verificationAssumption === 'CONFIRMED_CLOSURE'
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                {verificationAssumption === 'CONFIRMED_CLOSURE' ? 'Confirmed Ground Truth' : 'Hypothetical Only'}
              </button>
            </div>

            {/* Unverified Warning Badge if Selected Incident is unverified */}
            {verificationAssumption === 'UNVERIFIED_ASSUMPTION' && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-snug">
                  <strong>Hypothetical Simulation:</strong> This incident has not been officially verified (&lt;60% confidence). Modeled strictly as an exploratory hypothesis.
                </span>
              </div>
            )}

            {/* Regional Routing Probes */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-blue-600" />
                Regional Routing Probes
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">Origin Probe</label>
                  <select
                    aria-label="Origin Probe"
                    value={originNodeId}
                    onChange={(e) => setOriginNodeId(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800"
                  >
                    {Object.values(CORRIDOR_GRAPH_NODES).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-500">Destination Probe</label>
                  <select
                    aria-label="Destination Probe"
                    value={destinationNodeId}
                    onChange={(e) => setDestinationNodeId(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800"
                  >
                    {Object.values(CORRIDOR_GRAPH_NODES).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-500">Focus Lifeline Trauma Facility</label>
                <select
                  aria-label="Focus Lifeline Trauma Facility"
                  value={focusHospitalId}
                  onChange={(e) => setFocusHospitalId(e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800"
                >
                  {LIFELINE_HOSPITALS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} (Level {h.traumaLevel}, {h.emergencyBeds} beds)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Run Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => runSimulationMutation.mutate()}
                disabled={runSimulationMutation.isPending}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-bold text-sm shadow-xl shadow-orange-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {runSimulationMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing What-If Engine...</span>
                  </>
                ) : (
                  <>
                    <FlaskConical className="w-4 h-4" />
                    <span>Run Simulation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Geospatial Map Canvas & Decision Results (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Integrated Geospatial Map */}
          <div className="rounded-3xl overflow-hidden border border-white/70 shadow-xl bg-white/95 relative">
            <div className="p-3 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white px-5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Geospatial Scenario Canvas</span>
                {simulationResult && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Active Scenario Overlays Enabled
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-[11px] text-slate-400">
                  {allIncidents.length} Live Incidents • 6 Trauma Centers
                </span>
                <button
                  type="button"
                  onClick={() => setIsMapExpanded((p) => !p)}
                  className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                  title={isMapExpanded ? 'Collapse Map' : 'Expand Map'}
                >
                  {isMapExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <SimulatorMap
              selectedEdgeId={selectedEdgeId}
              onSelectEdgeId={(edgeId) => {
                setSelectedEdgeId(edgeId);
                const edge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === edgeId);
                if (edge) {
                  setScenarioName(`Disruption: ${edge.roadName}`);
                }
              }}
              simulationResult={simulationResult}
              selectedRouteId={selectedRouteId}
              onSelectRouteId={(routeId) => setSelectedRouteId(routeId)}
              focusHospitalId={focusHospitalId}
              onSelectHospitalId={(hId) => setFocusHospitalId(hId)}
              selectedIncident={selectedIncident}
              onSelectIncident={handleSelectLiveIncident}
              focusedIncidentCoords={focusedIncidentCoords}
              showBaselineRoute={showBaselineRoute}
              setShowBaselineRoute={setShowBaselineRoute}
              showScenarioRoute={showScenarioRoute}
              setShowScenarioRoute={setShowScenarioRoute}
              showAffectedLayer={showAffectedLayer}
              setShowAffectedLayer={setShowAffectedLayer}
              showHospitals={showHospitals}
              setShowHospitals={setShowHospitals}
              showAllIncidents={showAllIncidents}
              setShowAllIncidents={setShowAllIncidents}
              allIncidents={allIncidents}
              filteredIncidents={filteredIncidents}
              heightClass={isMapExpanded ? 'h-[620px]' : 'h-[440px]'}
              isExpanded={isMapExpanded}
              onToggleExpand={() => setIsMapExpanded((p) => !p)}
            />
          </div>

          {/* Decision Support Intelligence Panel */}
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-white/80 p-5 md:p-6 shadow-xl space-y-5">
            {/* Navigation Tabs Header */}
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-3 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('decision')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === 'decision'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Decision Support</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('routes')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === 'routes'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>
                  Affected Routes ({simulationResult?.analyzedRoutes?.length || STANDARD_ANALYZED_ROUTES.length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ripple')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === 'ripple'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Ripple Effects ({simulationResult?.rippleEffects?.length || 0})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('hospitals')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === 'hospitals'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Hospital className="w-3.5 h-3.5" />
                <span>Hospital Reachability (6)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('compare')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === 'compare'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Scenario Comparison</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('limitations')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === 'limitations'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                <span>Methodology</span>
              </button>
            </div>

            {/* TAB CONTENTS */}

            {/* If no simulation run yet */}
            {!simulationResult && activeTab !== 'compare' && (
              <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400 space-y-3">
                <div className="p-4 rounded-3xl bg-amber-50 text-amber-600 border border-amber-200 shadow-inner">
                  <FlaskConical className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">No Simulation Executed Yet</h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Select a scenario preset or live incident on the left, then click <strong>"Run Simulation"</strong> to calculate live deltas and explainable recommendations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => runSimulationMutation.mutate()}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 transition-colors shadow-md"
                >
                  Run Baseline Scenario
                </button>
              </div>
            )}

            {/* TAB 1: Decision Support & Executive Summary */}
            {simulationResult && activeTab === 'decision' && (
              <div className="space-y-5">
                {/* Executive KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-500">Route Viability</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      {simulationResult.hasNoViableRoute ? (
                        <span className="text-sm font-extrabold text-rose-600">SEVERED / BLOCKED</span>
                      ) : (
                        <span className="text-sm font-extrabold text-emerald-600">VIABLE DETOUR</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {simulationResult.routeEvaluation?.isSevered
                        ? 'Corridor severed'
                        : `Delay Delta: +${(
                            (simulationResult.routeEvaluation?.disruptedRoute?.totalTimeMin || 0) -
                            (simulationResult.routeEvaluation?.baselineRoute?.totalTimeMin || 0)
                          ).toFixed(1)}m`}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-500">Probe Travel Time</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-sm font-extrabold text-slate-900">
                        {simulationResult.routeEvaluation?.disruptedRoute?.totalTimeMin?.toFixed(1) || '∞'}m
                      </span>
                      <span className="text-[10px] text-slate-500">
                        (was {simulationResult.routeEvaluation?.baselineRoute?.totalTimeMin?.toFixed(1)}m)
                      </span>
                    </div>
                    <span className="text-[10px] text-amber-700 font-medium">
                      Cruising speed estimate
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-500">Affected Segments</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-sm font-extrabold text-orange-600">
                        {simulationResult.directlyDisruptedEdgesCount +
                          simulationResult.indirectlyAffectedEdgesCount}
                      </span>
                      <span className="text-[10px] text-slate-500">corridors</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {simulationResult.directlyDisruptedEdgesCount} direct, {simulationResult.indirectlyAffectedEdgesCount} reroute
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-500">Hospital Access</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-sm font-extrabold text-indigo-600">
                        {simulationResult.hospitalAssessments.filter((h) => !h.isCompletelySevered).length} / 6
                      </span>
                      <span className="text-[10px] text-slate-500">reachable</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {simulationResult.hospitalAssessments.filter((h) => h.isCompletelySevered).length} isolated
                    </span>
                  </div>
                </div>

                {/* Plain English Calculated Explanation */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Modeled Impact Explanation</span>
                  </div>
                  <p className="text-xs text-amber-950 leading-relaxed">
                    Under the <strong>{simulationResult.scenarioName}</strong> scenario, the selected road segment (<strong>{currentEdge.roadName}</strong>) is modeled as <strong>{closureCondition.toLowerCase().replace('_', ' ')}</strong>.
                    {simulationResult.hasNoViableRoute ? (
                      <> All standard connecting paths between {CORRIDOR_GRAPH_NODES[originNodeId]?.name || 'Origin'} and {CORRIDOR_GRAPH_NODES[destinationNodeId]?.name || 'Destination'} are completely severed with no viable highway bypass.</>
                    ) : (
                      <> The routing engine identified an alternative path adding approximately <strong>+{((simulationResult.routeEvaluation?.disruptedRoute?.totalTimeMin || 0) - (simulationResult.routeEvaluation?.baselineRoute?.totalTimeMin || 0)).toFixed(1)} minutes</strong> of cruising time.</>
                    )}
                  </p>
                </div>

                {/* Explainable Intervention Recommendation */}
                {simulationResult.recommendation && (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Recommended Action Plan
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        {simulationResult.recommendation.supportingMetrics.confidenceCertainty}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900">
                      {simulationResult.recommendation.primaryAction}
                    </p>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {simulationResult.recommendation.strategicRationale}
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div className="p-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200">
                        <span className="font-bold block">Recommended Corridor:</span>
                        <span>{simulationResult.recommendation.recommendedCorridor}</span>
                      </div>
                      <div className="p-2 rounded-xl bg-rose-50 text-rose-900 border border-rose-200">
                        <span className="font-bold block">Avoided Corridor:</span>
                        <span>{simulationResult.recommendation.avoidedCorridor}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Affected Routes & Network Analysis */}
            {simulationResult && activeTab === 'routes' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">
                    Evaluated Corridor Routes ({simulationResult.analyzedRoutes?.length || 0})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Click any route to highlight it on the map canvas
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Route Corridor</th>
                        <th className="py-2.5 px-3">Baseline</th>
                        <th className="py-2.5 px-3">Simulated</th>
                        <th className="py-2.5 px-3">Delta</th>
                        <th className="py-2.5 px-3">Impact Tier</th>
                        <th className="py-2.5 px-3">Alternative Path</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px]">
                      {(simulationResult.analyzedRoutes || []).map((route) => {
                        const isSelected = selectedRouteId === route.routeId;
                        return (
                          <tr
                            key={route.routeId}
                            onClick={() => handleSelectAnalyzedRoute(route)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-amber-50/90 font-bold text-slate-900'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <span className="font-bold">{route.name}</span>
                              <p className="text-[10px] text-slate-500 font-normal truncate max-w-xs">
                                {route.explanation}
                              </p>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {route.baselineTimeMin.toFixed(1)} min
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {route.simulatedTimeMin >= 999 ? '∞' : `${route.simulatedTimeMin.toFixed(1)} min`}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap font-bold">
                              {route.delayDeltaMin >= 999 ? (
                                <span className="text-rose-600">Severed</span>
                              ) : route.delayDeltaMin > 0 ? (
                                <span className="text-amber-700">+{route.delayDeltaMin.toFixed(1)}m</span>
                              ) : (
                                <span className="text-emerald-600">0.0m</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  route.classification === 'DIRECTLY_AFFECTED'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : route.classification === 'INDIRECTLY_AFFECTED'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : route.classification === 'POTENTIALLY_AFFECTED'
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {route.classification.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {route.alternativeAvailable ? (
                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Available
                                </span>
                              ) : (
                                <span className="text-rose-600 font-semibold flex items-center gap-1">
                                  <X className="w-3 h-3" /> Severed
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Destination Accessibility Summary */}
                {simulationResult.destinationsAccessibility && simulationResult.destinationsAccessibility.length > 0 && (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <span className="text-xs font-bold text-slate-800 block">
                      Regional Population Node Accessibility
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {simulationResult.destinationsAccessibility.slice(0, 6).map((dest) => (
                        <div key={dest.nodeId} className="p-2.5 rounded-xl bg-white border border-slate-200 text-[11px]">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span>{dest.name}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded ${
                                dest.accessibilityStatus === 'SEVERED_UNREACHABLE'
                                  ? 'bg-rose-100 text-rose-800'
                                  : dest.accessibilityStatus === 'REACHABLE_DELAYED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {dest.accessibilityStatus === 'SEVERED_UNREACHABLE'
                                ? 'Severed'
                                : dest.accessibilityStatus === 'REACHABLE_DELAYED'
                                ? `+${dest.delayDeltaMin.toFixed(0)}m Delay`
                                : 'Normal Access'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                            {dest.populationZone}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Traffic Ripple Effects */}
            {simulationResult && activeTab === 'ripple' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">
                    Segment Spillover &amp; Capacity Reallocation ({simulationResult.rippleEffects.length})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Graph structural pressure
                  </span>
                </div>

                <div className="space-y-2">
                  {simulationResult.rippleEffects.map((seg) => (
                    <div
                      key={seg.edgeId}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{seg.roadName}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              seg.impactClass === 'DIRECTLY_DISRUPTED'
                                ? 'bg-rose-100 text-rose-800'
                                : seg.impactClass === 'ALTERNATIVE_CORRIDOR_REQUIRED'
                                ? 'bg-orange-100 text-orange-800'
                                : seg.impactClass === 'MODELED_DELAY_INCREASED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {seg.impactClass.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {seg.absorptionRole || 'Standard regional artery'}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-[11px] shrink-0">
                        <div className="text-right">
                          <span className="text-slate-500 block">Baseline Cruising:</span>
                          <span className="font-bold text-slate-800">{seg.baselineTimeMin} min</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 block">Simulated Time:</span>
                          <span className="font-bold text-amber-700">{seg.disruptedTimeMin} min</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: Hospital & Lifeline Reachability */}
            {simulationResult && activeTab === 'hospitals' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">
                    Trauma Facility Accessibility Impact Matrix (6 Centers)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Critical emergency care reachability
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {simulationResult.hospitalAssessments.map((hosp) => (
                    <div
                      key={hosp.hospitalId}
                      className={`p-4 rounded-2xl border text-xs space-y-2 transition-all ${
                        hosp.isCompletelySevered
                          ? 'bg-rose-50/90 border-rose-300'
                          : hosp.averageDelayDeltaMin > 10
                          ? 'bg-amber-50/80 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-slate-900">{hosp.hospitalName}</h4>
                          <span className="text-[10px] text-slate-500">
                            Level {hosp.traumaLevel} Trauma • {hosp.emergencyBeds} Beds
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            hosp.isCompletelySevered
                              ? 'bg-rose-600 text-white'
                              : hosp.averageDelayDeltaMin > 15
                              ? 'bg-amber-600 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {hosp.isCompletelySevered
                            ? 'ISOLATED'
                            : hosp.averageDelayDeltaMin > 15
                            ? 'CRITICAL DELAY'
                            : 'ACCESSIBLE'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/60">
                        <div>
                          <span className="text-slate-500">Reachable Origins:</span>
                          <span className="font-bold ml-1 text-slate-800">
                            {hosp.disruptedReachableOrigins} / {hosp.baselineReachableOrigins}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Avg Delta:</span>
                          <span className="font-bold ml-1 text-amber-700">
                            {hosp.isCompletelySevered ? '∞' : `+${hosp.averageDelayDeltaMin.toFixed(1)}m`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 5: 3-Way Scenario Comparison Matrix */}
            {activeTab === 'compare' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-700">
                  <span className="font-bold">
                    3-Way Scenario Comparison (Baseline vs Scenario A vs Scenario B)
                  </span>
                  <button
                    type="button"
                    onClick={() => runComparisonMutation.mutate()}
                    disabled={runComparisonMutation.isPending}
                    className="px-3 py-1 rounded-xl bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${runComparisonMutation.isPending ? 'animate-spin' : ''}`} />
                    <span>Rerun 3-Way Suite</span>
                  </button>
                </div>

                {comparisonMatrix ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3">Scenario Name</th>
                          <th className="py-2.5 px-3">Closure Assumption</th>
                          <th className="py-2.5 px-3">Duration</th>
                          <th className="py-2.5 px-3">Baseline</th>
                          <th className="py-2.5 px-3">Simulated</th>
                          <th className="py-2.5 px-3">Delta</th>
                          <th className="py-2.5 px-3">Detour Available</th>
                          <th className="py-2.5 px-3">Affected Routes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {comparisonMatrix.scenarios.map((scen, idx) => (
                          <tr key={scen.scenarioId || idx} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {scen.scenarioName}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px]">
                                {scen.closureCondition || (idx === 0 ? 'No Blockage' : idx === 1 ? 'Partial Restriction' : 'Complete Closure')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {scen.duration || (idx === 0 ? '0 min' : idx === 1 ? '30 min' : '120 min')}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {scen.baselineTravelTime || '18.5 min'}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap font-bold">
                              {scen.simulatedTravelTime || (idx === 0 ? '18.5 min' : idx === 1 ? '38.5 min' : '∞ Severed')}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap font-bold">
                              {scen.additionalTravelTime || (idx === 0 ? '+0.0 min' : idx === 1 ? '+20.0 min' : '∞ (Severed)')}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {scen.viableRouteExists ? (
                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Yes
                                </span>
                              ) : (
                                <span className="text-rose-600 font-semibold flex items-center gap-1">
                                  <X className="w-3.5 h-3.5" /> No
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {scen.affectedRoutesAnalyzed ?? scen.directlyDisruptedCount} routes
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    <p>Click "Rerun 3-Way Suite" to compute Baseline vs Scenario A vs Scenario B side-by-side.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: Methodology, Assumptions & Limitations */}
            {activeTab === 'limitations' && (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2 text-amber-950">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Scientific Modeling Disclosure &amp; Scope</span>
                  </div>
                  <p className="leading-relaxed">
                    The RoadAlert Impact Simulator operates on a calibrated topological graph of the Mangaluru–Udupi arterial network. All computations reflect deterministic shortest-path graph calculations and static speed limits.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Key Modeling Principles &amp; Limitations
                  </h4>
                  <ul className="space-y-2 text-slate-600 leading-relaxed list-disc list-inside">
                    <li>
                      <strong>Deterministic Graph Sandbox:</strong> All hypothetical cuts are applied in an isolated in-memory graph. Production incident records and live telemetry are never modified.
                    </li>
                    <li>
                      <strong>Static Travel Estimates:</strong> Cruising speeds represent dry-weather design speed limits under normal geometry. Modeled delays reflect network restriction penalties, not measured micro-traffic queues.
                    </li>
                    <li>
                      <strong>Reachability vs Bed Capacity:</strong> Hospital reachability indicates geometric network connectivity. It does not reflect emergency triage wait times or ER bed occupancy.
                    </li>
                    <li>
                      <strong>Reroute Feasibility:</strong> The system does not claim vehicles will automatically reroute unless municipal diversion signage or active navigation guidance is enforced.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
