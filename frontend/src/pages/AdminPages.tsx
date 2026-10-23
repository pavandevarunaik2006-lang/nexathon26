import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { USER_ROLES } from '@roadalert/shared';
import { apiRequest } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { DemoDataBadge } from '../components/Badges';
import { AnimatedNumber, StaggerGrid, StaggerItem } from '../components/MotionPrimitives';

export function AdminDashboardPage() {
  const { data } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiRequest<any>('/admin/dashboard'),
  });

  const { data: logs } = useQuery({
    queryKey: ['admin-audit-logs-preview'],
    queryFn: () => apiRequest<any[]>('/admin/audit-logs?limit=12'),
  });

  return (
    <div className="space-y-5">
      <div className="p-6 neu-card rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
              Platform Administration &amp; Governance
            </span>
            <DemoDataBadge />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            RoadAlert System Administration &amp; Audit Control
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage users, organizations, verification queues, complaints, and immutable audit trails.
          </p>
        </div>
      </div>

      <StaggerGrid className="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
        <StaggerItem>
          <Link
            to="/admin/users"
            className="block p-4 neu-card rounded-2xl hover:border-blue-400 transition-colors"
          >
            <span className="text-xs font-medium text-slate-500">Users</span>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedNumber value={data?.totalUsers ?? 0} />
            </p>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link
            to="/admin/organizations"
            className="block p-4 neu-card rounded-2xl hover:border-blue-400 transition-colors"
          >
            <span className="text-xs font-medium text-slate-500">Organizations</span>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              <AnimatedNumber value={data?.totalOrganizations ?? 0} />
            </p>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link
            to="/admin/incidents"
            className="block p-4 neu-card rounded-2xl hover:border-blue-400 transition-colors"
          >
            <span className="text-xs font-medium text-slate-500">Total Incidents</span>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              <AnimatedNumber value={data?.totalIncidents ?? 0} />
            </p>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link
            to="/admin/complaints"
            className="block p-4 neu-card rounded-2xl hover:border-blue-400 transition-colors"
          >
            <span className="text-xs font-medium text-slate-500">Open Complaints</span>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              <AnimatedNumber value={data?.openComplaints ?? 0} />
            </p>
          </Link>
        </StaggerItem>
        <StaggerItem className="p-4 neu-card rounded-2xl">
          <span className="text-xs font-medium text-slate-500">Active Commutes</span>
          <p className="text-2xl font-bold text-sky-600 mt-1">
            <AnimatedNumber value={data?.activeJourneys ?? 0} />
          </p>
        </StaggerItem>
        <StaggerItem>
          <Link
            to="/admin/audit-logs"
            className="block p-4 neu-card rounded-2xl hover:border-blue-400 transition-colors"
          >
            <span className="text-xs font-medium text-slate-500">Audit Events</span>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedNumber value={data?.totalAuditLogs ?? 0} />
            </p>
          </Link>
        </StaggerItem>
      </StaggerGrid>

      {/* Recent Audit Logs */}
      <div className="p-6 neu-card rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Recent System Audit Logs</h2>
          <Link to="/admin/audit-logs" className="text-xs font-semibold text-blue-600 hover:underline">
            View Full Audit Log →
          </Link>
        </div>
        <div className="space-y-2">
          {(logs || []).map((log: any) => (
            <div
              key={log.id}
              className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <span className="font-mono font-bold text-blue-700">{log.action}</span>
                <span className="text-slate-600 ml-2">
                  ({log.entity_type} • {log.actor_name || 'System'})
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [confirmUser, setConfirmUser] = useState<{
    id: string;
    name: string;
    role: string;
    status: string;
  } | null>(null);

  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiRequest<any[]>('/admin/users'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; role: string; status: string }) =>
      apiRequest(`/admin/users/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: payload.role,
          status: payload.status,
          reason: 'Admin governance update with explicit confirmation',
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setConfirmUser(null);
      showToast({
        type: 'success',
        title: 'User Account Updated',
        message: 'Role/status change saved and recorded in audit logs.',
      });
    },
  });

  return (
    <div className="space-y-5">
      <div className="p-6 neu-card rounded-2xl flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">User &amp; Role Access Governance</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Explicit confirmation is required before changing privileged roles or suspending accounts (soft archival).
          </p>
        </div>
        <DemoDataBadge />
      </div>

      {confirmUser && (
        <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div>
            <p className="font-bold text-amber-900 text-sm">
              Confirm Administrative Change for {confirmUser.name}
            </p>
            <p className="text-amber-800 mt-0.5">
              Set Role to <strong>{confirmUser.role}</strong> and Status to{' '}
              <strong>{confirmUser.status}</strong>? This action will be written to the immutable audit trail.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateMutation.mutate(confirmUser)}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              Confirm &amp; Audit Change
            </button>
            <button
              onClick={() => setConfirmUser(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="neu-card rounded-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="py-3 px-4 font-semibold">Name</th>
              <th className="py-3 px-4 font-semibold">Email</th>
              <th className="py-3 px-3 font-semibold">Role</th>
              <th className="py-3 px-3 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Quick Governance Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(users || []).map((u: any) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                <td className="py-3 px-4 text-slate-600">{u.email}</td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                    {u.role}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`px-2 py-0.5 rounded font-bold border ${
                      u.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="py-3 px-4 flex items-center gap-2">
                  <select
                    defaultValue={u.role}
                    onChange={(e) =>
                      setConfirmUser({
                        id: u.id,
                        name: u.name,
                        role: e.target.value,
                        status: u.status,
                      })
                    }
                    className="enterprise-select py-1 px-2.5"
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      setConfirmUser({
                        id: u.id,
                        name: u.name,
                        role: u.role,
                        status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                      })
                    }
                    className="btn-secondary py-1 px-2.5"
                  >
                    {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminOrganizationsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [organizationType, setOrganizationType] = useState('IT_ENTERPRISE');

  const { data: orgs } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: () => apiRequest<any[]>('/admin/organizations'),
  });

  const createOrgMutation = useMutation({
    mutationFn: () =>
      apiRequest('/admin/organizations', {
        method: 'POST',
        body: JSON.stringify({ name, organizationType }),
      }),
    onSuccess: () => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] });
      showToast({
        type: 'success',
        title: 'Organization Created',
        message: 'Default privacy-first tracking policy initialized.',
      });
    },
  });

  return (
    <div className="space-y-5">
      <div className="p-6 neu-card rounded-2xl space-y-4">
        <h1 className="text-lg font-bold text-slate-900">
          Organizations &amp; Commute Policy Isolation
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createOrgMutation.mutate();
          }}
          className="flex flex-wrap items-center gap-3 text-xs"
        >
          <input
            type="text"
            required
            minLength={3}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Organization Name (e.g., Mangaluru Port Logistics Ltd)..."
            className="enterprise-input flex-1 min-w-[240px] py-2.5"
          />
          <select
            value={organizationType}
            onChange={(e) => setOrganizationType(e.target.value)}
            className="enterprise-select py-2.5"
          >
            <option value="IT_ENTERPRISE">IT_ENTERPRISE</option>
            <option value="LOGISTICS_PORT">LOGISTICS_PORT</option>
            <option value="FINANCIAL_SERVICES">FINANCIAL_SERVICES</option>
            <option value="HEALTHCARE_EDUCATION">HEALTHCARE_EDUCATION</option>
          </select>
          <button
            type="submit"
            disabled={createOrgMutation.isPending}
            className="btn-primary py-2.5"
          >
            <Plus className="w-4 h-4" /> Add Organization
          </button>
        </form>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(orgs || []).map((o: any) => (
          <div
            key={o.id}
            className="p-5 neu-card rounded-2xl space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">{o.name}</h2>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                {o.status}
              </span>
            </div>
            <p className="text-slate-500">
              Type: {o.organization_type} • Members: {o.member_count}
            </p>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <p className="text-slate-700">
                Tracking Mode: <strong className="text-blue-600">{o.tracking_mode}</strong>
              </p>
              <p className="text-slate-500">
                Retention: {o.retention_days} days • Require Explicit Consent:{' '}
                {o.require_consent ? 'Yes' : 'No'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminComplaintsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: complaints } = useQuery({
    queryKey: ['admin-complaints'],
    queryFn: () => apiRequest<any[]>('/admin/complaints'),
  });

  const updateComplaint = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest(`/admin/complaints/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason: 'Admin complaint review' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-complaints'] });
      showToast({
        type: 'success',
        title: 'Complaint Status Updated',
        message: 'Recorded in administrative audit trail.',
      });
    },
  });

  return (
    <div className="space-y-5">
      <div className="p-6 neu-card rounded-2xl flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Flagged Incident Complaints &amp; Dispute Queue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review commuter flags for duplicate or inaccurate incident reports.
          </p>
        </div>
        <DemoDataBadge />
      </div>

      <div className="space-y-3">
        {(complaints || []).map((c: any) => (
          <div
            key={c.id}
            className="p-5 neu-card rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                  {c.status}
                </span>
                <Link
                  to={`/app/incidents/${c.incident_id}`}
                  className="font-bold text-sm text-slate-900 hover:text-blue-600"
                >
                  {c.incident_title}
                </Link>
              </div>
              <p className="text-slate-700">{c.reason}</p>
              <p className="text-[11px] text-slate-500">
                Flagged by {c.reporter_name} • Road: {c.road_name}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => updateComplaint.mutate({ id: c.id, status: 'ACTIONED' })}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold"
              >
                Mark Actioned
              </button>
              <button
                onClick={() => updateComplaint.mutate({ id: c.id, status: 'DISMISSED' })}
                className="btn-secondary py-1.5 px-3"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminAuditLogsPage() {
  const [entityType, setEntityType] = useState('ALL');
  const { data: logs } = useQuery({
    queryKey: ['admin-audit-logs', entityType],
    queryFn: () =>
      apiRequest<any[]>(
        `/admin/audit-logs?entityType=${entityType}&limit=100`
      ),
  });

  return (
    <div className="space-y-5">
      <div className="p-6 neu-card rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Immutable System Audit Trail</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tracks confidence recalculations, authority decisions, employer data access, consent changes, and admin updates.
          </p>
        </div>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="enterprise-select"
        >
          <option value="ALL">All Entity Types</option>
          <option value="INCIDENT">INCIDENT</option>
          <option value="ORGANIZATION">ORGANIZATION</option>
          <option value="CONSENT">CONSENT</option>
          <option value="JOURNEY">JOURNEY</option>
          <option value="USER">USER</option>
        </select>
      </div>

      <div className="neu-card rounded-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="py-3 px-4 font-semibold">Timestamp</th>
              <th className="py-3 px-3 font-semibold">Action</th>
              <th className="py-3 px-3 font-semibold">Entity</th>
              <th className="py-3 px-3 font-semibold">Actor</th>
              <th className="py-3 px-4 font-semibold">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(logs || []).map((log: any) => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{log.action}</td>
                <td className="py-2.5 px-3 text-slate-600">{log.entity_type}</td>
                <td className="py-2.5 px-3 font-medium text-slate-900">
                  {log.actor_name || 'System'} ({log.actor_role || 'AUTO'})
                </td>
                <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 max-w-md truncate">
                  {JSON.stringify(log.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminSettingsPage() {
  const { data: configs } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => apiRequest<any[]>('/admin/settings'),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="p-6 neu-card rounded-2xl space-y-4">
        <h1 className="text-lg font-bold text-slate-900">
          System Configuration &amp; Verification Heuristic Weights
        </h1>
        <p className="text-xs text-slate-500">
          Current server-side configuration parameters persisted in PostgreSQL:
        </p>
        <div className="space-y-3">
          {(configs || []).map((cfg: any) => (
            <div
              key={cfg.key}
              className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-blue-700">{cfg.key}</span>
                <span className="text-slate-500">
                  Updated: {new Date(cfg.updated_at).toLocaleString()}
                </span>
              </div>
              <pre className="p-3 rounded-lg bg-white border border-slate-200 text-slate-800 overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(cfg.value, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
