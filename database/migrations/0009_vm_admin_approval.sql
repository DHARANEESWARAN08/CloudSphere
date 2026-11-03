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
