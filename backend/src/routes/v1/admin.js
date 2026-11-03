import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { requireRole } from '../../middleware/auth.js';

const router = Router();
router.use(requireRole('admin'));
const invalid = (res, message, status = 400) => res.status(status).json({ error: { code: 'INVALID_OPERATION', message } });
const id = z.string().regex(/^[1-9]\d*$/);

router.get('/hosts', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT h.*,r.name AS region_name,r.code AS region_code,
      (SELECT count(*)::int FROM virtual_machine vm WHERE vm.host_id=h.host_id AND vm.state IN ('PROVISIONING','RUNNING','STOPPED')) AS vm_count
      FROM cloud_host h JOIN cloud_region r USING(region_id) ORDER BY h.hostname`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.get('/vm-requests', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT vr.vm_request_id,vr.project_id,p.name AS project_name,o.name AS organization_name,
        vr.requested_by,u.full_name AS requester_name,u.email AS requester_email,vr.name,vr.vcpu,vr.ram_gb,vr.storage_gb,
        vr.os_image,vr.volume_type,vr.region_id,r.name AS region_name,vr.max_hourly_budget,vr.created_at,
        e.monthly_total_cost AS estimated_monthly_cost,e.projected_monthly_after,e.monthly_budget,e.within_monthly_budget
      FROM vm_request vr JOIN project p USING(project_id) JOIN organization o USING(organization_id)
      JOIN app_user u ON u.user_id=vr.requested_by LEFT JOIN cloud_region r USING(region_id)
      CROSS JOIN LATERAL estimate_vm_cost(vr.project_id,vr.vcpu,vr.ram_gb,vr.storage_gb) e
      WHERE vr.status='PENDING' ORDER BY vr.created_at,vr.vm_request_id`);
    res.json({data:rows});
  } catch (e) { next(e); }
});

