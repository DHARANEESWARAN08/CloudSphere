import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Server } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateViews';
import { formatNumber, formatPercent } from '@/lib/formatting';
import { getData } from '@/lib/api-client';
import BillingTrendChart from '@/components/charts/BillingTrendChart';

interface Vm { vm_id: string; name: string; state: string; vcpu: number; ram_gb: number; created_at: string }
interface Monitoring { vm_id: string; name: string; avg_cpu_pct: string | null; avg_ram_pct: string | null; avg_disk_pct: string | null; sample_count: number; latest_sample_at: string | null }
interface Invoice { invoice_id: string; period_start: string; total_amount: string | number; invoice_type: string; status: string }

const STATE_COLORS: Record<string, string> = {
  RUNNING: 'var(--cs-ok)', STOPPED: 'var(--cs-neutral)', PROVISIONING: 'var(--cs-info)', REQUESTED: 'var(--cs-info)',
  TERMINATED: 'var(--cs-neutral)', PREEMPTED: 'var(--cs-warn)', FAILED: 'var(--cs-danger)',
};
const METRICS = [
  { key: 'avg_cpu_pct', label: 'CPU', color: 'var(--cs-accent)' },
  { key: 'avg_ram_pct', label: 'Memory', color: 'var(--cs-accent)' },
  { key: 'avg_disk_pct', label: 'Disk', color: 'var(--cs-accent)' },
] as const;

function ChartLoading() { return <div className="cs-card cs-card-body"><LoadingBlock rows={4} /></div>; }
function ChartError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="cs-card cs-card-body"><ErrorState error={error} onRetry={retry} title="Could not load chart data" /></div>;
}
const tooltipStyle = { backgroundColor: 'var(--cs-surface-raised)', border: '1px solid var(--cs-border)', borderRadius: 8, color: 'var(--cs-text)', boxShadow: 'var(--cs-shadow-popover)' };
const axisStyle = { fill: 'var(--cs-muted)', fontSize: 11 };

