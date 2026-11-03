import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Activity, Bell, Building2, FolderKanban, LayoutDashboard, Server } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import Brand from '@/components/common/Brand';
import { ADMIN_NAV_GROUPS, CUSTOMER_NAV_GROUPS } from '@/components/layout/nav';
import { usePersistentFlag } from '@/hooks/usePersistentFlag';

export type ShellMode = 'customer' | 'admin';

export default function AppShell({ mode, children }: { mode: ShellMode; children: ReactNode }) {
  const [collapsed, setCollapsed] = usePersistentFlag('cs.sidebar.collapsed', false);
  const [darkMode, setDarkMode] = usePersistentFlag('cs.theme.dark', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const groups = mode === 'admin' ? ADMIN_NAV_GROUPS : CUSTOMER_NAV_GROUPS;

  return (
    <div className={`cs-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className={`cs-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Primary">
        <NavLink to={mode === 'admin' ? '/admin' : '/'} className="cs-brand" aria-label={mode === 'admin' ? 'CloudSphere platform overview' : 'CloudSphere workspace overview'}>
          <span className="cs-brand-identity"><Brand /><span className="cs-brand-context">{mode === 'admin' ? 'PLATFORM CONTROL PLANE' : 'CUSTOMER CONSOLE'}</span></span>
        </NavLink>
        <nav className="cs-nav">
          {groups.map((group) => (
            <div key={group.heading}>
              <div className="cs-nav-heading">{group.heading}</div>
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className="cs-nav-link" title={collapsed ? label : undefined}>
                  <Icon size={18} aria-hidden />
                  <span className="cs-nav-label">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {mobileOpen && <div className="cs-backdrop" onClick={() => setMobileOpen(false)} aria-hidden />}

      <div className="cs-main">
        <Topbar collapsed={collapsed} darkMode={darkMode} onToggleTheme={() => setDarkMode((value) => !value)} onToggleCollapsed={() => setCollapsed((c) => !c)} onOpenMobile={() => setMobileOpen(true)} />
        <main className={`cs-content cs-content--${mode}`} id="main">
          {children}
        </main>
      </div>
      <nav className="cs-mobile-tabbar" aria-label="Quick navigation">
        {(mode === 'admin' ? [
          { to: '/admin', label: 'Platform', icon: Building2, end: true },
          { to: '/admin/organizations', label: 'Tenants', icon: FolderKanban },
          { to: '/admin/hosts', label: 'Hosts', icon: Server },
          { to: '/admin/quotas', label: 'Quotas', icon: Activity },
          { to: '/admin/audit', label: 'Audit', icon: Bell },
        ] : [
          { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
          { to: '/projects', label: 'Projects', icon: FolderKanban },
          { to: '/vms', label: 'Compute', icon: Server },
          { to: '/monitoring', label: 'Health', icon: Activity },
          { to: '/notifications', label: 'Alerts', icon: Bell },
        ]).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="cs-mobile-tab">
            <Icon size={19} aria-hidden /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
