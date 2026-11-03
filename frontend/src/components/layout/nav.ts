import {
  Activity, Bell, Building2, Cpu, FolderKanban, Gauge, HardDrive, LayoutDashboard, LifeBuoy,
  Lightbulb, Network, Receipt, ScrollText, Server, Layers, Zap, type LucideIcon,
} from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
export interface NavGroup { heading: string; items: NavItem[] }

export const CUSTOMER_NAV_GROUPS: NavGroup[] = [
  { heading: 'WORKSPACE', items: [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/projects', label: 'Projects', icon: FolderKanban },
  ] },
  { heading: 'RESOURCES', items: [
    { to: '/vms', label: 'Compute', icon: Server },
    { to: '/storage', label: 'Storage', icon: HardDrive },
    { to: '/networks', label: 'Networking', icon: Network },
  ] },
  { heading: 'OPERATIONS', items: [
    { to: '/monitoring', label: 'Health & monitoring', icon: Activity },
    { to: '/notifications', label: 'Notifications', icon: Bell },
  ] },
  { heading: 'FINANCIALS', items: [
    { to: '/billing', label: 'Billing', icon: Receipt },
    { to: '/recommendations', label: 'Optimization', icon: Lightbulb },
  ] },
  { heading: 'HELP', items: [{ to: '/support', label: 'Support', icon: LifeBuoy }] },
];

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  { heading: 'PLATFORM', items: [
    { to: '/admin', label: 'Platform overview', icon: LayoutDashboard, end: true },
    { to: '/admin/vm-requests', label: 'VM requests', icon: Server },
    { to: '/admin/audit', label: 'Audit & activity', icon: ScrollText },
  ] },
  { heading: 'TENANTS', items: [
    { to: '/admin/organizations', label: 'Organizations & users', icon: Building2 },
    { to: '/projects', label: 'Projects', icon: FolderKanban },
  ] },
  { heading: 'INFRASTRUCTURE', items: [
    { to: '/admin/hosts', label: 'Hosts & capacity', icon: Cpu },
    { to: '/vms', label: 'Virtual machines', icon: Server },
    { to: '/storage', label: 'Storage', icon: HardDrive },
    { to: '/networks', label: 'Networking', icon: Network },
  ] },
  { heading: 'GOVERNANCE', items: [
    { to: '/admin/quotas', label: 'Quota policies', icon: Gauge },
    { to: '/admin/catalog', label: 'Catalog & regions', icon: Layers },
    { to: '/billing', label: 'Billing oversight', icon: Receipt },
    { to: '/sla-carbon', label: 'Carbon & SLA', icon: Lightbulb },
  ] },
  { heading: 'OPERATIONS', items: [
    { to: '/monitoring', label: 'Monitoring', icon: Activity },
    { to: '/spot-market', label: 'Spot requests', icon: Zap },
    { to: '/notifications', label: 'Notifications', icon: Bell },
    { to: '/support', label: 'Support', icon: LifeBuoy },
  ] },
];

export const ROUTE_LABELS: Record<string, string> = {
  projects: 'Projects', vms: 'Virtual machines', new: 'New VM', 'spot-market': 'Spot market',
  storage: 'Storage', networks: 'Networking', monitoring: 'Monitoring', recommendations: 'Optimization',
  'sla-carbon': 'Carbon & SLA', billing: 'Billing', support: 'Support', notifications: 'Notifications',
  admin: 'Platform control plane', hosts: 'Hosts & capacity', organizations: 'Organizations & users',
  'vm-requests': 'VM requests',
  catalog: 'Catalog & regions', quotas: 'Quota policies', audit: 'Audit & activity', forbidden: 'Access denied',
};