export default function DashboardInsights() {
  const [metricKey, setMetricKey] = useState<(typeof METRICS)[number]['key']>('avg_cpu_pct');
  const [selectedState, setSelectedState] = useState('');
  const vms = useQuery({ queryKey: ['vms'], queryFn: ({ signal }) => getData<Vm[]>('/vms', undefined, signal) });
  const monitoring = useQuery({ queryKey: ['monitoring-summary'], queryFn: ({ signal }) => getData<Monitoring[]>('/monitoring/summary', undefined, signal) });
  const invoices = useQuery({ queryKey: ['billing', 'invoices'], queryFn: ({ signal }) => getData<Invoice[]>('/billing/invoices', undefined, signal) });

  // Keep the overview distribution aligned with the summary's active-resource total.
  const vmRows = (vms.data ?? []).filter((vm) => !['TERMINATED', 'PREEMPTED', 'FAILED'].includes(vm.state));
  const stateCounts = Object.entries(vmRows.reduce<Record<string, number>>((counts, vm) => {
    counts[vm.state] = (counts[vm.state] ?? 0) + 1;
    return counts;
  }, {})).map(([name, value]) => ({ name, value, color: STATE_COLORS[name] ?? 'var(--cs-neutral)' }));
  const selectedVms = selectedState ? vmRows.filter((vm) => vm.state === selectedState) : [];

  const metric = METRICS.find((item) => item.key === metricKey)!;
  const usageRows = (monitoring.data ?? [])
    .filter((row) => row[metricKey] !== null && Number(row[metricKey]) >= 0)
    .sort((a, b) => Number(b[metricKey]) - Number(a[metricKey]))
    .slice(0, 8)
    .map((row) => ({ vm_id: row.vm_id, name: row.name, value: Number(row[metricKey]), samples: row.sample_count, sampledAt: row.latest_sample_at }));


  return <section className="cs-dashboard-charts" aria-label="Interactive cloud insights">
    <div className="cs-section-heading"><div><div className="cs-section-eyebrow">ANALYTICS</div><h2>Cloud insights</h2><p>Explore live resource, performance, and billing data.</p></div><span className="cs-live-indicator"><i /> From your organization data</span></div>
    <div className="row g-3">
      <div className="col-lg-8">
        {monitoring.isPending ? <ChartLoading /> : monitoring.isError ? <ChartError error={monitoring.error} retry={() => monitoring.refetch()} /> :
          <section className="cs-card cs-card-body cs-chart-panel" aria-labelledby="resource-chart-heading">
            <div className="cs-chart-heading"><div><div className="cs-chart-kicker"><Activity size={14} /> PERFORMANCE</div><h3 id="resource-chart-heading">Resource use by VM</h3><p>Average utilization across the last 24 hours</p></div>
              <div className="cs-chart-segment" role="group" aria-label="Choose utilization metric">{METRICS.map((item) => <button key={item.key} type="button" className={metricKey === item.key ? 'active' : ''} onClick={() => setMetricKey(item.key)} aria-pressed={metricKey === item.key}>{item.label}</button>)}</div>
            </div>
            {usageRows.length ? <>
              <div className="cs-chart-summary"><strong style={{ color: metric.color }}>{formatPercent(usageRows[0].value, 1)}</strong><span>highest average · {usageRows[0].name}</span><small>{formatNumber(usageRows.reduce((sum, row) => sum + row.samples, 0))} samples</small></div>
              <div className="cs-chart-canvas cs-chart-canvas--bar"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageRows} layout="vertical" margin={{ top: 6, right: 22, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--cs-border)" strokeDasharray="3 5" />
                  <XAxis type="number" domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fill: 'var(--cs-muted)', fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={92} axisLine={false} tickLine={false} tick={axisStyle} />
                  <Tooltip cursor={{ fill: 'var(--cs-neutral-soft)', opacity: .5 }} contentStyle={tooltipStyle} formatter={(value) => [formatPercent(Number(value), 1), metric.label]} labelFormatter={(name) => `VM · ${name}`} />
                  <Bar dataKey="value" fill={metric.color} radius={[0, 8, 8, 0]} maxBarSize={18} background={{ fill: 'var(--cs-neutral-soft)', radius: 8 }} />
                </BarChart>
              </ResponsiveContainer></div>
              <div className="d-flex justify-content-between small text-muted mt-1"><span>Top {usageRows.length} by {metric.label.toLowerCase()}</span><Link to="/monitoring">Open monitoring <ArrowUpRight size={13} /></Link></div>
            </> : <EmptyState title="No recent samples" description="Performance charts appear when monitoring samples are available." />}
          </section>}
      </div>

      <div className="col-lg-4">
        {vms.isPending ? <ChartLoading /> : vms.isError ? <ChartError error={vms.error} retry={() => vms.refetch()} /> :
          <section className="cs-card cs-card-body cs-chart-panel cs-state-chart" aria-labelledby="vm-state-heading">
            <div className="cs-chart-heading"><div><div className="cs-chart-kicker"><Server size={14} /> COMPUTE</div><h3 id="vm-state-heading">VM status</h3><p>Click a segment to inspect its machines</p></div></div>
            {stateCounts.length ? <>
              <div className="cs-donut-wrap"><ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stateCounts} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="88%" paddingAngle={4} stroke="none" onClick={(entry) => { if (entry.name) setSelectedState((current) => current === entry.name ? '' : String(entry.name)); }}>
                    {stateCounts.map((item) => <Cell key={item.name} fill={item.color} opacity={!selectedState || selectedState === item.name ? 1 : .34} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatNumber(Number(value)), String(name)]} />
                </PieChart>
              </ResponsiveContainer><div className="cs-donut-center"><strong>{formatNumber(vmRows.length)}</strong><span>virtual machines</span></div></div>
              <div className="cs-state-legend">{stateCounts.map((item) => <button key={item.name} type="button" className={selectedState === item.name ? 'active' : ''} onClick={() => setSelectedState((current) => current === item.name ? '' : item.name)}><i style={{ background: item.color }} /><span>{item.name.toLowerCase()}</span><strong>{item.value}</strong></button>)}</div>
              {selectedState && <div className="cs-selected-vms"><div className="small text-muted mb-1">{selectedVms.length} {selectedState.toLowerCase()} VM{selectedVms.length === 1 ? '' : 's'}</div>{selectedVms.slice(0, 3).map((vm) => <Link key={vm.vm_id} to={`/vms/${vm.vm_id}`}>{vm.name}<ArrowUpRight size={13} /></Link>)}</div>}
            </> : <EmptyState title="No virtual machines" description="Status distribution will appear after your first VM is created." action={<Link to="/vms/new" className="btn btn-primary btn-sm">Create a VM</Link>} />}
          </section>}
      </div>

      <div className="col-12">
        {invoices.isPending ? <ChartLoading /> : invoices.isError ? <ChartError error={invoices.error} retry={() => invoices.refetch()} /> : <BillingTrendChart invoices={invoices.data ?? []} />}
      </div>
    </div>
  </section>;
}
