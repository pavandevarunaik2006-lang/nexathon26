import React, { useState, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
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
  AlertTriangle,
  HelpCircle,
  XCircle,
  Printer,
  Search,
  Filter,
  ArrowUpDown,
  Plus,
  Mail,
  Copy,
  Check,
  ChevronRight,
  ExternalLink,
  MapPin,
  RefreshCw,
  Edit,
  Trash2,
  Calendar,
  AlertOctagon,
  Info,
  Car,
  Navigation,
} from 'lucide-react';
import { apiRequest, downloadAuthenticatedCsv } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { DemoDataBadge, SeverityBadge, ConfidenceMeter } from '../components/Badges';
import { REGIONAL_DESTINATIONS, DelayVerificationStatus, JourneyDisplayStatus } from '@roadalert/shared';

// Helper for status badge colors
function getJourneyStatusBadge(status: string) {
  switch (status) {
    case 'Road Block':
      return {
        bg: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
        icon: AlertOctagon,
      };
    case 'Traffic':
      return {
        bg: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
        icon: Car,
      };
    case 'Delayed':
      return {
        bg: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
        icon: Clock,
      };
    case 'Normal':
    case 'Completed':
      return {
        bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
        icon: CheckCircle2,
      };
    default:
      return {
        bg: 'bg-slate-800 border-slate-700 text-slate-300',
        icon: HelpCircle,
      };
  }
}

function getVerificationBadge(status: string) {
  switch (status) {
    case 'VERIFIED':
      return {
        label: 'Verified Traffic Delay',
        bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
        icon: ShieldCheck,
      };
    case 'PARTIALLY_VERIFIED':
      return {
        label: 'Partially Verified',
        bg: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
        icon: AlertTriangle,
      };
    case 'NOT_TRAFFIC_RELATED':
      return {
        label: 'Not Traffic-Related',
        bg: 'bg-red-500/15 border-red-500/30 text-red-300',
        icon: XCircle,
      };
    default:
      return {
        label: 'Unverified Delay',
        bg: 'bg-slate-800 border-slate-700 text-slate-400',
        icon: HelpCircle,
      };
  }
}

