import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Cpu, HardDrive, MemoryStick, X } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateViews';
import { getData, postData } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/formatting';
import { useToast } from '@/components/common/ToastProvider';

interface VmRequest {
  vm_request_id:string; project_id:string; project_name:string; organization_name:string;
  requester_name:string; requester_email:string; name:string; vcpu:number; ram_gb:number;
  storage_gb:number; os_image:string; volume_type:string; region_name:string|null;
  max_hourly_budget:string|null; estimated_monthly_cost:string; projected_monthly_after:string;
  monthly_budget:string|null; within_monthly_budget:boolean; created_at:string;
}

function RequestCard({request}:{request:VmRequest}) {
  const [reason,setReason]=useState('');
  const qc=useQueryClient(); const toast=useToast();
  const decide=useMutation({
    mutationFn:(decision:'APPROVE'|'REJECT')=>postData(`/admin/vm-requests/${request.vm_request_id}/decision`,{decision,...(decision==='REJECT'?{reason}: {})}),
    onSuccess:async(_,decision)=>{
      toast.success(decision==='APPROVE'?`“${request.name}” was approved and provisioned.`:'VM request rejected; the requester was notified.');
      await Promise.all([qc.invalidateQueries({queryKey:['admin-vm-requests']}),qc.invalidateQueries({queryKey:['dashboard']}),qc.invalidateQueries({queryKey:['admin-audit']}),qc.invalidateQueries({queryKey:['vms']}),qc.invalidateQueries({queryKey:['notifications']})]);
    },
  });
  return <article className="cs-card cs-card-body">
    <div className="d-flex flex-wrap justify-content-between gap-2"><div><h2 className="h5 mb-1">{request.name}</h2><p className="small text-muted mb-0">{request.organization_name} · {request.project_name}</p></div><time className="small text-muted">Submitted {formatDateTime(request.created_at)}</time></div>
    <p className="small mt-3 mb-2">Requested by <strong>{request.requester_name}</strong> · {request.requester_email}</p>
    <div className="d-flex flex-wrap gap-3 small mb-3"><span><Cpu size={15} className="me-1"/>{request.vcpu} vCPU</span><span><MemoryStick size={15} className="me-1"/>{request.ram_gb} GB RAM</span><span><HardDrive size={15} className="me-1"/>{request.storage_gb} GB {request.volume_type}</span></div>
    <div className="row g-2 small mb-3"><div className="col-sm-6"><span className="text-muted">Operating system</span><div>{request.os_image}</div></div><div className="col-sm-6"><span className="text-muted">Placement</span><div>{request.region_name??'Automatic region selection'}</div></div></div>
    <div className={`alert ${request.within_monthly_budget?'alert-info':'alert-warning'} py-2 small`}><strong>Current estimate:</strong> {formatCurrency(request.estimated_monthly_cost)} per month · project total after approval {formatCurrency(request.projected_monthly_after)}{request.monthly_budget!==null?` / ${formatCurrency(request.monthly_budget)} budget`:''}{!request.within_monthly_budget&&<div>Current projection exceeds the project budget. Approval will be blocked unless the budget situation changes.</div>}</div>
    {request.max_hourly_budget!==null&&<p className="small">Maximum hourly compute budget: {formatCurrency(request.max_hourly_budget)}</p>}
    {decide.isError&&<div className="alert alert-danger py-2" role="alert">{decide.error.message}</div>}
    <div className="row g-2 align-items-end"><div className="col-md"><label className="form-label" htmlFor={`reject-${request.vm_request_id}`}>Rejection reason</label><input id={`reject-${request.vm_request_id}`} className="form-control" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Required only when rejecting"/></div><div className="col-md-auto d-flex gap-2"><button type="button" className="btn btn-outline-danger" disabled={decide.isPending||reason.trim().length<3} onClick={()=>decide.mutate('REJECT')}><X size={15} className="me-1"/>Reject</button><button type="button" className="btn btn-primary" disabled={decide.isPending} onClick={()=>decide.mutate('APPROVE')}><Check size={15} className="me-1"/>{decide.isPending?'Reviewing…':'Approve & provision'}</button></div></div>
    <p className="form-text mt-2 mb-0">Approval reserves quota and host capacity, provisions the VM, and notifies the requester. Capacity, budget, and quotas are checked at approval time.</p>
  </article>;
}

export default function AdminVmRequestsPage(){
  const query=useQuery({queryKey:['admin-vm-requests'],queryFn:({signal})=>getData<VmRequest[]>('/admin/vm-requests',undefined,signal),refetchInterval:15000});
  return <><PageHeader title="VM requests" subtitle="Review customer requests before allocating host capacity."/>
    {query.isPending&&<LoadingBlock rows={4}/>}{query.isError&&<ErrorState error={query.error} onRetry={()=>query.refetch()}/>}
    {query.isSuccess&&!query.data.length&&<EmptyState title="No requests waiting" description="New VM requests from customers will appear here and notify the admin team."/>}
    <div className="d-grid gap-3">{query.data?.map(request=><RequestCard key={request.vm_request_id} request={request}/>)}</div>
  </>;
}
