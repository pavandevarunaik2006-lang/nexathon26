import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  Radio,
  StopCircle,
  Play,
  Lock,
  ShieldCheck,
  MapPin,
  Clock,
  AlertTriangle,
  ThumbsUp,
  CheckCircle2,
  Sliders,
  Building2,
  Briefcase,
  Save,
  Navigation,
  UserCheck,
} from 'lucide-react';
import { REGIONAL_DESTINATIONS, VERIFICATION_LEVELS } from '@roadalert/shared';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  SeverityBadge,
  StatusBadge,
  ConfidenceMeter,
  DemoDataBadge,
} from '../components/Badges';

export function AlertsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      apiRequest<{ unreadCount: number; items: any[] }>('/notifications'),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiRequest('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToast({
        type: 'success',
        title: 'Notifications Updated',
        message: 'All alerts marked as read.',
      });
    },
  });

  const items = data?.items || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" /> Corridor Traffic Alerts &amp; Notifications
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            High-confidence incident alerts, road closures, commute delay proofs, and authority status updates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DemoDataBadge />
          {(data?.unreadCount || 0) > 0 && (
            <button
              onClick={() => markAllMutation.mutate()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
            >
              <CheckCheck className="w-4 h-4" /> Mark All Read ({data?.unreadCount})
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-400">Loading alerts...</div>
      ) : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-slate-900 border border-slate-800 text-center text-sm text-slate-400">
          No traffic alerts recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n: any) => (
            <div
              key={n.id}
              className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                n.readAt
                  ? 'bg-slate-900/60 border-slate-800 opacity-80'
                  : 'bg-slate-900 border-cyan-500/40 shadow-lg shadow-cyan-500/5'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px] font-bold uppercase">
                    {n.type.replace(/_/g, ' ')}
                  </span>
                  {!n.readAt && (
                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 text-[10px] font-bold">
                      UNREAD
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <h2 className="text-sm font-bold text-white">{n.title}</h2>
                <p className="text-xs text-slate-300 leading-relaxed">{n.message}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {n.incidentId && (
                  <Link
                    to={`/app/incidents/${n.incidentId}`}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold"
                  >
                    Inspect Incident
                  </Link>
                )}
                {!n.readAt && (
                  <button
                    onClick={() => markReadMutation.mutate(n.id)}
                    className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function JourneysPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [origin, setOrigin] = useState('Udupi Karavali Bypass (NH-66)');
  const [destination, setDestination] = useState('Pumpwell Circle, Mangaluru (NH-66)');
  const [manualSelfReported, setManualSelfReported] = useState(false);
  const [manualStatusNote, setManualStatusNote] = useState('');
  const [sharePreciseCoords, setSharePreciseCoords] = useState(false);

  const { data: commuteProfile } = useQuery({
    queryKey: ['my-commute-profile'],
    queryFn: () => apiRequest<any>('/commute/profile'),
  });

  const { data: consentsData, refetch: refetchConsents } = useQuery({
    queryKey: ['my-consents'],
    queryFn: () =>
      apiRequest<{ consents: any[]; organizationPolicies: any[] }>('/consents/me'),
  });

  const { data: journeys, refetch: refetchJourneys } = useQuery({
    queryKey: ['my-journeys'],
    queryFn: () => apiRequest<any[]>('/journeys'),
  });

  useEffect(() => {
    if (commuteProfile?.hasOrganization) {
      if (commuteProfile.usualCommuteOrigin) setOrigin(commuteProfile.usualCommuteOrigin);
      if (commuteProfile.usualCommuteDestination) setDestination(commuteProfile.usualCommuteDestination);
      if (commuteProfile.sharePreciseCoords !== undefined) setSharePreciseCoords(commuteProfile.sharePreciseCoords);
    }
  }, [commuteProfile]);

  const activeConsent = consentsData?.consents?.find((c) => c.active);
  const activeJourney = journeys?.find((j) =>
    ['ACTIVE', 'DELAYED'].includes(j.status)
  );

  const grantConsentMutation = useMutation({
    mutationFn: () =>
      apiRequest('/consents', {
        method: 'POST',
        body: JSON.stringify({
          policyVersion: 'v2026.1-PRIVACY-FIRST',
          purpose:
            'Explicit session-only commute delay verification along Mangaluru–Udupi NH-66 corridor',
          sharePreciseCoords,
        }),
      }),
    onSuccess: () => {
      refetchConsents();
      showToast({
        type: 'success',
        title: 'Explicit Commute Consent Granted',
        message: 'You can now start a session-only commute verification journey.',
      });
    },
  });

  const revokeConsentMutation = useMutation({
    mutationFn: (consentId: string) =>
      apiRequest(`/consents/${consentId}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      refetchConsents();
      refetchJourneys();
      queryClient.invalidateQueries({ queryKey: ['my-journeys'] });
      showToast({
        type: 'warning',
        title: 'Consent Revoked & Tracking Halted',
        message: 'Any active commute session was immediately stopped.',
      });
    },
  });

  const startJourneyMutation = useMutation({
    mutationFn: async () => {
      if (!activeConsent) {
        throw new Error('Please grant explicit session tracking consent first.');
      }
      const originObj = REGIONAL_DESTINATIONS.find((d) => d.name === origin);
      const destObj = REGIONAL_DESTINATIONS.find((d) => d.name === destination);
      return apiRequest('/journeys', {
        method: 'POST',
        body: JSON.stringify({
          origin,
          destination,
          originLat: originObj?.lat,
          originLng: originObj?.lng,
          destLat: destObj?.lat,
          destLng: destObj?.lng,
          consentRecordId: activeConsent.id,
          manualSelfReported,
          manualStatusNote: manualStatusNote || undefined,
        }),
      });
    },
    onSuccess: () => {
      refetchJourneys();
      queryClient.invalidateQueries({ queryKey: ['my-journeys'] });
      showToast({
        type: 'success',
        title: 'Consented Commute Session Started',
        message: 'Persistent tracking indicator enabled. You can stop the session at any time.',
      });
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Cannot Start Session',
        message: err.message,
      });
    },
  });

  const recordCheckpointMutation = useMutation({
    mutationFn: (journeyId: string) =>
      apiRequest(`/journeys/${journeyId}/checkpoints`, {
        method: 'POST',
        body: JSON.stringify({
          latitude: 13.0908,
          longitude: 74.7864,
          speed: 7.5,
          sourceType: manualSelfReported ? 'MANUAL_SELF_REPORTED' : 'BROWSER_GPS',
          statusNote:
            manualStatusNote ||
            'Checkpoint recorded near Mulki NH-66 contraflow zone (7.5 km/h)',
        }),
      }),
    onSuccess: () => {
      refetchJourneys();
      showToast({
        type: 'info',
        title: 'Corridor Checkpoint Logged',
        message: 'Delay telemetry matched with nearby verified incidents.',
      });
    },
  });

  const stopJourneyMutation = useMutation({
    mutationFn: (journeyId: string) =>
      apiRequest(`/journeys/${journeyId}/stop`, { method: 'POST' }),
    onSuccess: () => {
      refetchJourneys();
      queryClient.invalidateQueries({ queryKey: ['my-journeys'] });
      showToast({
        type: 'success',
        title: 'Commute Session Stopped',
        message: 'Location collection terminated immediately. Delay proof saved to your history.',
      });
    },
  });

  return (
    <div className="space-y-6">
      {/* Privacy Charter Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white">
              Privacy-First Employee Commute Verification
            </h1>
          </div>
          <DemoDataBadge />
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          RoadAlert never enables 24/7 tracking and never starts tracking silently. You control when
          a commute session starts and stops, and your employer only receives corridor-level delay
          verification (precise GPS coordinates are redacted unless explicitly permitted).
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left 5 Cols: Consent Controls & Start/Stop Session */}
        <div className="lg:col-span-5 space-y-5">
          {/* Step 1: Consent Status Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white">
              Step 1: Explicit Commute Tracking Consent
            </h2>

            {activeConsent ? (
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Consent Active ({activeConsent.policyVersion})
                  </span>
                </div>
                <p className="text-slate-300">{activeConsent.purpose}</p>
                <p className="text-[11px] text-slate-400">
                  Precise Coordinates Shared with Employer:{' '}
                  <strong>{activeConsent.sharePreciseCoords ? 'Yes' : 'No (Redacted by Default)'}</strong>
                </p>
                <button
                  onClick={() => revokeConsentMutation.mutate(activeConsent.id)}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-semibold text-xs"
                >
                  Revoke Consent &amp; Terminate Any Active Session
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                <p className="text-slate-300">
                  You currently have no active tracking consent. You cannot start a commute session
                  until you explicitly grant session-only consent.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    id="shareCoords"
                    type="checkbox"
                    checked={sharePreciseCoords}
                    onChange={(e) => setSharePreciseCoords(e.target.checked)}
                    className="w-4 h-4 rounded accent-cyan-500"
                  />
                  <label htmlFor="shareCoords" className="text-slate-300">
                    Optional: Permit precise coordinate sharing (Unchecked = Redacted corridor-only)
                  </label>
                </div>
                <button
                  onClick={() => grantConsentMutation.mutate()}
                  disabled={grantConsentMutation.isPending}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                >
                  Grant Explicit Session-Only Tracking Consent
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Active Session Control or Start New Session */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white">
              Step 2: Commute Session Control
            </h2>

            {activeJourney ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <Radio className="w-4 h-4 animate-pulse" /> Tracking Active ({activeJourney.status})
                  </span>
                  <DemoDataBadge isDemo={activeJourney.demoData} />
                </div>
                <p className="text-xs font-bold text-white">
                  {activeJourney.origin} → {activeJourney.destination}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Estimated Delay</span>
                    <span className="font-bold text-amber-300">
                      +{activeJourney.estimatedDelayMin} min
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Verified Delay Proof</span>
                    <span className="font-bold text-emerald-300">
                      +{activeJourney.verifiedDelayMin} min
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={() => recordCheckpointMutation.mutate(activeJourney.id)}
                    className="flex-1 py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-semibold text-xs"
                  >
                    Log Corridor Checkpoint
                  </button>
                  <button
                    onClick={() => stopJourneyMutation.mutate(activeJourney.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-red-500 hover:bg-red-400 text-slate-950 font-bold text-xs"
                  >
                    <StopCircle className="w-4 h-4" /> Stop Session Now
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Origin</label>
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  >
                    {REGIONAL_DESTINATIONS.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Destination</label>
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  >
                    {REGIONAL_DESTINATIONS.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="selfReportToggle"
                    type="checkbox"
                    checked={manualSelfReported}
                    onChange={(e) => setManualSelfReported(e.target.checked)}
                    className="w-4 h-4 rounded accent-cyan-500"
                  />
                  <label htmlFor="selfReportToggle" className="text-slate-300">
                    Device lacks GPS — submit as clearly labeled Self-Reported status
                  </label>
                </div>
                {manualSelfReported && (
                  <input
                    type="text"
                    value={manualStatusNote}
                    onChange={(e) => setManualStatusNote(e.target.value)}
                    placeholder="Self-reported note (e.g., Delayed on express bus at Mulki)..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                )}
                <button
                  onClick={() => startJourneyMutation.mutate()}
                  disabled={!activeConsent || startJourneyMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs"
                >
                  <Play className="w-4 h-4" /> Start Consented Commute Session
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Cols: Personal Travel History & Corroborating Delay Evidence */}
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-base font-bold text-white">
            Personal Commute History &amp; Verified Delay Evidence ({journeys?.length || 0})
          </h2>

          {(journeys || []).map((j: any) => (
            <div
              key={j.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      j.status === 'DELAYED'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : j.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {j.status}
                  </span>
                  {j.manualSelfReported && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-semibold border border-amber-500/30">
                      Self-Reported Status
                    </span>
                  )}
                  <DemoDataBadge isDemo={j.demoData} />
                </div>
                <span className="text-xs text-slate-400">
                  Started: {new Date(j.startedAt).toLocaleString()}
                </span>
              </div>

              <h3 className="text-sm font-bold text-white">
                {j.origin} → {j.destination}
              </h3>

              {/* Clearly distinguish Estimated Delay from Verified Delay */}
              <div className="grid sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Estimated Route Delay</span>
                  <span className="font-bold text-amber-300">+{j.estimatedDelayMin} minutes</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">
                    Incident-Verified Delay
                  </span>
                  <span className="font-bold text-emerald-300">+{j.verifiedDelayMin} minutes</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Verification Tier</span>
                  <span className="font-semibold text-cyan-300">
                    Level {j.verificationLevel} Proof
                  </span>
                </div>
              </div>

              {j.checkpoints?.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-400 block">
                    Session Checkpoints ({j.checkpoints.length}):
                  </span>
                  {j.checkpoints.map((cp: any) => (
                    <div
                      key={cp.id}
                      className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] flex items-center justify-between"
                    >
                      <span className="text-slate-300">
                        {cp.status_note || 'Corridor checkpoint'} ({cp.speed} km/h • {cp.source_type})
                      </span>
                      <span className="text-slate-500">
                        {new Date(cp.recorded_at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {j.corroboratingIncidents?.length > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[11px] font-semibold text-cyan-300 block mb-1.5">
                    Corroborating Corridor Incidents Backing Commute Delay:
                  </span>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {j.corroboratingIncidents.slice(0, 2).map((inc: any) => (
                      <Link
                        key={inc.id}
                        to={`/app/incidents/${inc.id}`}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/40 text-xs"
                      >
                        <p className="font-semibold text-white truncate">{inc.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {inc.road_name} • Confidence {inc.confidence_score}/100 (+{inc.estimated_delay_minutes}m)
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VerificationCenterPage() {
  const { data } = useQuery({
    queryKey: ['incidents-verification-center'],
    queryFn: () => apiRequest<{ items: any[] }>('/incidents?limit=30'),
  });

  const incidents = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" /> Community Verification &amp; 6-Level Confidence Engine
          </h1>
          <DemoDataBadge />
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          How RoadAlert calculates trustworthiness: Independent distinct reports (up to 30 pts) +
          Location/time proximity (up to 20 pts) + Consented GPS speed-drop telemetry (up to 20 pts) +
          Validated photo/video evidence (up to 15 pts) + Traffic Authority confirmation (up to 15 pts).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2">
          {Object.entries(VERIFICATION_LEVELS).map(([lvl, label]) => (
            <div key={lvl} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-xs font-extrabold text-cyan-400">Tier {lvl}</span>
              <p className="text-[11px] text-slate-300 mt-0.5">{label.replace(`Level ${lvl}: `, '')}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {incidents.map((inc) => (
          <div
            key={inc.id}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={inc.severity} />
                  <StatusBadge status={inc.status} />
                  <DemoDataBadge isDemo={inc.demoData} />
                </div>
                <span className="text-xs font-semibold text-cyan-300">
                  {VERIFICATION_LEVELS[inc.verificationLevel as keyof typeof VERIFICATION_LEVELS]}
                </span>
              </div>
              <Link
                to={`/app/incidents/${inc.id}`}
                className="block text-sm font-bold text-white hover:text-cyan-300"
              >
                {inc.title}
              </Link>
              <p className="text-xs text-slate-400">{inc.roadName}</p>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-800">
              <ConfidenceMeter
                score={inc.confidenceScore}
                authorityConfirmed={inc.authorityConfirmed}
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {1 + inc.corroborationCount} reporter(s) • {inc.evidenceCount} evidence item(s)
                </span>
                <Link
                  to={`/app/incidents/${inc.id}`}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-semibold"
                >
                  Corroborate / Inspect Breakdown →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UserSettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: profileData, isLoading, refetch } = useQuery({
    queryKey: ['my-commute-profile'],
    queryFn: () => apiRequest<any>('/commute/profile'),
  });

  const [department, setDepartment] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [usualOrigin, setUsualOrigin] = useState('');
  const [usualDest, setUsualDest] = useState('');
  const [usualCorridor, setUsualCorridor] = useState('');
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('18:00');
  const [sharePreciseCoords, setSharePreciseCoords] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);

  useEffect(() => {
    if (profileData?.hasOrganization && !formInitialized) {
      setDepartment(profileData.department || '');
      setEmployeeCode(profileData.employeeCode || '');
      setUsualOrigin(profileData.usualCommuteOrigin || '');
      setUsualDest(profileData.usualCommuteDestination || '');
      setUsualCorridor(profileData.usualCommuteCorridor || '');
      setShiftStart(profileData.shiftStartTime || '09:00');
      setShiftEnd(profileData.shiftEndTime || '18:00');
      setSharePreciseCoords(Boolean(profileData.sharePreciseCoords));
      setFormInitialized(true);
    }
  }, [profileData, formInitialized]);

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest('/commute/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Commute Profile Saved',
        message: 'Your commute details and scheduled shift hours have been updated.',
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['my-commute-profile'] });
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Failed to Save Profile',
        message: err.message || 'An error occurred while updating profile.',
      });
    },
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      department: department.trim(),
      employeeCode: employeeCode.trim(),
      usualCommuteOrigin: usualOrigin.trim(),
      usualCommuteDestination: usualDest.trim(),
      usualCommuteCorridor: usualCorridor.trim(),
      shiftStartTime: shiftStart,
      shiftEndTime: shiftEnd,
      sharePreciseCoords,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Account Profile Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Sliders className="w-5 h-5 text-cyan-400" /> Account Profile &amp; Privacy Preferences
        </h1>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block">Display Name</span>
            <span className="font-bold text-white text-sm">{user?.name}</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block">Email Address</span>
            <span className="font-bold text-white text-sm">{user?.email}</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block">Authorized Role</span>
            <span className="font-bold text-cyan-300 text-sm">{user?.role}</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block">Account Status</span>
            <span className="font-bold text-emerald-300 text-sm">{user?.status}</span>
          </div>
        </div>
      </div>

      {/* Organization & Commute Profile (Phase 4 requirement) */}
      {profileData?.hasOrganization ? (
        <form onSubmit={handleSaveProfile} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-bold text-white">
                  Organization Commute &amp; Delay Verification Profile
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Associated with <strong className="text-white">{profileData.organizationName}</strong> ({profileData.organizationCity})
                &bull; Role: <span className="font-mono text-cyan-300">{profileData.membershipRole}</span>
              </p>
            </div>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving...' : 'Save Commute Profile'}
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Employee ID / Code
              </label>
              <input
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="e.g. EMP-2026-088"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">Used by HR to correlate traffic delay certificates with your payroll record.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Department / Team
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Engineering, Operations, Quality"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Usual Origin Area (Home / Transit Hub)
              </label>
              <input
                type="text"
                value={usualOrigin}
                onChange={(e) => setUsualOrigin(e.target.value)}
                placeholder="e.g. Udupi Karavali Bypass (NH-66)"
                list="regional-dest-list"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Workplace Destination
              </label>
              <input
                type="text"
                value={usualDest}
                onChange={(e) => setUsualDest(e.target.value)}
                placeholder="e.g. Pumpwell Circle, Mangaluru (NH-66)"
                list="regional-dest-list"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Usual Commute Corridor
              </label>
              <select
                value={usualCorridor}
                onChange={(e) => setUsualCorridor(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="">Select Primary Coastal Corridor...</option>
                <option value="Mangaluru–Udupi NH-66">Mangaluru–Udupi NH-66 (Coastal Mainline)</option>
                <option value="Ullal–Mangaluru NH-66">Ullal–Mangaluru NH-66 (Netravati South)</option>
                <option value="Bantwal–Mangaluru NH-75">Bantwal–Mangaluru NH-75 (Eastern Gateway)</option>
                <option value="Surathkal–Mangaluru NH-66">Surathkal–Mangaluru NH-66 (Industrial Belt)</option>
                <option value="Manipal–Udupi NH-169A">Manipal–Udupi NH-169A (Academic Corridor)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Scheduled Shift Start Time (Expected Arrival)
              </label>
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
              <p className="text-[11px] text-slate-400 mt-1">Delays are calculated relative to your scheduled shift arrival window.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Scheduled Shift End Time
              </label>
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Privacy & GPS Consent Controls */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-white">GPS Privacy &amp; Location Detail Sharing</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  By default, RoadAlert protects your privacy by sharing only corridor delay durations, incident
                  corroboration, and bottleneck verification. Precise GPS coordinates are redacted unless you explicitly toggle this on.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={sharePreciseCoords}
                  onChange={(e) => setSharePreciseCoords(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Consent Status: <strong className={profileData.consentActive ? 'text-emerald-400' : 'text-amber-400'}>{profileData.consentActive ? 'Active Consent Record' : 'No Active Session Consent'}</strong></span>
              <Link to="/app/journeys" className="text-cyan-400 underline hover:text-cyan-300">
                Manage Session Consents &rarr;
              </Link>
            </div>
          </div>

          <datalist id="regional-dest-list">
            {REGIONAL_DESTINATIONS.map((d) => (
              <option key={d.name} value={d.name} />
            ))}
          </datalist>
        </form>
      ) : (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 text-amber-400">
            <Building2 className="w-5 h-5" />
            <h2 className="text-base font-bold text-white">No Organization Associated</h2>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your account is currently registered as a commuter. If you work for a company using RoadAlert
            for commute delay verification, ask your HR administrator for an invitation code.
          </p>
          <div>
            <Link
              to="/register?tab=invite"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 transition-all"
            >
              Enter Organization Invite Code
            </Link>
          </div>
        </div>
      )}

      {/* Privacy Charter Summary */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2.5 text-xs text-slate-300">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-400" /> Commute Data Collection &amp; Consent Charter
        </h3>
        <ul className="space-y-1.5 list-disc pl-5 text-slate-400">
          <li><strong>Zero 24/7 Background Tracking:</strong> Location observations are only collected during an active commute session you explicitly initiate.</li>
          <li><strong>Instant Consent Revocation:</strong> Revoking consent immediately terminates any ongoing tracking session and halts data sharing.</li>
          <li><strong>Purpose Limitation:</strong> Telemetry is strictly used to verify road congestion against traffic police and crowd-reported incidents.</li>
          <li><strong>Immutable Audit Trails:</strong> Every access to employee commute certificates is recorded with full timestamps.</li>
        </ul>
      </div>
    </div>
  );
}
