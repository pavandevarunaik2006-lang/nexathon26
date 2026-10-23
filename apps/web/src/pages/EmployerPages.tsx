import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Lock,
  Download,
  Printer,
} from 'lucide-react';
import { apiRequest, downloadAuthenticatedCsv } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { DemoDataBadge, SeverityBadge, ConfidenceMeter } from '../components/Badges';
import { AnimatedNumber, StaggerGrid, StaggerItem } from '../components/MotionPrimitives';

export function EmployerDashboardPage() {
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['employer-dashboard'],
    queryFn: () => apiRequest<any>('/employer/dashboard'),
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
      <div className="p-6 enterprise-card flex flex-wrap items-center justify-between gap-4">
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

      {/* KPI Row */}
      <StaggerGrid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StaggerItem className="p-4 enterprise-card">
          <span className="text-xs font-medium text-slate-500">Authorized Employees</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            <AnimatedNumber value={metrics.authorizedEmployees || 0} />
          </p>
          <span className="text-[11px] text-slate-500">Enrolled in organization</span>
        </StaggerItem>
        <StaggerItem className="p-4 enterprise-card">
          <span className="text-xs font-medium text-slate-500">Active Consented Sessions</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            <AnimatedNumber value={metrics.activeConsentedJourneys || 0} />
          </p>
          <span className="text-[11px] text-slate-500">Explicitly started by employee</span>
        </StaggerItem>
        <StaggerItem className="p-4 enterprise-card">
          <span className="text-xs font-medium text-slate-500">Delayed Commutes</span>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            <AnimatedNumber value={metrics.delayedCommutes || 0} />
          </p>
          <span className="text-[11px] text-slate-500">Impacted by NH-66 incidents</span>
        </StaggerItem>
        <StaggerItem className="p-4 enterprise-card">
          <span className="text-xs font-medium text-slate-500">Avg Incident-Verified Delay</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            <AnimatedNumber value={metrics.avgVerifiedDelayMin || 0} prefix="+" suffix=" min" />
          </p>
          <span className="text-[11px] text-slate-500">Corroborated by corridor evidence</span>
        </StaggerItem>
      </StaggerGrid>

      {/* Active & Recent Consented Journeys Table */}
      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 enterprise-card overflow-hidden">
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
        <div className="lg:col-span-4 p-5 enterprise-card space-y-3">
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
      <div className="p-6 enterprise-card flex items-center justify-between">
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

      <div className="enterprise-card overflow-x-auto">
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
    <div className="space-y-5">
      <div className="p-6 enterprise-card flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {mode === 'reports'
              ? 'Authorized Commute Verification Reports & CSV Export'
              : 'Consented Employee Commute Sessions'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Every access and export is logged in the immutable organization audit trail.
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

      <div className="grid gap-3.5">
        {(journeys || []).map((j: any) => (
          <div
            key={j.id}
            className="p-5 enterprise-card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
      <div className="p-6 enterprise-card space-y-4">
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
