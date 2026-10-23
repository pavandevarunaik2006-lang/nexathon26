import React, { useState } from 'react';
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
  CheckCircle2,
  Sliders,
  MapPin,
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
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="p-6 neu-card rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" /> Corridor Traffic Alerts &amp; Notifications
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            High-confidence incident alerts, road closures, commute delay proofs, and authority status updates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DemoDataBadge />
          {(data?.unreadCount || 0) > 0 && (
            <button
              onClick={() => markAllMutation.mutate()}
              className="btn-primary"
            >
              <CheckCheck className="w-4 h-4" /> Mark All Read ({data?.unreadCount})
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading alerts...</div>
      ) : items.length === 0 ? (
        <div className="p-10 neu-card rounded-2xl text-center text-sm text-slate-500">
          No traffic alerts recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n: any) => (
            <div
              key={n.id}
              className={`p-5 neu-card rounded-2xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                n.readAt
                  ? 'opacity-80'
                  : 'border-blue-300 bg-blue-50/20'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold uppercase">
                    {n.type.replace(/_/g, ' ')}
                  </span>
                  {!n.readAt && (
                    <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
                      UNREAD
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <h2 className="text-sm font-bold text-slate-900">{n.title}</h2>
                <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {n.incidentId && (
                  <>
                    <Link
                      to={`/app/map?incidentId=${encodeURIComponent(n.incidentId)}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold border border-blue-200 transition-colors shadow-2xs text-xs"
                      title="View incident on Live Map"
                    >
                      <MapPin className="w-3.5 h-3.5 text-blue-600" /> View on Map
                    </Link>
                    <Link
                      to={`/app/incidents/${n.incidentId}`}
                      className="btn-secondary py-1.5 px-3"
                    >
                      Inspect Incident
                    </Link>
                  </>
                )}
                {!n.readAt && (
                  <button
                    onClick={() => markReadMutation.mutate(n.id)}
                    className="btn-primary py-1.5 px-3"
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

  const { data: consentsData, refetch: refetchConsents } = useQuery({
    queryKey: ['my-consents'],
    queryFn: () =>
      apiRequest<{ consents: any[]; organizationPolicies: any[] }>('/consents/me'),
  });

  const { data: journeys, refetch: refetchJourneys } = useQuery({
    queryKey: ['my-journeys'],
    queryFn: () => apiRequest<any[]>('/journeys'),
  });

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
    <div className="space-y-5">
      {/* Privacy Charter Header */}
      <div className="p-6 neu-card rounded-2xl space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600" />
            <h1 className="text-lg font-bold text-slate-900">
              Privacy-First Employee Commute Verification
            </h1>
          </div>
          <DemoDataBadge />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          RoadAlert never enables 24/7 tracking and never starts tracking silently. You control when
          a commute session starts and stops, and your employer only receives corridor-level delay
          verification (precise GPS coordinates are redacted unless explicitly permitted).
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-5">
        {/* Left 5 Cols: Consent Controls & Start/Stop Session */}
        <div className="lg:col-span-5 space-y-5">
          {/* Step 1: Consent Status Card */}
          <div className="p-5 neu-card rounded-2xl space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              Step 1: Explicit Commute Tracking Consent
            </h2>

            {activeConsent ? (
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Consent Active ({activeConsent.policyVersion})
                  </span>
                </div>
                <p className="text-slate-700">{activeConsent.purpose}</p>
                <p className="text-[11px] text-slate-600">
                  Precise Coordinates Shared with Employer:{' '}
                  <strong>{activeConsent.sharePreciseCoords ? 'Yes' : 'No (Redacted by Default)'}</strong>
                </p>
                <button
                  onClick={() => revokeConsentMutation.mutate(activeConsent.id)}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold text-xs"
                >
                  Revoke Consent &amp; Terminate Any Active Session
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <p className="text-slate-600">
                  You currently have no active tracking consent. You cannot start a commute session
                  until you explicitly grant session-only consent.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    id="shareCoords"
                    type="checkbox"
                    checked={sharePreciseCoords}
                    onChange={(e) => setSharePreciseCoords(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <label htmlFor="shareCoords" className="text-slate-700">
                    Optional: Permit precise coordinate sharing (Unchecked = Redacted corridor-only)
                  </label>
                </div>
                <button
                  onClick={() => grantConsentMutation.mutate()}
                  disabled={grantConsentMutation.isPending}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                >
                  Grant Explicit Session-Only Tracking Consent
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Active Session Control or Start New Session */}
          <div className="p-5 neu-card rounded-2xl space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              Step 2: Commute Session Control
            </h2>

            {activeJourney ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                    <Radio className="w-4 h-4 animate-pulse text-emerald-600" /> Tracking Active ({activeJourney.status})
                  </span>
                  <DemoDataBadge isDemo={activeJourney.demoData} />
                </div>
                <p className="text-xs font-bold text-slate-900">
                  {activeJourney.origin} → {activeJourney.destination}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Estimated Delay</span>
                    <span className="font-bold text-amber-700">
                      +{activeJourney.estimatedDelayMin} min
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Verified Delay Proof</span>
                    <span className="font-bold text-emerald-700">
                      +{activeJourney.verifiedDelayMin} min
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={() => recordCheckpointMutation.mutate(activeJourney.id)}
                    className="btn-secondary flex-1 py-2"
                  >
                    Log Corridor Checkpoint
                  </button>
                  <button
                    onClick={() => stopJourneyMutation.mutate(activeJourney.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs"
                  >
                    <StopCircle className="w-4 h-4" /> Stop Session Now
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Origin</label>
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="enterprise-select w-full py-2"
                  >
                    {REGIONAL_DESTINATIONS.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Destination</label>
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="enterprise-select w-full py-2"
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
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <label htmlFor="selfReportToggle" className="text-slate-600">
                    Device lacks GPS — submit as clearly labeled Self-Reported status
                  </label>
                </div>
                {manualSelfReported && (
                  <input
                    type="text"
                    value={manualStatusNote}
                    onChange={(e) => setManualStatusNote(e.target.value)}
                    placeholder="Self-reported note (e.g., Delayed on express bus at Mulki)..."
                    className="enterprise-input py-2"
                  />
                )}
                <button
                  onClick={() => startJourneyMutation.mutate()}
                  disabled={!activeConsent || startJourneyMutation.isPending}
                  className="btn-primary w-full py-2.5"
                >
                  <Play className="w-4 h-4" /> Start Consented Commute Session
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Cols: Personal Travel History & Corroborating Delay Evidence */}
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Personal Commute History &amp; Verified Delay Evidence ({journeys?.length || 0})
          </h2>

          {(journeys || []).map((j: any) => (
            <div
              key={j.id}
              className="p-5 neu-card rounded-2xl space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                      j.status === 'DELAYED'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : j.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {j.status}
                  </span>
                  {j.manualSelfReported && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200">
                      Self-Reported Status
                    </span>
                  )}
                  <DemoDataBadge isDemo={j.demoData} />
                </div>
                <span className="text-xs text-slate-500">
                  Started: {new Date(j.startedAt).toLocaleString()}
                </span>
              </div>

              <h3 className="text-sm font-bold text-slate-900">
                {j.origin} → {j.destination}
              </h3>

              <div className="grid sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Estimated Route Delay</span>
                  <span className="font-bold text-amber-700">+{j.estimatedDelayMin} minutes</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">
                    Incident-Verified Delay
                  </span>
                  <span className="font-bold text-emerald-700">+{j.verifiedDelayMin} minutes</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Verification Tier</span>
                  <span className="font-semibold text-blue-600">
                    Level {j.verificationLevel} Proof
                  </span>
                </div>
              </div>

              {j.checkpoints?.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    Session Checkpoints ({j.checkpoints.length}):
                  </span>
                  {j.checkpoints.map((cp: any) => (
                    <div
                      key={cp.id}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between"
                    >
                      <span className="text-slate-700">
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
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-semibold text-blue-600 block mb-1.5">
                    Corroborating Corridor Incidents Backing Commute Delay:
                  </span>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {j.corroboratingIncidents.slice(0, 2).map((inc: any) => (
                      <Link
                        key={inc.id}
                        to={`/app/incidents/${inc.id}`}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 text-xs transition-colors"
                      >
                        <p className="font-semibold text-slate-900 truncate">{inc.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {inc.road_name} • Confidence {inc.confidence_score}% (+{inc.estimated_delay_minutes}m)
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
    <div className="space-y-5">
      <div className="p-6 neu-card rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" /> Community Verification &amp; 6-Level Confidence Engine
          </h1>
          <DemoDataBadge />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          How RoadAlert calculates trustworthiness: Independent distinct reports (up to 30 pts) +
          Location/time proximity (up to 20 pts) + Consented GPS speed-drop telemetry (up to 20 pts) +
          Validated photo/video evidence (up to 15 pts) + Traffic Authority confirmation (up to 15 pts).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2">
          {Object.entries(VERIFICATION_LEVELS).map(([lvl, label]) => (
            <div key={lvl} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs font-bold text-blue-600">Tier {lvl}</span>
              <p className="text-[11px] text-slate-600 mt-0.5">{label.replace(`Level ${lvl}: `, '')}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {incidents.map((inc) => (
          <div
            key={inc.id}
            className="p-5 neu-card rounded-2xl flex flex-col justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={inc.severity} />
                  <StatusBadge status={inc.status} />
                  <DemoDataBadge isDemo={inc.demoData} />
                </div>
                <span className="text-xs font-semibold text-blue-600">
                  {VERIFICATION_LEVELS[inc.verificationLevel as keyof typeof VERIFICATION_LEVELS]}
                </span>
              </div>
              <Link
                to={`/app/incidents/${inc.id}`}
                className="block text-sm font-bold text-slate-900 hover:text-blue-600"
              >
                {inc.title}
              </Link>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{inc.roadName}</span>
                <span className="font-mono text-[10px] text-slate-400">ID: {inc.id.slice(0, 8)}...</span>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200">
              <ConfidenceMeter
                score={inc.confidenceScore}
                authorityConfirmed={inc.authorityConfirmed}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">
                  {1 + inc.corroborationCount} reporter(s) • {inc.evidenceCount} evidence item(s)
                </span>
                <div className="flex items-center gap-1.5">
                  <Link
                    to={`/app/map?incidentId=${encodeURIComponent(inc.id)}&lat=${inc.latitude}&lng=${inc.longitude}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold border border-blue-200 transition-colors shadow-2xs text-xs"
                    title="View on Live Map"
                  >
                    <MapPin className="w-3.5 h-3.5 text-blue-600" /> View on Map
                  </Link>
                  <Link
                    to={`/app/incidents/${inc.id}`}
                    className="btn-secondary py-1.5 px-3"
                  >
                    Inspect Breakdown →
                  </Link>
                </div>
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
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="p-6 neu-card rounded-2xl space-y-4">
        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-blue-600" /> Account Profile &amp; Privacy Preferences
        </h1>
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Display Name</span>
            <span className="font-bold text-slate-900 text-sm">{user?.name}</span>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Email Address</span>
            <span className="font-bold text-slate-900 text-sm">{user?.email}</span>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Authorized Role</span>
            <span className="font-bold text-blue-600 text-sm">{user?.role}</span>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Account Status</span>
            <span className="font-bold text-emerald-600 text-sm">{user?.status}</span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-600">
          <h2 className="font-bold text-slate-900">Privacy &amp; Location Protection Summary</h2>
          <p>
            • Browser geolocation is requested only when you explicitly click "My Location" or start
            an active commute verification session.
          </p>
          <p>
            • You can manage or revoke organization commute consent at any time in the{' '}
            <Link to="/app/journeys" className="text-blue-600 font-semibold hover:underline">
              Commute Proof
            </Link>{' '}
            view.
          </p>
        </div>
      </div>
    </div>
  );
}
