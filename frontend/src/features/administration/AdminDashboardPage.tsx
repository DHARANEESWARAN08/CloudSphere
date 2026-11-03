import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, Building2, Cpu, FolderKanban, Server, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import UsageMeter from '@/components/common/UsageMeter';
import { ErrorState, LoadingBlock } from '@/components/common/StateViews';
import { getData } from '@/lib/api-client';
import { formatNumber } from '@/lib/formatting';
import type { AdminDashboardSummary } from '@/types/api';

const operations = [
  { to: '/admin/hosts', title: 'Infrastructure capacity', description: 'Inspect hosts, allocation pressure, and hardware status.', icon: Cpu },
  { to: '/admin/vm-requests', title: 'VM request review', description: 'Approve or reject customer requests before capacity is allocated.', icon: Server },
  { to: '/admin/organizations', title: 'Tenant oversight', description: 'Review organizations, users, and project ownership.', icon: Building2 },
  { to: '/admin/quotas', title: 'Quota governance', description: 'Compare limits with current tenant allocations.', icon: TriangleAlert },
  { to: '/admin/audit', title: 'Audit trail', description: 'Trace administrative changes and platform activity.', icon: Activity },
];

export default function AdminDashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: ({ signal }) => getData<AdminDashboardSummary>('/dashboard/summary', undefined, signal),
  });
  const summary = query.data;

  return <>
    <PageHeader title="Platform overview" subtitle="Operational status and capacity across CloudSphere."
      actions={<Link className="btn btn-outline-primary btn-sm" to="/admin/hosts">Review infrastructure <ArrowRight size={15} className="ms-1" /></Link>} />
    {query.isPending && <LoadingBlock rows={4} />}
    {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load platform summary" />}
    {query.isSuccess && query.data.role !== 'admin' && <div className="alert alert-warning" role="alert">The platform summary endpoint returned a customer-scoped response. No platform metrics are shown.</div>}
    {summary?.role === 'admin' && <>
      <section aria-label="Platform resource summary" className="row g-3 mb-4">
        <div className="col-6 col-xl-3"><StatCard className="cs-dashboard-stat" label="Registered hosts" value={formatNumber(summary.total_hosts)} hint={`${formatNumber(summary.hosts_near_capacity)} near capacity`} icon={Cpu} /></div>
        <div className="col-6 col-xl-3"><StatCard className="cs-dashboard-stat" label="Active virtual machines" value={formatNumber(summary.total_vms)} icon={Server} /></div>
        <div className="col-6 col-xl-3"><StatCard className="cs-dashboard-stat" label="Active organizations" value={formatNumber(summary.active_organizations)} icon={Building2} /></div>
        <div className="col-6 col-xl-3"><StatCard className="cs-dashboard-stat" label="Active projects" value={formatNumber(summary.active_projects)} hint={`${formatNumber(summary.pending_spot_requests)} open spot requests`} icon={FolderKanban} /></div>
      </section>

      <div className="row g-3 mb-4">
        <div className="col-lg-7"><section className="cs-card cs-card-body h-100" aria-labelledby="capacity-heading">
          <div className="cs-admin-section-head"><div><span className="cs-section-eyebrow">CAPACITY</span><h2 id="capacity-heading" className="cs-card-title mb-1">Allocated infrastructure</h2><p className="small text-muted mb-3">Current allocation compared with registered host capacity.</p></div><Link className="small" to="/admin/hosts">Host inventory <ArrowRight size={13} /></Link></div>
          <UsageMeter label="vCPU" used={summary.allocated_cpu} max={summary.total_cpu} />
          <UsageMeter label="Memory" used={summary.allocated_ram_gb} max={summary.total_ram_gb} unit=" GB" />
        </section></div>
        <div className="col-lg-5"><section className="cs-card cs-card-body h-100" aria-labelledby="platform-watch-heading">
          <span className="cs-section-eyebrow">PLATFORM WATCH</span><h2 id="platform-watch-heading" className="cs-card-title">Attention</h2>
          {summary.hosts_near_capacity > 0 ? <div className="cs-admin-alert"><TriangleAlert size={18} aria-hidden /><div><strong>{formatNumber(summary.hosts_near_capacity)} host{summary.hosts_near_capacity === 1 ? '' : 's'} near capacity</strong><p className="small mb-2">Review free CPU and memory before placing additional workloads.</p><Link to="/admin/hosts">Inspect hosts <ArrowRight size={13} /></Link></div></div> : <p className="small text-muted mb-0">No hosts are currently reported near capacity.</p>}
          {summary.pending_spot_requests > 0 && <p className="small mt-3 mb-0"><Link to="/spot-market">{formatNumber(summary.pending_spot_requests)} open spot requests need review</Link></p>}
          {summary.pending_vm_requests > 0 && <p className="small mt-3 mb-0"><Link to="/admin/vm-requests">{formatNumber(summary.pending_vm_requests)} VM request{summary.pending_vm_requests===1?'':'s'} waiting for review</Link></p>}
        </section></div>
      </div>

      <section aria-labelledby="admin-workflows-heading">
        <div className="cs-section-heading"><div><span className="cs-section-eyebrow">CONTROL PLANE</span><h2 id="admin-workflows-heading">Operational workspaces</h2><p>Go directly to the platform area that needs attention.</p></div></div>
        <div className="row g-3">{operations.map(({ to, title, description, icon: Icon }) => <div className="col-md-6 col-xl-3" key={to}>
          <Link to={to} className="cs-card cs-card-body cs-admin-workspace h-100 d-block text-decoration-none text-reset"><span className="cs-admin-workspace-icon"><Icon size={18} aria-hidden /></span><h3>{title}</h3><p>{description}</p><span className="small">Open workspace <ArrowRight size={13} /></span></Link>
        </div>)}</div>
      </section>
    </>}
  </>;
}
