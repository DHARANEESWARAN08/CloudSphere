import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Server } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateViews';
import StatusBadge from '@/components/common/StatusBadge';
import { ApiError, getData, postData } from '@/lib/api-client';
import { formatDateTime } from '@/lib/formatting';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useToast } from '@/components/common/ToastProvider';

interface Vm { vm_id: string; project_id: string; project_name: string; name: string; state: string; vcpu: number; ram_gb: number; os_image: string; region_code: string | null; created_at: string; }
interface VmRequest { vm_request_id:string; project_id:string; project_name:string; name:string; vcpu:number; ram_gb:number; storage_gb:number; status:'PENDING'|'APPROVED'|'REJECTED'; decision_reason:string|null; vm_id:string|null; created_at:string; reviewed_at:string|null; }
export default function VmListPage() {
  const [terminating, setTerminating] = useState<Vm | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ['vms'], queryFn: ({ signal }) => getData<Vm[]>('/vms', undefined, signal) });
  const requests = useQuery({ queryKey:['vm-requests'], queryFn:({signal})=>getData<VmRequest[]>('/vm-requests',undefined,signal), refetchInterval:15000 });
  const pendingRequests = requests.data?.filter((request)=>request.status==='PENDING') ?? [];
  const completedRequests = requests.data?.filter((request)=>request.status!=='PENDING') ?? [];
  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: string }) => postData(`/vms/${id}/${verb}`),
    onSuccess: async (_, { verb }) => {
      setTerminating(null);
      toast.success(`Virtual machine ${verb === 'start' ? 'started' : verb === 'stop' ? 'stopped' : 'terminated'} successfully.`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['vms'] }), qc.invalidateQueries({ queryKey: ['storage'] }), qc.invalidateQueries({ queryKey: ['dashboard'] }), qc.invalidateQueries({ queryKey: ['project'] }), qc.invalidateQueries({ queryKey: ['monitoring-summary'] })]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'VM action failed.'),
  });
  return <>
    <PageHeader title="Virtual machines" subtitle="VMs and lifecycle actions for projects you can access."
      actions={<Link className="btn btn-primary btn-sm" to="/vms/new"><Plus size={15} className="me-1" />Create VM</Link>} />
    {action.isError && <div className="alert alert-danger" role="alert">{action.error instanceof ApiError ? action.error.message : 'VM action failed.'}</div>}
    {query.isPending && <LoadingBlock rows={5} />}
    {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load virtual machines" />}
    {requests.isError&&<ErrorState error={requests.error} onRetry={()=>requests.refetch()} title="Could not load VM requests"/>}
    {!!pendingRequests.length&&<section aria-labelledby="vm-requests-heading" className="mb-4"><h2 id="vm-requests-heading" className="h5 mb-3">Waiting for admin review</h2><div className="d-grid gap-2">{pendingRequests.map((request)=><article className="cs-card cs-card-body" key={request.vm_request_id}><div className="d-flex flex-wrap justify-content-between gap-2"><div><strong>{request.name}</strong><div className="small text-muted">{request.project_name} · {request.vcpu} vCPU · {request.ram_gb} GB RAM · {request.storage_gb} GB disk</div></div><span className="badge text-bg-info">Waiting for review</span></div><p className="small text-muted mt-2 mb-0">No capacity is reserved until an administrator approves this request.</p></article>)}</div></section>}
    {!!completedRequests.length&&<details className="cs-card cs-card-body mb-4"><summary className="fw-semibold">Request history ({completedRequests.length})</summary><div className="d-grid gap-2 mt-3">{completedRequests.map((request)=><article className="border rounded p-3" key={request.vm_request_id}><div className="d-flex flex-wrap justify-content-between gap-2"><div><strong>{request.name}</strong><div className="small text-muted">{request.project_name} · {request.vcpu} vCPU · {request.ram_gb} GB RAM · {request.storage_gb} GB disk</div></div><span className={`badge text-bg-${request.status==='APPROVED'?'success':'secondary'}`}>{request.status}</span></div>{request.status==='REJECTED'&&request.decision_reason&&<p className="small mt-2 mb-0">Reason: {request.decision_reason}</p>}{request.vm_id&&<Link className="btn btn-outline-primary btn-sm mt-2" to={`/vms/${request.vm_id}`}>Open provisioned VM</Link>}</article>)}</div></details>}
    {query.data?.length === 0 && <EmptyState title="No virtual machines yet" description="Create a VM to see it here." action={<Link className="btn btn-primary btn-sm" to="/vms/new">Create VM</Link>} />}
    {!!query.data?.length && <div className="cs-card cs-card-body cs-table-card"><div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Name</th><th>Project</th><th>Configuration</th><th>Region</th><th>Status</th><th>Created</th><th aria-label="Actions" /></tr></thead><tbody>
      {query.data.map((vm) => <tr key={vm.vm_id}><td><Link to={`/vms/${vm.vm_id}`} className="fw-semibold"><Server size={15} className="me-2" />{vm.name}</Link></td><td><Link to={`/projects/${vm.project_id}`}>{vm.project_name}</Link></td><td>{vm.vcpu} vCPU · {vm.ram_gb} GB<br /><small className="text-muted">{vm.os_image}</small></td><td>{vm.region_code ?? '—'}</td><td><StatusBadge status={vm.state} /></td><td>{formatDateTime(vm.created_at)}</td><td className="text-end text-nowrap">
        {vm.state === 'RUNNING' && <button className="btn btn-sm btn-outline-secondary" onClick={() => action.mutate({ id: vm.vm_id, verb: 'stop' })} disabled={action.isPending}>Stop</button>}
        {vm.state === 'STOPPED' && <button className="btn btn-sm btn-outline-primary me-1" onClick={() => action.mutate({ id: vm.vm_id, verb: 'start' })} disabled={action.isPending}>Start</button>}
        {!['TERMINATED','FAILED','PREEMPTED'].includes(vm.state) && <button className="btn btn-sm btn-outline-danger ms-1" onClick={() => setTerminating(vm)} disabled={action.isPending}>Terminate</button>}
      </td></tr>)}
    </tbody></table></div></div>}
    <ConfirmDialog
      open={Boolean(terminating)}
      title="Terminate this virtual machine?"
      description={<>Terminate <strong>{terminating?.name}</strong>? This releases its reserved capacity. The VM record remains in project history, but the operation cannot be undone.</>}
      confirmLabel="Terminate VM"
      busy={action.isPending}
      onCancel={() => setTerminating(null)}
      onConfirm={() => terminating && action.mutate({ id: terminating.vm_id, verb: 'terminate' })}
    />
  </>;
}
