import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Search,
  Crosshair,
  X,
  Check,
  Compass,
  Navigation,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { REGIONAL_DESTINATIONS } from '@roadalert/shared';
import { API_BASE } from '../../services/apiClient';

export interface LocationEndpointValue {
  text: string;
  lat?: number;
  lng?: number;
  roadName?: string;
  source: 'PRESET' | 'MANUAL' | 'SUGGESTION' | 'COORDINATE' | 'MAP_PIN';
}

export interface LocationSuggestionItem {
  id: string;
  label: string;
  secondaryLabel: string;
  category: string;
  lat: number;
  lng: number;
  roadName: string;
  source: string;
}

/**
 * Parse a "lat, lng" coordinate string on the client for immediate preview/validation
 */
export function parseClientCoordinateString(raw: string): {
  isCoordAttempt: boolean;
  valid: boolean;
  lat?: number;
  lng?: number;
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { isCoordAttempt: false, valid: false };

  const cleaned = trimmed
    .replace(/^\[|\]$/g, '')
    .replace(/\b(lat|latitude)\s*[:=]?\s*/i, '')
    .replace(/\b(lng|lon|long|longitude)\s*[:=]?\s*/i, '')
    .trim();

  const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:,\s*|\s+)\s*([+-]?\d+(?:\.\d+)?)$/);
  if (match) {
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { isCoordAttempt: true, valid: false, error: 'Coordinates must be valid numbers.' };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return {
        isCoordAttempt: true,
        valid: false,
        error: 'Latitude must be between -90..90 and longitude between -180..180.',
      };
    }
    return {
      isCoordAttempt: true,
      valid: true,
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
    };
  }

  if (/^[+-]?\d+\.\d+\s*,/.test(cleaned) || /^lat\s*[:=]/i.test(trimmed)) {
    return {
      isCoordAttempt: true,
      valid: false,
      error: 'Enter coordinates as "12.8669, 74.8692".',
    };
  }

  return { isCoordAttempt: false, valid: false };
}

interface RouteLocationInputProps {
  role: 'origin' | 'destination';
  label: string;
  markerBadge: 'A' | 'B';
  value: LocationEndpointValue;
  onChange: (next: LocationEndpointValue) => void;
  isPickingOnMap: boolean;
  onTogglePickOnMap: () => void;
  error?: string | null;
  onClearError?: () => void;
}

