import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Users,
  Briefcase,
  Lock,
  FileSpreadsheet,
  Download,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Printer,
} from 'lucide-react';
import { apiRequest, downloadAuthenticatedCsv } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { DemoDataBadge, SeverityBadge, ConfidenceMeter } from '../components/Badges';

export function EmployerDashboardPage() {
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['employer-dashboard'],
    queryFn: () => apiRequest<any>('/employer/dashboard'),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        Loading organization commute intelligence...
      </div>
    );
  }

  const org = data?.organization;
  const metrics = data?.metrics || {};
  const journeys = data?.activeJourneys || [];
  const incidents = data?.relevantCorridorIncidents || [];

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
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Organization-Isolated &amp; Consent-Verified
            </span>
            <DemoDataBadge />
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {org?.name || 'Employer Commute Verification Operations'}
          </h1>
          <p className="text-xs text-slate-400">
            Displays only explicitly consented employee commute sessions. Precise GPS coordinates are redacted by default.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20"
          >
            <Download className="w-4 h-4" /> Export Authorized CSV
          </button>
          <Link
            to="/employer/policies"
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
          >
            Privacy Policies
          </Link>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Authorized Employees</span>
          <p className="text-3xl font-extrabold text-white mt-1">
            {metrics.authorizedEmployees || 0}
          </p>
          <span className="text-[11px] text-slate-400">Enrolled in organization</span>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Active Consented Sessions</span>
          <p className="text-3xl font-extrabold text-emerald-400 mt-1">
            {metrics.activeConsentedJourneys || 0}
          </p>
          <span className="text-[11px] text-slate-400">Explicitly started by employee</span>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Delayed Commutes</span>
          <p className="text-3xl font-extrabold text-amber-300 mt-1">
            {metrics.delayedCommutes || 0}
          </p>
          <span className="text-[11px] text-slate-400">Impacted by NH-66 incidents</span>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Avg Incident-Verified Delay</span>
          <p className="text-3xl font-extrabold text-cyan-300 mt-1">
            +{metrics.avgVerifiedDelayMin || 0} min
          </p>
          <span className="text-[11px] text-slate-400">Corroborated by corridor evidence</span>
        </div>
      </div>

      {/* Active & Recent Consented Journeys Table */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">
                Authorized Employee Commute Verification Feed
              </h2>
              <p className="text-xs text-slate-400">
                Clearly distinguishes estimated route delay from verified incident-backed delay.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Corridor Route</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Est. Delay</th>
                  <th className="py-2.5 px-3">Verified Delay</th>
                  <th className="py-2.5 px-3">Privacy Redaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {journeys.map((j: any) => (
                  <tr key={j.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-semibold text-white">
                      {j.employeeName}
                      {j.demoData && (
                        <div className="mt-0.5">
                          <DemoDataBadge />
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {j.origin} → {j.destination}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          j.status === 'DELAYED'
                            ? 'bg-amber-500/20 text-amber-300'
                            : j.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-amber-300">
                      +{j.estimatedDelayMin} min
                    </td>
                    <td className="py-3 px-3 font-bold text-emerald-300">
                      +{j.verifiedDelayMin} min (Tier {j.verificationLevel})
                    </td>
                    <td className="py-3 px-3">
                      {j.preciseCoordinatesRedacted ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                          <Lock className="w-3 h-3" /> Exact GPS Redacted
                        </span>
                      ) : (
                        <span className="text-amber-300">Permitted by Consent</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 4 Cols: Relevant Corridor Incident Evidence */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h2 className="text-sm font-bold text-white">
            Corridor Incident Evidence Backing Delays
          </h2>
          <p className="text-xs text-slate-400">
            High-confidence disruptions along employee travel routes:
          </p>
          <div className="space-y-3">
            {incidents.map((inc: any) => (
              <div
                key={inc.id}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <SeverityBadge severity={inc.severity} />
                  <DemoDataBadge isDemo={inc.demo_data} />
                </div>
                <Link
                  to={`/app/incidents/${inc.id}`}
                  className="block text-xs font-bold text-white hover:text-cyan-300"
                >
                  {inc.title}
                </Link>
                <p className="text-[11px] text-slate-400">{inc.road_name}</p>
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
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            Authorized Organization Members &amp; Consent Status
          </h1>
          <p className="text-xs text-slate-400">
            Strict server-side organization isolation prevents viewing employees outside your company.
          </p>
        </div>
        <DemoDataBadge />
      </div>

      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-3 px-3">Name</th>
              <th className="py-3 px-3">Email</th>
              <th className="py-3 px-3">Membership Role</th>
              <th className="py-3 px-3">Active Consent Records</th>
              <th className="py-3 px-3">Total Verified Journeys</th>
              <th className="py-3 px-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {(employees || []).map((emp: any) => (
              <tr key={emp.id}>
                <td className="py-3 px-3 font-bold text-white">{emp.name}</td>
                <td className="py-3 px-3 text-slate-300">{emp.email}</td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-semibold">
                    {emp.membership_role}
                  </span>
                </td>
                <td className="py-3 px-3 font-bold text-emerald-300">
                  {emp.active_consents_count} active
                </td>
                <td className="py-3 px-3 text-slate-300">{emp.total_journeys_count} session(s)</td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
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

export function EmployerJourneysAndReportsPage({ mode }: { mode: 'journeys' | 'reports' }) {
  const { showToast } = useToast();
  const { data: journeys } = useQuery({
    queryKey: ['employer-journeys'],
    queryFn: () => apiRequest<any[]>('/employer/journeys'),
  });

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
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">
            {mode === 'reports'
              ? 'Authorized Commute Verification Reports & CSV Export'
              : 'Consented Employee Commute Sessions'}
          </h1>
          <p className="text-xs text-slate-400">
            Every access and export is logged in the immutable organization audit trail.
          </p>
        </div>
        <div className="flex items-center gap-2.5 no-print">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
          >
            <Printer className="w-4 h-4" /> Print Report View
          </button>
          <button
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {(journeys || []).map((j: any) => (
          <div
            key={j.id}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">{j.employeeName}</span>
                <span className="text-xs text-slate-400">({j.employeeEmail})</span>
                <DemoDataBadge isDemo={j.demoData} />
              </div>
              <p className="text-xs text-cyan-300 font-semibold">
                {j.origin} → {j.destination}
              </p>
              <p className="text-[11px] text-slate-400">
                Started: {new Date(j.startedAt).toLocaleString()} • Policy: {j.consentPolicyVersion}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Estimated Delay</span>
                <span className="font-bold text-amber-300">+{j.estimatedDelayMin} min</span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Verified Delay Proof</span>
                <span className="font-bold text-emerald-300">+{j.verifiedDelayMin} min</span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Verification Tier</span>
                <span className="font-bold text-cyan-300">Level {j.verificationLevel}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-400" /> Organization Commute Tracking Policy
          </h1>
          <DemoDataBadge />
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Configure data retention limits and coordinate redaction rules for{' '}
          <strong>{policy?.organization_name || 'your organization'}</strong>. Mandatory employee
          consent cannot be disabled.
        </p>

        {policy && (
          <div className="space-y-4 pt-2 text-xs">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-bold text-white">Tracking Mode</p>
                <p className="text-slate-400">
                  SESSION_ONLY_EXPLICIT — 24/7 background tracking is strictly prohibited
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                ENFORCED
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Commute Record Retention Window (Days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
              />
            </div>

            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <input
                id="allowPrecise"
                type="checkbox"
                checked={allowPreciseCoordinate}
                onChange={(e) => setAllowPreciseCoordinate(e.target.checked)}
                className="w-4 h-4 rounded accent-cyan-500"
              />
              <label htmlFor="allowPrecise" className="text-slate-300">
                Allow viewing precise coordinates ONLY when the employee also explicitly opts in
                (Recommended: Leave unchecked to enforce corridor-only redaction)
              </label>
            </div>

            <button
              onClick={() => updatePolicyMutation.mutate()}
              disabled={updatePolicyMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
            >
              {updatePolicyMutation.isPending ? 'Saving...' : 'Save Organization Policy'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
