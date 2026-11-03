import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/common/PageHeader';
import UsageMeter from '@/components/common/UsageMeter';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateViews';
import { getData, patchData } from '@/lib/api-client';
import { useToast } from '@/components/common/ToastProvider';
interface Host { host_id:string; hostname:string; region_name:string; status:string; total_cpu:number; total_ram_gb:number; allocated_cpu:number; allocated_ram_gb:number; vm_count:number; low_capacity_threshold_pct:string; }
function HostCard({host}:{host:Host}) {
 const [editing,setEditing]=useState(false); const [status,setStatus]=useState(host.status); const [threshold,setThreshold]=useState(host.low_capacity_threshold_pct);
 const qc=useQueryClient(); const toast=useToast();
 const save=useMutation({mutationFn:()=>patchData(`/admin/hosts/${host.host_id}`,{status,low_capacity_threshold_pct:Number(threshold)}),onSuccess:async()=>{setEditing(false);toast.success('Host settings saved.');await Promise.all(['admin-hosts','dashboard','admin-audit','notifications'].map(key=>qc.invalidateQueries({queryKey:[key]})));}});
 const low=(host.total_cpu-host.allocated_cpu)*100/host.total_cpu<Number(host.low_capacity_threshold_pct)||(host.total_ram_gb-host.allocated_ram_gb)*100/host.total_ram_gb<Number(host.low_capacity_threshold_pct);
 return <article className="cs-card cs-card-body"><div className="d-flex justify-content-between gap-3"><div><h2 className="h5">{host.hostname}</h2><p className="small text-muted">{host.region_name} · {host.vm_count} reserved VMs</p></div><StatusBadge status={host.status}/></div>
 <UsageMeter label="Reserved vCPU" used={host.allocated_cpu} max={host.total_cpu}/><UsageMeter label="Reserved memory" used={host.allocated_ram_gb} max={host.total_ram_gb} unit=" GB"/>
 <p className="small mt-3">{low?'Low capacity: review reservations before adding workloads.': 'Capacity is above the warning threshold.'}</p>
 {editing?<form onSubmit={e=>{e.preventDefault();save.mutate();}}><label className="form-label" htmlFor={`status-${host.host_id}`}>Placement status</label><select id={`status-${host.host_id}`} className="form-select mb-2" value={status} onChange={e=>setStatus(e.target.value)}>{['ACTIVE','DRAINING','MAINTENANCE','DECOMMISSIONED'].map(s=><option key={s}>{s}</option>)}</select>
 <p className="small text-muted">Active accepts new VMs. Draining blocks new placements. Maintenance and decommissioning require no reserved VMs.</p>
 <label className="form-label" htmlFor={`threshold-${host.host_id}`}>Warn below this free capacity (%)</label><input id={`threshold-${host.host_id}`} className="form-control mb-3" type="number" min="0" max="100" step="0.01" required value={threshold} onChange={e=>setThreshold(e.target.value)}/>
 {save.isError&&<div className="alert alert-danger" role="alert">{save.error.message}</div>}<button className="btn btn-primary btn-sm" disabled={save.isPending}>Save settings</button> <button type="button" className="btn btn-outline-secondary btn-sm" disabled={save.isPending} onClick={()=>setEditing(false)}>Cancel</button></form>:<button className="btn btn-outline-primary btn-sm" onClick={()=>{setStatus(host.status);setThreshold(host.low_capacity_threshold_pct);save.reset();setEditing(true);}}>Edit settings</button>}</article>;
}
export default function AdminHostsPage(){
 const [search,setSearch]=useState(''); const query=useQuery({queryKey:['admin-hosts'],queryFn:()=>getData<Host[]>('/admin/hosts'),refetchInterval:30000});
 const items=query.data?.filter(h=>`${h.hostname} ${h.region_name} ${h.status}`.toLowerCase().includes(search.toLowerCase()));
 return <><PageHeader title="Hosts & capacity" subtitle="Registered simulation hosts. Status changes control where new VM records can be allocated."/><input className="form-control mb-3" aria-label="Search hosts" placeholder="Search host, region or status" value={search} onChange={e=>setSearch(e.target.value)}/>{query.isPending&&<LoadingBlock rows={4}/>} {query.isError&&<ErrorState error={query.error} onRetry={()=>query.refetch()}/>}{items?.length===0&&<EmptyState title="No matching hosts" description="Try another host name or region."/>}<div className="row g-3">{items?.map(h=><div className="col-lg-6" key={h.host_id}><HostCard host={h}/></div>)}</div></>;
}
