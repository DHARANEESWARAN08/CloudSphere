import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CircleDollarSign } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/common/StateViews';
import { formatCurrency } from '@/lib/formatting';

export interface BillingTrendPoint { period_start: string; total_amount: string | number }
const tooltipStyle = { backgroundColor: 'var(--cs-surface-raised)', border: '1px solid var(--cs-border)', borderRadius: 8, color: 'var(--cs-text)', boxShadow: 'var(--cs-shadow-popover)' };

export default function BillingTrendChart({ invoices }: { invoices: BillingTrendPoint[] }) {
  const [months, setMonths] = useState(6);
  const points = useMemo(() => {
    const grouped = invoices.reduce<Record<string, number>>((groups, invoice) => {
      const month = invoice.period_start.slice(0, 7);
      if (month) groups[month] = (groups[month] ?? 0) + Number(invoice.total_amount);
      return groups;
    }, {});
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(-months).map(([month, amount]) => ({
      month, amount,
      label: new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`)),
    }));
  }, [invoices, months]);
  const total = points.reduce((sum, point) => sum + point.amount, 0);
  return <section className="cs-card cs-card-body cs-chart-panel" aria-labelledby="billing-chart-heading">
    <div className="cs-chart-heading"><div><div className="cs-chart-kicker"><CircleDollarSign size={14} /> BILLING</div><h3 id="billing-chart-heading">Invoice trend</h3><p>Issued invoice totals grouped by billing period</p></div>
      <div className="cs-chart-range" role="group" aria-label="Billing chart range">{[3, 6, 12].map((range) => <button key={range} type="button" className={months === range ? 'active' : ''} aria-pressed={months === range} onClick={() => setMonths(range)}>{range} mo</button>)}</div>
    </div>
    {points.length ? <>
      <div className="cs-chart-summary"><strong>{formatCurrency(total)}</strong><span>invoices in the selected period</span><small>{points.length} billing period{points.length === 1 ? '' : 's'}</small></div>
      <div className="cs-chart-canvas cs-chart-canvas--area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--cs-border)" strokeDasharray="3 5" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--cs-muted)', fontSize: 11 }} />
        <YAxis width={70} axisLine={false} tickLine={false} tick={{ fill: 'var(--cs-muted)', fontSize: 11 }} tickFormatter={(value) => formatCurrency(value)} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), 'Invoice total']} />
        <Area type="monotone" dataKey="amount" stroke="var(--cs-accent)" strokeWidth={2.5} fill="var(--cs-accent-soft)" activeDot={{ r: 5, strokeWidth: 3, stroke: 'var(--cs-surface)' }} />
      </AreaChart></ResponsiveContainer></div>
      <div className="d-flex justify-content-end small text-muted mt-1"><Link to="/billing">View invoice ledger <ArrowUpRight size={13} /></Link></div>
    </> : <EmptyState title="No invoice history yet" description="Invoice totals will be charted here when billing records are available." />}
  </section>;
}
