import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Lock,
  Download,
  Printer,
  Sparkles,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Eye,
  X,
  Check,
  FileImage,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Send,
  Loader2,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { apiRequest, downloadAuthenticatedCsv, API_BASE } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { DemoDataBadge, SeverityBadge, ConfidenceMeter } from '../components/Badges';
import { AnimatedNumber, StaggerGrid, StaggerItem } from '../components/MotionPrimitives';

export function EmployerDashboardPage() {
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['employer-dashboard'],
    queryFn: () => apiRequest<any>('/employer/dashboard'),
  });

  const { data: delayReportsData } = useQuery({
    queryKey: ['employer-delay-reports'],
    queryFn: () => apiRequest<{ reports: any[] }>('/employer/delay-reports'),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Loading organization commute intelligence...
      </div>
    );
  }

  const org = data?.organization;
  const metrics = data?.metrics || {};
  const journeys = data?.activeJourneys || [];
  const incidents = data?.relevantCorridorIncidents || [];
  const pendingDelayReports = (delayReportsData?.reports || []).filter((r: any) => r.status === 'PENDING');

  const handleExportCsv = async () => {
    try {
      await downloadAuthenticatedCsv(
        '/employer/journeys?format=csv',
        'roadalert-authorized-commute-report.csv'
      );
      showToast({
        type: 'success',
        title: 'CSV Export Downloaded',
        message: 'Export action recorded in organization audit log.',
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Export Failed',
        message: err.message,
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="p-6 neu-card rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Organization-Isolated &amp; Consent-Verified
            </span>
            <DemoDataBadge />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {org?.name || 'Employer Commute Verification Operations'}
          </h1>
          <p className="text-xs text-slate-500">
            Displays only explicitly consented employee commute sessions. Precise GPS coordinates are redacted by default.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="btn-primary py-2.5"
          >
            <Download className="w-4 h-4" /> Export Authorized CSV
          </button>
          <Link
            to="/employer/policies"
            className="btn-secondary py-2.5"
          >
            Privacy Policies
          </Link>
        </div>
      </div>

      {pendingDelayReports.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 flex-shrink-0">
              <Sparkles className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950">
                {pendingDelayReports.length} Employee Commute Delay {pendingDelayReports.length === 1 ? 'Claim' : 'Claims'} Awaiting Review
              </p>
              <p className="text-[11px] text-amber-800">
                Submitted through AI Mobility Assistant with photo evidence and corridor correlation.
              </p>
            </div>
          </div>
          <Link
            to="/employer/journeys"
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
          >
            Review Claims Now →
          </Link>
        </div>
      )}

      {/* KPI Row */}
      <StaggerGrid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StaggerItem className="p-4 neu-card rounded-2xl">
          <span className="text-xs font-medium text-slate-500">Authorized Employees</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            <AnimatedNumber value={metrics.authorizedEmployees || 0} />
          </p>
          <span className="text-[11px] text-slate-500">Enrolled in organization</span>
        </StaggerItem>
        <StaggerItem className="p-4 neu-card rounded-2xl">
          <span className="text-xs font-medium text-slate-500">Active Consented Sessions</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            <AnimatedNumber value={metrics.activeConsentedJourneys || 0} />
          </p>
          <span className="text-[11px] text-slate-500">Explicitly started by employee</span>
        </StaggerItem>
        <StaggerItem className="p-4 neu-card rounded-2xl">
          <span className="text-xs font-medium text-slate-500">Delayed Commutes</span>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            <AnimatedNumber value={metrics.delayedCommutes || 0} />
          </p>
          <span className="text-[11px] text-slate-500">Impacted by NH-66 incidents</span>
        </StaggerItem>
        <StaggerItem className="p-4 neu-card rounded-2xl">
          <span className="text-xs font-medium text-slate-500">Avg Incident-Verified Delay</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            <AnimatedNumber value={metrics.avgVerifiedDelayMin || 0} prefix="+" suffix=" min" />
          </p>
          <span className="text-[11px] text-slate-500">Corroborated by corridor evidence</span>
        </StaggerItem>
      </StaggerGrid>

      {/* Active & Recent Consented Journeys Table */}
      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 neu-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">
              Authorized Employee Commute Verification Feed
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Clearly distinguishes estimated route delay from verified incident-backed delay.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-4 font-semibold">Employee</th>
                  <th className="py-3 px-3 font-semibold">Corridor Route</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-3 font-semibold">Est. Delay</th>
                  <th className="py-3 px-3 font-semibold">Verified Delay</th>
                  <th className="py-3 px-4 font-semibold">Privacy Redaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {journeys.map((j: any) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {j.employeeName}
                      {j.demoData && (
                        <div className="mt-0.5">
                          <DemoDataBadge />
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {j.origin} → {j.destination}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold border ${
                          j.status === 'DELAYED'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : j.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-amber-700">
                      +{j.estimatedDelayMin} min
                    </td>
                    <td className="py-3 px-3 font-bold text-emerald-700">
                      +{j.verifiedDelayMin} min (Tier {j.verificationLevel})
                    </td>
                    <td className="py-3 px-4">
                      {j.preciseCoordinatesRedacted ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <Lock className="w-3 h-3" /> Exact GPS Redacted
                        </span>
                      ) : (
                        <span className="text-amber-700 font-medium">Permitted by Consent</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 4 Cols: Relevant Corridor Incident Evidence */}
        <div className="lg:col-span-4 p-5 neu-card rounded-2xl space-y-3">
          <h2 className="text-sm font-bold text-slate-900">
            Corridor Incident Evidence Backing Delays
          </h2>
          <p className="text-xs text-slate-500">
            High-confidence disruptions along employee travel routes:
          </p>
          <div className="space-y-3">
            {incidents.map((inc: any) => (
              <div
                key={inc.id}
                className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <SeverityBadge severity={inc.severity} />
                  <DemoDataBadge isDemo={inc.demo_data} />
                </div>
                <Link
                  to={`/app/incidents/${inc.id}`}
                  className="block text-xs font-bold text-slate-900 hover:text-blue-600"
                >
                  {inc.title}
                </Link>
                <p className="text-[11px] text-slate-500">{inc.road_name}</p>
                <ConfidenceMeter score={Number(inc.confidence_score)} compact />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmployerEmployeesPage() {
  const { data: employees } = useQuery({
    queryKey: ['employer-employees'],
    queryFn: () => apiRequest<any[]>('/employer/employees'),
  });

  return (
    <div className="space-y-5">
      <div className="p-6 neu-card rounded-2xl flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Authorized Organization Members &amp; Consent Status
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict server-side organization isolation prevents viewing employees outside your company.
          </p>
        </div>
        <DemoDataBadge />
      </div>

      <div className="neu-card rounded-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="py-3 px-4 font-semibold">Name</th>
              <th className="py-3 px-4 font-semibold">Email</th>
              <th className="py-3 px-3 font-semibold">Membership Role</th>
              <th className="py-3 px-3 font-semibold">Active Consent Records</th>
              <th className="py-3 px-3 font-semibold">Total Verified Journeys</th>
              <th className="py-3 px-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(employees || []).map((emp: any) => (
              <tr key={emp.id} className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-900">{emp.name}</td>
                <td className="py-3 px-4 text-slate-600">{emp.email}</td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                    {emp.membership_role}
                  </span>
                </td>
                <td className="py-3 px-3 font-bold text-emerald-700">
                  {emp.active_consents_count} active
                </td>
                <td className="py-3 px-3 text-slate-700">{emp.total_journeys_count} session(s)</td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                    {emp.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmployerDelayReportsSection() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'DISPUTED' | 'EVIDENCE_REQUESTED'>('ALL');
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<string>('');
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    name: string;
    employeeName: string;
    reason: string;
    delayMinutes: number;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['employer-delay-reports'],
    queryFn: () => apiRequest<{ reports: any[] }>('/employer/delay-reports'),
  });

  const reports = data?.reports || [];

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, notes }: { id: string; action: string; notes?: string }) =>
      apiRequest(`/employer/delay-reports/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, notes }),
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['employer-delay-reports'] });
      queryClient.invalidateQueries({ queryKey: ['employer-journeys'] });
      queryClient.invalidateQueries({ queryKey: ['employer-dashboard'] });
      setActiveReviewId(null);
      setReviewNote('');
      showToast({
        type: 'success',
        title: 'Review Decision Submitted',
        message: `Report marked as ${vars.action}. Audit trail recorded.`,
      });
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Review Action Failed',
        message: err.message || 'Could not update review status',
      });
    },
  });

  const filteredReports = reports.filter((r) => filter === 'ALL' || r.status === filter);
  const pendingCount = reports.filter((r) => r.status === 'PENDING').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Approved
          </span>
        );
      case 'DISPUTED':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Disputed
          </span>
        );
      case 'EVIDENCE_REQUESTED':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
            Evidence Requested
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Pending Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Reports ({reports.length})
          </button>
          <button
            onClick={() => setFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              filter === 'PENDING'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Pending Review
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter('APPROVED')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'APPROVED'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setFilter('EVIDENCE_REQUESTED')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'EVIDENCE_REQUESTED'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Evidence Requested
          </button>
          <button
            onClick={() => setFilter('DISPUTED')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'DISPUTED'
                ? 'bg-rose-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Disputed
          </button>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Strict organization isolation active</span>
        </div>
      </div>

      {/* Reports List */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-500">
          Loading commute delay evidence submissions...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-8 neu-card rounded-2xl text-center text-xs text-slate-500">
          No commute delay reports found matching this filter.
        </div>
      ) : (
        <div className="grid gap-3.5">
          {filteredReports.map((report: any) => {
            const photoUrl = report.evidence_file_path
              ? report.evidence_file_path.startsWith('http')
                ? report.evidence_file_path
                : `${API_BASE.replace('/api/v1', '')}${report.evidence_file_path}`
              : null;

            return (
              <div
                key={report.id}
                className="p-5 neu-card rounded-2xl border border-slate-200 bg-white space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {report.employee_name || 'Enrolled Employee'}
                      </span>
                      <span className="text-xs text-slate-500">({report.employee_email})</span>
                      {getStatusBadge(report.status)}
                    </div>
                    <p className="text-xs text-blue-600 font-semibold">
                      {report.origin || 'Commute Route'} → {report.destination || 'Workplace'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Submitted: {new Date(report.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-right">
                      <span className="text-[10px] text-amber-700 block font-medium">Claimed Delay</span>
                      <span className="font-extrabold text-amber-900 text-sm">
                        +{report.delay_minutes} min
                      </span>
                    </div>
                    {report.journey_delay_min !== undefined && (
                      <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-right">
                        <span className="text-[10px] text-slate-500 block font-medium">Verified Delay</span>
                        <span className="font-bold text-emerald-700 text-sm">
                          +{report.journey_delay_min} min
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stated Reason */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                  <span className="font-semibold text-slate-900 block mb-1">Employee Reason:</span>
                  <p className="whitespace-pre-line leading-relaxed">{report.delay_reason}</p>
                </div>

                {/* Photo Evidence Section */}
                {photoUrl && (
                  <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        onClick={() =>
                          setSelectedPhoto({
                            url: photoUrl,
                            name: report.evidence_original_name || 'delay-evidence.jpg',
                            employeeName: report.employee_name,
                            reason: report.delay_reason,
                            delayMinutes: report.delay_minutes,
                          })
                        }
                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-300 bg-slate-200 cursor-pointer group flex-shrink-0"
                      >
                        <img
                          src={photoUrl}
                          alt="Delay evidence"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <FileImage className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-xs font-semibold text-slate-800">
                            {report.evidence_original_name || 'Incident Evidence Photo'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          Format: {report.evidence_mime_type || 'image/jpeg'} • Attached from AI Assistant
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPhoto({
                          url: photoUrl,
                          name: report.evidence_original_name || 'delay-evidence.jpg',
                          employeeName: report.employee_name,
                          reason: report.delay_reason,
                          delayMinutes: report.delay_minutes,
                        })
                      }
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Photo Evidence
                    </button>
                  </div>
                )}

                {/* Previous Review Feedback (if any) */}
                {report.reviewed_at && (
                  <div className="p-3 rounded-xl bg-slate-100/60 border border-slate-200 text-xs text-slate-600 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">Employer Review Decision:</span>
                      <span className="text-[11px] text-slate-500">
                        Evaluated {new Date(report.reviewed_at).toLocaleString()}
                      </span>
                    </div>
                    {report.reviewer_notes ? (
                      <p className="text-slate-700 italic">"{report.reviewer_notes}"</p>
                    ) : (
                      <p className="text-slate-400 italic">No additional reviewer comments provided.</p>
                    )}
                  </div>
                )}

                {/* Review Action Controls */}
                <div className="pt-2 border-t border-slate-100">
                  {activeReviewId === report.id ? (
                    <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Reviewer Comments / Decision Notes (Optional):
                        </label>
                        <input
                          type="text"
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="e.g. Verified against NH-66 tree fall incident log."
                          className="enterprise-input py-2 text-xs"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={reviewMutation.isPending}
                          onClick={() =>
                            reviewMutation.mutate({
                              id: report.id,
                              action: 'APPROVE',
                              notes: reviewNote,
                            })
                          }
                          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve Delay (+{report.delay_minutes}m)
                        </button>

                        <button
                          type="button"
                          disabled={reviewMutation.isPending}
                          onClick={() =>
                            reviewMutation.mutate({
                              id: report.id,
                              action: 'REQUEST_EVIDENCE',
                              notes: reviewNote,
                            })
                          }
                          className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          Request More Evidence
                        </button>

                        <button
                          type="button"
                          disabled={reviewMutation.isPending}
                          onClick={() =>
                            reviewMutation.mutate({
                              id: report.id,
                              action: 'DISPUTE',
                              notes: reviewNote,
                            })
                          }
                          className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Dispute Claim
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveReviewId(null);
                            setReviewNote('');
                          }}
                          className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        {report.status === 'PENDING'
                          ? 'Awaiting employer verification decision'
                          : `Status: ${report.status}`}
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveReviewId(report.id);
                          setReviewNote(report.reviewer_notes || '');
                        }}
                        className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1"
                      >
                        {report.status === 'PENDING' ? 'Take Review Decision' : 'Change Decision'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Preview Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedPhoto.name}</h3>
                <p className="text-xs text-slate-500">
                  Uploaded by {selectedPhoto.employeeName} • Claimed +{selectedPhoto.delayMinutes} min
                </p>
              </div>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-950 flex items-center justify-center overflow-auto flex-1">
              <img
                src={selectedPhoto.url}
                alt="Full evidence"
                className="max-h-[60vh] max-w-full object-contain rounded-lg"
              />
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-600 italic truncate mr-2">
                Reason: "{selectedPhoto.reason}"
              </span>
              <a
                href={selectedPhoto.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 flex-shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open in New Tab
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmployerJourneysAndReportsPage({ mode }: { mode: 'journeys' | 'reports' }) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'delay-reports' | 'all-journeys'>('delay-reports');

  const { data: journeys } = useQuery({
    queryKey: ['employer-journeys'],
    queryFn: () => apiRequest<any[]>('/employer/journeys'),
  });

  const { data: delayReportsData } = useQuery({
    queryKey: ['employer-delay-reports'],
    queryFn: () => apiRequest<{ reports: any[] }>('/employer/delay-reports'),
  });

  const pendingCount = (delayReportsData?.reports || []).filter((r: any) => r.status === 'PENDING').length;

  const handleDownloadCsv = async () => {
    try {
      await downloadAuthenticatedCsv(
        '/employer/journeys?format=csv',
        'roadalert-commute-delay-verification.csv'
      );
      showToast({
        type: 'success',
        title: 'CSV Report Exported',
        message: 'Authorized commute delay report downloaded.',
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Export error', message: err.message });
    }
  };

  return (
    <div className="space-y-5">
      <div className="p-6 neu-card rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {mode === 'reports'
              ? 'Authorized Commute Verification Reports & Evidence Review'
              : 'Consented Employee Commute Sessions & Delay Claims'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Every review decision, access, and export is recorded in the immutable organization audit trail.
          </p>
        </div>
        <div className="flex items-center gap-2.5 no-print">
          <button
            onClick={() => window.print()}
            className="btn-secondary"
          >
            <Printer className="w-4 h-4" /> Print Report View
          </button>
          <button
            onClick={handleDownloadCsv}
            className="btn-primary"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('delay-reports')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'delay-reports'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Delay Evidence Claims (AI Assistant)
          {pendingCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'delay-reports'
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('all-journeys')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'all-journeys'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          Consented Commute Sessions ({journeys?.length || 0})
        </button>
      </div>

      {/* Content based on Active Tab */}
      {activeTab === 'delay-reports' ? (
        <EmployerDelayReportsSection />
      ) : (
        <div className="grid gap-3.5">
          {(journeys || []).map((j: any) => (
            <div
              key={j.id}
              className="p-5 neu-card rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">{j.employeeName}</span>
                  <span className="text-xs text-slate-500">({j.employeeEmail})</span>
                  <DemoDataBadge isDemo={j.demoData} />
                </div>
                <p className="text-xs text-blue-600 font-semibold">
                  {j.origin} → {j.destination}
                </p>
                <p className="text-[11px] text-slate-500">
                  Started: {new Date(j.startedAt).toLocaleString()} • Policy: {j.consentPolicyVersion}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Estimated Delay</span>
                  <span className="font-bold text-amber-700">+{j.estimatedDelayMin} min</span>
                </div>
                <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Verified Delay Proof</span>
                  <span className="font-bold text-emerald-700">+{j.verifiedDelayMin} min</span>
                </div>
                <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Verification Tier</span>
                  <span className="font-bold text-blue-600">Level {j.verificationLevel}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmployerPoliciesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: policies } = useQuery({
    queryKey: ['employer-policies'],
    queryFn: () => apiRequest<any[]>('/employer/policies'),
  });

  const policy = policies?.[0];
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [allowPreciseCoordinate, setAllowPreciseCoordinate] = useState<boolean>(false);

  React.useEffect(() => {
    if (policy) {
      setRetentionDays(Number(policy.retention_days || 30));
      setAllowPreciseCoordinate(Boolean(policy.allow_precise_coordinate));
    }
  }, [policy]);

  const updatePolicyMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/employer/policies/${policy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          retentionDays: Number(retentionDays),
          allowPreciseCoordinate,
          requireConsent: true,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer-policies'] });
      queryClient.invalidateQueries({ queryKey: ['employer-dashboard'] });
      showToast({
        type: 'success',
        title: 'Organization Tracking Policy Updated',
        message: 'Policy change saved and recorded in the audit trail.',
      });
    },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="p-6 neu-card rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600" /> Organization Commute Tracking Policy
          </h1>
          <DemoDataBadge />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Configure data retention limits and coordinate redaction rules for{' '}
          <strong>{policy?.organization_name || 'your organization'}</strong>. Mandatory employee
          consent cannot be disabled.
        </p>

        {policy && (
          <div className="space-y-4 pt-2 text-xs">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">Tracking Mode</p>
                <p className="text-slate-600">
                  SESSION_ONLY_EXPLICIT — 24/7 background tracking is strictly prohibited
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">
                ENFORCED
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Commute Record Retention Window (Days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="enterprise-input py-2.5"
              />
            </div>

            <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <input
                id="allowPrecise"
                type="checkbox"
                checked={allowPreciseCoordinate}
                onChange={(e) => setAllowPreciseCoordinate(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <label htmlFor="allowPrecise" className="text-slate-700">
                Allow viewing precise coordinates ONLY when the employee also explicitly opts in
                (Recommended: Leave unchecked to enforce corridor-only redaction)
              </label>
            </div>

            <button
              onClick={() => updatePolicyMutation.mutate()}
              disabled={updatePolicyMutation.isPending}
              className="btn-primary py-2.5 px-5"
            >
              {updatePolicyMutation.isPending ? 'Saving...' : 'Save Organization Policy'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
