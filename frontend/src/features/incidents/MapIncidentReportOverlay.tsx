import React, { useState, useEffect, useRef } from 'react';
import { Marker, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useQueryClient } from '@tanstack/react-query';
import {
  MapPin,
  AlertOctagon,
  Sparkles,
  Check,
  X,
  Loader2,
  AlertCircle,
  Crosshair,
} from 'lucide-react';
import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES } from '@roadalert/shared';
import { apiRequest, API_BASE } from '../../services/apiClient';
import { useToast } from '../../context/ToastContext';

function buildDraftIncidentDivIcon(): L.DivIcon {
  const html = `
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
      <span class="animate-marker-pulse" style="position:absolute;inset:-6px;border-radius:9999px;border:2px dashed #2563eb;background:rgba(37,99,235,0.14);pointer-events:none;"></span>
      <div style="
        width:32px;
        height:32px;
        border-radius:9999px;
        background:#2563eb;
        border:3px solid #ffffff;
        box-shadow:0 4px 12px rgba(15,23,42,0.4);
        display:flex;
        align-items:center;
        justify-content:center;
        color:#ffffff;
      ">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
    </div>
  `;
  return L.divIcon({
    className: 'roadalert-draft-incident-pin',
    html,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

/**
 * Leaflet map click listener active ONLY when incident placement mode is enabled.
 */
export function MapIncidentPlacementListener({
  enabled,
  onPickLocation,
}: {
  enabled: boolean;
  onPickLocation: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      const targetEl = e.originalEvent?.target as HTMLElement | null;
      if (
        targetEl &&
        (targetEl.closest('.leaflet-control') ||
          targetEl.closest('.map-incident-report-ui') ||
          targetEl.closest('.roadalert-custom-pin') ||
          targetEl.closest('.roadalert-cluster-pin'))
      ) {
        return;
      }
      onPickLocation(
        Math.round(e.latlng.lat * 100000) / 100000,
        Math.round(e.latlng.lng * 100000) / 100000
      );
    },
  });
  return null;
}

export function DraftIncidentMapMarker({
  coords,
  roadName,
}: {
  coords: [number, number] | null;
  roadName: string;
}) {
  if (!coords) return null;
  return (
    <Marker position={coords} icon={buildDraftIncidentDivIcon()} zIndexOffset={1500}>
      <Tooltip direction="top" offset={[0, -18]} permanent opacity={0.96}>
        <div className="text-[11px] font-sans font-semibold text-slate-900">
          <span className="text-blue-600 font-bold">[DRAFT PIN]</span>{' '}
          {roadName || `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`}
        </div>
      </Tooltip>
    </Marker>
  );
}

export interface MapIncidentReportOverlayProps {
  isPlacementMode: boolean;
  draftCoords: [number, number] | null;
  onCancelPlacement: () => void;
  onIncidentCreated: (incident: any) => void;
}

export function MapIncidentReportOverlay({
  isPlacementMode,
  draftCoords,
  onCancelPlacement,
  onIncidentCreated,
}: MapIncidentReportOverlayProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState<string>('Accident');
  const [severity, setSeverity] = useState<string>('HIGH');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [roadName, setRoadName] = useState<string>('');
  const [estimatedDelayMinutes, setEstimatedDelayMinutes] = useState<number>(20);
  const [anonymousPublicDisplay, setAnonymousPublicDisplay] = useState<boolean>(false);

  const [isResolvingLocation, setIsResolvingLocation] = useState<boolean>(false);
  const [isAiAssisting, setIsAiAssisting] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reverse-geocode clicked map coordinates to prefill roadName & generate a fresh idempotencyKey
  useEffect(() => {
    if (!draftCoords) {
      setSubmitError(null);
      return;
    }

    const [lat, lng] = draftCoords;
    idempotencyKeyRef.current = `map-report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setSubmitError(null);

    const fallbackRoad = `Corridor Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    setRoadName(fallbackRoad);
    setIsResolvingLocation(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/locations/reverse?lat=${lat}&lng=${lng}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Reverse geocode failed');
        const json = await res.json();
        if (json?.success && json.data) {
          const resolvedLabel = json.data.roadName || json.data.label || fallbackRoad;
          setRoadName(resolvedLabel);
          setTitle((prev) =>
            prev.trim() ? prev : `${category} near ${resolvedLabel}`
          );
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setTitle((prev) => (prev.trim() ? prev : `${category} at ${fallbackRoad}`));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsResolvingLocation(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftCoords?.[0], draftCoords?.[1]]);

  if (!isPlacementMode) return null;

  // Step 1 Banner: User activated placement mode, waiting for map click
  if (!draftCoords) {
    return (
      <div
        data-testid="incident-placement-banner"
        className="map-incident-report-ui absolute top-14 left-3 right-3 z-[450] bg-slate-900/95 text-white px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-lg bg-blue-600 text-white shrink-0">
            <Crosshair className="w-4 h-4" />
          </span>
          <div>
            <div className="text-xs font-bold">
              Incident Pin Placement Mode Active
            </div>
            <p className="text-[11px] text-slate-300">
              Click or tap the exact location on the corridor map to drop a temporary pin and open the report form.
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="cancel-incident-placement-btn"
          onClick={onCancelPlacement}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-600 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          <span>Cancel Placement</span>
        </button>
      </div>
    );
  }

  // Step 2: User clicked a map point -> Show compact prefilled Incident Report Panel
  const [lat, lng] = draftCoords;

  const handleAiAutoClassify = async () => {
    if (!title.trim() && !description.trim()) {
      setSubmitError('Enter a brief title or description first to run AI classification.');
      return;
    }
    setIsAiAssisting(true);
    setSubmitError(null);
    try {
      const suggestion = await apiRequest<any>('/incidents/ai-assist', {
        method: 'POST',
        body: JSON.stringify({ title, description, roadName }),
      });
      if (suggestion?.suggestedCategory) setCategory(suggestion.suggestedCategory);
      if (suggestion?.suggestedSeverity) setSeverity(suggestion.suggestedSeverity);
      showToast({
        type: 'info',
        title: 'AI Classification Applied',
        message: `Suggested ${suggestion.suggestedCategory} (${suggestion.suggestedSeverity})`,
      });
    } catch (err: any) {
      setSubmitError(err?.message || 'Unable to run AI assist.');
    } finally {
      setIsAiAssisting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Prevent duplicate clicks

    setSubmitError(null);
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    const trimmedRoad = roadName.trim();

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setSubmitError('Selected coordinates are outside valid geographic bounds.');
      return;
    }
    if (trimmedTitle.length < 5) {
      setSubmitError('Incident title must be at least 5 characters.');
      return;
    }
    if (trimmedDesc.length < 10) {
      setSubmitError('Please provide a clear description (at least 10 characters).');
      return;
    }
    if (trimmedRoad.length < 2) {
      setSubmitError('Road name or landmark is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest<any>('/incidents', {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          description: trimmedDesc,
          category,
          severity,
          latitude: lat,
          longitude: lng,
          roadName: trimmedRoad,
          estimatedDelayMinutes: Number(estimatedDelayMinutes) || 15,
          anonymousPublicDisplay,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });

      // Reset form state only after backend confirms 201 Created
      setTitle('');
      setDescription('');
      setSubmitError(null);

      // Refresh map & dashboard queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['incidents-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['map-incidents'] }),
      ]);

      if (res?.incident) {
        onIncidentCreated(res.incident);
      } else {
        onCancelPlacement();
      }
    } catch (err: any) {
      // Preserve form contents and draft marker on failure!
      const msg =
        err?.message ||
        'Failed to submit incident report. Your form entries have been preserved — please retry.';
      setSubmitError(msg);
      showToast({
        type: 'error',
        title: 'Incident Submission Failed',
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="map-incident-report-drawer"
      className="map-incident-report-ui absolute top-14 left-3 z-[460] w-[350px] sm:w-[385px] max-h-[calc(100%-70px)] overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-red-50 text-red-600 shrink-0">
            <AlertOctagon className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-xs font-bold text-slate-900">
              Report Incident at Pinned Location
            </h3>
            <p className="text-[10px] font-mono text-slate-500">
              Pin: {lat.toFixed(4)}°N, {lng.toFixed(4)}°E (Click map to adjust)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancelPlacement}
          aria-label="Cancel incident report"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5 text-xs">
        {/* Prefilled Road / Landmark Name */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            Road Name / Corridor Landmark {isResolvingLocation && '(Resolving...)'}
          </label>
          <div className="relative">
            <MapPin className="w-3.5 h-3.5 text-blue-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={roadName}
              onChange={(e) => setRoadName(e.target.value)}
              placeholder="e.g. NH-66 Kuloor Bridge"
              className="enterprise-input w-full pl-8 py-1.5 text-xs"
            />
          </div>
        </div>

        {/* Category & Severity */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Incident Category
            </label>
            <select
              value={category}
              onChange={(e) => {
                const nextCat = e.target.value;
                setCategory(nextCat);
                if (roadName && (!title.trim() || title.includes(' near ') || title.includes(' at '))) {
                  setTitle(`${nextCat} near ${roadName}`);
                }
              }}
              className="enterprise-select w-full py-1.5 text-xs"
            >
              {INCIDENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Severity Level
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="enterprise-select w-full py-1.5 text-xs"
            >
              {INCIDENT_SEVERITIES.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Incident Title */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            Incident Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Multi-lane blockage near Kuloor Bridge"
            className="enterprise-input w-full py-1.5 text-xs"
          />
        </div>

        {/* Description + AI Auto-Classify */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-slate-700">
              Field Description
            </label>
            <button
              type="button"
              onClick={handleAiAutoClassify}
              disabled={isAiAssisting}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700"
            >
              <Sparkles className="w-3 h-3" />
              <span>{isAiAssisting ? 'Analyzing...' : 'AI Auto-Classify'}</span>
            </button>
          </div>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe affected lanes, traffic flow impact, or hazards (min 10 chars)..."
            className="enterprise-input w-full py-1.5 text-xs"
          />
        </div>

        {/* Delay Estimate & Anonymous Option */}
        <div className="grid grid-cols-2 gap-2 items-center pt-0.5">
          <div>
            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
              Est. Delay (min)
            </label>
            <input
              type="number"
              min={0}
              max={360}
              value={estimatedDelayMinutes}
              onChange={(e) => setEstimatedDelayMinutes(Number(e.target.value))}
              className="enterprise-input w-full py-1 text-xs"
            />
          </div>

          <label className="flex items-center gap-1.5 pt-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={anonymousPublicDisplay}
              onChange={(e) => setAnonymousPublicDisplay(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-blue-600"
            />
            <span className="text-[11px] text-slate-600">Post Anonymously</span>
          </label>
        </div>

        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-500">
          New reports enter at <strong>Level 1 (Uncorroborated, 25% base confidence)</strong> and trigger simulated corridor traffic reassessment.
        </div>

        {submitError && (
          <div
            role="alert"
            className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] flex items-start gap-1.5"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancelPlacement}
            disabled={isSubmitting}
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="submit-map-incident-btn"
            className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Submit Incident</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
