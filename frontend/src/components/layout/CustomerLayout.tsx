import { Outlet } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';

export default function CustomerLayout() {
  return <AppShell mode="customer"><Outlet /></AppShell>;
}
