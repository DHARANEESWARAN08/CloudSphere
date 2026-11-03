import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, UserPlus } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateViews';
import { useToast } from '@/components/common/ToastProvider';
import { formatDateTime } from '@/lib/formatting';
import { getData, patchData, postData } from '@/lib/api-client';
import StatusBadge from '@/components/common/StatusBadge';

interface Organization {
  organization_id: string; name: string; billing_email: string; status: 'ACTIVE' | 'SUSPENDED';
  plan_name: string; user_count: number; project_count: number; created_at: string;
}
interface Plan { plan_id: string; name: string }
interface OrganizationUser {
  user_id: string; organization_id: string | null; organization_name: string | null; email: string;
  full_name: string; role: 'admin' | 'customer'; is_active: boolean; last_login_at: string | null; created_at: string;
}
interface CreateOrganizationInput {
  name: string; billing_email: string; plan_id: string; full_name: string; email: string; password: string;
}
interface CreateUserInput { organization_id: string; full_name: string; email: string; password: string }

const emptyOrganization: CreateOrganizationInput = { name: '', billing_email: '', plan_id: '', full_name: '', email: '', password: '' };
const emptyUser: CreateUserInput = { organization_id: '', full_name: '', email: '', password: '' };

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [organizationForm, setOrganizationForm] = useState(emptyOrganization);
  const [userForm, setUserForm] = useState(emptyUser);
  const organizations = useQuery({ queryKey: ['admin', 'organizations'], queryFn: ({ signal }) => getData<Organization[]>('/admin/organizations', undefined, signal) });
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: ({ signal }) => getData<OrganizationUser[]>('/admin/users', undefined, signal) });
  const plans = useQuery({ queryKey: ['admin', 'plans'], queryFn: ({ signal }) => getData<Plan[]>('/admin/plans', undefined, signal) });
  const activeOrganizations = organizations.data?.filter((organization) => organization.status === 'ACTIVE') ?? [];

  useEffect(() => {
    if (!organizationForm.plan_id && plans.data?.length) setOrganizationForm((value) => ({ ...value, plan_id: plans.data![0].plan_id }));
  }, [organizationForm.plan_id, plans.data]);
  useEffect(() => {
    if (activeOrganizations.length && !activeOrganizations.some((organization) => organization.organization_id === userForm.organization_id)) {
      setUserForm((value) => ({ ...value, organization_id: activeOrganizations[0].organization_id }));
    }
  }, [userForm.organization_id, activeOrganizations]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] }),
      queryClient.invalidateQueries({ queryKey: ['organizations'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  };
  const createOrganization = useMutation({
    mutationFn: (input: CreateOrganizationInput) => postData<{ organization: Organization; initial_user: OrganizationUser }>('/admin/organizations', input),
    onSuccess: async ({ organization }) => {
      setOrganizationForm(emptyOrganization);
      toast.success(`Organization “${organization.name}” and its first customer account were created.`);
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create organization.'),
  });
  const createUser = useMutation({
    mutationFn: (input: CreateUserInput) => postData<OrganizationUser>('/admin/users', input),
    onSuccess: async (user) => {
      setUserForm((value) => ({ ...emptyUser, organization_id: value.organization_id }));
      toast.success(`Customer account for ${user.email} was created.`);
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create customer account.'),
  });
  const updateOrganizationStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Organization['status'] }) => patchData(`/admin/organizations/${id}/status`, { status }),
    onSuccess: async (_, { status }) => { toast.success(`Organization ${status.toLowerCase()}.`); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update organization status.'),
  });
  const updateUserStatus = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => patchData(`/admin/users/${id}/status`, { is_active }),
    onSuccess: async (_, { is_active }) => { toast.success(`User account ${is_active ? 'activated' : 'deactivated'}.`); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update user status.'),
  });

  function submitOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createOrganization.mutate(organizationForm);
  }
  function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createUser.mutate(userForm);
  }

  return <>
    <PageHeader title="Organizations & users" subtitle="Manage organization accounts, subscription plans, and customer access." />

    <div className="row g-3 mb-3">
      <div className="col-xl-6">
        <section className="cs-card cs-card-body h-100" aria-labelledby="new-organization-heading">
          <div className="d-flex align-items-center gap-2 mb-3"><Building2 size={19} className="text-primary" /><h2 id="new-organization-heading" className="cs-card-title mb-0">Add an organization</h2></div>
          {plans.isError && <ErrorState error={plans.error} onRetry={() => plans.refetch()} title="Could not load subscription plans" />}
          {plans.isPending ? <LoadingBlock rows={2} /> : <form className="row g-3" onSubmit={submitOrganization}>
            <div className="col-md-6"><label className="form-label" htmlFor="org-name">Organization name</label><input id="org-name" className="form-control" value={organizationForm.name} onChange={(event) => setOrganizationForm({ ...organizationForm, name: event.target.value })} minLength={2} maxLength={120} required /></div>
            <div className="col-md-6"><label className="form-label" htmlFor="org-billing-email">Billing email</label><input id="org-billing-email" type="email" className="form-control" value={organizationForm.billing_email} onChange={(event) => setOrganizationForm({ ...organizationForm, billing_email: event.target.value })} maxLength={320} required /></div>
            <div className="col-12"><label className="form-label" htmlFor="org-plan">Subscription plan</label><select id="org-plan" className="form-select" value={organizationForm.plan_id} onChange={(event) => setOrganizationForm({ ...organizationForm, plan_id: event.target.value })} required>{plans.data?.map((plan) => <option key={plan.plan_id} value={plan.plan_id}>{plan.name}</option>)}</select></div>
            <div className="col-12"><div className="small fw-semibold">Initial customer account</div></div>
            <div className="col-md-6"><label className="form-label" htmlFor="initial-user-name">Full name</label><input id="initial-user-name" className="form-control" value={organizationForm.full_name} onChange={(event) => setOrganizationForm({ ...organizationForm, full_name: event.target.value })} minLength={2} maxLength={120} required /></div>
            <div className="col-md-6"><label className="form-label" htmlFor="initial-user-email">Login email</label><input id="initial-user-email" type="email" className="form-control" value={organizationForm.email} onChange={(event) => setOrganizationForm({ ...organizationForm, email: event.target.value })} maxLength={320} required /></div>
            <div className="col-12"><label className="form-label" htmlFor="initial-user-password">Temporary password</label><input id="initial-user-password" type="password" className="form-control" value={organizationForm.password} onChange={(event) => setOrganizationForm({ ...organizationForm, password: event.target.value })} minLength={12} maxLength={200} autoComplete="new-password" required /><div className="form-text">At least 12 characters. Share it with the account holder securely.</div></div>
            <div className="col-12"><button type="submit" className="btn btn-primary" disabled={createOrganization.isPending || !plans.data?.length}><Plus size={15} className="me-1" />{createOrganization.isPending ? 'Creating…' : 'Create organization'}</button></div>
          </form>}
        </section>
      </div>
      <div className="col-xl-6">
        <section className="cs-card cs-card-body h-100" aria-labelledby="new-user-heading">
          <div className="d-flex align-items-center gap-2 mb-3"><UserPlus size={19} className="text-primary" /><h2 id="new-user-heading" className="cs-card-title mb-0">Add a customer user</h2></div>
          {organizations.isError && <ErrorState error={organizations.error} onRetry={() => organizations.refetch()} title="Could not load organizations" />}
          {organizations.isPending ? <LoadingBlock rows={2} /> : !organizations.data?.length ? <EmptyState title="Create an organization first" description="A customer account must belong to an active organization." /> : <form className="row g-3" onSubmit={submitUser}>
            <div className="col-12"><label className="form-label" htmlFor="user-organization">Organization</label><select id="user-organization" className="form-select" value={userForm.organization_id} onChange={(event) => setUserForm({ ...userForm, organization_id: event.target.value })} required><option value="">Choose an organization</option>{activeOrganizations.map((organization) => <option key={organization.organization_id} value={organization.organization_id}>{organization.name}</option>)}</select>{!activeOrganizations.length && <div className="form-text">There are no active organizations to add users to.</div>}</div>
            <div className="col-md-6"><label className="form-label" htmlFor="user-full-name">Full name</label><input id="user-full-name" className="form-control" value={userForm.full_name} onChange={(event) => setUserForm({ ...userForm, full_name: event.target.value })} minLength={2} maxLength={120} required /></div>
            <div className="col-md-6"><label className="form-label" htmlFor="user-email">Login email</label><input id="user-email" type="email" className="form-control" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} maxLength={320} required /></div>
            <div className="col-12"><label className="form-label" htmlFor="user-password">Temporary password</label><input id="user-password" type="password" className="form-control" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} minLength={12} maxLength={200} autoComplete="new-password" required /><div className="form-text">At least 12 characters. Share it with the account holder securely.</div></div>
            <div className="col-12"><button type="submit" className="btn btn-primary" disabled={createUser.isPending || !userForm.organization_id || !activeOrganizations.length}><UserPlus size={15} className="me-1" />{createUser.isPending ? 'Creating…' : 'Create customer account'}</button></div>
          </form>}
        </section>
      </div>
    </div>

    <section className="cs-card cs-card-body cs-table-card mb-3" aria-labelledby="organizations-heading">
      <div className="d-flex justify-content-between align-items-center mb-3"><div><h2 id="organizations-heading" className="cs-card-title mb-1">Organizations</h2><p className="small text-muted mb-0">Plan, account status, and linked resource counts.</p></div>{organizations.data && <span className="small text-muted">{organizations.data.length} records</span>}</div>
      {organizations.isPending && <LoadingBlock rows={4} />}
      {organizations.isError && <ErrorState error={organizations.error} onRetry={() => organizations.refetch()} title="Could not load organizations" />}
      {organizations.data?.length === 0 && <EmptyState title="No organizations yet" description="Create an organization above to add its first customer account." />}
      {!!organizations.data?.length && <div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Organization</th><th>Billing email</th><th>Plan</th><th>Users</th><th>Projects</th><th>Status</th><th>Action</th></tr></thead><tbody>{organizations.data.map((organization) => <tr key={organization.organization_id}>
        <td><div className="fw-semibold">{organization.name}</div><small className="text-muted">Created {formatDateTime(organization.created_at)}</small></td><td>{organization.billing_email}</td><td>{organization.plan_name}</td><td>{organization.user_count}</td><td>{organization.project_count}</td><td><StatusBadge status={organization.status} /></td>
        <td><button className={`btn btn-sm ${organization.status === 'ACTIVE' ? 'btn-outline-danger' : 'btn-outline-primary'}`} type="button" disabled={updateOrganizationStatus.isPending} onClick={() => updateOrganizationStatus.mutate({ id: organization.organization_id, status: organization.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{organization.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button></td>
      </tr>)}</tbody></table></div>}
    </section>

    <section className="cs-card cs-card-body cs-table-card" aria-labelledby="users-heading">
      <div className="d-flex justify-content-between align-items-center mb-3"><div><h2 id="users-heading" className="cs-card-title mb-1">Users</h2><p className="small text-muted mb-0">Customer login accounts and last sign-in.</p></div>{users.data && <span className="small text-muted">{users.data.length} records</span>}</div>
      {users.isPending && <LoadingBlock rows={4} />}
      {users.isError && <ErrorState error={users.error} onRetry={() => users.refetch()} title="Could not load users" />}
      {users.data?.length === 0 && <EmptyState title="No users yet" description="Create an organization above to add its first customer account." />}
      {!!users.data?.length && <div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Name</th><th>Email</th><th>Organization</th><th>Role</th><th>Last sign-in</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.data.map((user) => <tr key={user.user_id}>
        <td className="fw-semibold">{user.full_name}</td><td>{user.email}</td><td>{user.organization_name ?? 'Platform'}</td><td className="text-capitalize">{user.role}</td><td>{formatDateTime(user.last_login_at)}</td><td><StatusBadge status={user.is_active ? 'ACTIVE' : 'SUSPENDED'} /></td>
        <td>{user.role === 'admin' ? <span className="small text-muted">Platform account</span> : <button className={`btn btn-sm ${user.is_active ? 'btn-outline-danger' : 'btn-outline-primary'}`} type="button" disabled={updateUserStatus.isPending} onClick={() => updateUserStatus.mutate({ id: user.user_id, is_active: !user.is_active })}>{user.is_active ? 'Deactivate' : 'Activate'}</button>}</td>
      </tr>)}</tbody></table></div>}
    </section>
  </>;
}
