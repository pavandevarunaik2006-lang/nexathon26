import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
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
  AlertTriangle,
} from 'lucide-react';
import { VERIFICATION_LEVELS } from '@roadalert/shared';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  SeverityBadge,
  StatusBadge,
  ConfidenceMeter,
  DemoDataBadge,
} from './Badges';
import { SkeletonBlock } from './MotionPrimitives';

export function IncidentInvestigationPanel({
  incidentId,
  onSelectNearby,
}: {
  incidentId: string | null;
  onSelectNearby?: (inc: any) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

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
    onSuccess: (res) => {
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
          title: `Confidence Updated: ${res.confidenceBreakdown.totalScore}/100`,
          message: `Band: ${res.confidenceBreakdown.band}`,
        });
      }
    },
  });

  const authorityQuickConfirmMutation = useMutation({
    mutationFn: (decision: 'CONFIRM' | 'RESOLVE') =>
      apiRequest<any>(`/incidents/${incidentId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reason:
            decision === 'CONFIRM'
              ? 'Control room verified incident via corridor telemetry and multi-user reports.'
              : 'Obstruction cleared and normal corridor flow restored.',
        }),
      }),
    onSuccess: (res, decision) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['incidents-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['map-incidents'] });
      showToast({
        type: 'success',
        title: `Authority Action: ${decision}`,
        message: `New confidence: ${res.confidenceBreakdown.totalScore}/100.`,
      });
    },
  });

  if (!incidentId) {
    return (
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center text-xs text-slate-400">
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

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={incident.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl bg-slate-900/95 border border-slate-800/90 p-4 space-y-3.5 shadow-xl"
      >
        {/* Top Metadata Row */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold">
              {incident.category}
            </span>
            {incident.roadClosed && (
              <span className="px-2 py-0.5 rounded-md bg-red-600/30 border border-red-500/50 text-red-200 text-[11px] font-bold">
                ⛔ CLOSED
              </span>
            )}
          </div>
          <DemoDataBadge isDemo={incident.demoData} />
        </div>

        {/* Title & Location */}
        <div>
          <Link
            to={`/app/incidents/${incident.id}`}
            className="text-sm font-bold text-white hover:text-cyan-300 transition-colors leading-snug block"
          >
            {incident.title}
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1">
            <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" /> {incident.roadName}
            </span>
            <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
              <Clock className="w-3.5 h-3.5" /> +{incident.estimatedDelayMinutes}m est. delay
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
          {incident.description}
        </p>

        {/* Explainable Confidence Breakdown Visualization */}
        <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
              Verification Confidence Heuristic
            </span>
            <span className="text-[10px] text-slate-400">
              {VERIFICATION_LEVELS[incident.verificationLevel as keyof typeof VERIFICATION_LEVELS]}
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
            ].map((p) => (
              <div
                key={p.label}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800/80"
              >
                <div className="text-[9px] text-slate-400 truncate">{p.label}</div>
                <div className="text-xs font-extrabold text-cyan-300 tabular-nums">
                  +{p.pts}
                  <span className="text-[9px] text-slate-500">/{p.max}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-500 italic">
            Heuristic confidence score (0–100) from {confidenceBreakdown.counts.distinctReporters}{' '}
            distinct reporter(s); not a statistical probability guarantee.
          </p>
        </div>

        {/* Attached Evidence & Photos Summary */}
        {evidences?.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300 flex items-center gap-1">
                <Camera className="w-3.5 h-3.5 text-emerald-400" /> Validated Evidence ({evidences.length})
              </span>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              {evidences.slice(0, 3).map((ev: any) => (
                <div
                  key={ev.id}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] flex items-center justify-between gap-2"
                >
                  <span className="truncate text-slate-300">
                    <strong className="text-cyan-300">{ev.evidence_type}:</strong>{' '}
                    {ev.metadata?.caption || ev.storage_key || 'Verified telemetry'}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold shrink-0">
                    {ev.validation_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactive Role-Aware Action Controls */}
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => corroborateMutation.mutate('CORROBORATE')}
              disabled={corroborateMutation.isPending}
              className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 font-bold text-[11px] active:scale-[0.98] transition-all"
            >
              <ThumbsUp className="w-3.5 h-3.5" /> Corroborate
            </button>
            <button
              type="button"
              onClick={() => corroborateMutation.mutate('GPS_CONGESTION')}
              disabled={corroborateMutation.isPending}
              className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 font-bold text-[11px] active:scale-[0.98] transition-all"
            >
              <Radio className="w-3.5 h-3.5" /> GPS Slowdown
            </button>
            <button
              type="button"
              onClick={() => corroborateMutation.mutate('DISPUTE')}
              disabled={corroborateMutation.isPending}
              className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-300 font-bold text-[11px] active:scale-[0.98] transition-all"
            >
              <ThumbsDown className="w-3.5 h-3.5" /> Dispute
            </button>
          </div>

          {isAuthorityOrAdmin && incident.status !== 'RESOLVED' && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => authorityQuickConfirmMutation.mutate('CONFIRM')}
                disabled={authorityQuickConfirmMutation.isPending}
                className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px]"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Authority Confirm
              </button>
              <button
                type="button"
                onClick={() => authorityQuickConfirmMutation.mutate('RESOLVE')}
                disabled={authorityQuickConfirmMutation.isPending}
                className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 font-bold text-[11px]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            <Link
              to={`/app/incidents/${incident.id}`}
              className="flex-1 inline-flex items-center justify-center gap-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors"
            >
              Full Investigation Dossier <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
            </Link>
            <Link
              to="/app/routes"
              className="inline-flex items-center justify-center gap-1 py-2 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-semibold text-xs transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" /> Bypass
            </Link>
          </div>
        </div>

        {/* Related Nearby Incidents */}
        {nearbyIncidents?.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Related Corridor Incidents (&le; 8 km)
            </span>
            {nearbyIncidents.slice(0, 2).map((nb: any) => (
              <button
                key={nb.id}
                type="button"
                onClick={() => onSelectNearby?.(nb)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-[11px] flex items-center justify-between gap-2"
              >
                <span className="truncate text-slate-200 font-medium">{nb.title}</span>
                <span className="text-cyan-400 font-bold shrink-0">{nb.distanceKm} km</span>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
