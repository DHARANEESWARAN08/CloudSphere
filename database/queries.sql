-- CloudSphere review queries. Run selected statements in pgAdmin on cloudsphere.
-- Q1: Running VMs, newest first.
SELECT vm_id, name, state, created_at
FROM public.virtual_machine WHERE state = 'RUNNING'
ORDER BY created_at DESC, vm_id DESC;

-- Q2: Three-table JOIN: VM, owning project and compute configuration.
SELECT v.name AS vm, p.name AS project, c.vcpu, c.ram_gb
FROM public.virtual_machine v
JOIN public.project p ON p.project_id = v.project_id
JOIN public.vm_configuration c ON c.vm_configuration_id = v.vm_configuration_id;

-- Q3: Include projects with zero VMs using LEFT JOIN and COUNT(column).
SELECT p.name, COUNT(v.vm_id) AS vm_count
FROM public.project p
LEFT JOIN public.virtual_machine v ON v.project_id = p.project_id
GROUP BY p.project_id, p.name ORDER BY vm_count DESC;

-- Q4: Subquery: projects that have no VM records.
SELECT p.project_id, p.name FROM public.project p
WHERE NOT EXISTS (SELECT 1 FROM public.virtual_machine v WHERE v.project_id = p.project_id);

-- Q5: Active hosts and their regions; free capacity is a generated column.
SELECT h.hostname, r.name AS region, h.free_cpu, h.free_ram_gb
FROM public.cloud_host h JOIN public.cloud_region r ON r.region_id = h.region_id
WHERE h.status = 'ACTIVE' AND h.free_cpu >= 2 AND h.free_ram_gb >= 4;

-- Q6: Approval status summary.
SELECT status, COUNT(*) AS request_count
FROM public.vm_request GROUP BY status ORDER BY status;

-- Optional session-only view. This does not create a permanent application view.
CREATE OR REPLACE TEMP VIEW review_vm_summary AS
SELECT v.name AS vm, p.name AS project, v.state
FROM public.virtual_machine v JOIN public.project p USING (project_id);
SELECT * FROM review_vm_summary ORDER BY project, vm;

-- Isolated CRUD exercise, run the complete block as the schema owner.
-- This illustrates SQL mechanics, not the production provisioning workflow.
BEGIN;
CREATE TEMP TABLE review_crud_demo (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, vcpu INTEGER CHECK (vcpu > 0)
) ON COMMIT DROP;
INSERT INTO review_crud_demo VALUES (1, 'demo', 2) RETURNING *;
UPDATE review_crud_demo SET vcpu = 4 WHERE id = 1 RETURNING *;
SELECT * FROM review_crud_demo;
DELETE FROM review_crud_demo WHERE id = 1 RETURNING *;
ROLLBACK;
