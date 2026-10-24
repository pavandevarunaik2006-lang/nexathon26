import React, { useMemo, useState } from 'react';
import {
  Search,
  X,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  RotateCcw,
  AlertOctagon,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from '@roadalert/shared';

export interface IncidentListFilterPanelProps {
  incidents: any[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  selectedIncidentId: string | null;
  onSelectIncident: (incident: any) => void;
  onViewOnMap: (incident: any) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  categoryFilter: string;
  setCategoryFilter: (c: string) => void;
  severityFilter: string;
  setSeverityFilter: (s: string) => void;
  verificationFilter: string;
  setVerificationFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (st: string) => void;
  dateRangeFilter: string;
  setDateRangeFilter: (d: string) => void;
  onClearFilters: () => void;
  filteredIncidents: any[];
}

export function IncidentListFilterPanel({
  incidents,
  isLoading,
  isError,
  onRetry,
  selectedIncidentId,
  onSelectIncident,
  onViewOnMap,
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  severityFilter,
  setSeverityFilter,
  verificationFilter,
  setVerificationFilter,
  statusFilter,
  setStatusFilter,
  dateRangeFilter,
  setDateRangeFilter,
  onClearFilters,
  filteredIncidents,
}: IncidentListFilterPanelProps) {
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [missingCoordsWarningId, setMissingCoordsWarningId] = useState<string | null>(null);

  // Compute active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (categoryFilter !== 'ALL') count++;
    if (severityFilter !== 'ALL') count++;
    if (verificationFilter !== 'ALL') count++;
    if (statusFilter !== 'ALL') count++;
    if (dateRangeFilter !== 'ALL') count++;
    return count;
  }, [searchQuery, categoryFilter, severityFilter, verificationFilter, statusFilter, dateRangeFilter]);

  // Count how many have valid coordinates
  const validCoordinatesCount = useMemo(() => {
    return filteredIncidents.filter(
      (i) =>
        Number(i.latitude) !== 0 &&
        !isNaN(Number(i.latitude)) &&
        Number(i.longitude) !== 0 &&
        !isNaN(Number(i.longitude))
    ).length;
  }, [filteredIncidents]);

  return (
    <div className="space-y-3">
      {/* Search Bar & Filter Toggle Header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search road, title, corridor, location..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFilterExpanded((v) => !v)}
          className={`px-3 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-all shadow-sm ${
            filterExpanded || activeFiltersCount > 0
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
          title="Toggle filter controls"
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filters</span>
          {activeFiltersCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
          {filterExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
        </button>

        {activeFiltersCount > 0 && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-2.5 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Reset all filters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expandable Filter Tray */}
      {filterExpanded && (
        <div className="p-3 bg-slate-50/90 backdrop-blur-sm rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-200 shadow-sm text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {/* Category Filter */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Categories</option>
                {INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Severity Filter */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Severity
              </label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Severities</option>
                {INCIDENT_SEVERITIES.map((sev) => (
                  <option key={sev} value={sev}>
                    {sev}
                  </option>
                ))}
              </select>
            </div>

            {/* Verification Status Filter */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Verification
              </label>
              <select
                value={verificationFilter}
                onChange={(e) => setVerificationFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Verification</option>
                <option value="VERIFIED">Confirmed Verified</option>
                <option value="CORROBORATED">Community Corroborated</option>
                <option value="UNVERIFIED">Unverified / Low Trust</option>
                <option value="DISPUTED">Disputed / Rejected</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE_ONLY">Active Only (Unresolved)</option>
                <option value="REPORTED">Reported</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="VERIFIED">Verified</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>

            {/* Date Range Filter */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Reported Time
              </label>
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Today Only</option>
                <option value="24H">Last 24 Hours</option>
                <option value="7D">Last 7 Days</option>
              </select>
            </div>

            {/* Quick Reset Action */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={onClearFilters}
                className="w-full py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Bar */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Showing <strong>{filteredIncidents.length}</strong> of {incidents.length} incidents
          {activeFiltersCount > 0 && <span className="text-blue-600 font-semibold ml-1">({activeFiltersCount} active filters)</span>}
        </span>
        <span className="flex items-center gap-1 text-[11px]">
          <MapPin className="w-3 h-3 text-emerald-600" />
          <span>{validCoordinatesCount} plotted on map</span>
        </span>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-2 py-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 animate-pulse space-y-2">
              <div className="h-4 bg-slate-200 rounded w-2/3"></div>
              <div className="h-3 bg-slate-200 rounded w-1/2"></div>
              <div className="h-3 bg-slate-100 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
          <div className="font-bold flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4 text-rose-600" />
            <span>Failed to load incident feed from RoadAlert backend</span>
          </div>
          <p className="text-[11px] text-rose-700 leading-relaxed">
            Please check network connectivity or ensure the backend server is running on port 4000.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1 text-xs font-bold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
            >
              Retry Loading
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && filteredIncidents.length === 0 && (
        <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-2.5">
          <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
          <div className="text-xs font-bold text-slate-800">No incidents match current filters</div>
          <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
            Try adjusting your search keywords, expanding the date range, or resetting filters to see available incidents.
          </p>
          <button
            type="button"
            onClick={onClearFilters}
            className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Scrollable Incident List Cards */}
      {!isLoading && !isError && filteredIncidents.length > 0 && (
        <div className="max-h-[460px] overflow-y-auto space-y-2.5 pr-1">
          {filteredIncidents.map((inc) => {
            const isSelected = selectedIncidentId === inc.id;
            const lat = Number(inc.latitude);
            const lng = Number(inc.longitude);
            const hasValidCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;

            const sev = String(inc.severity || 'MEDIUM').toUpperCase();
            let sevBadge = 'bg-slate-100 text-slate-700 border-slate-200';
            if (sev === 'CRITICAL') sevBadge = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
            else if (sev === 'HIGH') sevBadge = 'bg-orange-100 text-orange-800 border-orange-300 font-bold';
            else if (sev === 'MEDIUM') sevBadge = 'bg-amber-100 text-amber-800 border-amber-300';
            else if (sev === 'LOW') sevBadge = 'bg-blue-100 text-blue-800 border-blue-200';

            const isVerified =
              inc.verification_status === 'VERIFIED' ||
              inc.verificationState === 'VERIFIED' ||
              Number(inc.confidence_score || inc.confidenceScore || 0) >= 75;

            const isResolved = inc.status === 'RESOLVED';

            return (
              <div
                key={inc.id}
                onClick={() => onSelectIncident(inc)}
                className={`p-3.5 rounded-xl border text-xs space-y-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-500 shadow-md ring-2 ring-blue-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                {/* Header: Title, Category & Severity */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 text-xs md:text-sm flex items-center gap-1.5">
                      <span>{inc.title}</span>
                      {isSelected && (
                        <span className="px-1.5 py-0.2 rounded bg-blue-600 text-white text-[9px] font-bold">
                          Selected Target
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                      <span className="font-semibold text-slate-800">{inc.road_name || inc.roadName || 'Corridor Location'}</span>
                      <span>•</span>
                      <span className="text-slate-500">{inc.category}</span>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] border whitespace-nowrap ${sevBadge}`}>
                    {sev}
                  </span>
                </div>

                {/* Sub details: Verification, Status, Reported Time */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-[10px] text-slate-600">
                  {/* Verification Status */}
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${
                      isVerified
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {isVerified ? (
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <ShieldAlert className="w-3 h-3 text-amber-600" />
                    )}
                    <span>{isVerified ? 'Verified' : 'Hypothetical / Unverified'}</span>
                  </span>

                  {/* Incident Status */}
                  <span
                    className={`px-1.5 py-0.5 rounded font-semibold ${
                      isResolved
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    Status: {inc.status || 'REPORTED'}
                  </span>

                  {/* Timestamp */}
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>
                      {inc.reported_at || inc.reportedAt
                        ? new Date(inc.reported_at || inc.reportedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Recent'}
                    </span>
                  </span>
                </div>

                {/* Coordinate Location Tag / Warning */}
                <div className="flex items-center justify-between text-[11px] pt-1">
                  {hasValidCoords ? (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>{lat.toFixed(4)}, {lng.toFixed(4)}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Map location unavailable (no GPS coords)</span>
                    </span>
                  )}

                  {/* Card Actions */}
                  <div className="flex items-center gap-1.5">
                    {hasValidCoords ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewOnMap(inc);
                        }}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors inline-flex items-center gap-1"
                        title="Focus map on this incident"
                      >
                        <MapPin className="w-3 h-3 text-blue-600" />
                        <span>View on Map</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMissingCoordsWarningId(inc.id);
                          setTimeout(() => setMissingCoordsWarningId(null), 3000);
                        }}
                        className="px-2 py-1 rounded-lg text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                        title="Location coordinates missing"
                      >
                        No Map Pin
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectIncident(inc);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {isSelected ? '✓ Selected' : 'Select'}
                    </button>
                  </div>
                </div>

                {/* Missing Coordinates Warning Banner */}
                {missingCoordsWarningId === inc.id && (
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-[10px] animate-in fade-in">
                    ⚠️ Geographic coordinates were not provided for this report. The simulator matches it to the closest corridor segment by road name, but cannot plot a physical pin on the map.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
