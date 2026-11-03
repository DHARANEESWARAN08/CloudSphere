import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FolderKanban, Plus, X } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateViews';
import { useToast } from '@/components/common/ToastProvider';
import { useAuth } from '@/features/auth/AuthContext';
import { getData, postData } from '@/lib/api-client';
import { formatCurrency, formatNumber } from '@/lib/formatting';
import StatusBadge from '@/components/common/StatusBadge';

interface Project {
  project_id: string; organization_id: string; name: string; description: string | null; status: string; monthly_budget: string | null;
  max_vcpu: number | null; used_vcpu: number | null; max_ram_gb: number | null; used_ram_gb: number | null;
  max_vms: number | null; used_vms: number | null;
}
interface Organization { organization_id: string; name: string }
interface ProjectInput { name: string; description: string; monthly_budget: number | null; organization_id?: string }

export default function ProjectsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const isAdmin = user?.role === 'admin';
  const canCreate = Boolean(user?.organization_id || isAdmin);
  const query = useQuery({ queryKey: ['projects'], queryFn: ({ signal }) => getData<Project[]>('/projects', undefined, signal) });
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: ({ signal }) => getData<Organization[]>('/organizations', undefined, signal),
    enabled: isAdmin,
  });
  useEffect(() => {
    if (!organizationId && organizations.data?.length) setOrganizationId(organizations.data[0].organization_id);
  }, [organizationId, organizations.data]);

  const create = useMutation({
    mutationFn: (input: ProjectInput) => postData<Project>('/projects', input),
    onSuccess: async (project) => {
      setName(''); setDescription(''); setMonthlyBudget(''); setShowForm(false);
      toast.success(`Project “${project.name}” created.`);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create project.'),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({
      name,
      description,
      monthly_budget: monthlyBudget.trim() ? Number(monthlyBudget) : null,
      ...(isAdmin ? { organization_id: organizationId } : {}),
    });
  }

  const createButton = canCreate && <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowForm((value) => !value)}>
    {showForm ? <X size={15} className="me-1" /> : <Plus size={15} className="me-1" />}{showForm ? 'Cancel' : 'Create project'}
  </button>;

  return <>
    <PageHeader title="Projects" subtitle={isAdmin ? 'Projects across organizations, with tenant ownership and current quota use.' : 'Your organization’s projects, quotas, and VM resources.'}
      actions={<>{createButton}<Link className="btn btn-outline-primary btn-sm" to="/vms/new">Request a VM</Link></>} />

    {showForm && <section className="cs-card cs-card-body mb-3" aria-labelledby="create-project-heading">
      <h2 className="cs-card-title" id="create-project-heading">Create a project</h2>
      <form className="row g-3" onSubmit={submit}>
        {isAdmin && <div className="col-md-6">
          <label className="form-label" htmlFor="project-organization">Organization</label>
          {organizations.isError ? <ErrorState error={organizations.error} onRetry={() => organizations.refetch()} title="Could not load organizations" /> :
            <select className="form-select" id="project-organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} required disabled={organizations.isPending || !organizations.data?.length}>
              <option value="">Choose an organization</option>{(organizations.data ?? []).map((organization) => <option key={organization.organization_id} value={organization.organization_id}>{organization.name}</option>)}
            </select>}
        </div>}
        <div className="col-md-6"><label className="form-label" htmlFor="project-name">Project name</label>
          <input id="project-name" className="form-control" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required placeholder="e.g. Website modernization" />
        </div>
        <div className="col-md-6"><label className="form-label" htmlFor="project-budget">Monthly budget (optional)</label>
          <input id="project-budget" className="form-control" type="number" min="0" step="0.01" value={monthlyBudget} onChange={(event) => setMonthlyBudget(event.target.value)} placeholder="No limit" />
        </div>
        <div className="col-12"><label className="form-label" htmlFor="project-description">Description (optional)</label>
          <textarea id="project-description" className="form-control" rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this project for?" />
        </div>
        <div className="col-12 d-flex gap-2"><button className="btn btn-primary" type="submit" disabled={create.isPending || (isAdmin && (!organizationId || organizations.isPending))}>{create.isPending ? 'Creating…' : 'Create project'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
      </form>
    </section>}

    {!canCreate && <div className="alert alert-info" role="status">This account needs an organization before it can create a project.</div>}
    {query.isPending && <LoadingBlock rows={4} />}
    {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load projects" />}
    {query.isSuccess && query.data.length === 0 && <EmptyState title="No projects yet" description="Create a project to start requesting virtual machines." action={!showForm ? createButton : undefined} />}
    {query.isSuccess && query.data.length > 0 && <div className="row g-3">
      {query.data.map((project) => <div className="col-md-6 col-xl-4" key={project.project_id}>
        <Link to={`/projects/${project.project_id}`} className="cs-card cs-card-body h-100 d-block text-decoration-none text-reset">
          <div className="d-flex align-items-start gap-3"><span className="cs-stat-icon"><FolderKanban size={18} /></span><div className="min-w-0">
            <h2 className="h6 mb-1">{project.name}</h2><p className="small text-muted mb-2">{project.description || 'Project resource workspace'}</p>
            {isAdmin && <p className="small mb-2"><span className="text-muted">Organization · </span>{organizations.data?.find((organization) => organization.organization_id === project.organization_id)?.name ?? 'Organization unavailable'}</p>}
            <StatusBadge status={project.status} />
          </div></div>
          <hr />
          <div className="d-flex justify-content-between small"><span className="text-muted">vCPU</span><strong>{formatNumber(project.used_vcpu)}/{formatNumber(project.max_vcpu)}</strong></div>
          <div className="d-flex justify-content-between small mt-2"><span className="text-muted">VM slots</span><strong>{formatNumber(project.used_vms)}/{formatNumber(project.max_vms)}</strong></div>
          <div className="d-flex justify-content-between small mt-2"><span className="text-muted">Monthly budget</span><strong>{project.monthly_budget ? formatCurrency(project.monthly_budget) : 'No limit'}</strong></div>
        </Link>
      </div>)}
    </div>}
  </>;
}
