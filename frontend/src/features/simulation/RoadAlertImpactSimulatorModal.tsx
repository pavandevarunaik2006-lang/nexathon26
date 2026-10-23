import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  FlaskConical,
  X,
  ShieldAlert,
  ArrowRight,
  Activity,
  Hospital,
  Compass,
  CheckCircle2,
  Info,
  Scale,
  Sparkles,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import {
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  LIFELINE_HOSPITALS,
  type ScenarioDefinition,
  type HypotheticalDisruption,
  type SimulationResult,
  type ScenarioComparisonMatrix,
  type DisruptionType,
  type DisruptionSeverity,
} from '@roadalert/shared';

interface RoadAlertImpactSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToMap?: (simulation: SimulationResult | null) => void;
  activeSimulation?: SimulationResult | null;
  initialDisruptionEdgeId?: string | null;
}

interface PresetScenarioItem {
  id: string;
  name: string;
  description: string;
  disruptions: HypotheticalDisruption[];
  testOriginNodeId: string;
  testDestinationNodeId: string;
  focusHospitalId: string;
}

const PRESET_SCENARIOS: PresetScenarioItem[] = [
  {
    id: 'kuloor-bridge-severance',
    name: 'Kuloor Bridge Severance (NH-66 Coastal Link)',
    description: 'Structural failure / emergency closure of the primary Gurupura River crossing.',
    disruptions: [
      {
        id: 'dis-kuloor',
        edgeId: 'edge_kuloor_bridge',
        roadName: 'NH-66 Kuloor Bridge (Gurupura River Crossing)',
        disruptionType: 'COMPLETE_CLOSURE',
        severity: 'CRITICAL',
        delayPenaltyMinutes: 999,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
    ],
    testOriginNodeId: 'node_surathkal',
    testDestinationNodeId: 'node_nanthoor',
    focusHospitalId: 'hosp-aj-mangalore',
  },
  {
    id: 'mulki-estuary-flood',
    name: 'Mulki Estuary Inundation (Monsoon Flooding)',
    description: 'High-tide coastal storm surge submerges the NH-66 Shambhavi river causeway.',
    disruptions: [
      {
        id: 'dis-mulki',
        edgeId: 'edge_mulki_padubidri',
        roadName: 'NH-66 Mulki to Padubidri Coastal Stretch',
        disruptionType: 'TRAVEL_COST_PENALTY',
        severity: 'HIGH',
        delayPenaltyMinutes: 45,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
    ],
    testOriginNodeId: 'node_surathkal',
    testDestinationNodeId: 'node_udupi',
    focusHospitalId: 'hosp-kmc-manipal',
  },
  {
    id: 'surathkal-chokepoint',
    name: 'Surathkal Chokepoint & MRPL Divergence',
    description: 'Major petrochemical freight spill restricts heavy transport corridor to single lane.',
    disruptions: [
      {
        id: 'dis-surathkal',
        edgeId: 'edge_surathkal_mulki',
        roadName: 'NH-66 Surathkal to Mulki Expressway',
        disruptionType: 'PARTIAL_RESTRICTION',
        severity: 'MODERATE',
        delayPenaltyMinutes: 25,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
    ],
    testOriginNodeId: 'node_pumpwell',
    testDestinationNodeId: 'node_padubidri',
    focusHospitalId: 'hosp-wenlock-mangalore',
  },
  {
    id: 'manipal-dual-severance',
    name: 'Udupi-Manipal Dual Severance (Lifeline Isolation)',
    description: 'Simultaneous rockfall on NH-169A and bridge washout on Eastern Karkala Lifeline.',
    disruptions: [
      {
        id: 'dis-manipal-1',
        edgeId: 'edge_udupi_manipal',
        roadName: 'NH-169A Udupi-Manipal Apex Lifeline',
        disruptionType: 'COMPLETE_CLOSURE',
        severity: 'CRITICAL',
        delayPenaltyMinutes: 999,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
      {
        id: 'dis-manipal-2',
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
  },
];

export function RoadAlertImpactSimulatorModal({
  isOpen,
  onClose,
  onApplyToMap,
  activeSimulation,
  initialDisruptionEdgeId,
}: RoadAlertImpactSimulatorModalProps) {
  // Scenario state
  const [scenarioName, setScenarioName] = useState('Kuloor Bridge Severance (NH-66 Coastal Link)');
  const [scenarioDesc, setScenarioDesc] = useState(
    'Structural failure / emergency closure of the primary Gurupura River crossing.'
  );
  const [disruptions, setDisruptions] = useState<HypotheticalDisruption[]>([
    PRESET_SCENARIOS[0].disruptions[0],
  ]);
  const [originNodeId, setOriginNodeId] = useState('node_surathkal');
  const [destinationNodeId, setDestinationNodeId] = useState('node_nanthoor');
  const [focusHospitalId, setFocusHospitalId] = useState('hosp-aj-mangalore');
  const [activeTab, setActiveTab] = useState<'decision' | 'ripple' | 'hospitals' | 'compare'>('decision');

  // Simulation run state
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(activeSimulation || null);
  const [comparisonMatrix, setComparisonMatrix] = useState<ScenarioComparisonMatrix | null>(null);

  // If opened with a specific edge
  useEffect(() => {
    if (initialDisruptionEdgeId) {
      const edge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === initialDisruptionEdgeId);
      if (edge) {
        setScenarioName(`Disruption Scenario: ${edge.roadName}`);
        setScenarioDesc(`Hypothetical simulated closure along ${edge.roadName}`);
        setDisruptions([
          {
            id: `dis-${edge.id}`,
            edgeId: edge.id,
            roadName: edge.roadName,
            disruptionType: 'COMPLETE_CLOSURE',
            severity: 'CRITICAL',
            delayPenaltyMinutes: 999,
            verificationAssumption: 'CONFIRMED_CLOSURE',
          },
        ]);
      }
    }
  }, [initialDisruptionEdgeId]);

  // Sync activeSimulation if passed
  useEffect(() => {
    if (activeSimulation) {
      setSimulationResult(activeSimulation);
    }
  }, [activeSimulation]);

  // Run Simulation Mutation
  const runSimulationMutation = useMutation({
    mutationFn: async () => {
      const payload: ScenarioDefinition = {
        id: `sim-${Date.now()}`,
        name: scenarioName,
        description: scenarioDesc,
        disruptions,
        testOriginNodeId: originNodeId,
        testDestinationNodeId: destinationNodeId,
        focusHospitalId,
      };
      return await apiRequest<SimulationResult>('/simulation/impact', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data) => {
      setSimulationResult(data);
      if (onApplyToMap) {
        onApplyToMap(data);
      }
    },
  });

  // Run Comparison Mutation
  const runComparisonMutation = useMutation({
    mutationFn: async () => {
      const currentScenario: ScenarioDefinition = {
        id: 'scenario-custom',
        name: scenarioName,
        description: scenarioDesc,
        disruptions,
        testOriginNodeId: originNodeId,
        testDestinationNodeId: destinationNodeId,
        focusHospitalId,
      };

      const alternativeScenario: ScenarioDefinition = {
        id: 'scenario-mitigation',
        name: 'Inland Bypass Mitigation (Bajpe Ring)',
        description: 'Controlled diversion through airport inland arterial road with active escorting',
        disruptions: disruptions.map((d) => ({
          ...d,
          disruptionType: 'PARTIAL_RESTRICTION' as DisruptionType,
          severity: 'MODERATE' as DisruptionSeverity,
          delayPenaltyMinutes: Math.min(d.delayPenaltyMinutes, 20),
        })),
        testOriginNodeId: originNodeId,
        testDestinationNodeId: destinationNodeId,
        focusHospitalId,
      };

      return await apiRequest<ScenarioComparisonMatrix>('/simulation/compare', {
        method: 'POST',
        body: JSON.stringify({
          scenarios: [currentScenario, alternativeScenario],
        }),
      });
    },
    onSuccess: (data) => {
      setComparisonMatrix(data);
      setActiveTab('compare');
    },
  });

  const handleApplyPreset = (presetId: string) => {
    const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
    if (!preset) return;
    setScenarioName(preset.name);
    setScenarioDesc(preset.description);
    setDisruptions(preset.disruptions);
    setOriginNodeId(preset.testOriginNodeId);
    setDestinationNodeId(preset.testDestinationNodeId);
    setFocusHospitalId(preset.focusHospitalId);
  };

  const handleUpdateDisruption = (
    index: number,
    field: keyof HypotheticalDisruption,
    value: any
  ) => {
    setDisruptions((prev) => {
      const next = [...prev];
      if (field === 'edgeId') {
        const edge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === value);
        next[index] = {
          ...next[index],
          edgeId: value,
          roadName: edge ? edge.roadName : value,
        };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };

  const handleAddDisruption = () => {
    const unusedEdge =
      CORRIDOR_GRAPH_EDGES.find((e) => !disruptions.some((d) => d.edgeId === e.id)) ||
      CORRIDOR_GRAPH_EDGES[0];
    setDisruptions((prev) => [
      ...prev,
      {
        id: `dis-${Date.now()}`,
        edgeId: unusedEdge.id,
        roadName: unusedEdge.roadName,
        disruptionType: 'COMPLETE_CLOSURE',
        severity: 'CRITICAL',
        delayPenaltyMinutes: 999,
        verificationAssumption: 'CONFIRMED_CLOSURE',
      },
    ]);
  };

  const handleRemoveDisruption = (index: number) => {
    if (disruptions.length <= 1) return;
    setDisruptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleResetToBaseline = () => {
    setSimulationResult(null);
    setComparisonMatrix(null);
    if (onApplyToMap) {
      onApplyToMap(null);
    }
  };

  const routeEval = simulationResult?.routeEvaluation;
  const baselineTime = routeEval?.baselineRoute?.totalTimeMin ?? 0;
  const disruptedTime = routeEval?.disruptedRoute?.totalTimeMin ?? 0;
  const delayDelta =
    routeEval?.isSevered || !routeEval?.disruptedRoute
      ? 999
      : Math.max(0, disruptedTime - baselineTime);

  if (!isOpen) return null;

  return (
    <div
      data-testid="impact-simulator-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-950/70 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="w-full max-w-6xl max-h-[92vh] bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/60 flex flex-col overflow-hidden text-slate-900">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-blue-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-700 border border-amber-500/30 shadow-inner">
              <FlaskConical className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  RoadAlert Impact Simulator
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  DECISION INTELLIGENCE
                </span>
                {simulationResult && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Active on Map
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Hypothetical road disruption modeling, hospital reachability deltas & explainable interventions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {simulationResult && (
              <button
                type="button"
                onClick={handleResetToBaseline}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
                title="Clear hypothetical disruptions and return to real-time baseline"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Baseline
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Two columns layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Column: Scenario Definition Controls (5 cols) */}
          <div className="lg:col-span-5 p-5 border-r border-slate-200/80 overflow-y-auto space-y-4 bg-slate-50/50">
            {/* Presets Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
                <span>Select Scenario Preset</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              </label>
              <select
                aria-label="Select Scenario Preset"
                onChange={(e) => handleApplyPreset(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              >
                {PRESET_SCENARIOS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Scenario Name & Description */}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-semibold text-slate-700">Scenario Title</label>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Operational Context</label>
                <textarea
                  rows={2}
                  value={scenarioDesc}
                  onChange={(e) => setScenarioDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-normal resize-none"
                />
              </div>
            </div>

            {/* Disruptions List */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  Corridor Disruptions ({disruptions.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddDisruption}
                  className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold transition-colors"
                >
                  + Add Road Cut
                </button>
              </div>

              {disruptions.map((dis, idx) => (
                <div
                  key={dis.id || idx}
                  className="p-3 rounded-2xl bg-white border border-rose-200/80 shadow-sm space-y-2.5 relative group"
                >
                  {disruptions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDisruption(idx)}
                      className="absolute top-2 right-2 text-slate-400 hover:text-rose-600 text-xs font-bold p-1 rounded-md"
                      title="Remove this disruption"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Road Corridor Selection */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Disrupted Corridor Segment</label>
                    <select
                      aria-label="Disrupted Corridor Segment"
                      value={dis.edgeId}
                      onChange={(e) => handleUpdateDisruption(idx, 'edgeId', e.target.value)}
                      className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    >
                      {CORRIDOR_GRAPH_EDGES.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.roadName} ({e.distanceKm} km, {e.baseTimeMin} min)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Disruption Type & Penalty */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">Disruption Type</label>
                      <select
                        aria-label="Disruption Type"
                        value={dis.disruptionType}
                        onChange={(e) =>
                          handleUpdateDisruption(idx, 'disruptionType', e.target.value as DisruptionType)
                        }
                        className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-[11px] font-semibold text-slate-800"
                      >
                        <option value="COMPLETE_CLOSURE">Complete Closure</option>
                        <option value="PARTIAL_RESTRICTION">Partial Restriction</option>
                        <option value="CAPACITY_REDUCTION">Capacity Reduction</option>
                        <option value="TRAVEL_COST_PENALTY">Travel Cost Penalty</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600">
                        Delay Penalty: {dis.delayPenaltyMinutes >= 999 ? '∞ (Severed)' : `+${dis.delayPenaltyMinutes}m`}
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="120"
                        step="5"
                        value={dis.delayPenaltyMinutes >= 999 ? 120 : dis.delayPenaltyMinutes}
                        onChange={(e) =>
                          handleUpdateDisruption(
                            idx,
                            'delayPenaltyMinutes',
                            Number(e.target.value) >= 120 ? 999 : Number(e.target.value)
                          )
                        }
                        className="w-full mt-1.5 accent-rose-600 h-1.5 bg-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Verification Assumption Toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 font-medium">Assumption Mode:</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateDisruption(
                          idx,
                          'verificationAssumption',
                          dis.verificationAssumption === 'CONFIRMED_CLOSURE'
                            ? 'UNVERIFIED_ASSUMPTION'
                            : 'CONFIRMED_CLOSURE'
                        )
                      }
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors ${
                        dis.verificationAssumption === 'CONFIRMED_CLOSURE'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                    >
                      {dis.verificationAssumption === 'CONFIRMED_CLOSURE'
                        ? 'Confirmed Ground Truth'
                        : 'Unverified Report Only'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Test Routing Parameters */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-blue-600" />
                Regional Origin & Destination Probe
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">Test Origin</label>
                  <select
                    aria-label="Test Origin"
                    value={originNodeId}
                    onChange={(e) => setOriginNodeId(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800"
                  >
                    {Object.values(CORRIDOR_GRAPH_NODES).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-500">Test Destination</label>
                  <select
                    aria-label="Test Destination"
                    value={destinationNodeId}
                    onChange={(e) => setDestinationNodeId(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800"
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
                <label className="text-[11px] font-medium text-slate-500">Focus Lifeline Trauma Center</label>
                <select
                  aria-label="Focus Lifeline Trauma Center"
                  value={focusHospitalId}
                  onChange={(e) => setFocusHospitalId(e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800"
                >
                  {LIFELINE_HOSPITALS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} (Level {h.traumaLevel}, {h.emergencyBeds} beds)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => runSimulationMutation.mutate()}
                disabled={runSimulationMutation.isPending}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white font-bold text-sm shadow-md hover:shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {runSimulationMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Modeling Graph Disruption...</span>
                  </>
                ) : (
                  <>
                    <FlaskConical className="w-4 h-4" />
                    <span>Execute Impact Simulation</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => runComparisonMutation.mutate()}
                disabled={runComparisonMutation.isPending}
                className="w-full py-2 px-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Scale className="w-3.5 h-3.5 text-blue-600" />
                <span>Compare vs Inland Mitigation Scenario</span>
              </button>
            </div>
          </div>

          {/* Right Column: Simulation Output & Decision Intelligence (7 cols) */}
          <div className="lg:col-span-7 flex flex-col overflow-hidden bg-white">
            {/* Tabs Header */}
            <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('decision')}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'decision'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Decision Support
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ripple')}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'ripple'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Traffic Ripple ({simulationResult?.rippleEffects.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('hospitals')}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'hospitals'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Hospital className="w-3.5 h-3.5" />
                Hospital Reachability ({simulationResult?.hospitalAssessments.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('compare')}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'compare'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                Scenario Matrix
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 p-6 overflow-y-auto space-y-5">
              {!simulationResult ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
                  <div className="p-4 rounded-3xl bg-slate-100 text-slate-400">
                    <FlaskConical className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-700">No Simulation Executed Yet</h3>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                      Select a preset scenario on the left or customize road disruptions, then click "Execute Impact Simulation" to calculate live deltas and recommendations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => runSimulationMutation.mutate()}
                    className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 transition-colors"
                  >
                    Run Default Scenario
                  </button>
                </div>
              ) : (
                <>
                  {/* Top KPI Metrics Bar */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[11px] font-semibold text-slate-500">Route Status</span>
                      <div className="mt-1 flex items-baseline gap-1">
                        {simulationResult.hasNoViableRoute ? (
                          <span className="text-sm font-bold text-rose-600">NO VIABLE ROUTE</span>
                        ) : (
                          <span className="text-sm font-bold text-emerald-600">VIABLE DETOUR</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {routeEval?.isSevered ? 'Corridor severed' : `Delta: +${delayDelta} min`}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[11px] font-semibold text-slate-500">Probe Travel Time</span>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-slate-800">
                          {baselineTime}m → {disruptedTime >= 999 ? '∞' : `${disruptedTime}m`}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">Baseline vs Disrupted</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[11px] font-semibold text-slate-500">Active Bypasses</span>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-sm font-bold text-emerald-600">
                          {simulationResult.alternativeBypassesActiveCount} Corridors
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">Alternative capacity active</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[11px] font-semibold text-slate-500">Severed Hospital Origins</span>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-sm font-bold text-rose-600">
                          {simulationResult.severedPopulationZonesCount} zones
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">Zero emergency access</span>
                    </div>
                  </div>

                  {/* TAB 1: DECISION SUPPORT */}
                  {activeTab === 'decision' && (
                    <div className="space-y-4">
                      {/* Explainable Recommendation Card */}
                      <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-amber-300 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-600 text-white uppercase tracking-wider">
                            RECOMMENDED INTERVENTION
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            Certainty:{' '}
                            <strong className="text-slate-800">
                              {simulationResult.recommendation.supportingMetrics.confidenceCertainty.replace(/_/g, ' ')}
                            </strong>
                          </span>
                        </div>

                        <div>
                          <h4 className="text-base font-extrabold text-slate-900">
                            {simulationResult.recommendation.primaryAction}
                          </h4>
                          <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                            {simulationResult.recommendation.strategicRationale}
                          </p>
                        </div>

                        {/* Evidence & Metrics list */}
                        <div className="p-3 rounded-xl bg-white/80 border border-amber-200/70 space-y-1.5">
                          <span className="text-[11px] font-bold uppercase text-slate-600">
                            Deterministic Graph Evidence
                          </span>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-slate-700">
                            <div className="p-2 rounded-lg bg-slate-50">
                              <span className="text-[10px] text-slate-500 block">Baseline Travel Time</span>
                              <strong className="text-slate-800 font-bold">
                                {simulationResult.recommendation.supportingMetrics.baselineTimeMin} min
                              </strong>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-50">
                              <span className="text-[10px] text-slate-500 block">Disrupted Detour Time</span>
                              <strong className="text-slate-800 font-bold">
                                {simulationResult.recommendation.supportingMetrics.disruptedTimeMin >= 999
                                  ? 'Severed (∞)'
                                  : `${simulationResult.recommendation.supportingMetrics.disruptedTimeMin} min`}
                              </strong>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-50">
                              <span className="text-[10px] text-slate-500 block">Delay Delta</span>
                              <strong className="text-amber-700 font-bold">
                                +{simulationResult.recommendation.supportingMetrics.delayDeltaMin} min
                              </strong>
                            </div>
                          </div>
                        </div>

                        {/* Caveats and Limitations */}
                        <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-600">
                          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-700">Modeling Assumptions: </span>
                            {simulationResult.recommendation.assumptionsAndLimitations.join('. ')}
                          </div>
                        </div>
                      </div>

                      {/* Corridor Details & Bypass Route */}
                      {routeEval?.disruptedRoute && !routeEval.isSevered && (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">
                              Active Modeled Detour Corridors
                            </span>
                            <span className="text-xs font-bold text-emerald-600">
                              {routeEval.disruptedRoute.totalDistanceKm} km ({routeEval.disruptedRoute.totalTimeMin} min)
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {routeEval.disruptedRoute.path.map((nodeId, i) => {
                              const nodeObj = CORRIDOR_GRAPH_NODES[nodeId];
                              return (
                                <React.Fragment key={nodeId}>
                                  <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-semibold text-slate-700">
                                    {nodeObj ? nodeObj.name : nodeId}
                                  </span>
                                  {i < routeEval.disruptedRoute!.path.length - 1 && (
                                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 self-center" />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: TRAFFIC RIPPLE EFFECT */}
                  {activeTab === 'ripple' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Corridor Segment Ripple Impact
                        </span>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="flex items-center gap-1 font-semibold text-rose-700">
                            <span className="w-2 h-2 rounded-full bg-rose-600" /> Disrupted
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-emerald-700">
                            <span className="w-2 h-2 rounded-full bg-emerald-600" /> Bypass
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-amber-700">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> Delayed
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                        {simulationResult.rippleEffects.map((edge) => (
                          <div
                            key={edge.edgeId}
                            className={`p-3 flex items-center justify-between text-xs ${
                              edge.impactClass === 'DIRECTLY_DISRUPTED'
                                ? 'bg-rose-50/70'
                                : edge.impactClass === 'ALTERNATIVE_CORRIDOR_REQUIRED'
                                ? 'bg-emerald-50/70'
                                : edge.impactClass === 'MODELED_DELAY_INCREASED'
                                ? 'bg-amber-50/70'
                                : 'bg-white'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-800">{edge.roadName}</div>
                              <div className="text-[11px] text-slate-500">
                                {edge.impactClass.replace(/_/g, ' ')}
                                {edge.absorptionRole && ` • ${edge.absorptionRole}`}
                              </div>
                            </div>
                            <div className="text-right">
                              <span
                                className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                                  edge.delayDeltaMin > 0
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {edge.delayDeltaMin >= 999
                                  ? 'BLOCKED'
                                  : edge.delayDeltaMin > 0
                                  ? `+${edge.delayDeltaMin} min`
                                  : 'Nominal'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: HOSPITAL REACHABILITY */}
                  {activeTab === 'hospitals' && (
                    <div className="space-y-3">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Lifeline Trauma Facility Accessibility Matrix
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto">
                        {simulationResult.hospitalAssessments.map((hosp) => (
                          <div
                            key={hosp.hospitalId}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              hosp.isCompletelySevered
                                ? 'bg-rose-50 border-rose-300'
                                : hosp.severedOriginsCount > 0
                                ? 'bg-amber-50 border-amber-300'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h5 className="font-bold text-xs text-slate-900">{hosp.hospitalName}</h5>
                                <span className="text-[10px] font-semibold text-slate-500">
                                  Level {hosp.traumaLevel} • {hosp.emergencyBeds} Emergency Beds
                                </span>
                              </div>
                              {hosp.isCompletelySevered ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-600 text-white">
                                  SEVERED
                                </span>
                              ) : hosp.severedOriginsCount > 0 ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-600 text-white">
                                  {hosp.severedOriginsCount} ISOLATED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  ACCESSIBLE
                                </span>
                              )}
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-500">Reachable Origins:</span>
                                <div className="font-bold text-slate-800">
                                  {hosp.disruptedReachableOrigins} / {hosp.baselineReachableOrigins}
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-500">Average Delay Delta:</span>
                                <div className="font-bold text-slate-800">
                                  +{hosp.averageDelayDeltaMin} min
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: SCENARIO MATRIX */}
                  {activeTab === 'compare' && (
                    <div className="space-y-3">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Multi-Scenario Decision Matrix
                      </span>

                      {!comparisonMatrix ? (
                        <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                          <Scale className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                          <p className="text-xs">
                            Click "Compare vs Inland Mitigation Scenario" to evaluate options side-by-side.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                              <tr>
                                <th className="p-2.5">Scenario</th>
                                <th className="p-2.5">Reachable Origins %</th>
                                <th className="p-2.5">Severed Origins</th>
                                <th className="p-2.5">Avg Delay Delta</th>
                                <th className="p-2.5">Recommended Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {comparisonMatrix.scenarios.map((sc) => (
                                <tr key={sc.scenarioId} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-bold text-slate-800">
                                    {sc.scenarioName}
                                  </td>
                                  <td className="p-2.5 font-semibold">
                                    {sc.reachableOriginsPercentage}%
                                  </td>
                                  <td className="p-2.5 font-bold text-rose-600">
                                    {sc.severedOriginsCount} zones
                                  </td>
                                  <td className="p-2.5 font-semibold text-amber-600">
                                    +{sc.averageDelayDeltaMin} min
                                  </td>
                                  <td className="p-2.5 text-[11px] text-slate-700">
                                    {sc.recommendedIntervention}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
