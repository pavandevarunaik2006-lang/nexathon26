import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ShieldCheck,
  MapPin,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Radio,
  ArrowUpRight,
  Navigation,
  CheckCircle2,
  Camera,
  Lock,
} from 'lucide-react';
import { VERIFICATION_LEVELS, classifyIncidentVerificationState } from '@roadalert/shared';
import { apiRequest } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  SeverityBadge,
  StatusBadge,
  ConfidenceMeter,
  DemoDataBadge,
} from '../../components/Badges';
import {
  AnimatedNumber,
  SkeletonBlock,
  panelFadeVariants,
  SPRING_SNAPPY,
  ENTERPRISE_EASE,
} from '../../components/MotionPrimitives';

export function IncidentInvestigationPanel({
  incidentId,
  onSelectNearby,
  onIncidentStateChanged,
}: {
  incidentId: string | null;
  onSelectNearby?: (inc: any) => void;
  onIncidentStateChanged?: (incident: any, decision: string) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'nearby'>('overview');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['incident-detail', incidentId],
    queryFn: () => apiRequest<any>(`/incidents/${incidentId}`),
    enabled: Boolean(incidentId),
  });

  const corroborateMutation = useMutation({
    mutationFn: (corroborationType: 'CORROBORATE' | 'DISPUTE' | 'GPS_CONGESTION') =>
      apiRequest<any>(`/incidents/${incidentId}/corroborate`, {
        method: 'POST',
        body: JSON.stringify({
          corroborationType,
          latitude: data?.incident?.latitude,
          longitude: data?.incident?.longitude,
          speedKmh: corroborationType === 'GPS_CONGESTION' ? 7.8 : undefined,
          notes: `Control room quick ${corroborationType.toLowerCase()} signal`,
        }),
      }),
    onSuccess: (res, corroborationType) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['incidents-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['map-incidents'] });
      if (res.duplicateIgnored) {
        showToast({
          type: 'warning',
          title: 'Duplicate Corroboration Ignored',
          message: 'Same-user submissions do not inflate independent corroboration points.',
        });
      } else {
        showToast({
          type: 'success',
          title: `Confidence Updated: ${res.confidenceBreakdown.totalScore}%`,
          message: `Band: ${res.confidenceBreakdown.band}`,
        });
        if (data?.incident) {
          onIncidentStateChanged?.(
            {
              ...data.incident,
              confidenceScore: res.confidenceBreakdown.totalScore,
            },
            `CORROBORATE_${corroborationType}`
          );
        }
      }
    },
  });

  const authorityQuickConfirmMutation = useMutation({
    mutationFn: (decision: 'CONFIRM' | 'MARK_ROAD_CLOSED' | 'RESOLVE') =>
      apiRequest<any>(`/incidents/${incidentId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reason:
            decision === 'CONFIRM'
              ? 'Control room verified incident as a real event via corridor telemetry (road remains passable).'
              : decision === 'MARK_ROAD_CLOSED'
              ? 'Control room confirmed physical road obstruction/closure; mandatory route diversion activated.'
              : 'Obstruction cleared and normal corridor flow restored.',
        }),
      }),
    onSuccess: (res, decision) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['incidents-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['map-incidents'] });
      onIncidentStateChanged?.(res.incident, decision);
      showToast({
        type: 'success',
        title: `Authority Action: ${decision.replace(/_/g, ' ')}`,
        message:
          decision === 'MARK_ROAD_CLOSED'
            ? `Confirmed road obstruction (${res.confidenceBreakdown.totalScore}%). Affected vehicles rerouted.`
            : decision === 'RESOLVE'
            ? 'Obstruction cleared and affected vehicles restored to normal flow.'
            : `Verified incident (${res.confidenceBreakdown.totalScore}%).`,
      });
    },
  });

  if (!incidentId) {
    return (
      <div className="p-6 enterprise-card text-center text-xs text-slate-500">
        Select an incident marker on the map or in the feed to inspect its verification intelligence.
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <SkeletonBlock className="h-36" />
        <SkeletonBlock className="h-44" />
      </div>
    );
  }

  const { incident, confidenceBreakdown, evidences, nearbyIncidents } = data;
  const isAuthorityOrAdmin =
    user?.role === 'TRAFFIC_AUTHORITY' || user?.role === 'ADMIN';
  const verificationState =
    incident.verificationState || classifyIncidentVerificationState(incident);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={incident.id}
        variants={prefersReducedMotion ? undefined : panelFadeVariants}
        initial={prefersReducedMotion ? false : 'hidden'}
        animate="visible"
        exit="exit"
        className="neu-card overflow-hidden rounded-2xl"
      >
        {/* Panel Header */}
        <div className="px-4 py-3.5 bg-slate-50/80 backdrop-blur-xs border-b border-slate-200/90 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Selected Incident Dossier
            </span>
          </div>
          <DemoDataBadge isDemo={incident.demoData} />
        </div>

        <div className="p-4 space-y-4">
          {/* Top Metadata Row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/90 text-slate-700 text-[11px] font-semibold">
              {incident.category}
            </span>
            {verificationState === 'CONFIRMED_OBSTRUCTION' ? (
              <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10.5px] font-bold inline-flex items-center gap-1 shadow-xs">
                <Lock className="w-3 h-3" /> CONFIRMED OBSTRUCTION
              </span>
            ) : verificationState === 'VERIFIED_INCIDENT' ? (
              <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[10.5px] font-bold inline-flex items-center gap-1 shadow-xs">
                <ShieldCheck className="w-3 h-3" /> VERIFIED (PASSABLE)
              </span>
            ) : verificationState === 'RESOLVED_OBSTRUCTION' ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10.5px] font-bold inline-flex items-center gap-1 shadow-xs">
                <CheckCircle2 className="w-3 h-3" /> RESOLVED / CLEARED
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10.5px] font-bold shadow-xs">
                UNVERIFIED OBSERVATION
              </span>
            )}
          </div>

          {/* Title & Location */}
          <div>
            <Link
              to={`/app/incidents/${incident.id}`}
              className="text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors leading-snug block"
            >
              {incident.title}
            </Link>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1.5">
              <span className="inline-flex items-center gap-1 text-slate-700 font-semibold">
                <MapPin className="w-3.5 h-3.5 text-blue-600" /> {incident.roadName}
              </span>
              <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                <Clock className="w-3.5 h-3.5 text-amber-600" /> +
                <AnimatedNumber value={incident.estimatedDelayMinutes} />m delay
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
            {incident.description}
          </p>

          {/* Smooth Investigation Tab Bar with Neumorphic Well */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shadow-neu-inset-sm">
            {(
              [
                { id: 'overview', label: 'Verification' },
                { id: 'evidence', label: `Evidence (${evidences?.length || 0})` },
                { id: 'nearby', label: `Nearby (${nearbyIncidents?.length || 0})` },
              ] as const
            ).map((tab) => {
              const isTabActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold transition-all ${
                    isTabActive ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isTabActive &&
                    (prefersReducedMotion ? (
                      <span className="absolute inset-0 bg-white rounded-lg shadow-neu-raised-sm" />
                    ) : (
                      <motion.span
                        layoutId="incident-investigation-tab-pill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 bg-white rounded-lg shadow-neu-raised-sm"
                      />
                    ))}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="tab-overview"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -3 }}
                transition={{ duration: 0.16, ease: ENTERPRISE_EASE }}
                className="space-y-3"
              >
                {/* Explainable Confidence Breakdown Visualization */}
                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 shadow-neu-inset-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Verification Score Breakdown
                    </span>
                    <span className="text-[11px] font-bold text-blue-700">
                      {
                        VERIFICATION_LEVELS[
                          incident.verificationLevel as keyof typeof VERIFICATION_LEVELS
                        ]
                      }
                    </span>
                  </div>

                  <ConfidenceMeter
                    score={confidenceBreakdown.totalScore}
                    authorityConfirmed={confidenceBreakdown.authorityConfirmed}
                  />

                  {/* 5-Pillar Micro Bars */}
                  <div className="grid grid-cols-5 gap-1.5 pt-1 text-center">
                    {[
                      {
                        label: 'Reports',
                        pts: confidenceBreakdown.components.independentReports,
                        max: 30,
                      },
                      {
                        label: 'Proximity',
                        pts: confidenceBreakdown.components.locationTimeProximity,
                        max: 20,
                      },
                      {
                        label: 'GPS Speed',
                        pts: confidenceBreakdown.components.gpsCorroboration,
                        max: 20,
                      },
                      {
                        label: 'Media',
                        pts: confidenceBreakdown.components.mediaEvidence,
                        max: 15,
                      },
                      {
                        label: 'Authority',
                        pts: confidenceBreakdown.components.authorityConfirmation,
                        max: 15,
                      },
                    ].map((p) => {
                      const pct = Math.min(100, Math.round((p.pts / p.max) * 100));
                      return (
                        <div
                          key={p.label}
                          className="p-1.5 rounded-xl bg-white border border-slate-200/80 shadow-neu-raised-sm space-y-1"
                        >
                          <div className="text-[9px] font-semibold text-slate-500 truncate">
                            {p.label}
                          </div>
                          <div className="text-xs font-bold text-slate-900 tabular-nums">
                            +<AnimatedNumber value={p.pts} />
                            <span className="text-[9px] font-normal text-slate-400">/{p.max}</span>
                          </div>
                          <div className="w-full h-1 rounded-full bg-slate-100 overflow-hidden">
                            {prefersReducedMotion ? (
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            ) : (
                              <motion.div
                                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.4, ease: ENTERPRISE_EASE }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {confidenceBreakdown.explanation?.length > 0 && (
                    <p className="text-[11px] text-slate-600 leading-snug pt-0.5">
                      {confidenceBreakdown.explanation[0]}
                    </p>
                  )}
                </div>

                {/* Attached Evidence & Photos Summary */}
                {evidences?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <Camera className="w-3.5 h-3.5 text-emerald-600" /> Validated Evidence (
                        {evidences.length})
                      </span>
                    </div>
                    <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                      {evidences.slice(0, 3).map((ev: any) => (
                        <div
                          key={ev.id}
                          className="px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between gap-2"
                        >
                          <span className="truncate text-slate-700">
                            <strong className="text-slate-900">{ev.evidence_type}:</strong>{' '}
                            {ev.metadata?.caption || ev.storage_key || 'Verified telemetry'}
                          </span>
                          <span className="text-[10px] text-emerald-700 font-semibold shrink-0">
                            {ev.validation_status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'evidence' && (
              <motion.div
                key="tab-evidence"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -3 }}
                transition={{ duration: 0.16, ease: ENTERPRISE_EASE }}
                className="space-y-2"
              >
                {evidences?.length > 0 ? (
                  evidences.map((ev: any) => (
                    <div
                      key={ev.id}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                          {ev.evidence_type}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-semibold">
                          {ev.validation_status}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-slate-800">
                        {ev.metadata?.caption || ev.storage_key || 'Verified telemetry'}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Submitted by {ev.submitter_name || 'Commuter'}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    No media or telemetry attachments recorded yet.
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'nearby' && (
              <motion.div
                key="tab-nearby"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -3 }}
                transition={{ duration: 0.16, ease: ENTERPRISE_EASE }}
                className="space-y-1.5"
              >
                {nearbyIncidents?.length > 0 ? (
                  nearbyIncidents.map((nb: any) => (
                    <button
                      key={nb.id}
                      type="button"
                      onClick={() => {
                        setActiveTab('overview');
                        onSelectNearby?.(nb);
                      }}
                      className="w-full text-left p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs flex items-center justify-between gap-2 transition-all active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <span className="truncate text-slate-900 font-semibold block">
                          {nb.title}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate">
                          {nb.road_name} • Confidence {nb.confidence_score}%
                        </span>
                      </div>
                      <span className="text-blue-600 font-bold shrink-0 text-[11px]">
                        {nb.distanceKm} km
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    No other active incidents within 8 km.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Interactive Role-Aware Action Controls */}
          <div className="space-y-2.5 pt-2.5 border-t border-slate-200/90">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => corroborateMutation.mutate('CORROBORATE')}
                disabled={corroborateMutation.isPending}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-800 font-semibold text-[11px] shadow-neu-raised-sm active:shadow-neu-inset-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Corroborate
              </button>
              <button
                type="button"
                onClick={() => corroborateMutation.mutate('GPS_CONGESTION')}
                disabled={corroborateMutation.isPending}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 text-sky-800 font-semibold text-[11px] shadow-neu-raised-sm active:shadow-neu-inset-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Radio className="w-3.5 h-3.5" /> GPS Slowdown
              </button>
              <button
                type="button"
                onClick={() => corroborateMutation.mutate('DISPUTE')}
                disabled={corroborateMutation.isPending}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-800 font-semibold text-[11px] shadow-neu-raised-sm active:shadow-neu-inset-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <ThumbsDown className="w-3.5 h-3.5" /> Dispute
              </button>
            </div>

            {isAuthorityOrAdmin && incident.status !== 'RESOLVED' && (
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => authorityQuickConfirmMutation.mutate('CONFIRM')}
                  disabled={authorityQuickConfirmMutation.isPending}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold text-[10.5px] shadow-neu-button transition-all active:scale-[0.98] disabled:opacity-50"
                  title="Verify incident as real without closing the road"
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Verify Event
                </button>
                <button
                  type="button"
                  onClick={() => authorityQuickConfirmMutation.mutate('MARK_ROAD_CLOSED')}
                  disabled={authorityQuickConfirmMutation.isPending}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold text-[10.5px] shadow-neu-button transition-all active:scale-[0.98] disabled:opacity-50"
                  title="Confirm road obstruction and force mandatory vehicle rerouting"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" /> Confirm Closure
                </button>
                <button
                  type="button"
                  onClick={() => authorityQuickConfirmMutation.mutate('RESOLVE')}
                  disabled={authorityQuickConfirmMutation.isPending}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold text-[10.5px] shadow-neu-raised-sm transition-all active:scale-[0.98] disabled:opacity-50"
                  title="Mark obstruction resolved and restore normal corridor flow"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Mark Resolved
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 pt-0.5">
              <Link
                to={`/app/incidents/${incident.id}`}
                className="flex-1 btn-primary py-2 text-xs shadow-neu-button"
              >
                Investigation Dossier <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link to="/app/routes" className="btn-secondary py-2 text-xs shadow-neu-raised-sm">
                <Navigation className="w-3.5 h-3.5 text-blue-600" /> Bypass
              </Link>
            </div>
          </div>

          {/* Related Nearby Incidents */}
          {nearbyIncidents?.length > 0 && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Nearby Corridor Incidents (&le; 8 km)
              </span>
              {nearbyIncidents.slice(0, 2).map((nb: any) => (
                <button
                  key={nb.id}
                  type="button"
                  onClick={() => onSelectNearby?.(nb)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[11px] flex items-center justify-between gap-2 transition-all active:scale-[0.99]"
                >
                  <span className="truncate text-slate-800 font-medium">{nb.title}</span>
                  <span className="text-blue-600 font-semibold shrink-0">{nb.distanceKm} km</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
