import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowUpRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/common/StateViews';
import { formatNumber, formatPercent } from '@/lib/formatting';

export interface MonitoringPoint {
  vm_id: string; name: string; avg_cpu_pct: string | null; avg_ram_pct: string | null;
  avg_disk_pct: string | null; sample_count: number; latest_sample_at: string | null;
}
const METRICS = [
  { key: 'avg_cpu_pct', label: 'CPU', color: 'var(--cs-accent)' },
  { key: 'avg_ram_pct', label: 'Memory', color: 'var(--cs-accent)' },
  { key: 'avg_disk_pct', label: 'Disk', color: 'var(--cs-accent)' },
] as const;
const tooltipStyle = { backgroundColor: 'var(--cs-surface-raised)', border: '1px solid var(--cs-border)', borderRadius: 8, color: 'var(--cs-text)', boxShadow: 'var(--cs-shadow-popover)' };

export default function MonitoringUtilizationChart({ data, embedded = false }: { data: MonitoringPoint[]; embedded?: boolean }) {
  const [metricKey, setMetricKey] = useState<(typeof METRICS)[number]['key']>('avg_cpu_pct');
  const metric = METRICS.find((item) => item.key === metricKey)!;
  const rows = data
    .filter((row) => row[metricKey] !== null && Number(row[metricKey]) >= 0)
    .sort((a, b) => Number(b[metricKey]) - Number(a[metricKey]))
    .slice(0, embedded ? 8 : 12)
    .map((row) => ({ name: row.name, value: Number(row[metricKey]), samples: row.sample_count }));
  const samples = rows.reduce((sum, row) => sum + row.samples, 0);
  const content = <>
    <div className="cs-chart-heading"><div><div className="cs-chart-kicker"><Activity size={14} /> PERFORMANCE</div><h3>Resource use by VM</h3><p>Average utilization across the last 24 hours</p></div>
      <div className="cs-chart-segment" role="group" aria-label="Choose utilization metric">{METRICS.map((item) => <button key={item.key} type="button" className={metricKey === item.key ? 'active' : ''} onClick={() => setMetricKey(item.key)} aria-pressed={metricKey === item.key}>{item.label}</button>)}</div>
    </div>
    {rows.length ? <>
      <div className="cs-chart-summary"><strong style={{ color: metric.color }}>{formatPercent(rows[0].value, 1)}</strong><span>highest average · {rows[0].name}</span><small>{formatNumber(samples)} samples</small></div>
      <div className={`cs-chart-canvas ${embedded ? 'cs-chart-canvas--bar' : 'cs-chart-canvas--monitoring'}`}><ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 6, right: 22, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--cs-border)" strokeDasharray="3 5" />
          <XAxis type="number" domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fill: 'var(--cs-muted)', fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false} tick={{ fill: 'var(--cs-muted)', fontSize: 11 }} />
          <Tooltip cursor={{ fill: 'var(--cs-neutral-soft)', opacity: .5 }} contentStyle={tooltipStyle} formatter={(value) => [formatPercent(Number(value), 1), metric.label]} labelFormatter={(name) => `VM · ${name}`} />
          <Bar dataKey="value" fill={metric.color} radius={[0, 8, 8, 0]} maxBarSize={18} background={{ fill: 'var(--cs-neutral-soft)', radius: 8 }} />
        </BarChart>
      </ResponsiveContainer></div>
      {!embedded && <div className="d-flex justify-content-end small mt-1"><Link to="/vms">View virtual machines <ArrowUpRight size={13} /></Link></div>}
    </> : <EmptyState title="No recent samples" description="Performance charts appear when monitoring samples are available." />}
  </>;
  return embedded ? <div className="cs-chart-panel-content">{content}</div> : <section className="cs-card cs-card-body cs-chart-panel" aria-label="Interactive VM utilization chart">{content}</section>;
}