export function RouteLocationInput({
  role,
  label,
  markerBadge,
  value,
  onChange,
  isPickingOnMap,
  onTogglePickOnMap,
  error,
  onClearError,
}: RouteLocationInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestionItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  // Check if current text matches one of the preset REGIONAL_DESTINATIONS
  const matchedPreset = REGIONAL_DESTINATIONS.find(
    (d) => d.name.toLowerCase() === value.text.trim().toLowerCase()
  );

  // Close suggestion popover on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Debounced autocomplete fetch with AbortController stale-response protection
  useEffect(() => {
    if (!isOpen) return;

    const query = value.text.trim();
    const currentSeq = ++requestSeqRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Provide instant client-side matches while server search resolves
    const localFiltered: LocationSuggestionItem[] = REGIONAL_DESTINATIONS.filter((d) =>
      !query ? true : d.name.toLowerCase().includes(query.toLowerCase())
    )
      .slice(0, 6)
      .map((d, idx) => ({
        id: `local-preset-${idx}`,
        label: d.name,
        secondaryLabel: `Corridor Landmark (${d.lat.toFixed(4)}, ${d.lng.toFixed(4)})`,
        category: 'PRESET_CORRIDOR',
        lat: d.lat,
        lng: d.lng,
        roadName: d.name,
        source: 'PRESET',
      }));

    const coordCheck = parseClientCoordinateString(query);
    if (coordCheck.isCoordAttempt && coordCheck.valid && coordCheck.lat != null && coordCheck.lng != null) {
      localFiltered.unshift({
        id: `client-coord-${coordCheck.lat}-${coordCheck.lng}`,
        label: `${coordCheck.lat.toFixed(4)}, ${coordCheck.lng.toFixed(4)}`,
        secondaryLabel: 'Use exact latitude & longitude coordinates',
        category: 'COORDINATE',
        lat: coordCheck.lat,
        lng: coordCheck.lng,
        roadName: `Coordinate (${coordCheck.lat.toFixed(4)}, ${coordCheck.lng.toFixed(4)})`,
        source: 'COORDINATE',
      });
    }

    setSuggestions(localFiltered);

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `${API_BASE}/locations/search?q=${encodeURIComponent(query)}&limit=8`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error('Search request failed');
        const json = await res.json();
        if (currentSeq === requestSeqRef.current && json?.success && Array.isArray(json.data?.suggestions)) {
          setSuggestions(json.data.suggestions);
          setHighlightedIndex(-1);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && currentSeq === requestSeqRef.current) {
          // Retain localFiltered fallback gracefully
        }
      } finally {
        if (currentSeq === requestSeqRef.current) {
          setIsSearching(false);
        }
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value.text, isOpen]);

  const handlePresetDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedName = e.target.value;
    if (selectedName === '__CUSTOM__') return;
    const preset = REGIONAL_DESTINATIONS.find((d) => d.name === selectedName);
    if (preset) {
      onClearError?.();
      onChange({
        text: preset.name,
        lat: preset.lat,
        lng: preset.lng,
        roadName: preset.name,
        source: 'PRESET',
      });
      setIsOpen(false);
    }
  };

  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextText = e.target.value;
    onClearError?.();
    const coordParsed = parseClientCoordinateString(nextText);
    const exactPreset = REGIONAL_DESTINATIONS.find(
      (d) => d.name.toLowerCase() === nextText.trim().toLowerCase()
    );

    if (exactPreset) {
      onChange({
        text: nextText,
        lat: exactPreset.lat,
        lng: exactPreset.lng,
        roadName: exactPreset.name,
        source: 'PRESET',
      });
    } else if (coordParsed.isCoordAttempt && coordParsed.valid && coordParsed.lat != null && coordParsed.lng != null) {
      onChange({
        text: nextText,
        lat: coordParsed.lat,
        lng: coordParsed.lng,
        roadName: `Coordinates (${coordParsed.lat.toFixed(4)}, ${coordParsed.lng.toFixed(4)})`,
        source: 'COORDINATE',
      });
    } else {
      // Preserve typed text without stale coordinates so server resolves the typed location
      onChange({
        text: nextText,
        lat: undefined,
        lng: undefined,
        roadName: undefined,
        source: 'MANUAL',
      });
    }
    setIsOpen(true);
  };

  const handleSelectSuggestion = (item: LocationSuggestionItem) => {
    onClearError?.();
    onChange({
      text: item.label,
      lat: item.lat,
      lng: item.lng,
      roadName: item.roadName,
      source:
        item.source === 'PRESET'
          ? 'PRESET'
          : item.source === 'COORDINATE'
          ? 'COORDINATE'
          : 'SUGGESTION',
    });
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    if (isOpen && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      } else if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[highlightedIndex]);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
  };

  const badgeBg =
    markerBadge === 'A'
      ? 'bg-blue-600 text-white'
      : 'bg-emerald-600 text-white';

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      {/* Header Row: Label + Source Pill + Pick on Map Button */}
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`route-${role}-input`}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
        >
          <span
            className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${badgeBg}`}
          >
            {markerBadge}
          </span>
          <span>{label}</span>
          {value.lat != null && value.lng != null && (
            <span className="hidden xl:inline-block text-[10px] font-mono font-normal text-slate-400">
              ({value.lat.toFixed(4)}, {value.lng.toFixed(4)})
            </span>
          )}
        </label>

        <button
          type="button"
          onClick={onTogglePickOnMap}
          aria-pressed={isPickingOnMap}
          data-testid={`pick-on-map-${role}`}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all border shadow-neu-raised-sm active:scale-95 ${
            isPickingOnMap
              ? 'bg-blue-600 text-white border-blue-600 shadow-neu-button ring-2 ring-blue-600/20'
              : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50 hover:text-blue-700'
          }`}
        >
          <Crosshair className="w-3 h-3" />
          <span>{isPickingOnMap ? 'Picking on Map...' : 'Pick on Map'}</span>
        </button>
      </div>

      {/* Mode A: Existing Corridor Preset Dropdown (preserved with all REGIONAL_DESTINATIONS) */}
      <div>
        <select
          aria-label={`${label} Corridor Preset`}
          data-testid={`preset-select-${role}`}
          value={matchedPreset ? matchedPreset.name : '__CUSTOM__'}
          onChange={handlePresetDropdownChange}
          className="enterprise-select w-full py-2 text-xs bg-slate-50/80 rounded-xl border-slate-200/90 shadow-neu-inset-sm"
        >
          {!matchedPreset && (
            <option value="__CUSTOM__">
              {value.source === 'MAP_PIN'
                ? `Map Pin: ${value.text || 'Selected Point'}`
                : value.source === 'COORDINATE'
                ? `Coordinates: ${value.text}`
                : `Custom / Manual: ${value.text || 'Type below or select preset...'}`}
            </option>
          )}
          {REGIONAL_DESTINATIONS.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Mode B: Manual Location / Landmark / Road / Coordinate Entry with Autocomplete */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id={`route-${role}-input`}
          data-testid={`manual-input-${role}`}
          type="text"
          value={value.text}
          onChange={handleManualInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Type place, road, landmark, or lat, lng..."
          autoComplete="off"
          className={`enterprise-input w-full pl-8 pr-14 py-2 text-xs rounded-xl shadow-neu-inset-sm ${
            error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200/90'
          }`}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isSearching && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
          {value.text && (
            <button
              type="button"
              title="Clear location input"
              aria-label={`Clear ${label}`}
              onClick={() => {
                onClearError?.();
                onChange({
                  text: '',
                  lat: undefined,
                  lng: undefined,
                  roadName: undefined,
                  source: 'MANUAL',
                });
                setIsOpen(true);
              }}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Autocomplete Suggestion Dropdown */}
        {isOpen && (
          <div
            role="listbox"
            aria-label={`${label} suggestions`}
            className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-lg border border-slate-200 shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100"
          >
            <div className="px-2.5 py-1 bg-slate-50 flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              <span>
                {value.text.trim()
                  ? 'Matching Landmarks, Roads & Coordinates'
                  : 'Corridor Presets & Landmarks'}
              </span>
              <span>{suggestions.length} options</span>
            </div>

            {suggestions.length === 0 ? (
              <div className="p-3 text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-700">No matching corridor locations found.</p>
                <p className="text-[11px] text-slate-500">
                  Try a nearby landmark (e.g., Surathkal, Manipal, Jyothi Circle, Moodbidri), enter{' '}
                  <code className="px-1 py-0.5 bg-slate-100 rounded text-[10px]">lat, lng</code>{' '}
                  coordinates, or click <strong>Pick on Map</strong>.
                </p>
              </div>
            ) : (
              suggestions.map((item, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const isCurrent =
                  item.label.toLowerCase() === value.text.trim().toLowerCase();
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onMouseDown={(e) => {
                      // Prevent input blur before selection
                      e.preventDefault();
                      handleSelectSuggestion(item);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-3 py-2 flex items-start justify-between gap-2 transition-colors ${
                      isHighlighted
                        ? 'bg-blue-50/90 text-slate-900'
                        : isCurrent
                        ? 'bg-slate-50 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {item.source === 'COORDINATE' ? (
                          <Compass className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        ) : item.source === 'PRESET' ? (
                          <Navigation className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        ) : (
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        )}
                        <span className="text-xs font-semibold truncate">{item.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate pl-5">
                        {item.secondaryLabel}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-0.5">
                      <span className="text-[10px] font-mono text-slate-400">
                        {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
                      </span>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Validation Error Display */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-1.5 text-[11px] text-red-600 font-medium pt-0.5"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
