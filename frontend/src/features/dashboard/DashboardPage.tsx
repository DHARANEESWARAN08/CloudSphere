import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleAlert, CircleCheck, Plus, Receipt, Server } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import UsageMeter from '@/components/common/UsageMeter';
import StatusBadge from '@/components/common/StatusBadge';
import DashboardInsights from '@/features/dashboard/DashboardInsights';
import { EmptyState, ErrorState, FeatureUnavailable, LoadingBlock } from '@/components/common/StateViews';
import { ApiError, getData } from '@/lib/api-client';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/formatting';
import type { CustomerDashboardSummary, DashboardSummary } from '@/types/api';

interface Vm { vm_id: string; project_id: string; project_name: string; name: string; state: string; vcpu: number; ram_gb: number; region_code: string | null; created_at: string }
const problemStates = new Set(['FAILED', 'PREEMPTED']);

function CustomerView({ s, vms, resourcesPending, resourcesError }: { s: CustomerDashboardSummary; vms: Vm[]; resourcesPending: boolean; resourcesError: boolean }) {
  const attention = vms.filter((vm) => problemStates.has(vm.state));
  const quotaPressures = s.quota ? [
    ['vCPU', s.quota.used_vcpu, s.quota.max_vcpu],
    ['Memory', s.quota.used_ram_gb, s.quota.max_ram_gb],
    ['VMs', s.quota.used_vms, s.quota.max_vms],
  ].filter(([, used, max]) => Number(max) > 0 && Number(used) / Number(max) >= .8) : [];
  const pendingVms = Math.max(0, s.total_vms - s.running_vms - s.stopped_vms);

  return <>
    <div className="row g-3 mb-3" aria-label="Workspace resource summary">
      <div className="col-6 col-xl-3"><StatCard className="cs-dashboard-stat" label="Virtual machines" value={formatNumber(s.total_vms)} hint={`${formatNumber(s.running_vms)} running · ${formatNumber(s.stopped_vms)} stopped · ${formatNumber(pendingVms)} pending`} icon={Server} /></div>
      <div className="col-6 col-xl-3"><StatCard className="cs-dashboard-stat" label="Allocated vCPU" value={formatNumber(s.allocated_vcpu)} icon={Server} /></div>
      <div className="col-6 col-xl-3"><StatCard className="cs-dashboard-stat" label="Estimated monthly spend" value={formatCurrency(s.estimated_usage_charges)} hint="Projected usage charge" icon={Receipt} /></div>
      <div className="col-6 col-xl-3"><StatCard className="cs-dashboard-stat" label="Open support tickets" value={formatNumber(s.open_tickets)} hint={`${formatNumber(s.pending_recommendations)} pending optimizations`} icon={CircleAlert} /></div>
    </div>

    <section className="cs-card cs-card-body mb-3" aria-labelledby="attention-heading">
      <div className="cs-section-heading"><div><span className="cs-section-eyebrow">WORKSPACE CHECK</span><h2 id="attention-heading">Needs attention</h2></div><Link to="/notifications">View notifications <ArrowRight size={13} /></Link></div>
      {resourcesPending ? <p className="small text-muted mb-0">Checking resource health…</p> : resourcesError ? <p className="small text-muted mb-0">VM health could not be checked because the resource list failed to load.</p> : attention.length === 0 && quotaPressures.length === 0 ? <p className="small text-muted mb-0"><CircleCheck size={15} className="me-2 text-success" aria-hidden />No failed VMs or high quota usage are reported.</p> : <div className="d-flex flex-column gap-2">
        {attention.map((vm) => <div className="cs-customer-alert" key={vm.vm_id}><CircleAlert size={17} aria-hidden /><span><strong>{vm.name}</strong> is {vm.state.toLowerCase()} in {vm.project_name}.</span><Link to={`/vms/${vm.vm_id}`}>Inspect VM <ArrowRight size={13} /></Link></div>)}
        {quotaPressures.map(([label, used, max]) => <div className="cs-customer-alert" key={label}><CircleAlert size={17} aria-hidden /><span><strong>{label}</strong> quota is at {Math.round(Number(used) / Number(max) * 100)}%.</span><Link to="/projects">Review projects <ArrowRight size={13} /></Link></div>)}
      </div>}
    </section>

    <div className="row g-3 mb-3">
      <div className="col-lg-5"><section className="cs-card cs-card-body h-100" aria-labelledby="quota-heading">
        <div className="cs-section-heading"><div><span className="cs-section-eyebrow">USAGE</span><h2 id="quota-heading">Quota utilization</h2></div><Link to="/projects">Projects <ArrowRight size={13} /></Link></div>
        {s.quota ? <><UsageMeter label="vCPU" used={s.quota.used_vcpu} max={s.quota.max_vcpu} /><UsageMeter label="Memory" used={s.quota.used_ram_gb} max={s.quota.max_ram_gb} unit=" GB" /><UsageMeter label="Virtual machines" used={s.quota.used_vms} max={s.quota.max_vms} /></> : <p className="small text-muted mb-0">No project quota data is available.</p>}
      </section></div>
      <div className="col-lg-7"><section className="cs-card cs-card-body h-100" aria-labelledby="resources-heading">
        <div className="cs-section-heading"><div><span className="cs-section-eyebrow">YOUR WORKLOADS</span><h2 id="resources-heading">Recent virtual machines</h2></div><Link to="/vms">All compute <ArrowRight size={13} /></Link></div>
        {vms.length ? <div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Name</th><th>Project</th><th>Region</th><th>Status</th><th>Created</th></tr></thead><tbody>{vms.slice(0, 5).map((vm) => <tr key={vm.vm_id}><td><Link className="fw-semibold" to={`/vms/${vm.vm_id}`}>{vm.name}</Link></td><td><Link to={`/projects/${vm.project_id}`}>{vm.project_name}</Link></td><td>{vm.region_code ?? '—'}</td><td><StatusBadge status={vm.state} /></td><td className="small text-muted">{formatDateTime(vm.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState title="No virtual machines" description="Create a VM to start running a workload in your workspace." action={<Link className="btn btn-primary btn-sm" to="/vms/new"><Plus size={14} className="me-1" />Create VM</Link>} />}
      </section></div>
    </div>
  </>;
}

export default function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: ({ signal }) => getData<DashboardSummary>('/dashboard/summary', undefined, signal),
  });
  const vms = useQuery({ queryKey: ['vms'], queryFn: ({ signal }) => getData<Vm[]>('/vms', undefined, signal) });
  const customer = query.data?.role === 'customer' ? query.data : null;

  return <>
    <PageHeader title="Workspace overview" subtitle="Your projects, running resources, and the items that need attention."
      actions={<><Link className="btn btn-outline-primary btn-sm" to="/projects">View projects</Link><Link className="btn btn-primary btn-sm" to="/vms/new"><Plus size={15} className="me-1" />Create VM</Link></>} />
    {query.isPending && <LoadingBlock rows={4} />}
    {query.isError && (query.error instanceof ApiError && query.error.isNotImplemented ? <FeatureUnavailable title="Workspace data is not available yet" description="The backend does not implement the workspace summary endpoint, so no figures are shown." endpoints={['GET /api/v1/dashboard/summary']} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load the workspace overview" />)}
    {query.isSuccess && query.data.role !== 'customer' && <div className="alert alert-warning" role="alert">This customer workspace does not have a customer-scoped summary. Open the Admin Control Plane for platform data.</div>}
    {customer && <>
      <CustomerView s={customer} vms={vms.data ?? []} resourcesPending={vms.isPending} resourcesError={vms.isError} />
      {vms.isError && <ErrorState error={vms.error} onRetry={() => vms.refetch()} title="Could not load virtual machines" />}
      <DashboardInsights />
    </>}
  </>;
}