// -------------------------------------------------------------
// 1. EMPLOYER DASHBOARD PAGE
// -------------------------------------------------------------
export function EmployerDashboardPage() {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [verificationFilter, setVerificationFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [activeTab, setActiveTab] = useState<'all' | 'live' | 'sample'>('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employer-dashboard'],
    queryFn: () => apiRequest<any>('/employer/dashboard'),
  });

  const org = data?.organization;
  const metrics = data?.metrics || {};
  const liveJourneys = data?.activeJourneys || [];
  const sampleJourneys = data?.sampleDisplayJourneys || [];
  const incidents = data?.relevantCorridorIncidents || [];

  // Combine or filter journeys depending on tab
  const allDisplayItems = useMemo(() => {
    let combined: any[] = [];
    if (activeTab === 'all' || activeTab === 'live') {
      combined = [...combined, ...liveJourneys];
    }
    if (activeTab === 'all' || activeTab === 'sample') {
      combined = [...combined, ...sampleJourneys];
    }

    return combined
      .filter((j: any) => {
        const empName = j.employeeName || j.employee || '';
        const route = j.route || `${j.origin || ''} → ${j.destination || ''}`;
        const matchesSearch =
          searchTerm === '' ||
          empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          route.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus =
          statusFilter === 'ALL' ||
          j.status?.toLowerCase() === statusFilter.toLowerCase();

        const matchesVerification =
          verificationFilter === 'ALL' ||
          (j.verificationStatus || '').toUpperCase() === verificationFilter.toUpperCase();

        return matchesSearch && matchesStatus && matchesVerification;
      })
      .sort((a: any, b: any) => {
        const delayA = Number(a.delayMinutes || a.estimatedDelayMin || 0);
        const delayB = Number(b.delayMinutes || b.estimatedDelayMin || 0);
        return sortOrder === 'desc' ? delayB - delayA : delayA - delayB;
      });
  }, [liveJourneys, sampleJourneys, activeTab, searchTerm, statusFilter, verificationFilter, sortOrder]);

  const handleExportCsv = async () => {
    try {
      await downloadAuthenticatedCsv(
        '/employer/journeys?format=csv',
        'roadalert-authorized-commute-report.csv'
      );
      showToast({
        type: 'success',
        title: 'CSV Export Downloaded',
        message: 'Action recorded in immutable organization audit log.',
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Export Failed', message: err.message });
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-sm text-slate-400 space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400" />
        <p>Loading organization commute intelligence &amp; evidence feeds...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 rounded-2xl bg-slate-900 border border-red-500/30 text-center space-y-4">
        <AlertTriangle className="w-8 h-8 mx-auto text-red-400" />
        <h2 className="text-lg font-bold text-white">Failed to load organization commute feed</h2>
        <p className="text-xs text-slate-400">
          Ensure you are signed in with an authorized Company Admin or Employer HR account.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
        >
          Retry Load
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
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
            Answers: <strong className="text-slate-200">“Was this employee late because of verified traffic, or is the reason unverified?”</strong> Precise GPS redacted by default.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20"
          >
            <Download className="w-4 h-4" /> Export Authorized CSV
          </button>
          <Link
            to="/employer/employees"
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1.5"
          >
            <Users className="w-4 h-4" /> Manage Employees
          </Link>
          <Link
            to="/employer/settings"
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
          >
            Settings
          </Link>
        </div>
      </div>

      {/* 5 KPI Summary Cards (Section 3 Requirement) */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            Total Employees <Users className="w-4 h-4 text-slate-500" />
          </span>
          <p className="text-2xl font-extrabold text-white mt-1">
            {metrics.totalEmployees || 0}
          </p>
          <span className="text-[10px] text-slate-500">Enrolled organization staff</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            Currently Travelling <Navigation className="w-4 h-4 text-cyan-400" />
          </span>
          <p className="text-2xl font-extrabold text-cyan-400 mt-1">
            {metrics.travellingCount || 0}
          </p>
          <span className="text-[10px] text-slate-500">Active consented sessions</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            Employees Delayed <Clock className="w-4 h-4 text-amber-400" />
          </span>
          <p className="text-2xl font-extrabold text-amber-300 mt-1">
            {metrics.delayedCount || 0}
          </p>
          <span className="text-[10px] text-slate-500">Delay &gt; 0 min on corridor</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/30 bg-emerald-950/10">
          <span className="text-[11px] font-semibold text-emerald-300 flex items-center justify-between">
            Verified Traffic Delays <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </span>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">
            {metrics.verifiedDelaysCount || 0}
          </p>
          <span className="text-[10px] text-emerald-400/80">Substantiated by evidence</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            Unverified Delays <HelpCircle className="w-4 h-4 text-slate-500" />
          </span>
          <p className="text-2xl font-extrabold text-slate-300 mt-1">
            {metrics.unverifiedDelaysCount || 0}
          </p>
          <span className="text-[10px] text-slate-500">Insufficient / not traffic</span>
        </div>
      </div>

      {/* Main Grid: Journey Table (8 cols) + Corridor Disruption Feed (4 cols) */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          {/* Table Container Card */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-cyan-400" /> Employee Journey Monitoring &amp; Verification Feed
                </h2>
                <p className="text-xs text-slate-400">
                  Search, filter, and inspect evidence backing each employee's arrival delay.
                </p>
              </div>

              {/* Data View Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    activeTab === 'all'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({liveJourneys.length + sampleJourneys.length})
                </button>
                <button
                  onClick={() => setActiveTab('live')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    activeTab === 'live'
                      ? 'bg-slate-800 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Live / Seeded ({liveJourneys.length})
                </button>
                <button
                  onClick={() => setActiveTab('sample')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    activeTab === 'sample'
                      ? 'bg-slate-800 text-amber-300 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sample Records ({sampleJourneys.length})
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="grid sm:grid-cols-12 gap-2.5 pt-1">
              <div className="sm:col-span-5 relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search employee or route (e.g. Udupi, Mangaluru)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="sm:col-span-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Traffic">Traffic</option>
                  <option value="Road Block">Road Block</option>
                  <option value="Normal">Normal</option>
                  <option value="Delayed">Delayed</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <select
                  value={verificationFilter}
                  onChange={(e) => setVerificationFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">All Verifications</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="PARTIALLY_VERIFIED">Partially Verified</option>
                  <option value="UNVERIFIED">Unverified</option>
                  <option value="NOT_TRAFFIC_RELATED">Not Traffic-Related</option>
                </select>
              </div>

              <div className="sm:col-span-1">
                <button
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                  title={`Sort by delay duration (${sortOrder === 'desc' ? 'Highest first' : 'Lowest first'})`}
                  className="w-full h-full flex items-center justify-center p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                    <th className="py-3 px-3 font-semibold">Employee</th>
                    <th className="py-3 px-3 font-semibold">Route</th>
                    <th className="py-3 px-3 font-semibold">Status</th>
                    <th className="py-3 px-3 font-semibold">Delay</th>
                    <th className="py-3 px-3 font-semibold">Verification</th>
                    <th className="py-3 px-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {allDisplayItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        No commute journeys match the selected search or filter criteria.
                      </td>
                    </tr>
                  ) : (
                    allDisplayItems.map((j: any) => {
                      const empName = j.employeeName || j.employee || 'Employee';
                      const route = j.route || `${j.origin} → ${j.destination}`;
                      const delayMin = Number(j.delayMinutes || j.estimatedDelayMin || 0);
                      const displayStatus = j.status || 'Normal';
                      const statusBadge = getJourneyStatusBadge(displayStatus);
                      const StatusIcon = statusBadge.icon;
                      const verBadge = getVerificationBadge(j.verificationStatus || j.verification);
                      const VerIcon = verBadge.icon;
                      const isSample = Boolean(j.isSampleRecord);

                      return (
                        <tr key={j.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              {empName}
                              {isSample ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Sample Record
                                </span>
                              ) : j.demoData ? (
                                <DemoDataBadge />
                              ) : null}
                            </div>
                            {j.employeeEmail && (
                              <span className="text-[11px] text-slate-500">{j.employeeEmail}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-medium">
                            {route}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusBadge.bg}`}
                            >
                              <StatusIcon className="w-3 h-3" /> {displayStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-bold">
                            <span
                              className={
                                delayMin >= 30
                                  ? 'text-rose-400 font-extrabold'
                                  : delayMin > 0
                                  ? 'text-amber-300'
                                  : 'text-emerald-400'
                              }
                            >
                              {delayMin > 0 ? `+${delayMin} min` : '0 min'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${verBadge.bg}`}
                            >
                              <VerIcon className="w-3.5 h-3.5" />
                              {j.verification || verBadge.label}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {isSample ? (
                              <button
                                onClick={() =>
                                  showToast({
                                    type: 'info',
                                    title: 'Sample Evaluation Record',
                                    message: j.evidence || 'Demonstration sample record provided by specification.',
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                              >
                                View Note
                              </button>
                            ) : (
                              <Link
                                to={`/employer/journeys/${j.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold"
                              >
                                Inspect <ChevronRight className="w-3.5 h-3.5" />
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Corridor Incidents Supporting Delays */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 text-amber-400" /> Active Corridor Disruptions
              </h2>
              <DemoDataBadge />
            </div>
            <p className="text-xs text-slate-400">
              High-confidence incidents along NH-66 corridor used to substantiate employee delays:
            </p>

            <div className="space-y-3">
              {incidents.slice(0, 5).map((inc: any) => (
                <div
                  key={inc.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <SeverityBadge severity={inc.severity} />
                    <span className="text-[10px] text-cyan-400 font-semibold">
                      +{inc.estimated_delay_minutes || 15} min delay
                    </span>
                  </div>

                  <Link
                    to={`/app/incidents/${inc.id}`}
                    className="block text-xs font-bold text-white hover:text-cyan-300 leading-snug"
                  >
                    {inc.title}
                  </Link>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-500" /> {inc.road_name}
                    </span>
                    {inc.road_closed && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                        Road Closed
                      </span>
                    )}
                  </div>

                  <ConfidenceMeter score={Number(inc.confidence_score)} compact />
                </div>
              ))}
            </div>

            <Link
              to="/employer/verifications"
              className="block text-center text-xs font-semibold text-cyan-400 hover:text-cyan-300 pt-1"
            >
              Open Delay Verification Center →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 2. EMPLOYEE MANAGEMENT PAGE
// -------------------------------------------------------------
export function EmployerEmployeesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);

  // Form states for Add Employee
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('RoadAlert@2026');
  const [formRole, setFormRole] = useState<'EMPLOYEE' | 'HR_VIEWER' | 'EMPLOYER_ADMIN'>('EMPLOYEE');
  const [formDepartment, setFormDepartment] = useState('');
  const [formEmployeeCode, setFormEmployeeCode] = useState('');
  const [formOrigin, setFormOrigin] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formShiftStart, setFormShiftStart] = useState('09:00');
  const [formShiftEnd, setFormShiftEnd] = useState('18:00');

  // Form states for Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'EMPLOYEE' | 'HR_VIEWER' | 'EMPLOYER_ADMIN'>('EMPLOYEE');
  const [inviteDept, setInviteDept] = useState('');
  const [createdInvite, setCreatedInvite] = useState<any | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const { data: employees, isLoading, refetch } = useQuery({
    queryKey: ['employer-employees'],
    queryFn: () => apiRequest<any[]>('/employer/employees'),
  });

  const { data: invitations } = useQuery({
    queryKey: ['employer-invitations'],
    queryFn: () => apiRequest<any[]>('/employer/invitations'),
  });

  // Mutation: Add Employee
  const addEmployeeMutation = useMutation({
    mutationFn: () =>
      apiRequest('/employer/employees', {
        method: 'POST',
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPassword,
          membershipRole: formRole,
          department: formDepartment.trim() || undefined,
          employeeCode: formEmployeeCode.trim() || undefined,
          usualCommuteOrigin: formOrigin || undefined,
          usualCommuteDestination: formDestination || undefined,
          shiftStartTime: formShiftStart,
          shiftEndTime: formShiftEnd,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employer-dashboard'] });
      showToast({ type: 'success', title: 'Employee Registered', message: 'Employee added to company roster.' });
      setAddModalOpen(false);
      resetAddForm();
    },
    onError: (err: any) => {
      showToast({ type: 'error', title: 'Registration Error', message: err.message });
    },
  });

  // Mutation: Edit Employee
  const updateEmployeeMutation = useMutation({
    mutationFn: (updated: any) =>
      apiRequest(`/employer/employees/${updated.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updated),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer-employees'] });
      showToast({ type: 'success', title: 'Employee Profile Saved', message: 'Commute route and profile updated.' });
      setEditEmployee(null);
    },
    onError: (err: any) => {
      showToast({ type: 'error', title: 'Update Error', message: err.message });
    },
  });

  // Mutation: Remove Employee
  const removeEmployeeMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/employer/employees/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employer-dashboard'] });
      showToast({ type: 'success', title: 'Employee Association Removed', message: 'User unlinked from organization.' });
    },
    onError: (err: any) => {
      showToast({ type: 'error', title: 'Removal Error', message: err.message });
    },
  });

  // Mutation: Create Invitation
  const createInviteMutation = useMutation({
    mutationFn: () =>
      apiRequest<any>('/employer/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          membershipRole: inviteRole,
          department: inviteDept.trim() || undefined,
        }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['employer-invitations'] });
      setCreatedInvite(res);
      showToast({ type: 'success', title: 'Invitation Generated', message: `Invite code ${res.inviteCode} created.` });
    },
    onError: (err: any) => {
      showToast({ type: 'error', title: 'Invite Failed', message: err.message });
    },
  });

  const resetAddForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('RoadAlert@2026');
    setFormDepartment('');
    setFormEmployeeCode('');
    setFormOrigin('');
    setFormDestination('');
  };

  const filteredEmployees = useMemo(() => {
    return (employees || []).filter((e: any) => {
      const matchSearch =
        searchTerm === '' ||
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.department || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchRole = roleFilter === 'ALL' || e.membershipRole === roleFilter;
      return matchSearch && matchRole;
    });
  }, [employees, searchTerm, roleFilter]);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-xs font-semibold">
              Organization Staff Directory
            </span>
            <DemoDataBadge />
          </div>
          <h1 className="text-xl font-bold text-white mt-1">
            Registered Employees &amp; Usual Commute Routes
          </h1>
          <p className="text-xs text-slate-400">
            Assign usual commute corridors and shift times to substantiate legitimate traffic delays.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setInviteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
          >
            <Mail className="w-4 h-4 text-cyan-400" /> Invite Employee
          </button>
          <button
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" /> Register Employee
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, email, department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300"
          >
            <option value="ALL">All Roles</option>
            <option value="EMPLOYER_ADMIN">Company Admin</option>
            <option value="HR_VIEWER">HR Viewer</option>
            <option value="EMPLOYEE">Employee</option>
          </select>
        </div>
      </div>

      {/* Employees Table */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-3 px-3">Employee</th>
              <th className="py-3 px-3">Role &amp; Department</th>
              <th className="py-3 px-3">Usual Commute Corridor</th>
              <th className="py-3 px-3">Shift Hours</th>
              <th className="py-3 px-3">Consent &amp; Sessions</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  Loading employee directory...
                </td>
              </tr>
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No employees found matching the filters.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp: any) => (
                <tr key={emp.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-3">
                    <div className="font-bold text-white">{emp.name}</div>
                    <div className="text-[11px] text-slate-400">{emp.email}</div>
                    {emp.employeeCode && (
                      <span className="text-[10px] text-slate-500">ID: {emp.employeeCode}</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        emp.membershipRole === 'EMPLOYER_ADMIN'
                          ? 'bg-purple-500/15 text-purple-300'
                          : emp.membershipRole === 'HR_VIEWER'
                          ? 'bg-cyan-500/15 text-cyan-300'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {emp.membershipRole === 'EMPLOYER_ADMIN'
                        ? 'Admin'
                        : emp.membershipRole === 'HR_VIEWER'
                        ? 'HR Viewer'
                        : 'Employee'}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {emp.department || 'General'}
                    </p>
                  </td>
                  <td className="py-3 px-3 text-slate-300 font-medium max-w-[260px] truncate">
                    {emp.usualCommuteRoute}
                  </td>
                  <td className="py-3 px-3 text-slate-300 font-mono text-[11px]">
                    {emp.shiftStartTime} – {emp.shiftEndTime}
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-emerald-400 font-semibold block">
                      {emp.activeConsentsCount > 0 ? 'Consent Active' : 'No Consent'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {emp.totalJourneysCount} logged session(s)
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        emp.status === 'ACTIVE'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-red-500/15 text-red-300'
                      }`}
                    >
                      {emp.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right space-x-1.5">
                    <button
                      onClick={() => setEditEmployee(emp)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                      title="Edit Employee Commute Details"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${emp.name} from your organization?`)) {
                          removeEmployeeMutation.mutate(emp.id);
                        }
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-300"
                      title="Remove from Organization"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Register Employee */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Register Organization Employee</h2>
              <button
                onClick={() => setAddModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Rohith Shetty"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Company Email *</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="rohith@company.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Membership Role</label>
                  <select
                    value={formRole}
                    onChange={(e: any) => setFormRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="HR_VIEWER">HR / Viewer</option>
                    <option value="EMPLOYER_ADMIN">Company Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Department</label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    placeholder="e.g. Engineering"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Usual Commute Origin
                </label>
                <select
                  value={formOrigin}
                  onChange={(e) => setFormOrigin(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white mb-1.5"
                >
                  <option value="">Select Coastal Landmark or type below...</option>
                  {REGIONAL_DESTINATIONS.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={formOrigin}
                  onChange={(e) => setFormOrigin(e.target.value)}
                  placeholder="Or type custom origin (e.g. Udupi Karavali Bypass)"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Usual Commute Destination (Office / Branch)
                </label>
                <select
                  value={formDestination}
                  onChange={(e) => setFormDestination(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white mb-1.5"
                >
                  <option value="">Select Destination Landmark...</option>
                  {REGIONAL_DESTINATIONS.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={formDestination}
                  onChange={(e) => setFormDestination(e.target.value)}
                  placeholder="Or type custom office location (e.g. Pumpwell Circle, Mangaluru)"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Shift Start</label>
                  <input
                    type="time"
                    value={formShiftStart}
                    onChange={(e) => setFormShiftStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Shift End</label>
                  <input
                    type="time"
                    value={formShiftEnd}
                    onChange={(e) => setFormShiftEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                onClick={() => setAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => addEmployeeMutation.mutate()}
                disabled={!formName || !formEmail || addEmployeeMutation.isPending}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                {addEmployeeMutation.isPending ? 'Registering...' : 'Register Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Invite Employee */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
                <Mail className="w-5 h-5 text-cyan-400" /> Invite Employee via Link
              </h2>
              <button
                onClick={() => {
                  setInviteModalOpen(false);
                  setCreatedInvite(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {!createdInvite ? (
              <div className="space-y-3 text-xs">
                <p className="text-slate-400">
                  Generate a secure registration token. The employee sets their own password and automatically joins your organization.
                </p>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Employee Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="candidate@karavalitech.in"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Department</label>
                  <input
                    type="text"
                    value={inviteDept}
                    onChange={(e) => setInviteDept(e.target.value)}
                    placeholder="e.g. IT Operations"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <button
                  onClick={() => createInviteMutation.mutate()}
                  disabled={!inviteEmail || createInviteMutation.isPending}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
                >
                  {createInviteMutation.isPending ? 'Generating Code...' : 'Generate Invite Link'}
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-xs p-4 rounded-xl bg-slate-950 border border-cyan-500/30">
                <p className="font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Invitation Code Active
                </p>
                <div className="p-2.5 bg-slate-900 rounded border border-slate-800 font-mono text-center text-sm font-bold text-white tracking-widest">
                  {createdInvite.inviteCode}
                </div>
                <p className="text-slate-400">Direct Invitation URL:</p>
                <div className="p-2 bg-slate-900 rounded text-[11px] text-cyan-300 break-all select-all">
                  {window.location.origin}/register?invite={createdInvite.inviteCode}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/register?invite=${createdInvite.inviteCode}`
                    );
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold flex items-center justify-center gap-1.5"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copiedCode ? 'Copied to Clipboard!' : 'Copy Invitation Link'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Edit Employee */}
      {editEmployee && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Edit Employee: {editEmployee.name}</h2>
              <button onClick={() => setEditEmployee(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Department</label>
                <input
                  type="text"
                  value={editEmployee.department || ''}
                  onChange={(e) => setEditEmployee({ ...editEmployee, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Usual Commute Origin</label>
                <input
                  type="text"
                  value={editEmployee.usualCommuteOrigin || ''}
                  onChange={(e) => setEditEmployee({ ...editEmployee, usualCommuteOrigin: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Usual Commute Destination</label>
                <input
                  type="text"
                  value={editEmployee.usualCommuteDestination || ''}
                  onChange={(e) => setEditEmployee({ ...editEmployee, usualCommuteDestination: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Shift Start Time</label>
                  <input
                    type="time"
                    value={editEmployee.shiftStartTime || '09:00'}
                    onChange={(e) => setEditEmployee({ ...editEmployee, shiftStartTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Shift End Time</label>
                  <input
                    type="time"
                    value={editEmployee.shiftEndTime || '18:00'}
                    onChange={(e) => setEditEmployee({ ...editEmployee, shiftEndTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditEmployee(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  updateEmployeeMutation.mutate({
                    id: editEmployee.id,
                    department: editEmployee.department,
                    usualCommuteOrigin: editEmployee.usualCommuteOrigin,
                    usualCommuteDestination: editEmployee.usualCommuteDestination,
                    shiftStartTime: editEmployee.shiftStartTime,
                    shiftEndTime: editEmployee.shiftEndTime,
                  })
                }
                disabled={updateEmployeeMutation.isPending}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 3. EMPLOYEE JOURNEY DETAIL PAGE (Dedicated verification dossier)
// -------------------------------------------------------------
export function EmployerJourneyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: journey, isLoading, refetch } = useQuery({
    queryKey: ['employer-journey-detail', id],
    queryFn: () => apiRequest<any>(`/employer/journeys/${id}`),
    enabled: Boolean(id),
  });

  const reevaluateMutation = useMutation({
    mutationFn: () => apiRequest(`/employer/journeys/${id}/verify-delay`, { method: 'POST' }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['employer-journey-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['employer-dashboard'] });
      showToast({
        type: 'success',
        title: 'Delay Verification Re-evaluated',
        message: `Outcome: ${data.verificationStatus} (${data.journeyStatus})`,
      });
    },
    onError: (err: any) => {
      showToast({ type: 'error', title: 'Evaluation Failed', message: err.message });
    },
  });

  if (isLoading) {
    return (
      <div className="p-12 text-center text-sm text-slate-400 space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400" />
        <p>Analyzing employee commute telemetry and corridor incidents...</p>
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <h2 className="text-base font-bold text-white">Journey Record Not Found</h2>
        <Link to="/employer/dashboard" className="text-xs text-cyan-400 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const ver = journey.verification;
  const verBadge = getVerificationBadge(ver?.verificationStatus || journey.verificationStatus);
  const VerIcon = verBadge.icon;
  const statusBadge = getJourneyStatusBadge(journey.status);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to="/employer/dashboard"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              ← Back to Commute Feed
            </Link>
            <DemoDataBadge isDemo={journey.demoData} />
          </div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>{journey.employeeName}</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadge.bg}`}
            >
              {journey.status}
            </span>
          </h1>
          <p className="text-xs text-cyan-300 font-medium">
            {journey.origin} → {journey.destination}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => reevaluateMutation.mutate()}
            disabled={reevaluateMutation.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${reevaluateMutation.isPending ? 'animate-spin' : ''}`} />
            {reevaluateMutation.isPending ? 'Evaluating Evidence...' : 'Re-evaluate Verification'}
          </button>
        </div>
      </div>

      {/* EVIDENCE-BASED DELAY VERIFICATION DOSSIER (Section 6 Requirement) */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Evidence-Based Delay Analysis
            </span>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <VerIcon className="w-5 h-5 text-cyan-400" /> Delay Verification Verdict
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs border ${verBadge.bg}`}
            >
              <VerIcon className="w-4 h-4" /> {verBadge.label}
            </span>
          </div>
        </div>

        {/* Conclusion Callout (Section 6 Highlight) */}
        <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/30 space-y-2">
          <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide">
            Verified Conclusion Statement
          </span>
          <p className="text-sm text-white font-medium leading-relaxed">
            {ver?.conclusionText || journey.delayEvidenceSummary || 'No evidence conclusion generated.'}
          </p>
        </div>

        {/* Evidence Metrics Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block text-[11px]">Computed Delay Impact</span>
            <span className="text-lg font-bold text-amber-300 mt-1 block">
              +{ver?.delayMinutes || journey.estimatedDelayMin} min
            </span>
            <span className="text-[10px] text-slate-500">Duration beyond normal schedule</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block text-[11px]">Corridor Incident Match</span>
            <span className="text-lg font-bold text-white mt-1 block">
              {ver?.spatialIntersection ? 'Confirmed Intersection' : 'No Intersection'}
            </span>
            <span className="text-[10px] text-slate-500">
              {ver?.incidentDetails?.length || 0} disruption(s) on corridor
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block text-[11px]">GPS Telemetry Observation</span>
            <span className="text-lg font-bold text-emerald-400 mt-1 block">
              {ver?.speedDropDetected ? 'Speed-Drop Confirmed' : 'Normal / Redacted'}
            </span>
            <span className="text-[10px] text-slate-500">In-zone presence telemetry</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block text-[11px]">Verification Rule / Method</span>
            <span className="text-xs font-bold text-slate-300 mt-1 block font-mono">
              SPATIO_TEMPORAL_INTERSECTION
            </span>
            <span className="text-[10px] text-slate-500">Rule-based, explainable</span>
          </div>
        </div>

        {/* GPS Observation Detail */}
        {ver?.gpsObservationSummary && (
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">GPS Observation Detail: </strong>
              {ver.gpsObservationSummary}
            </div>
          </div>
        )}

        {/* Missing Evidence Factors (When Partially Verified or Unverified) */}
        {ver?.missingEvidenceFactors && ver.missingEvidenceFactors.length > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1.5 text-xs">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Missing or Incomplete Evidence Factors:
            </span>
            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
              {ver.missingEvidenceFactors.map((f: string, i: number) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Corroborating Incident Details Table */}
      {ver?.incidentDetails && ver.incidentDetails.length > 0 && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4 text-amber-400" /> Corroborating Road Incidents on Commute Corridor
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Incident</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Confidence Score</th>
                  <th className="py-2.5 px-3">Estimated Delay</th>
                  <th className="py-2.5 px-3">Authority Confirmed</th>
                  <th className="py-2.5 px-3">Road Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {ver.incidentDetails.map((inc: any) => (
                  <tr key={inc.id}>
                    <td className="py-2.5 px-3 font-semibold text-white">
                      <Link to={`/app/incidents/${inc.id}`} className="hover:text-cyan-300">
                        {inc.title}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{inc.roadName}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-cyan-300">{inc.confidenceScore}/100</span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-amber-300">
                      +{inc.estimatedDelayMinutes} min
                    </td>
                    <td className="py-2.5 px-3">
                      {inc.authorityConfirmed ? (
                        <span className="text-emerald-400 font-semibold">Confirmed</span>
                      ) : (
                        <span className="text-slate-400">Pending Field Patrol</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {inc.roadClosed ? (
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                          Road Closed
                        </span>
                      ) : (
                        <span className="text-slate-400">Open with Congestion</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Checkpoints & Privacy Section */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-emerald-400" /> Consented Commute Telemetry Logs
            </h3>
            <p className="text-xs text-slate-400">
              Only recorded while commute session is active. Stopping session immediately halts data collection.
            </p>
          </div>
          {journey.preciseCoordinatesRedacted && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              Exact GPS Coordinates Redacted by Policy
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Recorded Time</th>
                <th className="py-2.5 px-3">Speed</th>
                <th className="py-2.5 px-3">Source</th>
                <th className="py-2.5 px-3">Status Note / Observation</th>
                <th className="py-2.5 px-3">Coordinates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {journey.checkpoints?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No GPS checkpoints were logged during this session (session-only mode or offline).
                  </td>
                </tr>
              ) : (
                journey.checkpoints.map((cp: any, idx: number) => (
                  <tr key={cp.id || idx}>
                    <td className="py-2.5 px-3 text-slate-300 font-mono">
                      {new Date(cp.recordedAt).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      {cp.speed} km/h
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{cp.sourceType}</td>
                    <td className="py-2.5 px-3 text-slate-300">{cp.statusNote || 'Normal segment transit'}</td>
                    <td className="py-2.5 px-3">
                      {cp.coordinateRedacted ? (
                        <span className="text-slate-500 italic">Redacted (Privacy Policy)</span>
                      ) : (
                        <span className="font-mono text-[11px] text-cyan-300">
                          {cp.latitude}, {cp.longitude}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 4. DELAY VERIFICATIONS SUMMARY PAGE
// -------------------------------------------------------------
export function EmployerVerificationsPage() {
  const [filterStatus, setFilterStatus] = useState('ALL');

  const { data: verifications, isLoading } = useQuery({
    queryKey: ['employer-verifications'],
    queryFn: () => apiRequest<any[]>('/employer/verifications'),
  });

  const filtered = useMemo(() => {
    return (verifications || []).filter((v: any) => {
      return filterStatus === 'ALL' || v.verificationStatus === filterStatus;
    });
  }, [verifications, filterStatus]);

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold">
              Evidence-Based Verification Center
            </span>
            <DemoDataBadge />
          </div>
          <h1 className="text-xl font-bold text-white mt-1">
            Employee Commute Delay Verifications
          </h1>
          <p className="text-xs text-slate-400">
            Truthful, rule-based verification. Delays are only classified as traffic-related when corroborating evidence exists.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300"
          >
            <option value="ALL">All Outcomes</option>
            <option value="VERIFIED">Verified Only</option>
            <option value="PARTIALLY_VERIFIED">Partially Verified</option>
            <option value="UNVERIFIED">Unverified Only</option>
            <option value="NOT_TRAFFIC_RELATED">Not Traffic-Related</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading verifications...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-500">
            No delay verification records found for the selected filter.
          </div>
        ) : (
          filtered.map((v: any) => {
            const verBadge = getVerificationBadge(v.verificationStatus);
            const VerIcon = verBadge.icon;
            return (
              <div
                key={v.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{v.employeeName}</span>
                    <span className="text-xs text-slate-400">({v.employeeEmail})</span>
                    <DemoDataBadge isDemo={v.demoData} />
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${verBadge.bg}`}
                  >
                    <VerIcon className="w-3.5 h-3.5" /> {verBadge.label}
                  </span>
                </div>

                <div className="text-xs text-cyan-300 font-semibold">{v.route}</div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
                  {v.conclusionText}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>
                    Verified At: {new Date(v.verifiedAt).toLocaleString()} • Delay: +{v.delayMinutes} min
                  </span>
                  <Link
                    to={`/employer/journeys/${v.journeyId}`}
                    className="text-cyan-400 hover:underline font-semibold flex items-center gap-1"
                  >
                    View Journey Dossier <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 5. ORGANIZATION SETTINGS PAGE
// -------------------------------------------------------------
export function EmployerSettingsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['employer-profile'],
    queryFn: () => apiRequest<any>('/employer/profile'),
  });

  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState('ENTERPRISE');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Mangaluru');
  const [description, setDescription] = useState('');
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('18:00');

  React.useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setOrgType(profile.organization_type || 'ENTERPRISE');
      setEmail(profile.contact_email || '');
      setPhone(profile.contact_phone || '');
      setAddress(profile.address || '');
      setCity(profile.city || 'Mangaluru');
      setDescription(profile.description || '');
      setShiftStart(profile.default_shift_start || '09:00');
      setShiftEnd(profile.default_shift_end || '18:00');
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest('/employer/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          organizationType: orgType,
          contactEmail: email.trim() || undefined,
          contactPhone: phone.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim(),
          description: description.trim() || undefined,
          defaultShiftStart: shiftStart,
          defaultShiftEnd: shiftEnd,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer-profile'] });
      queryClient.invalidateQueries({ queryKey: ['employer-dashboard'] });
      showToast({
        type: 'success',
        title: 'Organization Profile Updated',
        message: 'Settings saved and recorded in audit trail.',
      });
    },
    onError: (err: any) => {
      showToast({ type: 'error', title: 'Update Error', message: err.message });
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" /> Organization Profile &amp; Workplace Settings
          </h1>
          <DemoDataBadge />
        </div>
        <p className="text-xs text-slate-400">
          Configure company operating location, contact channels, and default working shifts.
        </p>

        <div className="space-y-4 pt-2 text-xs">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Company / Organization Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Organization Type</label>
              <select
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
              >
                <option value="IT_ENTERPRISE">IT Enterprise / Tech Park</option>
                <option value="FINANCIAL_SERVICES">Financial Services</option>
                <option value="HEALTHCARE">Healthcare &amp; Hospitals</option>
                <option value="MANUFACTURING">Manufacturing / Industrial</option>
                <option value="LOGISTICS">Logistics &amp; Transport</option>
                <option value="EDUCATION">Educational Institution</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">City / Region</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Contact Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Contact Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Office / Facility Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Kavoor NH-66 Corridor, Mangaluru"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Default Shift Start</label>
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Default Shift End</label>
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Company Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <Link
              to="/employer/policies"
              className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
            >
              <Lock className="w-3.5 h-3.5" /> Configure Privacy &amp; Tracking Policies →
            </Link>

            <button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Organization Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 6. EMPLOYER TRACKING POLICIES PAGE (Existing retained & polished)
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// 7. EMPLOYER JOURNEYS & REPORTS PAGE (Existing retained & polished)
// -------------------------------------------------------------
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
                Started: {new Date(j.startedAt).toLocaleString()} • Verification:{' '}
                <strong className="text-slate-300">{j.verificationStatus || 'UNVERIFIED'}</strong>
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
              <Link
                to={`/employer/journeys/${j.id}`}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1"
              >
                Inspect Dossier <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
