import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ROUTE_LABELS } from '@/components/layout/nav';
import { useAuth } from '@/features/auth/AuthContext';

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    to: isAdmin ? (i === 0 ? '/admin' : '/' + segments.slice(0, i + 1).join('/')) : '/' + segments.slice(0, i + 1).join('/'),
    label: isAdmin && seg === 'admin' ? 'Overview' : ROUTE_LABELS[seg] ?? seg,
  }));

  return (
    <nav className="cs-breadcrumbs" aria-label="Breadcrumb">
      <Link to={isAdmin ? '/admin' : '/'}>{isAdmin ? 'Platform' : 'Workspace'}</Link>
      {crumbs.map((c, i) => (
        <span key={c.to} className="d-inline-flex align-items-center gap-1">
          <ChevronRight size={14} aria-hidden />
          {i === crumbs.length - 1 ? <span aria-current="page">{c.label}</span> : <Link to={c.to}>{c.label}</Link>}
        </span>
      ))}
    </nav>
  );
}
