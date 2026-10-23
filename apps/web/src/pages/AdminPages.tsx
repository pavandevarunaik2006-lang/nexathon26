import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Building2,
  Scale,
  History,
  Settings,
  ShieldCheck,
  AlertOctagon,
  Plus,
} from 'lucide-react';
import { USER_ROLES } from '@roadalert/shared';
import { apiRequest } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { DemoDataBadge, SeverityBadge, StatusBadge, ConfidenceMeter } from '../components/Badges';

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
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
              Platform Administration &amp; Governance
            </span>
            <DemoDataBadge />
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            RoadAlert System Administration &amp; Audit Control
          </h1>
          <p className="text-xs text-slate-400">
            Manage users, organizations, verification queues, complaints, and immutable audit trails.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Link
          to="/admin/users"
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40"
        >
          <span className="text-xs text-slate-400">Users</span>
          <p className="text-2xl font-extrabold text-white mt-1">{data?.totalUsers ?? 0}</p>
        </Link>
        <Link
          to="/admin/organizations"
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40"
        >
          <span className="text-xs text-slate-400">Organizations</span>
          <p className="text-2xl font-extrabold text-cyan-300 mt-1">
            {data?.totalOrganizations ?? 0}
          </p>
        </Link>
        <Link
          to="/admin/incidents"
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40"
        >
          <span className="text-xs text-slate-400">Total Incidents</span>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">
            {data?.totalIncidents ?? 0}
          </p>
        </Link>
        <Link
          to="/admin/complaints"
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40"
        >
          <span className="text-xs text-slate-400">Open Complaints</span>
          <p className="text-2xl font-extrabold text-amber-300 mt-1">
            {data?.openComplaints ?? 0}
          </p>
        </Link>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Active Commutes</span>
          <p className="text-2xl font-extrabold text-indigo-300 mt-1">
            {data?.activeJourneys ?? 0}
          </p>
        </div>
        <Link
          to="/admin/audit-logs"
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40"
        >
          <span className="text-xs text-slate-400">Audit Events</span>
          <p className="text-2xl font-extrabold text-white mt-1">{data?.totalAuditLogs ?? 0}</p>
        </Link>
      </div>

      {/* Recent Audit Logs */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Recent System Audit Logs</h2>
          <Link to="/admin/audit-logs" className="text-xs text-cyan-400 hover:underline">
            View Full Audit Log →
          </Link>
        </div>
        <div className="space-y-2">
          {(logs || []).map((log: any) => (
            <div
              key={log.id}
              className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <span className="font-mono font-bold text-cyan-300">{log.action}</span>
                <span className="text-slate-400 ml-2">
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
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">User &amp; Role Access Governance</h1>
          <p className="text-xs text-slate-400">
            Explicit confirmation is required before changing privileged roles or suspending accounts (soft archival).
          </p>
        </div>
        <DemoDataBadge />
      </div>

      {confirmUser && (
        <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div>
            <p className="font-bold text-amber-200 text-sm">
              Confirm Administrative Change for {confirmUser.name}
            </p>
            <p className="text-amber-100/80 mt-0.5">
              Set Role to <strong>{confirmUser.role}</strong> and Status to{' '}
              <strong>{confirmUser.status}</strong>? This action will be written to the immutable audit trail.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateMutation.mutate(confirmUser)}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold"
            >
              Confirm &amp; Audit Change
            </button>
            <button
              onClick={() => setConfirmUser(null)}
              className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2.5 px-3">Name</th>
              <th className="py-2.5 px-3">Email</th>
              <th className="py-2.5 px-3">Role</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Quick Governance Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {(users || []).map((u: any) => (
              <tr key={u.id}>
                <td className="py-3 px-3 font-bold text-white">{u.name}</td>
                <td className="py-3 px-3 text-slate-300">{u.email}</td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold">
                    {u.role}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      u.status === 'ACTIVE'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-red-500/15 text-red-300'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="py-3 px-3 flex items-center gap-2">
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
                    className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white"
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
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
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
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h1 className="text-xl font-bold text-white">
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
            className="flex-1 min-w-[240px] px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
          />
          <select
            value={organizationType}
            onChange={(e) => setOrganizationType(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
          >
            <option value="IT_ENTERPRISE">IT_ENTERPRISE</option>
            <option value="LOGISTICS_PORT">LOGISTICS_PORT</option>
            <option value="FINANCIAL_SERVICES">FINANCIAL_SERVICES</option>
            <option value="HEALTHCARE_EDUCATION">HEALTHCARE_EDUCATION</option>
          </select>
          <button
            type="submit"
            disabled={createOrgMutation.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
          >
            <Plus className="w-4 h-4" /> Add Organization
          </button>
        </form>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(orgs || []).map((o: any) => (
          <div
            key={o.id}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">{o.name}</h2>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                {o.status}
              </span>
            </div>
            <p className="text-slate-400">
              Type: {o.organization_type} • Members: {o.member_count}
            </p>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <p className="text-slate-300">
                Tracking Mode: <strong className="text-cyan-300">{o.tracking_mode}</strong>
              </p>
              <p className="text-slate-400">
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
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            Flagged Incident Complaints &amp; Dispute Queue
          </h1>
          <p className="text-xs text-slate-400">
            Review commuter flags for duplicate or inaccurate incident reports.
          </p>
        </div>
        <DemoDataBadge />
      </div>

      <div className="space-y-3">
        {(complaints || []).map((c: any) => (
          <div
            key={c.id}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                  {c.status}
                </span>
                <Link
                  to={`/app/incidents/${c.incident_id}`}
                  className="font-bold text-sm text-white hover:text-cyan-300"
                >
                  {c.incident_title}
                </Link>
              </div>
              <p className="text-slate-300">{c.reason}</p>
              <p className="text-[11px] text-slate-400">
                Flagged by {c.reporter_name} • Road: {c.road_name}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => updateComplaint.mutate({ id: c.id, status: 'ACTIONED' })}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold"
              >
                Mark Actioned
              </button>
              <button
                onClick={() => updateComplaint.mutate({ id: c.id, status: 'DISMISSED' })}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300"
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
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Immutable System Audit Trail</h1>
          <p className="text-xs text-slate-400">
            Tracks confidence recalculations, authority decisions, employer data access, consent changes, and admin updates.
          </p>
        </div>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
        >
          <option value="ALL">All Entity Types</option>
          <option value="INCIDENT">INCIDENT</option>
          <option value="ORGANIZATION">ORGANIZATION</option>
          <option value="CONSENT">CONSENT</option>
          <option value="JOURNEY">JOURNEY</option>
          <option value="USER">USER</option>
        </select>
      </div>

      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2.5 px-3">Timestamp</th>
              <th className="py-2.5 px-3">Action</th>
              <th className="py-2.5 px-3">Entity</th>
              <th className="py-2.5 px-3">Actor</th>
              <th className="py-2.5 px-3">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {(logs || []).map((log: any) => (
              <tr key={log.id}>
                <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="py-2.5 px-3 font-mono font-bold text-cyan-300">{log.action}</td>
                <td className="py-2.5 px-3 text-slate-300">{log.entity_type}</td>
                <td className="py-2.5 px-3 text-white">
                  {log.actor_name || 'System'} ({log.actor_role || 'AUTO'})
                </td>
                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 max-w-md truncate">
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h1 className="text-xl font-bold text-white">
          System Configuration &amp; Verification Heuristic Weights
        </h1>
        <p className="text-xs text-slate-400">
          Current server-side configuration parameters persisted in PostgreSQL:
        </p>
        <div className="space-y-3">
          {(configs || []).map((cfg: any) => (
            <div
              key={cfg.key}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-cyan-300">{cfg.key}</span>
                <span className="text-slate-500">
                  Updated: {new Date(cfg.updated_at).toLocaleString()}
                </span>
              </div>
              <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(cfg.value, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
