import { useAuth } from '@/features/auth/AuthContext';
import AdminLayout from '@/components/layout/AdminLayout';
import CustomerLayout from '@/components/layout/CustomerLayout';

export default function RoleLayout() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminLayout /> : <CustomerLayout />;
}
