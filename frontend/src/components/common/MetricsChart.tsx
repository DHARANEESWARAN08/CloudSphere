import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateTime } from '@/lib/formatting';

export interface MetricPoint { logged_at: string; cpu_pct: number | string; ram_pct: number | string; disk_pct: number | string; net_in_kbps?: number | string; net_out_kbps?: number | string; }
export default function MetricsChart({ data }: { data: MetricPoint[] }) {
  const [hours, setHours] = useState(24);
  const [visible, setVisible] = useState({ cpu: true, ram: true, disk: true });
  const points = useMemo(() => {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return data.map((p) => ({ ...p, cpu: Number(p.cpu_pct), ram: Number(p.ram_pct), disk: Number(p.disk_pct), time: p.logged_at }))
      .filter((point) => new Date(point.time).getTime() >= cutoff);
  }, [data, hours]);
  const series = [{ key: 'cpu' as const, label: 'CPU', color: 'var(--cs-accent)', dash: undefined }, { key: 'ram' as const, label: 'Memory', color: 'var(--cs-accent)', dash: '6 3' }, { key: 'disk' as const, label: 'Disk', color: 'var(--cs-accent)', dash: '2 3' }];
  return <>
    <div className="cs-metrics-controls">
      <div className="cs-chart-segment" role="group" aria-label="Metric visibility">{series.map((item) => <button key={item.key} type="button" className={visible[item.key] ? 'active' : ''} aria-pressed={visible[item.key]} onClick={() => setVisible((current) => ({ ...current, [item.key]: !current[item.key] }))}>{item.label}</button>)}</div>
      <div className="cs-chart-range" role="group" aria-label="Monitoring time range">{[6, 12, 24].map((range) => <button key={range} type="button" className={hours === range ? 'active' : ''} aria-pressed={hours === range} onClick={() => setHours(range)}>{range}h</button>)}</div>
    </div>
    <div className="cs-chart-card" style={{ width: '100%', height: 310 }}><ResponsiveContainer>
      <LineChart data={points} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--cs-border)" />
        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: 'var(--cs-muted)', fontSize: 11 }} tickFormatter={(v: string) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} minTickGap={40} />
        <YAxis domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fill: 'var(--cs-muted)', fontSize: 11 }} width={42} />
        <Tooltip labelFormatter={(v) => formatDateTime(String(v))} formatter={(v) => [`${Number(v).toFixed(1)}%`]} contentStyle={{ backgroundColor: 'var(--cs-surface-raised)', color: 'var(--cs-text)', border: '1px solid var(--cs-border)', borderRadius: 8, boxShadow: 'var(--cs-shadow-popover)' }} />
        {series.map((item) => visible[item.key] && <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeDasharray={item.dash} dot={false} activeDot={{ r: 4 }} strokeWidth={2.4} connectNulls />)}
      </LineChart>
    </ResponsiveContainer></div>
  </>;
}
