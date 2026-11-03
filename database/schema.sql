-- CloudSphere schema snapshot. Fresh bootstrapped database ONLY.
-- Run as cloudsphere_migrator after database/scripts/00_bootstrap.sql.
-- Alternative to npm run migrate, not an additional installation step.
BEGIN;
SELECT pg_advisory_xact_lock(726001);
CREATE TABLE schema_migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- SOURCE: 0001_foundation.sql
-- 0001: extensions and shared helpers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

INSERT INTO schema_migrations(filename,checksum) VALUES ('0001_foundation.sql','d9ba55e2fb3a530b101639749ecc7de46fe351fa597783be5568d150d3e5d3bc');

-- SOURCE: 0002_identity_catalog.sql
-- 0002: subscription plans, regions, organizations, users, projects

CREATE TABLE subscription_plan (
  plan_id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                       TEXT          NOT NULL UNIQUE,
  monthly_fee                NUMERIC(12,2) NOT NULL CHECK (monthly_fee >= 0),
  price_per_vcpu_hour        NUMERIC(12,4) NOT NULL CHECK (price_per_vcpu_hour >= 0),
  price_per_gb_ram_hour      NUMERIC(12,4) NOT NULL CHECK (price_per_gb_ram_hour >= 0),
  price_per_gb_storage_month NUMERIC(12,4) NOT NULL CHECK (price_per_gb_storage_month >= 0),
  sla_uptime_target_pct      NUMERIC(6,3)  NOT NULL CHECK (sla_uptime_target_pct > 0 AND sla_uptime_target_pct <= 100),
  default_max_vcpu           INTEGER       NOT NULL CHECK (default_max_vcpu > 0),
  default_max_ram_gb         INTEGER       NOT NULL CHECK (default_max_ram_gb > 0),
  default_max_vms            INTEGER       NOT NULL CHECK (default_max_vms > 0),
  is_active                  BOOLEAN       NOT NULL DEFAULT true,
  created_at                 TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE cloud_region (
  region_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       TEXT        NOT NULL UNIQUE,
  name       TEXT        NOT NULL,
  country    TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organization (
  organization_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                 TEXT   NOT NULL UNIQUE,
  subscription_plan_id BIGINT NOT NULL REFERENCES subscription_plan(plan_id),
  billing_email        TEXT   NOT NULL,
  status               TEXT   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organization_plan_idx ON organization (subscription_plan_id);

CREATE TABLE app_user (
  user_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id BIGINT REFERENCES organization(organization_id),
  email           TEXT    NOT NULL,
  password_hash   TEXT    NOT NULL,
  full_name       TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK (role IN ('customer','admin')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_user_org_required CHECK (role = 'admin' OR organization_id IS NOT NULL)
);
CREATE UNIQUE INDEX app_user_email_lower_uq ON app_user (lower(email));
CREATE INDEX app_user_org_idx ON app_user (organization_id);

CREATE TABLE project (
  project_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organization(organization_id),
  name            TEXT   NOT NULL,
  description     TEXT,
  status          TEXT   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  monthly_budget  NUMERIC(12,2) CHECK (monthly_budget IS NULL OR monthly_budget >= 0),
  created_by      BIGINT REFERENCES app_user(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX project_created_by_idx ON project (created_by);

CREATE TRIGGER trg_subscription_plan_updated BEFORE UPDATE ON subscription_plan FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cloud_region_updated      BEFORE UPDATE ON cloud_region      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_organization_updated      BEFORE UPDATE ON organization      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_app_user_updated          BEFORE UPDATE ON app_user          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_updated           BEFORE UPDATE ON project           FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO schema_migrations(filename,checksum) VALUES ('0002_identity_catalog.sql','f540e11f4668fdc93e606fc330820dabb1139cc06c87f1e3db30d1b9fafdb939');

-- SOURCE: 0003_infrastructure.sql
-- 0003: carbon profiles, hosts, VM configurations, networks, firewall, load balancers

CREATE TABLE carbon_profile (
  carbon_profile_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  region_id                  BIGINT        NOT NULL REFERENCES cloud_region(region_id),
  version                    INTEGER       NOT NULL CHECK (version >= 1),
  carbon_intensity_gco2_kwh  NUMERIC(8,2)  NOT NULL CHECK (carbon_intensity_gco2_kwh >= 0),
  effective_from             TIMESTAMPTZ   NOT NULL,
  effective_to               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (region_id, version),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX carbon_profile_current_uq ON carbon_profile (region_id) WHERE effective_to IS NULL;

CREATE TABLE cloud_host (
  host_id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  region_id                  BIGINT  NOT NULL REFERENCES cloud_region(region_id),
  hostname                   TEXT    NOT NULL UNIQUE,
  total_cpu                  INTEGER NOT NULL CHECK (total_cpu > 0),
  total_ram_gb               INTEGER NOT NULL CHECK (total_ram_gb > 0),
  allocated_cpu              INTEGER NOT NULL DEFAULT 0,
  allocated_ram_gb           INTEGER NOT NULL DEFAULT 0,
  free_cpu                   INTEGER GENERATED ALWAYS AS (total_cpu - allocated_cpu) STORED,
  free_ram_gb                INTEGER GENERATED ALWAYS AS (total_ram_gb - allocated_ram_gb) STORED,
  status                     TEXT    NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE','DRAINING','MAINTENANCE','DECOMMISSIONED')),
  low_capacity_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (low_capacity_threshold_pct BETWEEN 0 AND 100),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- database-enforced oversubscription guards
  CONSTRAINT cloud_host_cpu_cap CHECK (allocated_cpu BETWEEN 0 AND total_cpu),
  CONSTRAINT cloud_host_ram_cap CHECK (allocated_ram_gb BETWEEN 0 AND total_ram_gb)
);
-- Matches the allocation query: ACTIVE hosts in a region with enough free CPU/RAM
CREATE INDEX cloud_host_selection_idx ON cloud_host (region_id, free_cpu, free_ram_gb) WHERE status = 'ACTIVE';

CREATE TABLE vm_configuration (
  vm_configuration_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                TEXT,
  vcpu                INTEGER NOT NULL CHECK (vcpu > 0),
  ram_gb              INTEGER NOT NULL CHECK (ram_gb > 0),
  os_family           TEXT    NOT NULL CHECK (os_family IN ('LINUX','WINDOWS')),
  os_image            TEXT    NOT NULL,
  is_catalog          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vcpu, ram_gb, os_image)
);

CREATE TABLE virtual_network (
  virtual_network_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id         BIGINT NOT NULL REFERENCES project(project_id),
  region_id          BIGINT NOT NULL REFERENCES cloud_region(region_id),
  parent_network_id  BIGINT REFERENCES virtual_network(virtual_network_id),
  name               TEXT   NOT NULL,
  cidr_block         CIDR   NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name),
  CHECK (parent_network_id IS NULL OR parent_network_id <> virtual_network_id)
);
CREATE INDEX virtual_network_parent_idx ON virtual_network (parent_network_id);
CREATE INDEX virtual_network_region_idx ON virtual_network (region_id);

-- A subnet must lie inside its parent network and belong to the same project
CREATE OR REPLACE FUNCTION check_subnet_in_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent virtual_network%ROWTYPE;
BEGIN
  IF NEW.parent_network_id IS NOT NULL THEN
    SELECT * INTO parent FROM virtual_network WHERE virtual_network_id = NEW.parent_network_id;
    IF parent.project_id <> NEW.project_id OR NOT (parent.cidr_block >>= NEW.cidr_block) THEN
      RAISE EXCEPTION 'Subnet % must be inside its parent network % and the same project', NEW.cidr_block, parent.cidr_block
        USING ERRCODE = 'CS003';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_virtual_network_subnet BEFORE INSERT OR UPDATE OF cidr_block, parent_network_id ON virtual_network
  FOR EACH ROW EXECUTE FUNCTION check_subnet_in_parent();
CREATE TRIGGER trg_virtual_network_updated BEFORE UPDATE ON virtual_network FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE firewall_rule (
  firewall_rule_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  virtual_network_id BIGINT NOT NULL REFERENCES virtual_network(virtual_network_id),
  direction          TEXT   NOT NULL CHECK (direction IN ('INGRESS','EGRESS')),
  action             TEXT   NOT NULL CHECK (action IN ('ALLOW','DENY')),
  protocol           TEXT   NOT NULL CHECK (protocol IN ('TCP','UDP','ICMP','ANY')),
  port_from          INTEGER CHECK (port_from BETWEEN 0 AND 65535),
  port_to            INTEGER CHECK (port_to BETWEEN 0 AND 65535),
  remote_cidr        CIDR   NOT NULL,
  priority           INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 65535),
  description        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (virtual_network_id, direction, priority),
  CHECK ((port_from IS NULL) = (port_to IS NULL)),
  CHECK (port_from IS NULL OR port_from <= port_to),
  CHECK (protocol IN ('TCP','UDP') OR port_from IS NULL)
);

CREATE TABLE load_balancer (
  load_balancer_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id         BIGINT NOT NULL REFERENCES project(project_id),
  virtual_network_id BIGINT NOT NULL REFERENCES virtual_network(virtual_network_id),
  name               TEXT   NOT NULL,
  algorithm          TEXT   NOT NULL DEFAULT 'ROUND_ROBIN' CHECK (algorithm IN ('ROUND_ROBIN','LEAST_CONNECTIONS')),
  listener_protocol  TEXT   NOT NULL DEFAULT 'HTTP' CHECK (listener_protocol IN ('HTTP','HTTPS','TCP')),
  listener_port      INTEGER NOT NULL DEFAULT 80 CHECK (listener_port BETWEEN 1 AND 65535),
  status             TEXT   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DELETED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
CREATE INDEX load_balancer_network_idx ON load_balancer (virtual_network_id);

CREATE TRIGGER trg_cloud_host_updated   BEFORE UPDATE ON cloud_host   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_load_balancer_updated BEFORE UPDATE ON load_balancer FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO schema_migrations(filename,checksum) VALUES ('0003_infrastructure.sql','743486bfd7d13de7337dd5ab88bb3121dfb4c75c353fa78967af054b9d303212');

-- SOURCE: 0004_compute.sql
-- 0004: quotas, VMs, storage, snapshots, allocation history, spot requests
-- D2 (confirmed): a STOPPED VM RETAINS its host assignment and CPU/RAM/quota reservation.

CREATE TABLE resource_quota (
  quota_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id  BIGINT  NOT NULL REFERENCES organization(organization_id),
  project_id       BIGINT  REFERENCES project(project_id),   -- NULL = organization-level limit
  max_vcpu         INTEGER NOT NULL CHECK (max_vcpu >= 0),
  max_ram_gb       INTEGER NOT NULL CHECK (max_ram_gb >= 0),
  max_vms          INTEGER NOT NULL CHECK (max_vms >= 0),
  max_storage_gb   INTEGER CHECK (max_storage_gb IS NULL OR max_storage_gb >= 0), -- NULL = unlimited
  used_vcpu        INTEGER NOT NULL DEFAULT 0 CHECK (used_vcpu >= 0),
  used_ram_gb      INTEGER NOT NULL DEFAULT 0 CHECK (used_ram_gb >= 0),
  used_vms         INTEGER NOT NULL DEFAULT 0 CHECK (used_vms >= 0),
  used_storage_gb  INTEGER NOT NULL DEFAULT 0 CHECK (used_storage_gb >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quota_vcpu_cap    CHECK (used_vcpu <= max_vcpu),
  CONSTRAINT quota_ram_cap     CHECK (used_ram_gb <= max_ram_gb),
  CONSTRAINT quota_vms_cap     CHECK (used_vms <= max_vms),
  CONSTRAINT quota_storage_cap CHECK (max_storage_gb IS NULL OR used_storage_gb <= max_storage_gb)
);
CREATE UNIQUE INDEX resource_quota_project_uq ON resource_quota (project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX resource_quota_org_uq     ON resource_quota (organization_id) WHERE project_id IS NULL;
CREATE TRIGGER trg_resource_quota_updated BEFORE UPDATE ON resource_quota FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every project gets a quota row from its organization's plan defaults (allocation denies projects without one).
CREATE OR REPLACE FUNCTION create_default_project_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO resource_quota (organization_id, project_id, max_vcpu, max_ram_gb, max_vms)
  SELECT NEW.organization_id, NEW.project_id, p.default_max_vcpu, p.default_max_ram_gb, p.default_max_vms
  FROM organization o JOIN subscription_plan p ON p.plan_id = o.subscription_plan_id
  WHERE o.organization_id = NEW.organization_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_project_default_quota AFTER INSERT ON project FOR EACH ROW EXECUTE FUNCTION create_default_project_quota();

CREATE TABLE virtual_machine (
  vm_id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id          BIGINT NOT NULL REFERENCES project(project_id),
  vm_configuration_id BIGINT NOT NULL REFERENCES vm_configuration(vm_configuration_id),
  host_id             BIGINT REFERENCES cloud_host(host_id),
  name                TEXT   NOT NULL,
  state               TEXT   NOT NULL CHECK (state IN
                        ('REQUESTED','PROVISIONING','RUNNING','STOPPED','TERMINATED','PREEMPTED','FAILED')),
  is_spot             BOOLEAN NOT NULL DEFAULT false,
  subnet_id           BIGINT REFERENCES virtual_network(virtual_network_id),
  private_ip          INET,
  load_balancer_id    BIGINT REFERENCES load_balancer(load_balancer_id),
  created_by          BIGINT REFERENCES app_user(user_id),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  stopped_at          TIMESTAMPTZ,
  terminated_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- a VM holds a host (and reservation) in every active state, including STOPPED
  CONSTRAINT vm_active_has_host CHECK (host_id IS NOT NULL OR state NOT IN ('PROVISIONING','RUNNING','STOPPED')),
  CONSTRAINT vm_subnet_ip_pair  CHECK ((subnet_id IS NULL) = (private_ip IS NULL))
);
CREATE UNIQUE INDEX vm_name_active_uq ON virtual_machine (project_id, name)
  WHERE state NOT IN ('TERMINATED','PREEMPTED','FAILED');
CREATE UNIQUE INDEX vm_ip_active_uq ON virtual_machine (subnet_id, private_ip)
  WHERE subnet_id IS NOT NULL AND state NOT IN ('TERMINATED','PREEMPTED','FAILED');
CREATE INDEX vm_project_state_idx ON virtual_machine (project_id, state);
CREATE INDEX vm_host_active_idx   ON virtual_machine (host_id) WHERE state IN ('PROVISIONING','RUNNING','STOPPED');
CREATE INDEX vm_config_idx        ON virtual_machine (vm_configuration_id);
CREATE INDEX vm_lb_idx            ON virtual_machine (load_balancer_id) WHERE load_balancer_id IS NOT NULL;
CREATE TRIGGER trg_vm_updated BEFORE UPDATE ON virtual_machine FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Valid state machine (defence in depth: the lifecycle routines also validate)
CREATE OR REPLACE FUNCTION enforce_vm_state_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = OLD.state THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.state = 'REQUESTED'    AND NEW.state IN ('PROVISIONING','TERMINATED'))
    OR (OLD.state = 'PROVISIONING' AND NEW.state IN ('RUNNING','FAILED','TERMINATED'))
    OR (OLD.state = 'RUNNING'      AND (NEW.state IN ('STOPPED','TERMINATED') OR (NEW.state = 'PREEMPTED' AND OLD.is_spot)))
    OR (OLD.state = 'STOPPED'      AND NEW.state IN ('RUNNING','TERMINATED'))
  ) THEN
    RAISE EXCEPTION 'Invalid VM state transition % -> %', OLD.state, NEW.state USING ERRCODE = 'CS004';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_vm_state_transition BEFORE UPDATE OF state ON virtual_machine
  FOR EACH ROW EXECUTE FUNCTION enforce_vm_state_transition();

CREATE TABLE storage_volume (
  volume_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  BIGINT NOT NULL REFERENCES project(project_id),
  region_id   BIGINT NOT NULL REFERENCES cloud_region(region_id),
  vm_id       BIGINT REFERENCES virtual_machine(vm_id),
  name        TEXT   NOT NULL,
  size_gb     INTEGER NOT NULL CHECK (size_gb > 0),
  used_gb     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (used_gb >= 0),
  volume_type TEXT   NOT NULL CHECK (volume_type IN ('SSD','HDD')),
  is_root     BOOLEAN NOT NULL DEFAULT false,
  state       TEXT   NOT NULL DEFAULT 'AVAILABLE' CHECK (state IN ('AVAILABLE','ATTACHED','DELETED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (used_gb <= size_gb),
  CHECK ((state = 'ATTACHED') = (vm_id IS NOT NULL))
);
CREATE UNIQUE INDEX storage_volume_name_uq ON storage_volume (project_id, name) WHERE state <> 'DELETED';
CREATE UNIQUE INDEX storage_volume_root_uq ON storage_volume (vm_id) WHERE is_root AND vm_id IS NOT NULL;
CREATE INDEX storage_volume_vm_idx ON storage_volume (vm_id);
CREATE INDEX storage_volume_project_idx ON storage_volume (project_id);
CREATE TRIGGER trg_storage_volume_updated BEFORE UPDATE ON storage_volume FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE backup_snapshot (
  snapshot_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  volume_id      BIGINT NOT NULL REFERENCES storage_volume(volume_id),
  name           TEXT   NOT NULL,
  status         TEXT   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED','EXPIRED','DELETED')),
  size_gb        NUMERIC(10,2) CHECK (size_gb IS NULL OR size_gb >= 0),
  taken_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  expires_at     TIMESTAMPTZ NOT NULL,
  created_by     BIGINT REFERENCES app_user(user_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > taken_at)
);
CREATE INDEX backup_snapshot_volume_idx ON backup_snapshot (volume_id, status);
CREATE INDEX backup_snapshot_expiry_idx ON backup_snapshot (expires_at) WHERE status = 'COMPLETED';

CREATE TABLE resource_allocation_log (
  allocation_log_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vm_id                   BIGINT NOT NULL REFERENCES virtual_machine(vm_id),
  host_id                 BIGINT REFERENCES cloud_host(host_id),
  action                  TEXT   NOT NULL CHECK (action IN ('ALLOCATE','SCALE_UP','SCALE_DOWN','DEALLOCATE','PREEMPT','PROVISION_FAILED')),
  old_vm_configuration_id BIGINT REFERENCES vm_configuration(vm_configuration_id),
  new_vm_configuration_id BIGINT REFERENCES vm_configuration(vm_configuration_id),
  vcpu_delta              INTEGER NOT NULL,
  ram_gb_delta            INTEGER NOT NULL,
  reason                  TEXT,
  performed_by            BIGINT REFERENCES app_user(user_id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX allocation_log_vm_idx   ON resource_allocation_log (vm_id, created_at);
CREATE INDEX allocation_log_host_idx ON resource_allocation_log (host_id);

CREATE TABLE spot_bid_request (
  bid_id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id               BIGINT NOT NULL REFERENCES project(project_id),
  requested_by             BIGINT NOT NULL REFERENCES app_user(user_id),
  vm_configuration_id      BIGINT NOT NULL REFERENCES vm_configuration(vm_configuration_id),
  region_id                BIGINT REFERENCES cloud_region(region_id),
  max_price_per_hour       NUMERIC(12,4) NOT NULL CHECK (max_price_per_hour > 0),
  status                   TEXT NOT NULL DEFAULT 'OPEN'
                           CHECK (status IN ('OPEN','FULFILLED','PREEMPTED','CANCELLED','EXPIRED','REJECTED')),
  fulfilled_vm_id          BIGINT UNIQUE REFERENCES virtual_machine(vm_id),
  fulfilled_price_per_hour NUMERIC(12,4),
  expires_at               TIMESTAMPTZ,
  fulfilled_at             TIMESTAMPTZ,
  preempted_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX spot_bid_project_idx ON spot_bid_request (project_id, status);
CREATE TRIGGER trg_spot_bid_updated BEFORE UPDATE ON spot_bid_request FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO schema_migrations(filename,checksum) VALUES ('0004_compute.sql','cbdc8504bee170e9ef426bcea75ee338a4226f4f0c5baa730b33efa3c67fa19c');

-- SOURCE: 0005_monitoring.sql
-- 0005: monthly range-partitioned monitoring_log (D10) and partition maintenance
-- Partitioning is created from the start; an existing table cannot be converted in place.

CREATE TABLE monitoring_log (
  vm_id        BIGINT       NOT NULL REFERENCES virtual_machine(vm_id),
  logged_at    TIMESTAMPTZ  NOT NULL,
  cpu_pct      NUMERIC(5,2) NOT NULL CHECK (cpu_pct  BETWEEN 0 AND 100),
  ram_pct      NUMERIC(5,2) NOT NULL CHECK (ram_pct  BETWEEN 0 AND 100),
  disk_pct     NUMERIC(5,2) NOT NULL CHECK (disk_pct BETWEEN 0 AND 100),
  net_in_kbps  BIGINT       NOT NULL CHECK (net_in_kbps  >= 0),
  net_out_kbps BIGINT       NOT NULL CHECK (net_out_kbps >= 0),
  -- The primary key must include the partition key. It also serves per-VM history queries,
  -- and makes batch ingestion idempotent (ON CONFLICT (vm_id, logged_at) DO NOTHING).
  PRIMARY KEY (vm_id, logged_at)
) PARTITION BY RANGE (logged_at);

-- Creates missing monthly partitions from (current month - months_back) to (current month + months_ahead).
-- Idempotent. Bounds are computed in UTC so they do not depend on the session time zone.
CREATE OR REPLACE FUNCTION ensure_monitoring_partitions(p_months_back INT DEFAULT 1, p_months_ahead INT DEFAULT 3)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  i INT; m DATE; part TEXT; start_ts TIMESTAMPTZ; end_ts TIMESTAMPTZ; created INT := 0;
BEGIN
  FOR i IN -p_months_back .. p_months_ahead LOOP
    m := (date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i))::date;
    part := format('monitoring_log_%s', to_char(m, 'YYYY_MM'));
    IF to_regclass(format('public.%I', part)) IS NULL THEN
      start_ts := m::timestamp AT TIME ZONE 'UTC';
      end_ts   := (m + INTERVAL '1 month')::date::timestamp AT TIME ZONE 'UTC';
      EXECUTE format('CREATE TABLE public.%I PARTITION OF public.monitoring_log FOR VALUES FROM (%L) TO (%L)',
                     part, start_ts, end_ts);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END $$;

-- Retention: drops WHOLE monthly partitions whose upper bound is older than the cutoff, so data is kept
-- for p_retention_days to roughly p_retention_days + one month (A9). Uses a plain DETACH because
-- DETACH ... CONCURRENTLY cannot run inside a function.
CREATE OR REPLACE FUNCTION drop_expired_monitoring_partitions(p_retention_days INT DEFAULT 90)
RETURNS SETOF TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r RECORD; cutoff TIMESTAMPTZ := now() - make_interval(days => p_retention_days); upper_bound TIMESTAMPTZ;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'monitoring_log' AND c.relname ~ '^monitoring_log_[0-9]{4}_[0-9]{2}$'
    ORDER BY c.relname
  LOOP
    upper_bound := (to_date(substr(r.relname, 16), 'YYYY_MM') + INTERVAL '1 month')::date::timestamp AT TIME ZONE 'UTC';
    IF upper_bound <= cutoff THEN
      EXECUTE format('ALTER TABLE public.monitoring_log DETACH PARTITION public.%I', r.relname);
      EXECUTE format('DROP TABLE public.%I', r.relname);
      RETURN NEXT r.relname;
    END IF;
  END LOOP;
END $$;

SELECT ensure_monitoring_partitions(2, 3);

INSERT INTO schema_migrations(filename,checksum) VALUES ('0005_monitoring.sql','fd9124f41bfd6aad416e02056c91048fe00c2cc351999db3652a798675a734a6');

-- SOURCE: 0006_billing_support.sql
-- 0006: billing, payments, support, feedback, audit, notifications, recommendations, SLA

CREATE TABLE billing_invoice (
  invoice_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organization(organization_id),
  project_id      BIGINT REFERENCES project(project_id),   -- NULL for subscription invoices
  invoice_type    TEXT   NOT NULL CHECK (invoice_type IN ('SUBSCRIPTION','USAGE')),
  period_start    DATE   NOT NULL,
  period_end      DATE   NOT NULL,
  subtotal        NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount    NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  usage_breakdown JSONB,
  status          TEXT   NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PAID','OVERDUE','VOID')),
  issued_at       TIMESTAMPTZ,
  due_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end > period_start),
  CHECK (total_amount = subtotal + tax_amount),
  CHECK ((invoice_type = 'USAGE') = (project_id IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (organization_id, project_id, invoice_type, period_start, period_end)
);
CREATE INDEX billing_invoice_project_idx ON billing_invoice (project_id);
CREATE TRIGGER trg_billing_invoice_updated BEFORE UPDATE ON billing_invoice FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payment (
  payment_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id      BIGINT NOT NULL REFERENCES billing_invoice(invoice_id),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method          TEXT   NOT NULL CHECK (method IN ('SIMULATED_CARD','SIMULATED_UPI','SIMULATED_BANK')),
  status          TEXT   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCEEDED','FAILED','REFUNDED')),
  transaction_ref TEXT   NOT NULL UNIQUE,    -- generated token; no card/bank data is ever stored
  paid_at         TIMESTAMPTZ,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_invoice_idx ON payment (invoice_id);

CREATE TABLE support_ticket (
  ticket_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_by  BIGINT NOT NULL REFERENCES app_user(user_id),
  assigned_to BIGINT REFERENCES app_user(user_id),
  project_id  BIGINT REFERENCES project(project_id),
  vm_id       BIGINT REFERENCES virtual_machine(vm_id),
  subject     TEXT   NOT NULL,
  description TEXT   NOT NULL,
  priority    TEXT   NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status      TEXT   NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('RESOLVED','CLOSED') OR resolved_at IS NOT NULL)
);
CREATE INDEX support_ticket_creator_idx ON support_ticket (created_by);
CREATE INDEX support_ticket_project_idx ON support_ticket (project_id);
CREATE TRIGGER trg_support_ticket_updated BEFORE UPDATE ON support_ticket FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE customer_feedback (
  feedback_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES app_user(user_id),
  ticket_id   BIGINT REFERENCES support_ticket(ticket_id),
  project_id  BIGINT REFERENCES project(project_id),
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_feedback_ticket_uq ON customer_feedback (ticket_id, user_id) WHERE ticket_id IS NOT NULL;

CREATE TABLE audit_log (
  audit_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id BIGINT REFERENCES app_user(user_id),
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     BIGINT,          -- polymorphic reference, deliberately no FK
  old_values    JSONB,
  new_values    JSONB,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_log_actor_idx  ON audit_log (actor_user_id, created_at DESC);

CREATE TABLE notification_queue (
  notification_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES app_user(user_id),
  notification_type TEXT   NOT NULL,
  title             TEXT   NOT NULL,
  payload           JSONB,
  dedupe_key        TEXT   UNIQUE,
  status            TEXT   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
  read_at           TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_user_idx ON notification_queue (user_id, created_at DESC);
CREATE INDEX notification_unread_idx ON notification_queue (user_id) WHERE read_at IS NULL;
CREATE INDEX notification_pending_idx ON notification_queue (created_at) WHERE status = 'PENDING';

CREATE TABLE recommendation_log (
  recommendation_id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vm_id                           BIGINT NOT NULL REFERENCES virtual_machine(vm_id),
  recommendation_type             TEXT   NOT NULL CHECK (recommendation_type IN
                                    ('SCALE_UP','SCALE_DOWN','TERMINATE_IDLE','RIGHTSIZE','COST_SAVING')),
  rule_code                       TEXT   NOT NULL,
  trigger_metrics                 JSONB  NOT NULL,
  window_start                    TIMESTAMPTZ NOT NULL,
  window_end                      TIMESTAMPTZ NOT NULL,
  recommended_vm_configuration_id BIGINT REFERENCES vm_configuration(vm_configuration_id),
  estimated_monthly_saving        NUMERIC(12,2),
  status                          TEXT   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','EXPIRED')),
  responded_by                    BIGINT REFERENCES app_user(user_id),
  responded_at                    TIMESTAMPTZ,
  outcome                         TEXT   CHECK (outcome IN ('CORRECT','INCORRECT','INCONCLUSIVE')),
  outcome_notes                   TEXT,
  reviewed_at                     TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (window_end > window_start)
);
CREATE INDEX recommendation_vm_idx ON recommendation_log (vm_id, created_at DESC);
CREATE INDEX recommendation_pending_idx ON recommendation_log (vm_id) WHERE status = 'PENDING';

CREATE TABLE sla_record (
  sla_record_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vm_id                BIGINT NOT NULL REFERENCES virtual_machine(vm_id),
  subscription_plan_id BIGINT NOT NULL REFERENCES subscription_plan(plan_id),
  period_start         TIMESTAMPTZ NOT NULL,
  period_end           TIMESTAMPTZ NOT NULL,
  target_uptime_pct    NUMERIC(6,3) NOT NULL,      -- snapshot of the plan target at evaluation time
  measured_uptime_pct  NUMERIC(6,3) NOT NULL,
  expected_samples     INTEGER NOT NULL CHECK (expected_samples >= 0),
  received_samples     INTEGER NOT NULL CHECK (received_samples >= 0),
  downtime_minutes     NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_breach            BOOLEAN GENERATED ALWAYS AS (measured_uptime_pct < target_uptime_pct) STORED,
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end > period_start),
  UNIQUE (vm_id, period_start, period_end)
);
CREATE INDEX sla_record_plan_idx ON sla_record (subscription_plan_id);

INSERT INTO schema_migrations(filename,checksum) VALUES ('0006_billing_support.sql','1de2ce0e92d11b14f523f975a826ae953717f2194fe2324d8629e771e1178d1c');

-- SOURCE: 0007_routines.sql
-- 0007: pricing helpers, allocation and lifecycle routines, audit and low-capacity triggers
--
-- Decisions implemented here: D1, D2 (retain), D8, A1, A2, A5, A6, A10.
--   * allocate_resource is the ONLY place that decides placement and mutates capacity/quota counters.
--   * One CALL is one atomic unit: no COMMIT/ROLLBACK and no exception handler that swallows errors.
--   * Global lock order in every routine: (1) the VM row -> (2) quota rows (organization row, then project row)
--     -> (3) host rows in ascending host_id. allocate_resource creates its VM, so it starts at (2).
--   * "Active" VM = state IN ('PROVISIONING','RUNNING','STOPPED'): it holds a host and a CPU/RAM/quota reservation.
--
-- Error codes: CS001 capacity, CS002 quota, CS003 invalid request, CS004 invalid state transition,
--              CS005 budget exceeded, CS006 not found / not accessible.
--
-- The routines assume READ COMMITTED (the PostgreSQL default). Callers should retry the whole CALL on 40P01/40001.

-- ---------------------------------------------------------------------------------------------------------------
-- Pricing helpers (single source of pricing logic)
-- ---------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION billing_hours_per_month() RETURNS INTEGER
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 730 $$;

-- Hourly compute price for a configuration under a subscription plan.
CREATE OR REPLACE FUNCTION vm_hourly_compute_cost(p_plan_id BIGINT, p_vcpu INTEGER, p_ram_gb INTEGER)
RETURNS NUMERIC LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_cost NUMERIC;
BEGIN
  SELECT p_vcpu * price_per_vcpu_hour + p_ram_gb * price_per_gb_ram_hour
    INTO v_cost FROM subscription_plan WHERE plan_id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription plan not found' USING ERRCODE = 'CS006';
  END IF;
  RETURN v_cost;
END $$;

-- Monthly storage price for p_gb gigabytes under a subscription plan (rounded to cents).
CREATE OR REPLACE FUNCTION storage_monthly_cost(p_plan_id BIGINT, p_gb INTEGER)
RETURNS NUMERIC LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_cost NUMERIC;
BEGIN
  SELECT ROUND(p_gb * price_per_gb_storage_month, 2)
    INTO v_cost FROM subscription_plan WHERE plan_id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription plan not found' USING ERRCODE = 'CS006';
  END IF;
  RETURN v_cost;
END $$;

-- Projected monthly cost of everything a project currently holds (A2):
--   730 h x compute rate for PROVISIONING/RUNNING VMs (STOPPED VMs contribute no compute)
--   + storage price x GB for every non-deleted volume (including volumes of STOPPED VMs).
CREATE OR REPLACE FUNCTION project_projected_monthly_cost(p_project_id BIGINT)
RETURNS NUMERIC LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_plan BIGINT; v_compute NUMERIC; v_gb BIGINT;
BEGIN
  SELECT o.subscription_plan_id INTO v_plan
    FROM project pr JOIN organization o ON o.organization_id = pr.organization_id
   WHERE pr.project_id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'CS006';
  END IF;

  SELECT COALESCE(SUM(vm_hourly_compute_cost(v_plan, c.vcpu, c.ram_gb)), 0) * billing_hours_per_month()
    INTO v_compute
    FROM virtual_machine vm JOIN vm_configuration c ON c.vm_configuration_id = vm.vm_configuration_id
   WHERE vm.project_id = p_project_id AND vm.state IN ('PROVISIONING','RUNNING');

  SELECT COALESCE(SUM(size_gb), 0) INTO v_gb
    FROM storage_volume WHERE project_id = p_project_id AND state <> 'DELETED';

  RETURN ROUND(v_compute, 2) + storage_monthly_cost(v_plan, v_gb::INTEGER);
END $$;

-- Pricing preview for the provisioning wizard. Pure read; allocate_resource applies the same arithmetic.
CREATE OR REPLACE FUNCTION estimate_vm_cost(p_project_id BIGINT, p_vcpu INTEGER, p_ram_gb INTEGER, p_storage_gb INTEGER)
RETURNS TABLE (
  hourly_compute_cost       NUMERIC,
  monthly_compute_cost      NUMERIC,
  monthly_storage_cost      NUMERIC,
  monthly_total_cost        NUMERIC,
  projected_monthly_before  NUMERIC,
  projected_monthly_after   NUMERIC,
  monthly_budget            NUMERIC,
  within_monthly_budget     BOOLEAN
) LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_plan BIGINT; v_budget NUMERIC; v_hourly NUMERIC; v_compute NUMERIC; v_storage NUMERIC; v_before NUMERIC;
BEGIN
  IF p_vcpu IS NULL OR p_vcpu < 1 OR p_ram_gb IS NULL OR p_ram_gb < 1 OR p_storage_gb IS NULL OR p_storage_gb < 1 THEN
    RAISE EXCEPTION 'vCPU, RAM and storage must be positive integers' USING ERRCODE = 'CS003';
  END IF;

  SELECT o.subscription_plan_id, pr.monthly_budget INTO v_plan, v_budget
    FROM project pr JOIN organization o ON o.organization_id = pr.organization_id
   WHERE pr.project_id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'CS006';
  END IF;

  v_hourly  := vm_hourly_compute_cost(v_plan, p_vcpu, p_ram_gb);
  v_compute := ROUND(v_hourly * billing_hours_per_month(), 2);
  v_storage := storage_monthly_cost(v_plan, p_storage_gb);
  v_before  := project_projected_monthly_cost(p_project_id);

  RETURN QUERY SELECT v_hourly, v_compute, v_storage, v_compute + v_storage,
                      v_before, v_before + v_compute + v_storage, v_budget,
                      (v_budget IS NULL OR v_before + v_compute + v_storage <= v_budget);
END $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------------------------------------------

-- Authorises a user against a project and returns the project's organization id.
-- Admins may act on any project; customers only inside their own organization.
-- A project the user may not see is reported as "not found" (CS006) so ids cannot be probed.
CREATE OR REPLACE FUNCTION assert_project_access(p_user_id BIGINT, p_project_id BIGINT)
RETURNS BIGINT LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_role TEXT; v_user_org BIGINT; v_active BOOLEAN; v_project_org BIGINT;
BEGIN
  SELECT role, organization_id, is_active INTO v_role, v_user_org, v_active
    FROM app_user WHERE user_id = p_user_id;
  IF NOT FOUND OR NOT v_active THEN
    RAISE EXCEPTION 'Unknown or inactive user' USING ERRCODE = 'CS003';
  END IF;

  SELECT organization_id INTO v_project_org FROM project WHERE project_id = p_project_id;
  IF NOT FOUND OR (v_role <> 'admin' AND v_user_org IS DISTINCT FROM v_project_org) THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'CS006';
  END IF;
  RETURN v_project_org;
END $$;

-- Raises CS002 if the request does not fit within one quota row. NULL max_storage_gb means unlimited (D5).
CREATE OR REPLACE FUNCTION check_quota_headroom(p_q resource_quota, p_vcpu INTEGER, p_ram_gb INTEGER,
                                                p_storage_gb INTEGER, p_scope TEXT)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_q.used_vcpu + p_vcpu > p_q.max_vcpu THEN
    RAISE EXCEPTION 'vCPU quota exceeded for the % (using %, requesting %, limit %)',
      p_scope, p_q.used_vcpu, p_vcpu, p_q.max_vcpu USING ERRCODE = 'CS002';
  END IF;
  IF p_q.used_ram_gb + p_ram_gb > p_q.max_ram_gb THEN
    RAISE EXCEPTION 'RAM quota exceeded for the % (using % GB, requesting % GB, limit % GB)',
      p_scope, p_q.used_ram_gb, p_ram_gb, p_q.max_ram_gb USING ERRCODE = 'CS002';
  END IF;
  IF p_q.used_vms + 1 > p_q.max_vms THEN
    RAISE EXCEPTION 'VM count quota exceeded for the % (using %, limit %)',
      p_scope, p_q.used_vms, p_q.max_vms USING ERRCODE = 'CS002';
  END IF;
  IF p_q.max_storage_gb IS NOT NULL AND p_q.used_storage_gb + p_storage_gb > p_q.max_storage_gb THEN
    RAISE EXCEPTION 'Storage quota exceeded for the % (using % GB, requesting % GB, limit % GB)',
      p_scope, p_q.used_storage_gb, p_storage_gb, p_q.max_storage_gb USING ERRCODE = 'CS002';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------------------------
-- allocate_resource: validate -> quota -> budget -> placement -> reserve -> create VM and root volume
-- ---------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE allocate_resource(
  p_user_id            BIGINT,
  p_project_id         BIGINT,
  p_name               TEXT,
  p_vcpu               INTEGER,
  p_ram_gb             INTEGER,
  p_storage_gb         INTEGER,
  p_os_image           TEXT,
  p_volume_type        TEXT,
  p_region_id          BIGINT,    -- NULL = any region (lowest carbon wins, A1)
  p_max_hourly_budget  NUMERIC,   -- NULL = no per-request cap
  INOUT p_vm_id        BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org_id       BIGINT;
  v_org_status   TEXT;
  v_plan_id      BIGINT;
  v_proj_status  TEXT;
  v_budget       NUMERIC;
  v_cfg_id       BIGINT;
  v_os_family    TEXT;
  v_hourly       NUMERIC;
  v_new_monthly  NUMERIC;
  v_projected    NUMERIC;
  v_org_q        resource_quota%ROWTYPE;
  v_has_org_q    BOOLEAN;
  v_proj_q       resource_quota%ROWTYPE;
  v_candidates   BIGINT[];
  v_host_id      BIGINT;
  v_host_region  BIGINT;
  v_round        INTEGER;
BEGIN
  PERFORM set_config('cloudsphere.user_id', COALESCE(p_user_id::text, ''), true);
  p_name     := btrim(p_name);
  p_os_image := btrim(p_os_image);

  -- 1. Validate the request ---------------------------------------------------------------------------
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'VM name must be 1 to 100 characters' USING ERRCODE = 'CS003';
  END IF;
  IF p_os_image IS NULL OR char_length(p_os_image) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'OS image must be 1 to 100 characters' USING ERRCODE = 'CS003';
  END IF;
  IF p_vcpu IS NULL OR p_vcpu NOT BETWEEN 1 AND 512 THEN
    RAISE EXCEPTION 'vCPU must be between 1 and 512' USING ERRCODE = 'CS003';
  END IF;
  IF p_ram_gb IS NULL OR p_ram_gb NOT BETWEEN 1 AND 4096 THEN
    RAISE EXCEPTION 'RAM must be between 1 and 4096 GB' USING ERRCODE = 'CS003';
  END IF;
  IF p_storage_gb IS NULL OR p_storage_gb NOT BETWEEN 1 AND 65536 THEN
    RAISE EXCEPTION 'Storage must be between 1 and 65536 GB' USING ERRCODE = 'CS003';
  END IF;
  IF p_volume_type IS NULL OR p_volume_type NOT IN ('SSD','HDD') THEN
    RAISE EXCEPTION 'Volume type must be SSD or HDD' USING ERRCODE = 'CS003';
  END IF;
  IF p_max_hourly_budget IS NOT NULL AND p_max_hourly_budget < 0 THEN
    RAISE EXCEPTION 'Hourly budget cannot be negative' USING ERRCODE = 'CS003';
  END IF;

  v_org_id := assert_project_access(p_user_id, p_project_id);   -- CS003 bad user / CS006 project not visible

  SELECT o.status, o.subscription_plan_id, pr.status, pr.monthly_budget
    INTO v_org_status, v_plan_id, v_proj_status, v_budget
    FROM project pr JOIN organization o ON o.organization_id = pr.organization_id
   WHERE pr.project_id = p_project_id;
  IF v_org_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Organization is not active' USING ERRCODE = 'CS003';
  END IF;
  IF v_proj_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Project is not active' USING ERRCODE = 'CS003';
  END IF;

  IF p_region_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM cloud_region WHERE region_id = p_region_id AND is_active) THEN
    RAISE EXCEPTION 'Region not found or not active' USING ERRCODE = 'CS003';
  END IF;

  -- 2. Shared configuration row (D3): get or create ---------------------------------------------------
  v_os_family := CASE WHEN lower(p_os_image) LIKE 'windows%' THEN 'WINDOWS' ELSE 'LINUX' END;
  INSERT INTO vm_configuration (vcpu, ram_gb, os_family, os_image)
  VALUES (p_vcpu, p_ram_gb, v_os_family, p_os_image)
  ON CONFLICT (vcpu, ram_gb, os_image) DO NOTHING;
  SELECT vm_configuration_id INTO v_cfg_id
    FROM vm_configuration WHERE vcpu = p_vcpu AND ram_gb = p_ram_gb AND os_image = p_os_image;

  -- 3. Per-request hourly cap (A2) --------------------------------------------------------------------
  v_hourly := vm_hourly_compute_cost(v_plan_id, p_vcpu, p_ram_gb);
  IF p_max_hourly_budget IS NOT NULL AND v_hourly > p_max_hourly_budget THEN
    RAISE EXCEPTION 'Hourly cost % exceeds the requested hourly budget %',
      ROUND(v_hourly, 4), p_max_hourly_budget USING ERRCODE = 'CS005';
  END IF;

  -- 4. Lock quota rows (organization first, then project) and check headroom --------------------------
  SELECT * INTO v_org_q FROM resource_quota
   WHERE organization_id = v_org_id AND project_id IS NULL FOR UPDATE;
  v_has_org_q := FOUND;

  SELECT * INTO v_proj_q FROM resource_quota WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No quota is defined for this project' USING ERRCODE = 'CS002';
  END IF;

  IF v_has_org_q THEN
    PERFORM check_quota_headroom(v_org_q, p_vcpu, p_ram_gb, p_storage_gb, 'organization');
  END IF;
  PERFORM check_quota_headroom(v_proj_q, p_vcpu, p_ram_gb, p_storage_gb, 'project');

  -- 5. Monthly budget (A2). Serialised per project by the project quota lock taken above. -------------
  IF v_budget IS NOT NULL THEN
    v_new_monthly := ROUND(v_hourly * billing_hours_per_month(), 2) + storage_monthly_cost(v_plan_id, p_storage_gb);
    v_projected   := project_projected_monthly_cost(p_project_id) + v_new_monthly;
    IF v_projected > v_budget THEN
      RAISE EXCEPTION 'Projected monthly cost % would exceed the project budget %', v_projected, v_budget
        USING ERRCODE = 'CS005';
    END IF;
  END IF;

  -- 6. Placement (A1): up to 3 rounds. Pick candidates unlocked, lock them in ascending host_id, re-check.
  --    SKIP LOCKED is deliberately not used: it would report false "no capacity" under contention.
  FOR v_round IN 1..3 LOOP
    SELECT array_agg(c.host_id) INTO v_candidates FROM (
      SELECT h.host_id
        FROM cloud_host h
        JOIN cloud_region r ON r.region_id = h.region_id AND r.is_active
        LEFT JOIN carbon_profile cp ON cp.region_id = h.region_id AND cp.effective_to IS NULL
       WHERE h.status = 'ACTIVE'
         AND (p_region_id IS NULL OR h.region_id = p_region_id)
         AND h.free_cpu >= p_vcpu AND h.free_ram_gb >= p_ram_gb
       ORDER BY cp.carbon_intensity_gco2_kwh NULLS LAST, h.host_id
       LIMIT 5
    ) c;
    EXIT WHEN v_candidates IS NULL;

    PERFORM 1 FROM cloud_host WHERE host_id = ANY (v_candidates) ORDER BY host_id FOR UPDATE;

    -- Re-select among the now-locked candidates; their counters can no longer change under us.
    SELECT h.host_id, h.region_id INTO v_host_id, v_host_region
      FROM cloud_host h
      LEFT JOIN carbon_profile cp ON cp.region_id = h.region_id AND cp.effective_to IS NULL
     WHERE h.host_id = ANY (v_candidates)
       AND h.status = 'ACTIVE'
       AND h.free_cpu >= p_vcpu AND h.free_ram_gb >= p_ram_gb
     ORDER BY cp.carbon_intensity_gco2_kwh NULLS LAST, h.host_id
     LIMIT 1;
    EXIT WHEN FOUND;
  END LOOP;

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'Insufficient capacity: no active host has % vCPU and % GB RAM free%',
      p_vcpu, p_ram_gb,
      CASE WHEN p_region_id IS NULL THEN '' ELSE ' in the requested region' END
      USING ERRCODE = 'CS001';
  END IF;

  -- 7. Reserve ---------------------------------------------------------------------------------------
  UPDATE cloud_host
     SET allocated_cpu = allocated_cpu + p_vcpu, allocated_ram_gb = allocated_ram_gb + p_ram_gb
   WHERE host_id = v_host_id;

  UPDATE resource_quota
     SET used_vcpu = used_vcpu + p_vcpu, used_ram_gb = used_ram_gb + p_ram_gb,
         used_vms = used_vms + 1, used_storage_gb = used_storage_gb + p_storage_gb
   WHERE quota_id = v_proj_q.quota_id OR (v_has_org_q AND quota_id = v_org_q.quota_id);

  -- 8. Create the VM, its root volume and the allocation log entry (A4: REQUESTED is never written; A10: no IP)
  INSERT INTO virtual_machine (project_id, vm_configuration_id, host_id, name, state, created_by)
  VALUES (p_project_id, v_cfg_id, v_host_id, p_name, 'PROVISIONING', p_user_id)
  RETURNING vm_id INTO p_vm_id;

  INSERT INTO storage_volume (project_id, region_id, vm_id, name, size_gb, volume_type, is_root, state)
  VALUES (p_project_id, v_host_region, p_vm_id, p_name || '-root', p_storage_gb, p_volume_type, true, 'ATTACHED');

  INSERT INTO resource_allocation_log (vm_id, host_id, action, new_vm_configuration_id,
                                       vcpu_delta, ram_gb_delta, reason, performed_by)
  VALUES (p_vm_id, v_host_id, 'ALLOCATE', v_cfg_id, p_vcpu, p_ram_gb, 'VM allocated', p_user_id);
END $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Releasing a reservation. terminate_vm, fail_provisioning and preempt_vm all go through this one function.
-- The active -> terminal transition can only happen once under the VM row lock, so resources are released exactly once.
-- ---------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION release_active_vm(p_vm_id BIGINT, p_new_state TEXT, p_user_id BIGINT, p_action TEXT,
                                             p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_vm        virtual_machine%ROWTYPE;
  v_cfg       vm_configuration%ROWTYPE;
  v_org_id    BIGINT;
  v_root_gb   INTEGER;
  v_expected  TEXT;
  v_reason    TEXT;
BEGIN
  v_expected := CASE p_new_state
                  WHEN 'TERMINATED' THEN 'DEALLOCATE'
                  WHEN 'FAILED'     THEN 'PROVISION_FAILED'
                  WHEN 'PREEMPTED'  THEN 'PREEMPT'
                END;
  IF v_expected IS NULL OR p_action IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Invalid release request (% / %)', p_new_state, p_action USING ERRCODE = 'CS003';
  END IF;

  -- (1) the VM row
  SELECT * INTO v_vm FROM virtual_machine WHERE vm_id = p_vm_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VM not found' USING ERRCODE = 'CS006';
  END IF;

  IF v_vm.state NOT IN ('PROVISIONING','RUNNING','STOPPED') THEN
    RAISE EXCEPTION 'VM is % and holds no reservation to release', v_vm.state USING ERRCODE = 'CS004';
  END IF;
  IF p_new_state = 'FAILED' AND v_vm.state <> 'PROVISIONING' THEN
    RAISE EXCEPTION 'Only a PROVISIONING VM can fail provisioning (VM is %)', v_vm.state USING ERRCODE = 'CS004';
  END IF;
  IF p_new_state = 'PREEMPTED' AND (v_vm.state <> 'RUNNING' OR NOT v_vm.is_spot) THEN
    RAISE EXCEPTION 'Only a RUNNING spot VM can be preempted' USING ERRCODE = 'CS004';
  END IF;

  SELECT * INTO v_cfg FROM vm_configuration WHERE vm_configuration_id = v_vm.vm_configuration_id;
  SELECT organization_id INTO v_org_id FROM project WHERE project_id = v_vm.project_id;

  -- (2) quota rows: organization first, then project
  PERFORM 1 FROM resource_quota WHERE organization_id = v_org_id AND project_id IS NULL FOR UPDATE;
  PERFORM 1 FROM resource_quota WHERE project_id = v_vm.project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota row missing for project %; cannot release reservation', v_vm.project_id;
  END IF;

  -- (3) the host row
  PERFORM 1 FROM cloud_host WHERE host_id = v_vm.host_id FOR UPDATE;

  -- Volumes: the root volume is deleted and its storage released; data volumes are detached and kept.
  UPDATE storage_volume SET state = 'DELETED', vm_id = NULL
   WHERE vm_id = p_vm_id AND is_root AND state <> 'DELETED'
   RETURNING size_gb INTO v_root_gb;
  v_root_gb := COALESCE(v_root_gb, 0);

  UPDATE storage_volume SET state = 'AVAILABLE', vm_id = NULL
   WHERE vm_id = p_vm_id AND NOT is_root;

  -- Counters
  UPDATE cloud_host
     SET allocated_cpu = allocated_cpu - v_cfg.vcpu, allocated_ram_gb = allocated_ram_gb - v_cfg.ram_gb
   WHERE host_id = v_vm.host_id;

  UPDATE resource_quota
     SET used_vcpu = used_vcpu - v_cfg.vcpu, used_ram_gb = used_ram_gb - v_cfg.ram_gb,
         used_vms = used_vms - 1, used_storage_gb = used_storage_gb - v_root_gb
   WHERE (project_id = v_vm.project_id) OR (organization_id = v_org_id AND project_id IS NULL);

  -- The VM keeps its host_id as history; the active-state partial indexes ignore it from here on.
  PERFORM set_config('cloudsphere.user_id', COALESCE(p_user_id::text, ''), true);
  UPDATE virtual_machine
     SET state = p_new_state, terminated_at = now(), load_balancer_id = NULL
   WHERE vm_id = p_vm_id;

  v_reason := COALESCE(p_reason, CASE p_new_state
                                   WHEN 'TERMINATED' THEN 'VM terminated'
                                   WHEN 'FAILED'     THEN 'Provisioning failed'
                                   WHEN 'PREEMPTED'  THEN 'Spot capacity reclaimed'
                                 END);
  INSERT INTO resource_allocation_log (vm_id, host_id, action, old_vm_configuration_id,
                                       vcpu_delta, ram_gb_delta, reason, performed_by)
  VALUES (p_vm_id, v_vm.host_id, p_action, v_vm.vm_configuration_id,
          -v_cfg.vcpu, -v_cfg.ram_gb, v_reason, p_user_id);
END $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Lifecycle procedures (A6)
-- ---------------------------------------------------------------------------------------------------------------

-- Simulated provisioning finishing. System action (no user): the audit actor is NULL.
CREATE OR REPLACE PROCEDURE complete_provisioning(p_vm_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_state TEXT;
BEGIN
  PERFORM set_config('cloudsphere.user_id', '', true);
  SELECT state INTO v_state FROM virtual_machine WHERE vm_id = p_vm_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VM not found' USING ERRCODE = 'CS006';
  END IF;
  IF v_state <> 'PROVISIONING' THEN
    RAISE EXCEPTION 'VM is %; only a PROVISIONING VM can complete provisioning', v_state USING ERRCODE = 'CS004';
  END IF;
  UPDATE virtual_machine SET state = 'RUNNING', started_at = now(), stopped_at = NULL WHERE vm_id = p_vm_id;
END $$;

-- RUNNING -> STOPPED. D2-retain: host and quota counters do not change.
CREATE OR REPLACE PROCEDURE stop_vm(p_user_id BIGINT, p_vm_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_project BIGINT; v_state TEXT;
BEGIN
  PERFORM set_config('cloudsphere.user_id', COALESCE(p_user_id::text, ''), true);
  SELECT project_id INTO v_project FROM virtual_machine WHERE vm_id = p_vm_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VM not found' USING ERRCODE = 'CS006';
  END IF;
  PERFORM assert_project_access(p_user_id, v_project);

  SELECT state INTO v_state FROM virtual_machine WHERE vm_id = p_vm_id FOR UPDATE;
  IF v_state <> 'RUNNING' THEN
    RAISE EXCEPTION 'VM is %; only a RUNNING VM can be stopped', v_state USING ERRCODE = 'CS004';
  END IF;
  UPDATE virtual_machine SET state = 'STOPPED', stopped_at = now() WHERE vm_id = p_vm_id;
END $$;

-- STOPPED -> RUNNING on the retained host. D2-retain: no counter change; fails if that host cannot run VMs.
CREATE OR REPLACE PROCEDURE start_vm(p_user_id BIGINT, p_vm_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_project BIGINT; v_state TEXT; v_host BIGINT; v_host_status TEXT;
BEGIN
  PERFORM set_config('cloudsphere.user_id', COALESCE(p_user_id::text, ''), true);
  SELECT project_id INTO v_project FROM virtual_machine WHERE vm_id = p_vm_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VM not found' USING ERRCODE = 'CS006';
  END IF;
  PERFORM assert_project_access(p_user_id, v_project);

  SELECT state, host_id INTO v_state, v_host FROM virtual_machine WHERE vm_id = p_vm_id FOR UPDATE;
  IF v_state <> 'STOPPED' THEN
    RAISE EXCEPTION 'VM is %; only a STOPPED VM can be started', v_state USING ERRCODE = 'CS004';
  END IF;

  SELECT status INTO v_host_status FROM cloud_host WHERE host_id = v_host FOR SHARE;
  IF v_host_status IN ('MAINTENANCE','DECOMMISSIONED') THEN
    RAISE EXCEPTION 'The VM''s host is %; the VM cannot be started right now', v_host_status USING ERRCODE = 'CS001';
  END IF;

  UPDATE virtual_machine SET state = 'RUNNING', started_at = now(), stopped_at = NULL WHERE vm_id = p_vm_id;
END $$;

-- Any active state -> TERMINATED; releases the reservation exactly once.
CREATE OR REPLACE PROCEDURE terminate_vm(p_user_id BIGINT, p_vm_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_project BIGINT;
BEGIN
  SELECT project_id INTO v_project FROM virtual_machine WHERE vm_id = p_vm_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VM not found' USING ERRCODE = 'CS006';
  END IF;
  PERFORM assert_project_access(p_user_id, v_project);
  PERFORM release_active_vm(p_vm_id, 'TERMINATED', p_user_id, 'DEALLOCATE');
END $$;

-- PROVISIONING -> FAILED (simulated failure); releases the reservation. p_user_id NULL = system.
CREATE OR REPLACE PROCEDURE fail_provisioning(p_vm_id BIGINT, p_user_id BIGINT DEFAULT NULL, p_reason TEXT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM release_active_vm(p_vm_id, 'FAILED', p_user_id, 'PROVISION_FAILED', p_reason);
END $$;

-- RUNNING spot VM -> PREEMPTED; releases the reservation. p_user_id NULL = system.
CREATE OR REPLACE PROCEDURE preempt_vm(p_vm_id BIGINT, p_user_id BIGINT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM release_active_vm(p_vm_id, 'PREEMPTED', p_user_id, 'PREEMPT');
END $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------------------------

-- Audit every VM state change. The actor comes from the transaction-local setting the routines write.
CREATE OR REPLACE FUNCTION audit_vm_state_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (NULLIF(current_setting('cloudsphere.user_id', true), '')::BIGINT,
          'vm.state_change', 'virtual_machine', NEW.vm_id,
          jsonb_build_object('state', OLD.state),
          jsonb_build_object('state', NEW.state, 'host_id', NEW.host_id, 'project_id', NEW.project_id));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_vm_audit_state AFTER UPDATE OF state ON virtual_machine
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION audit_vm_state_change();

-- Queue a notification for every active admin when an allocation leaves a host below its low-capacity threshold.
-- The dedupe key (host, admin, UTC day) keeps this to one notification per host per admin per day.
CREATE OR REPLACE FUNCTION notify_host_low_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_cpu_pct NUMERIC; v_ram_pct NUMERIC;
BEGIN
  v_cpu_pct := ROUND((NEW.total_cpu - NEW.allocated_cpu) * 100.0 / NEW.total_cpu, 2);
  v_ram_pct := ROUND((NEW.total_ram_gb - NEW.allocated_ram_gb) * 100.0 / NEW.total_ram_gb, 2);
  IF v_cpu_pct < NEW.low_capacity_threshold_pct OR v_ram_pct < NEW.low_capacity_threshold_pct THEN
    INSERT INTO notification_queue (user_id, notification_type, title, payload, dedupe_key)
    SELECT u.user_id, 'HOST_LOW_CAPACITY', format('Host %s is low on capacity', NEW.hostname),
           jsonb_build_object('host_id', NEW.host_id, 'hostname', NEW.hostname,
                              'free_cpu_pct', v_cpu_pct, 'free_ram_pct', v_ram_pct,
                              'threshold_pct', NEW.low_capacity_threshold_pct),
           format('host-low-capacity:%s:%s:%s', NEW.host_id, u.user_id,
                  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
      FROM app_user u WHERE u.role = 'admin' AND u.is_active
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_host_low_capacity AFTER UPDATE OF allocated_cpu, allocated_ram_gb ON cloud_host
  FOR EACH ROW WHEN (NEW.allocated_cpu > OLD.allocated_cpu OR NEW.allocated_ram_gb > OLD.allocated_ram_gb)
  EXECUTE FUNCTION notify_host_low_capacity();

INSERT INTO schema_migrations(filename,checksum) VALUES ('0007_routines.sql','18eca488f65ad9b264f56c4932c97422594a9076ac8e4b9acf53170f779514e2');

-- SOURCE: 0008_grants.sql
-- 0008: privilege hardening for the API role (A7)
--
-- The API connects as cloudsphere_app. Capacity and quota counters, VM rows and their state may only change
-- through the SECURITY DEFINER routines in 0007, which run as the schema owner (cloudsphere_migrator).
-- Column-level REVOKE does not override a table-level grant, so table privileges are revoked first and the
-- permitted columns are granted back afterwards.

-- cloud_host: the app may change status and the low-capacity threshold, and register new hosts with zero allocation.
REVOKE UPDATE, DELETE ON cloud_host FROM cloudsphere_app;
REVOKE INSERT ON cloud_host FROM cloudsphere_app;
GRANT UPDATE (status, low_capacity_threshold_pct) ON cloud_host TO cloudsphere_app;
GRANT INSERT (region_id, hostname, total_cpu, total_ram_gb, status, low_capacity_threshold_pct)
  ON cloud_host TO cloudsphere_app;

-- resource_quota: the app may set limits, never usage counters.
REVOKE UPDATE, DELETE ON resource_quota FROM cloudsphere_app;
REVOKE INSERT ON resource_quota FROM cloudsphere_app;
GRANT UPDATE (max_vcpu, max_ram_gb, max_vms, max_storage_gb) ON resource_quota TO cloudsphere_app;
GRANT INSERT (organization_id, project_id, max_vcpu, max_ram_gb, max_vms, max_storage_gb)
  ON resource_quota TO cloudsphere_app;

-- virtual_machine: created and moved between states only by the routines; the app may rename.
REVOKE INSERT, UPDATE, DELETE ON virtual_machine FROM cloudsphere_app;
GRANT UPDATE (name) ON virtual_machine TO cloudsphere_app;

-- audit_log is append-only for the app.
REVOKE UPDATE, DELETE ON audit_log FROM cloudsphere_app;

-- The migration bookkeeping table is not the API's business.
REVOKE ALL ON schema_migrations FROM cloudsphere_app;

-- Routines: nothing is executable by PUBLIC. Extension functions (pgcrypto's crypt/gen_salt, used for login) keep
-- their grants; only functions and procedures defined by our own migrations are revoked.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid
                          AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON ROUTINE %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- Future routines created by the migrator are not executable by PUBLIC either.
ALTER DEFAULT PRIVILEGES FOR ROLE cloudsphere_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- The API may call the lifecycle procedures and the read-only pricing functions.
-- Not granted: release_active_vm, assert_project_access, check_quota_headroom (internal helpers),
-- drop_expired_monitoring_partitions (destroys data; run by the migrator role only).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('allocate_resource','complete_provisioning','stop_vm','start_vm','terminate_vm',
                         'fail_provisioning','preempt_vm',
                         'estimate_vm_cost','project_projected_monthly_cost','vm_hourly_compute_cost',
                         'storage_monthly_cost','billing_hours_per_month',
                         'ensure_monitoring_partitions')
  LOOP
    EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO cloudsphere_app', r.sig);
  END LOOP;
END $$;

INSERT INTO schema_migrations(filename,checksum) VALUES ('0008_grants.sql','6b2f8e15a1d85ffcc49ab4e16bd989c7fb3a5b172a8d55b24acfb1dd658c334d');

-- SOURCE: 0009_vm_admin_approval.sql
-- VM requests remain unallocated until an administrator approves them.
CREATE TABLE vm_request (
  vm_request_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id         BIGINT NOT NULL REFERENCES project(project_id),
  requested_by       BIGINT NOT NULL REFERENCES app_user(user_id),
  name               TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  vcpu               INTEGER NOT NULL CHECK (vcpu BETWEEN 1 AND 256),
  ram_gb             INTEGER NOT NULL CHECK (ram_gb BETWEEN 1 AND 4096),
  storage_gb         INTEGER NOT NULL CHECK (storage_gb BETWEEN 1 AND 65536),
  os_image           TEXT NOT NULL CHECK (char_length(btrim(os_image)) BETWEEN 1 AND 200),
  volume_type        TEXT NOT NULL CHECK (volume_type IN ('SSD','HDD')),
  region_id          BIGINT REFERENCES cloud_region(region_id),
  max_hourly_budget  NUMERIC(12,4) CHECK (max_hourly_budget IS NULL OR max_hourly_budget >= 0),
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by        BIGINT REFERENCES app_user(user_id),
  reviewed_at        TIMESTAMPTZ,
  decision_reason    TEXT,
  vm_id              BIGINT UNIQUE REFERENCES virtual_machine(vm_id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND vm_id IS NULL)
      OR (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND vm_id IS NOT NULL)
      OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND vm_id IS NULL))
);

CREATE UNIQUE INDEX vm_request_pending_name_uq
  ON vm_request(project_id, lower(name)) WHERE status = 'PENDING';
CREATE INDEX vm_request_queue_idx ON vm_request(status, created_at DESC);
CREATE INDEX vm_request_user_idx ON vm_request(requested_by, created_at DESC);
CREATE TRIGGER trg_vm_request_updated BEFORE UPDATE ON vm_request FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO schema_migrations(filename,checksum) VALUES ('0009_vm_admin_approval.sql','d97a0ad215e29d5b90b01bc749c2bccb9bab40c7d2be724b805c0acb0e730ab8');
COMMIT;
