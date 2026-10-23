import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Flame,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  Ban,
  Radio,
  FileQuestion,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { CriticalVerificationItem } from '@roadalert/shared';

interface DecisionCriticalQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectIncident?: (incidentId: string) => void;
}

export function DecisionCriticalQueueModal({
  isOpen,
  onClose,
  onSelectIncident,
}: DecisionCriticalQueueModalProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [filterBand, setFilterBand] = useState<'ALL' | 'URGENT' | 'HIGH_RISK'>('ALL');
  const [actingIncidentId, setActingIncidentId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{
    success: boolean;
    data: {
      items: CriticalVerificationItem[];
      total: number;
      urgentCount: number;
      highRiskCount: number;
    };
  }>({
    queryKey: ['critical-verification-queue'],
    queryFn: () => apiRequest<any>('/verification/critical-queue'),
    enabled: isOpen,
    refetchInterval: 15_000,
  });

  const actionMutation = useMutation({
    mutationFn: ({
      incidentId,
      action,
      notes,
    }: {
      incidentId: string;
      action: 'CONFIRM_ROAD_CLOSURE' | 'VERIFY_PASSABLE' | 'DISPUTE_REPORT' | 'REQUEST_MORE_EVIDENCE';
      notes?: string;
    }) =>
      apiRequest<any>(`/verification/critical-queue/${incidentId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, notes }),
      }),
    onMutate: ({ incidentId }) => {
      setActingIncidentId(incidentId);
    },
    onSuccess: (_, variables) => {
      setActingIncidentId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['incidents-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['map-incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident-detail', variables.incidentId] });

      const actionLabels: Record<string, string> = {
        CONFIRM_ROAD_CLOSURE: 'Confirmed Road Closure enforced in routing',
        VERIFY_PASSABLE: 'Verified passable with transit delay',
        REQUEST_MORE_EVIDENCE: 'Marked under review and requested evidence',
        DISPUTE_REPORT: 'Report disputed / rejected',
      };

      showToast({
        type: 'success',
        title: 'Queue Action Executed',
        message: actionLabels[variables.action] || 'Action applied successfully',
      });
    },
    onError: (err: any) => {
      setActingIncidentId(null);
      showToast({
        type: 'error',
        title: 'Action Failed',
        message: err.message || 'Could not execute queue action',
      });
    },
  });

  if (!isOpen) return null;

  const queuePayload = (data as any)?.items ? (data as any) : data?.data;
  const items: CriticalVerificationItem[] = queuePayload?.items || [];
  const urgentCount = queuePayload?.urgentCount ?? 0;
  const highRiskCount = queuePayload?.highRiskCount ?? 0;
  const displayItems =
    filterBand === 'URGENT'
      ? items.filter((i) => i.priorityBand === 'URGENT_EMERGENCY_IMPACT')
      : filterBand === 'HIGH_RISK'
      ? items.filter((i) => i.priorityBand === 'URGENT_EMERGENCY_IMPACT' || i.priorityBand === 'HIGH_CORRIDOR_RISK')
      : items;

  return (
    <div
      data-testid="critical-verification-queue-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all duration-200"
    >
      <div className="w-full max-w-4xl max-h-[88vh] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200/80 bg-gradient-to-r from-red-50/80 via-white to-amber-50/80 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-md shadow-red-500/20 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-red-100 text-red-800 border border-red-200">
                  Feature 2: Decision-Critical Queue
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {urgentCount} Urgent Impact • {highRiskCount} High Corridor Risk
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Prioritized Incident Verification Queue
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Ranks unverified citizen reports by their immediate threat to lifeline hospital corridors and emergency routing.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close critical queue modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">Filter Risk:</span>
            <button
              type="button"
              onClick={() => setFilterBand('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filterBand === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Reports ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterBand('URGENT')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filterBand === 'URGENT' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Urgent Hospital Impact ({urgentCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterBand('HIGH_RISK')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filterBand === 'HIGH_RISK' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              High Corridor Risk ({highRiskCount})
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            Strict Policy: Unverified reports never close roads until confirmed.
          </div>
        </div>

        {/* Queue Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : displayItems.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-800">No Critical Unverified Reports</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                All high-impact corridor disruptions have been verified or reviewed by the operations desk.
              </p>
            </div>
          ) : (
            displayItems.map((item) => {
              const isUrgent = item.priorityBand === 'URGENT_EMERGENCY_IMPACT';
              const isHigh = item.priorityBand === 'HIGH_CORRIDOR_RISK';
              const isActing = actingIncidentId === item.incidentId;

              const bandBg = isUrgent
                ? 'bg-red-600 text-white'
                : isHigh
                ? 'bg-amber-600 text-white'
                : 'bg-slate-700 text-white';

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isUrgent
                      ? 'bg-red-50/50 border-red-200 shadow-sm'
                      : isHigh
                      ? 'bg-amber-50/40 border-amber-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${bandBg}`}>
                          Priority {item.priorityScore}/100
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-slate-300 text-slate-700">
                          {item.priorityBand.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {item.category} ({item.severity})
                        </span>
                      </div>

                      <h3
                        onClick={() => onSelectIncident?.(item.incidentId)}
                        className="text-sm font-bold text-slate-900 mt-1 hover:text-blue-600 cursor-pointer flex items-center gap-1.5"
                      >
                        <span>{item.title}</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                      </h3>

                      <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.roadName}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-slate-500 font-mono">
                        Reported {new Date(item.reportedAt).toLocaleTimeString()}
                      </div>
                      <div className="text-xs font-semibold text-slate-700 mt-0.5">
                        Trust: <strong className="text-slate-900">{item.trustState}</strong> (Score: {item.confidenceScore})
                      </div>
                    </div>
                  </div>

                  {/* Priority Reasons */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {item.priorityReasons.map((reason, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/90 border border-slate-200 text-slate-700 shadow-2xs"
                      >
                        ⚡ {reason}
                      </span>
                    ))}
                  </div>

                  {item.threatenedHospitals.length > 0 && (
                    <div className="mt-2 text-[11px] text-red-700 font-semibold flex items-center gap-1">
                      <span>⚠️ Immediate Risk Corridor for:</span>
                      <span>{item.threatenedHospitals.join(', ')}</span>
                    </div>
                  )}

                  {/* Quick Review Actions */}
                  <div className="mt-3.5 pt-3 border-t border-black/10 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Operator Action:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() =>
                          actionMutation.mutate({
                            incidentId: item.incidentId,
                            action: 'CONFIRM_ROAD_CLOSURE',
                            notes: 'Confirmed full road closure via Decision-Critical Queue',
                          })
                        }
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs transition-all active:scale-95 disabled:opacity-50"
                      >
                        Confirm Road Closure
                      </button>

                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() =>
                          actionMutation.mutate({
                            incidentId: item.incidentId,
                            action: 'VERIFY_PASSABLE',
                            notes: 'Verified passable with caution via Decision-Critical Queue',
                          })
                        }
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all active:scale-95 disabled:opacity-50"
                      >
                        Verify Passable
                      </button>

                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() =>
                          actionMutation.mutate({
                            incidentId: item.incidentId,
                            action: 'REQUEST_MORE_EVIDENCE',
                            notes: 'Awaiting additional commuter or telemetry signals',
                          })
                        }
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-300 hover:bg-sky-100 transition-all active:scale-95 disabled:opacity-50"
                      >
                        Request Evidence
                      </button>

                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() =>
                          actionMutation.mutate({
                            incidentId: item.incidentId,
                            action: 'DISPUTE_REPORT',
                            notes: 'Rejected report as unfounded from operations queue',
                          })
                        }
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Priority ranking automatically balances hospital proximity, corridor choke fragility, and commuter evidence momentum.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