router.post('/vm-requests/:id/decision', async (req, res, next) => {
  const requestId = id.safeParse(req.params.id);
  const parsed = z.object({decision:z.enum(['APPROVE','REJECT']),reason:z.string().trim().max(500).optional()}).strict().safeParse(req.body);
  if (!requestId.success || !parsed.success || (parsed.data?.decision==='REJECT' && (!parsed.data.reason || parsed.data.reason.length<3)))
    return invalid(res,'Choose approve, or provide a rejection reason of at least 3 characters.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows:[request]} = await client.query(`SELECT vr.*,p.organization_id FROM vm_request vr JOIN project p USING(project_id)
      WHERE vm_request_id=$1 FOR UPDATE OF vr`,[requestId.data]);
    if (!request) { await client.query('ROLLBACK'); return invalid(res,'VM request not found.',404); }
    if (request.status!=='PENDING') { await client.query('ROLLBACK'); return invalid(res,'This request has already been reviewed.',409); }

    let vmId = null;
    if (parsed.data.decision==='APPROVE') {
      const {rows:[allocated]} = await client.query(`CALL allocate_resource($1::bigint,$2::bigint,$3::text,$4::int,$5::int,$6::int,$7::text,$8::text,$9::bigint,$10::numeric,$11::bigint)`,
        [request.requested_by,request.project_id,request.name,request.vcpu,request.ram_gb,request.storage_gb,request.os_image,request.volume_type,request.region_id,request.max_hourly_budget,null]);
      vmId = allocated.p_vm_id;
      await client.query('CALL complete_provisioning($1::bigint)',[vmId]);
      await client.query(`UPDATE vm_request SET status='APPROVED',reviewed_by=$2,reviewed_at=now(),vm_id=$3 WHERE vm_request_id=$1`,[request.vm_request_id,req.user.user_id,vmId]);
      await client.query(`INSERT INTO notification_queue(user_id,notification_type,title,payload,status,sent_at)
        VALUES($1,'VM_REQUEST_APPROVED',$2,$3,'SENT',now())`,[request.requested_by,`VM request approved: ${request.name}`,JSON.stringify({vm_request_id:request.vm_request_id,vm_id:vmId,project_id:request.project_id})]);
    } else {
      await client.query(`UPDATE vm_request SET status='REJECTED',reviewed_by=$2,reviewed_at=now(),decision_reason=$3 WHERE vm_request_id=$1`,[request.vm_request_id,req.user.user_id,parsed.data.reason]);
      await client.query(`INSERT INTO notification_queue(user_id,notification_type,title,payload,status,sent_at)
        VALUES($1,'VM_REQUEST_REJECTED',$2,$3,'SENT',now())`,[request.requested_by,`VM request rejected: ${request.name}`,JSON.stringify({vm_request_id:request.vm_request_id,project_id:request.project_id,reason:parsed.data.reason})]);
    }
    await client.query(`INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,new_values)
      VALUES($1,$2,'vm_request',$3,$4)`,[req.user.user_id,parsed.data.decision==='APPROVE'?'vm_request.approved':'vm_request.rejected',request.vm_request_id,JSON.stringify({decision:parsed.data.decision,reason:parsed.data.reason??null,vm_id:vmId})]);
    await client.query('COMMIT');
    res.json({data:{vm_request_id:request.vm_request_id,status:parsed.data.decision==='APPROVE'?'APPROVED':'REJECTED',vm_id:vmId}});
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    next(e);
  } finally { client.release(); }
});

router.get('/quotas', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT q.*,o.name AS organization_name,p.name AS project_name
      FROM resource_quota q JOIN organization o USING(organization_id) LEFT JOIN project p USING(project_id)
      ORDER BY o.name,p.name NULLS FIRST`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// Lock the same rows used by allocation before changing placement eligibility or limits.
for (const kind of ['hosts', 'quotas']) {
  const schema = kind === 'hosts' ? z.object({ status: z.enum(['ACTIVE','DRAINING','MAINTENANCE','DECOMMISSIONED']), low_capacity_threshold_pct: z.number().min(0).max(100) }).strict()
    : z.object({ max_vcpu: z.number().int().min(0).max(2147483647), max_ram_gb: z.number().int().min(0).max(2147483647), max_vms: z.number().int().min(0).max(2147483647), max_storage_gb: z.number().int().min(0).max(2147483647).nullable() }).strict();
  router.patch(`/${kind}/:id`, async (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!id.safeParse(req.params.id).success || !parsed.success) return invalid(res, 'Enter valid settings. Limits must be non-negative whole numbers.');
    const table = kind === 'hosts' ? 'cloud_host' : 'resource_quota';
    const key = kind === 'hosts' ? 'host_id' : 'quota_id';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [old] } = await client.query(`SELECT * FROM ${table} WHERE ${key}=$1 FOR UPDATE`, [req.params.id]);
      if (!old) { await client.query('ROLLBACK'); return invalid(res, 'Record not found.', 404); }
      if (kind === 'hosts' && ['MAINTENANCE','DECOMMISSIONED'].includes(parsed.data.status)) {
        const { rows: [active] } = await client.query(`SELECT count(*)::int AS count FROM virtual_machine WHERE host_id=$1 AND state IN ('PROVISIONING','RUNNING','STOPPED')`, [old.host_id]);
        if (active.count || old.allocated_cpu || old.allocated_ram_gb) { await client.query('ROLLBACK'); return invalid(res, 'This host still has reserved VMs. Use Draining to prevent new placements, then terminate its VMs before maintenance or decommissioning.', 409); }
      }
      if (kind === 'quotas' && ['vcpu','ram_gb','vms','storage_gb'].some(k => parsed.data[`max_${k}`] !== null && parsed.data[`max_${k}`] < old[`used_${k}`])) {
        await client.query('ROLLBACK'); return invalid(res, 'A limit cannot be lower than current reserved usage. Release resources first.', 409);
      }
      const keys = Object.keys(parsed.data);
      const { rows: [updated] } = await client.query(`UPDATE ${table} SET ${keys.map((k,i) => `${k}=$${i+2}`).join(',')} WHERE ${key}=$1 RETURNING *`, [req.params.id,...Object.values(parsed.data)]);
      const changed = keys.some(k => String(old[k]) !== String(updated[k]));
      if (changed) {
        await client.query(`INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,old_values,new_values) VALUES($1,$2,$3,$4,$5,$6)`,
          [req.user.user_id,`${table}.settings_changed`,table,req.params.id,Object.fromEntries(keys.map(k => [k,old[k]])),parsed.data]);
        if (kind === 'quotas') await client.query(`INSERT INTO notification_queue(user_id,notification_type,title,payload,status,sent_at)
          SELECT user_id,'QUOTA_UPDATED','Your resource limits have changed',$2,'SENT',now() FROM app_user WHERE organization_id=$1 AND is_active`,
          [old.organization_id,JSON.stringify({ project_id:old.project_id,quota_id:old.quota_id,limits:parsed.data })]);
      }
      await client.query('COMMIT');
      res.json({ data: updated });
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); }
    finally { client.release(); }
  });
}

router.get('/audit', async (req, res, next) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), search:z.string().max(100).default('') }).safeParse(req.query);
  if (!parsed.success) return invalid(res,'Invalid search or page.');
  try {
    const {page,search} = parsed.data;
    const { rows } = await query(`SELECT a.audit_id,a.action,a.entity_type,a.entity_id,a.old_values,a.new_values,a.created_at,
      coalesce(u.full_name,'System') AS actor_name, count(*) OVER()::int AS total
      FROM audit_log a LEFT JOIN app_user u ON u.user_id=a.actor_user_id
      WHERE concat_ws(' ',a.action,a.entity_type,a.entity_id::text,u.full_name) ILIKE $1
      ORDER BY a.created_at DESC,a.audit_id DESC LIMIT 25 OFFSET $2`, [`%${search}%`,(page-1)*25]);
    res.json({data:{items:rows,page,has_more:rows.length>0 && page*25<rows[0].total}});
  } catch (e) { next(e); }
});

router.get('/catalog', async (req, res, next) => {
  try {
    const plans = await query('SELECT * FROM subscription_plan ORDER BY monthly_fee,name');
    const regions = await query(`SELECT r.*,cp.carbon_intensity_gco2_kwh FROM cloud_region r LEFT JOIN carbon_profile cp ON cp.region_id=r.region_id AND cp.effective_to IS NULL ORDER BY r.name`);
    const configurations = await query('SELECT * FROM vm_configuration WHERE is_catalog ORDER BY vcpu,ram_gb,name');
    res.json({data:{plans:plans.rows,regions:regions.rows,configurations:configurations.rows}});
  } catch (e) { next(e); }
});
export default router;
