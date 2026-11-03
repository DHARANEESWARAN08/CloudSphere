# CloudSphere — Tables and Columns

Read from the local database. Monthly partition child tables are excluded; their columns are inherited from monitoring_log. Migration tracking tables, if present, are listed separately from application tables.

## app_user

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| user_id | bigint | Yes | Identity (auto-generated ID) |
| organization_id | bigint | No | — |
| email | text | Yes | — |
| password_hash | text | Yes | — |
| full_name | text | Yes | — |
| role | text | Yes | — |
| is_active | boolean | Yes | true |
| last_login_at | timestamp with time zone | No | — |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK (((role = 'admin'::text) OR (organization_id IS NOT NULL)))`
- `CHECK ((role = ANY (ARRAY['customer'::text, 'admin'::text])))`
- `FOREIGN KEY (organization_id) REFERENCES organization(organization_id)`
- `NOT NULL created_at`
- `NOT NULL email`
- `NOT NULL full_name`
- `NOT NULL is_active`
- `NOT NULL password_hash`
- `NOT NULL role`
- `NOT NULL updated_at`
- `NOT NULL user_id`
- `PRIMARY KEY (user_id)`

## audit_log

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| audit_id | bigint | Yes | Identity (auto-generated ID) |
| actor_user_id | bigint | No | — |
| action | text | Yes | — |
| entity_type | text | Yes | — |
| entity_id | bigint | No | — |
| old_values | jsonb | No | — |
| new_values | jsonb | No | — |
| ip_address | inet | No | — |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `FOREIGN KEY (actor_user_id) REFERENCES app_user(user_id)`
- `NOT NULL action`
- `NOT NULL audit_id`
- `NOT NULL created_at`
- `NOT NULL entity_type`
- `PRIMARY KEY (audit_id)`

## backup_snapshot

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| snapshot_id | bigint | Yes | Identity (auto-generated ID) |
| volume_id | bigint | Yes | — |
| name | text | Yes | — |
| status | text | Yes | 'PENDING'::text |
| size_gb | numeric(10,2) | No | — |
| taken_at | timestamp with time zone | Yes | now() |
| retention_days | integer | Yes | — |
| expires_at | timestamp with time zone | Yes | — |
| created_by | bigint | No | — |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((expires_at > taken_at))`
- `CHECK ((retention_days > 0))`
- `CHECK (((size_gb IS NULL) OR (size_gb >= (0)::numeric)))`
- `CHECK ((status = ANY (ARRAY['PENDING'::text, 'COMPLETED'::text, 'FAILED'::text, 'EXPIRED'::text, 'DELETED'::text])))`
- `FOREIGN KEY (created_by) REFERENCES app_user(user_id)`
- `FOREIGN KEY (volume_id) REFERENCES storage_volume(volume_id)`
- `NOT NULL created_at`
- `NOT NULL expires_at`
- `NOT NULL name`
- `NOT NULL retention_days`
- `NOT NULL snapshot_id`
- `NOT NULL status`
- `NOT NULL taken_at`
- `NOT NULL volume_id`
- `PRIMARY KEY (snapshot_id)`

## billing_invoice

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| invoice_id | bigint | Yes | Identity (auto-generated ID) |
| organization_id | bigint | Yes | — |
| project_id | bigint | No | — |
| invoice_type | text | Yes | — |
| period_start | date | Yes | — |
| period_end | date | Yes | — |
| subtotal | numeric(12,2) | Yes | — |
| tax_amount | numeric(12,2) | Yes | 0 |
| total_amount | numeric(12,2) | Yes | — |
| usage_breakdown | jsonb | No | — |
| status | text | Yes | 'DRAFT'::text |
| issued_at | timestamp with time zone | No | — |
| due_date | date | No | — |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((period_end > period_start))`
- `CHECK ((total_amount = (subtotal + tax_amount)))`
- `CHECK (((invoice_type = 'USAGE'::text) = (project_id IS NOT NULL)))`
- `CHECK ((invoice_type = ANY (ARRAY['SUBSCRIPTION'::text, 'USAGE'::text])))`
- `CHECK ((status = ANY (ARRAY['DRAFT'::text, 'ISSUED'::text, 'PAID'::text, 'OVERDUE'::text, 'VOID'::text])))`
- `CHECK ((subtotal >= (0)::numeric))`
- `CHECK ((tax_amount >= (0)::numeric))`
- `CHECK ((total_amount >= (0)::numeric))`
- `FOREIGN KEY (organization_id) REFERENCES organization(organization_id)`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `NOT NULL created_at`
- `NOT NULL invoice_id`
- `NOT NULL invoice_type`
- `NOT NULL organization_id`
- `NOT NULL period_end`
- `NOT NULL period_start`
- `NOT NULL status`
- `NOT NULL subtotal`
- `NOT NULL tax_amount`
- `NOT NULL total_amount`
- `NOT NULL updated_at`
- `PRIMARY KEY (invoice_id)`
- `UNIQUE NULLS NOT DISTINCT (organization_id, project_id, invoice_type, period_start, period_end)`

## carbon_profile

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| carbon_profile_id | bigint | Yes | Identity (auto-generated ID) |
| region_id | bigint | Yes | — |
| version | integer | Yes | — |
| carbon_intensity_gco2_kwh | numeric(8,2) | Yes | — |
| effective_from | timestamp with time zone | Yes | — |
| effective_to | timestamp with time zone | No | — |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((carbon_intensity_gco2_kwh >= (0)::numeric))`
- `CHECK (((effective_to IS NULL) OR (effective_to > effective_from)))`
- `CHECK ((version >= 1))`
- `FOREIGN KEY (region_id) REFERENCES cloud_region(region_id)`
- `NOT NULL carbon_intensity_gco2_kwh`
- `NOT NULL carbon_profile_id`
- `NOT NULL created_at`
- `NOT NULL effective_from`
- `NOT NULL region_id`
- `NOT NULL version`
- `PRIMARY KEY (carbon_profile_id)`
- `UNIQUE (region_id, version)`

## cloud_host

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| host_id | bigint | Yes | Identity (auto-generated ID) |
| region_id | bigint | Yes | — |
| hostname | text | Yes | — |
| total_cpu | integer | Yes | — |
| total_ram_gb | integer | Yes | — |
| allocated_cpu | integer | Yes | 0 |
| allocated_ram_gb | integer | Yes | 0 |
| free_cpu | integer | No | Generated: (total_cpu - allocated_cpu) |
| free_ram_gb | integer | No | Generated: (total_ram_gb - allocated_ram_gb) |
| status | text | Yes | 'ACTIVE'::text |
| low_capacity_threshold_pct | numeric(5,2) | Yes | 10 |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK (((allocated_cpu >= 0) AND (allocated_cpu <= total_cpu)))`
- `CHECK (((low_capacity_threshold_pct >= (0)::numeric) AND (low_capacity_threshold_pct <= (100)::numeric)))`
- `CHECK (((allocated_ram_gb >= 0) AND (allocated_ram_gb <= total_ram_gb)))`
- `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DRAINING'::text, 'MAINTENANCE'::text, 'DECOMMISSIONED'::text])))`
- `CHECK ((total_cpu > 0))`
- `CHECK ((total_ram_gb > 0))`
- `FOREIGN KEY (region_id) REFERENCES cloud_region(region_id)`
- `NOT NULL allocated_cpu`
- `NOT NULL allocated_ram_gb`
- `NOT NULL created_at`
- `NOT NULL host_id`
- `NOT NULL hostname`
- `NOT NULL low_capacity_threshold_pct`
- `NOT NULL region_id`
- `NOT NULL status`
- `NOT NULL total_cpu`
- `NOT NULL total_ram_gb`
- `NOT NULL updated_at`
- `PRIMARY KEY (host_id)`
- `UNIQUE (hostname)`

## cloud_region

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| region_id | bigint | Yes | Identity (auto-generated ID) |
| code | text | Yes | — |
| name | text | Yes | — |
| country | text | No | — |
| is_active | boolean | Yes | true |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `NOT NULL code`
- `NOT NULL created_at`
- `NOT NULL is_active`
- `NOT NULL name`
- `NOT NULL region_id`
- `NOT NULL updated_at`
- `PRIMARY KEY (region_id)`
- `UNIQUE (code)`

## customer_feedback

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| feedback_id | bigint | Yes | Identity (auto-generated ID) |
| user_id | bigint | Yes | — |
| ticket_id | bigint | No | — |
| project_id | bigint | No | — |
| rating | smallint | Yes | — |
| comment | text | No | — |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK (((rating >= 1) AND (rating <= 5)))`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `FOREIGN KEY (ticket_id) REFERENCES support_ticket(ticket_id)`
- `FOREIGN KEY (user_id) REFERENCES app_user(user_id)`
- `NOT NULL created_at`
- `NOT NULL feedback_id`
- `NOT NULL rating`
- `NOT NULL user_id`
- `PRIMARY KEY (feedback_id)`

## firewall_rule

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| firewall_rule_id | bigint | Yes | Identity (auto-generated ID) |
| virtual_network_id | bigint | Yes | — |
| direction | text | Yes | — |
| action | text | Yes | — |
| protocol | text | Yes | — |
| port_from | integer | No | — |
| port_to | integer | No | — |
| remote_cidr | cidr | Yes | — |
| priority | integer | Yes | — |
| description | text | No | — |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((action = ANY (ARRAY['ALLOW'::text, 'DENY'::text])))`
- `CHECK (((port_from IS NULL) = (port_to IS NULL)))`
- `CHECK (((port_from IS NULL) OR (port_from <= port_to)))`
- `CHECK (((protocol = ANY (ARRAY['TCP'::text, 'UDP'::text])) OR (port_from IS NULL)))`
- `CHECK ((direction = ANY (ARRAY['INGRESS'::text, 'EGRESS'::text])))`
- `CHECK (((port_from >= 0) AND (port_from <= 65535)))`
- `CHECK (((port_to >= 0) AND (port_to <= 65535)))`
- `CHECK (((priority >= 1) AND (priority <= 65535)))`
- `CHECK ((protocol = ANY (ARRAY['TCP'::text, 'UDP'::text, 'ICMP'::text, 'ANY'::text])))`
- `FOREIGN KEY (virtual_network_id) REFERENCES virtual_network(virtual_network_id)`
- `NOT NULL action`
- `NOT NULL created_at`
- `NOT NULL direction`
- `NOT NULL firewall_rule_id`
- `NOT NULL priority`
- `NOT NULL protocol`
- `NOT NULL remote_cidr`
- `NOT NULL virtual_network_id`
- `PRIMARY KEY (firewall_rule_id)`
- `UNIQUE (virtual_network_id, direction, priority)`

## load_balancer

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| load_balancer_id | bigint | Yes | Identity (auto-generated ID) |
| project_id | bigint | Yes | — |
| virtual_network_id | bigint | Yes | — |
| name | text | Yes | — |
| algorithm | text | Yes | 'ROUND_ROBIN'::text |
| listener_protocol | text | Yes | 'HTTP'::text |
| listener_port | integer | Yes | 80 |
| status | text | Yes | 'ACTIVE'::text |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((algorithm = ANY (ARRAY['ROUND_ROBIN'::text, 'LEAST_CONNECTIONS'::text])))`
- `CHECK (((listener_port >= 1) AND (listener_port <= 65535)))`
- `CHECK ((listener_protocol = ANY (ARRAY['HTTP'::text, 'HTTPS'::text, 'TCP'::text])))`
- `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DELETED'::text])))`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `FOREIGN KEY (virtual_network_id) REFERENCES virtual_network(virtual_network_id)`
- `NOT NULL algorithm`
- `NOT NULL created_at`
- `NOT NULL listener_port`
- `NOT NULL listener_protocol`
- `NOT NULL load_balancer_id`
- `NOT NULL name`
- `NOT NULL project_id`
- `NOT NULL status`
- `NOT NULL updated_at`
- `NOT NULL virtual_network_id`
- `PRIMARY KEY (load_balancer_id)`
- `UNIQUE (project_id, name)`

## monitoring_log

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| vm_id | bigint | Yes | — |
| logged_at | timestamp with time zone | Yes | — |
| cpu_pct | numeric(5,2) | Yes | — |
| ram_pct | numeric(5,2) | Yes | — |
| disk_pct | numeric(5,2) | Yes | — |
| net_in_kbps | bigint | Yes | — |
| net_out_kbps | bigint | Yes | — |

Constraints and keys:

- `CHECK (((cpu_pct >= (0)::numeric) AND (cpu_pct <= (100)::numeric)))`
- `CHECK (((disk_pct >= (0)::numeric) AND (disk_pct <= (100)::numeric)))`
- `CHECK ((net_in_kbps >= 0))`
- `CHECK ((net_out_kbps >= 0))`
- `CHECK (((ram_pct >= (0)::numeric) AND (ram_pct <= (100)::numeric)))`
- `FOREIGN KEY (vm_id) REFERENCES virtual_machine(vm_id)`
- `NOT NULL cpu_pct`
- `NOT NULL disk_pct`
- `NOT NULL logged_at`
- `NOT NULL net_in_kbps`
- `NOT NULL net_out_kbps`
- `NOT NULL ram_pct`
- `NOT NULL vm_id`
- `PRIMARY KEY (vm_id, logged_at)`

## notification_queue

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| notification_id | bigint | Yes | Identity (auto-generated ID) |
| user_id | bigint | Yes | — |
| notification_type | text | Yes | — |
| title | text | Yes | — |
| payload | jsonb | No | — |
| dedupe_key | text | No | — |
| status | text | Yes | 'PENDING'::text |
| read_at | timestamp with time zone | No | — |
| sent_at | timestamp with time zone | No | — |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'FAILED'::text])))`
- `FOREIGN KEY (user_id) REFERENCES app_user(user_id)`
- `NOT NULL created_at`
- `NOT NULL notification_id`
- `NOT NULL notification_type`
- `NOT NULL status`
- `NOT NULL title`
- `NOT NULL user_id`
- `PRIMARY KEY (notification_id)`
- `UNIQUE (dedupe_key)`

## organization

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| organization_id | bigint | Yes | Identity (auto-generated ID) |
| name | text | Yes | — |
| subscription_plan_id | bigint | Yes | — |
| billing_email | text | Yes | — |
| status | text | Yes | 'ACTIVE'::text |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'SUSPENDED'::text])))`
- `FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plan(plan_id)`
- `NOT NULL billing_email`
- `NOT NULL created_at`
- `NOT NULL name`
- `NOT NULL organization_id`
- `NOT NULL status`
- `NOT NULL subscription_plan_id`
- `NOT NULL updated_at`
- `PRIMARY KEY (organization_id)`
- `UNIQUE (name)`

## payment

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| payment_id | bigint | Yes | Identity (auto-generated ID) |
| invoice_id | bigint | Yes | — |
| amount | numeric(12,2) | Yes | — |
| method | text | Yes | — |
| status | text | Yes | 'PENDING'::text |
| transaction_ref | text | Yes | — |
| paid_at | timestamp with time zone | No | — |
| failure_reason | text | No | — |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((amount > (0)::numeric))`
- `CHECK ((method = ANY (ARRAY['SIMULATED_CARD'::text, 'SIMULATED_UPI'::text, 'SIMULATED_BANK'::text])))`
- `CHECK ((status = ANY (ARRAY['PENDING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'REFUNDED'::text])))`
- `FOREIGN KEY (invoice_id) REFERENCES billing_invoice(invoice_id)`
- `NOT NULL amount`
- `NOT NULL created_at`
- `NOT NULL invoice_id`
- `NOT NULL method`
- `NOT NULL payment_id`
- `NOT NULL status`
- `NOT NULL transaction_ref`
- `PRIMARY KEY (payment_id)`
- `UNIQUE (transaction_ref)`

## project

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| project_id | bigint | Yes | Identity (auto-generated ID) |
| organization_id | bigint | Yes | — |
| name | text | Yes | — |
| description | text | No | — |
| status | text | Yes | 'ACTIVE'::text |
| monthly_budget | numeric(12,2) | No | — |
| created_by | bigint | No | — |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK (((monthly_budget IS NULL) OR (monthly_budget >= (0)::numeric)))`
- `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'ARCHIVED'::text])))`
- `FOREIGN KEY (created_by) REFERENCES app_user(user_id)`
- `FOREIGN KEY (organization_id) REFERENCES organization(organization_id)`
- `NOT NULL created_at`
- `NOT NULL name`
- `NOT NULL organization_id`
- `NOT NULL project_id`
- `NOT NULL status`
- `NOT NULL updated_at`
- `PRIMARY KEY (project_id)`
- `UNIQUE (organization_id, name)`

## recommendation_log

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| recommendation_id | bigint | Yes | Identity (auto-generated ID) |
| vm_id | bigint | Yes | — |
| recommendation_type | text | Yes | — |
| rule_code | text | Yes | — |
| trigger_metrics | jsonb | Yes | — |
| window_start | timestamp with time zone | Yes | — |
| window_end | timestamp with time zone | Yes | — |
| recommended_vm_configuration_id | bigint | No | — |
| estimated_monthly_saving | numeric(12,2) | No | — |
| status | text | Yes | 'PENDING'::text |
| responded_by | bigint | No | — |
| responded_at | timestamp with time zone | No | — |
| outcome | text | No | — |
| outcome_notes | text | No | — |
| reviewed_at | timestamp with time zone | No | — |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((window_end > window_start))`
- `CHECK ((outcome = ANY (ARRAY['CORRECT'::text, 'INCORRECT'::text, 'INCONCLUSIVE'::text])))`
- `CHECK ((recommendation_type = ANY (ARRAY['SCALE_UP'::text, 'SCALE_DOWN'::text, 'TERMINATE_IDLE'::text, 'RIGHTSIZE'::text, 'COST_SAVING'::text])))`
- `CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'EXPIRED'::text])))`
- `FOREIGN KEY (recommended_vm_configuration_id) REFERENCES vm_configuration(vm_configuration_id)`
- `FOREIGN KEY (responded_by) REFERENCES app_user(user_id)`
- `FOREIGN KEY (vm_id) REFERENCES virtual_machine(vm_id)`
- `NOT NULL created_at`
- `NOT NULL recommendation_id`
- `NOT NULL recommendation_type`
- `NOT NULL rule_code`
- `NOT NULL status`
- `NOT NULL trigger_metrics`
- `NOT NULL vm_id`
- `NOT NULL window_end`
- `NOT NULL window_start`
- `PRIMARY KEY (recommendation_id)`

## resource_allocation_log

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| allocation_log_id | bigint | Yes | Identity (auto-generated ID) |
| vm_id | bigint | Yes | — |
| host_id | bigint | No | — |
| action | text | Yes | — |
| old_vm_configuration_id | bigint | No | — |
| new_vm_configuration_id | bigint | No | — |
| vcpu_delta | integer | Yes | — |
| ram_gb_delta | integer | Yes | — |
| reason | text | No | — |
| performed_by | bigint | No | — |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((action = ANY (ARRAY['ALLOCATE'::text, 'SCALE_UP'::text, 'SCALE_DOWN'::text, 'DEALLOCATE'::text, 'PREEMPT'::text, 'PROVISION_FAILED'::text])))`
- `FOREIGN KEY (host_id) REFERENCES cloud_host(host_id)`
- `FOREIGN KEY (new_vm_configuration_id) REFERENCES vm_configuration(vm_configuration_id)`
- `FOREIGN KEY (old_vm_configuration_id) REFERENCES vm_configuration(vm_configuration_id)`
- `FOREIGN KEY (performed_by) REFERENCES app_user(user_id)`
- `FOREIGN KEY (vm_id) REFERENCES virtual_machine(vm_id)`
- `NOT NULL action`
- `NOT NULL allocation_log_id`
- `NOT NULL created_at`
- `NOT NULL ram_gb_delta`
- `NOT NULL vcpu_delta`
- `NOT NULL vm_id`
- `PRIMARY KEY (allocation_log_id)`

## resource_quota

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| quota_id | bigint | Yes | Identity (auto-generated ID) |
| organization_id | bigint | Yes | — |
| project_id | bigint | No | — |
| max_vcpu | integer | Yes | — |
| max_ram_gb | integer | Yes | — |
| max_vms | integer | Yes | — |
| max_storage_gb | integer | No | — |
| used_vcpu | integer | Yes | 0 |
| used_ram_gb | integer | Yes | 0 |
| used_vms | integer | Yes | 0 |
| used_storage_gb | integer | Yes | 0 |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((used_ram_gb <= max_ram_gb))`
- `CHECK (((max_storage_gb IS NULL) OR (used_storage_gb <= max_storage_gb)))`
- `CHECK ((used_vcpu <= max_vcpu))`
- `CHECK ((used_vms <= max_vms))`
- `CHECK ((max_ram_gb >= 0))`
- `CHECK (((max_storage_gb IS NULL) OR (max_storage_gb >= 0)))`
- `CHECK ((max_vcpu >= 0))`
- `CHECK ((max_vms >= 0))`
- `CHECK ((used_ram_gb >= 0))`
- `CHECK ((used_storage_gb >= 0))`
- `CHECK ((used_vcpu >= 0))`
- `CHECK ((used_vms >= 0))`
- `FOREIGN KEY (organization_id) REFERENCES organization(organization_id)`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `NOT NULL created_at`
- `NOT NULL max_ram_gb`
- `NOT NULL max_vcpu`
- `NOT NULL max_vms`
- `NOT NULL organization_id`
- `NOT NULL quota_id`
- `NOT NULL updated_at`
- `NOT NULL used_ram_gb`
- `NOT NULL used_storage_gb`
- `NOT NULL used_vcpu`
- `NOT NULL used_vms`
- `PRIMARY KEY (quota_id)`

## schema_migrations

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| filename | text | Yes | — |
| checksum | text | Yes | — |
| applied_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `NOT NULL applied_at`
- `NOT NULL checksum`
- `NOT NULL filename`
- `PRIMARY KEY (filename)`

## sla_record

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| sla_record_id | bigint | Yes | Identity (auto-generated ID) |
| vm_id | bigint | Yes | — |
| subscription_plan_id | bigint | Yes | — |
| period_start | timestamp with time zone | Yes | — |
| period_end | timestamp with time zone | Yes | — |
| target_uptime_pct | numeric(6,3) | Yes | — |
| measured_uptime_pct | numeric(6,3) | Yes | — |
| expected_samples | integer | Yes | — |
| received_samples | integer | Yes | — |
| downtime_minutes | numeric(10,2) | Yes | 0 |
| is_breach | boolean | No | Generated: (measured_uptime_pct < target_uptime_pct) |
| computed_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((period_end > period_start))`
- `CHECK ((expected_samples >= 0))`
- `CHECK ((received_samples >= 0))`
- `FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plan(plan_id)`
- `FOREIGN KEY (vm_id) REFERENCES virtual_machine(vm_id)`
- `NOT NULL computed_at`
- `NOT NULL downtime_minutes`
- `NOT NULL expected_samples`
- `NOT NULL measured_uptime_pct`
- `NOT NULL period_end`
- `NOT NULL period_start`
- `NOT NULL received_samples`
- `NOT NULL sla_record_id`
- `NOT NULL subscription_plan_id`
- `NOT NULL target_uptime_pct`
- `NOT NULL vm_id`
- `PRIMARY KEY (sla_record_id)`
- `UNIQUE (vm_id, period_start, period_end)`

## spot_bid_request

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| bid_id | bigint | Yes | Identity (auto-generated ID) |
| project_id | bigint | Yes | — |
| requested_by | bigint | Yes | — |
| vm_configuration_id | bigint | Yes | — |
| region_id | bigint | No | — |
| max_price_per_hour | numeric(12,4) | Yes | — |
| status | text | Yes | 'OPEN'::text |
| fulfilled_vm_id | bigint | No | — |
| fulfilled_price_per_hour | numeric(12,4) | No | — |
| expires_at | timestamp with time zone | No | — |
| fulfilled_at | timestamp with time zone | No | — |
| preempted_at | timestamp with time zone | No | — |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((max_price_per_hour > (0)::numeric))`
- `CHECK ((status = ANY (ARRAY['OPEN'::text, 'FULFILLED'::text, 'PREEMPTED'::text, 'CANCELLED'::text, 'EXPIRED'::text, 'REJECTED'::text])))`
- `FOREIGN KEY (fulfilled_vm_id) REFERENCES virtual_machine(vm_id)`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `FOREIGN KEY (region_id) REFERENCES cloud_region(region_id)`
- `FOREIGN KEY (requested_by) REFERENCES app_user(user_id)`
- `FOREIGN KEY (vm_configuration_id) REFERENCES vm_configuration(vm_configuration_id)`
- `NOT NULL bid_id`
- `NOT NULL created_at`
- `NOT NULL max_price_per_hour`
- `NOT NULL project_id`
- `NOT NULL requested_by`
- `NOT NULL status`
- `NOT NULL updated_at`
- `NOT NULL vm_configuration_id`
- `PRIMARY KEY (bid_id)`
- `UNIQUE (fulfilled_vm_id)`

## storage_volume

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| volume_id | bigint | Yes | Identity (auto-generated ID) |
| project_id | bigint | Yes | — |
| region_id | bigint | Yes | — |
| vm_id | bigint | No | — |
| name | text | Yes | — |
| size_gb | integer | Yes | — |
| used_gb | numeric(10,2) | Yes | 0 |
| volume_type | text | Yes | — |
| is_root | boolean | Yes | false |
| state | text | Yes | 'AVAILABLE'::text |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((used_gb <= (size_gb)::numeric))`
- `CHECK (((state = 'ATTACHED'::text) = (vm_id IS NOT NULL)))`
- `CHECK ((size_gb > 0))`
- `CHECK ((state = ANY (ARRAY['AVAILABLE'::text, 'ATTACHED'::text, 'DELETED'::text])))`
- `CHECK ((used_gb >= (0)::numeric))`
- `CHECK ((volume_type = ANY (ARRAY['SSD'::text, 'HDD'::text])))`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `FOREIGN KEY (region_id) REFERENCES cloud_region(region_id)`
- `FOREIGN KEY (vm_id) REFERENCES virtual_machine(vm_id)`
- `NOT NULL created_at`
- `NOT NULL is_root`
- `NOT NULL name`
- `NOT NULL project_id`
- `NOT NULL region_id`
- `NOT NULL size_gb`
- `NOT NULL state`
- `NOT NULL updated_at`
- `NOT NULL used_gb`
- `NOT NULL volume_id`
- `NOT NULL volume_type`
- `PRIMARY KEY (volume_id)`

## subscription_plan

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| plan_id | bigint | Yes | Identity (auto-generated ID) |
| name | text | Yes | — |
| monthly_fee | numeric(12,2) | Yes | — |
| price_per_vcpu_hour | numeric(12,4) | Yes | — |
| price_per_gb_ram_hour | numeric(12,4) | Yes | — |
| price_per_gb_storage_month | numeric(12,4) | Yes | — |
| sla_uptime_target_pct | numeric(6,3) | Yes | — |
| default_max_vcpu | integer | Yes | — |
| default_max_ram_gb | integer | Yes | — |
| default_max_vms | integer | Yes | — |
| is_active | boolean | Yes | true |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((default_max_ram_gb > 0))`
- `CHECK ((default_max_vcpu > 0))`
- `CHECK ((default_max_vms > 0))`
- `CHECK ((monthly_fee >= (0)::numeric))`
- `CHECK ((price_per_gb_ram_hour >= (0)::numeric))`
- `CHECK ((price_per_gb_storage_month >= (0)::numeric))`
- `CHECK ((price_per_vcpu_hour >= (0)::numeric))`
- `CHECK (((sla_uptime_target_pct > (0)::numeric) AND (sla_uptime_target_pct <= (100)::numeric)))`
- `NOT NULL created_at`
- `NOT NULL default_max_ram_gb`
- `NOT NULL default_max_vcpu`
- `NOT NULL default_max_vms`
- `NOT NULL is_active`
- `NOT NULL monthly_fee`
- `NOT NULL name`
- `NOT NULL plan_id`
- `NOT NULL price_per_gb_ram_hour`
- `NOT NULL price_per_gb_storage_month`
- `NOT NULL price_per_vcpu_hour`
- `NOT NULL sla_uptime_target_pct`
- `NOT NULL updated_at`
- `PRIMARY KEY (plan_id)`
- `UNIQUE (name)`

## support_ticket

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| ticket_id | bigint | Yes | Identity (auto-generated ID) |
| created_by | bigint | Yes | — |
| assigned_to | bigint | No | — |
| project_id | bigint | No | — |
| vm_id | bigint | No | — |
| subject | text | Yes | — |
| description | text | Yes | — |
| priority | text | Yes | 'MEDIUM'::text |
| status | text | Yes | 'OPEN'::text |
| resolved_at | timestamp with time zone | No | — |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK (((status <> ALL (ARRAY['RESOLVED'::text, 'CLOSED'::text])) OR (resolved_at IS NOT NULL)))`
- `CHECK ((priority = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text])))`
- `CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_PROGRESS'::text, 'RESOLVED'::text, 'CLOSED'::text])))`
- `FOREIGN KEY (assigned_to) REFERENCES app_user(user_id)`
- `FOREIGN KEY (created_by) REFERENCES app_user(user_id)`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `FOREIGN KEY (vm_id) REFERENCES virtual_machine(vm_id)`
- `NOT NULL created_at`
- `NOT NULL created_by`
- `NOT NULL description`
- `NOT NULL priority`
- `NOT NULL status`
- `NOT NULL subject`
- `NOT NULL ticket_id`
- `NOT NULL updated_at`
- `PRIMARY KEY (ticket_id)`

## virtual_machine

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| vm_id | bigint | Yes | Identity (auto-generated ID) |
| project_id | bigint | Yes | — |
| vm_configuration_id | bigint | Yes | — |
| host_id | bigint | No | — |
| name | text | Yes | — |
| state | text | Yes | — |
| is_spot | boolean | Yes | false |
| subnet_id | bigint | No | — |
| private_ip | inet | No | — |
| load_balancer_id | bigint | No | — |
| created_by | bigint | No | — |
| requested_at | timestamp with time zone | Yes | now() |
| started_at | timestamp with time zone | No | — |
| stopped_at | timestamp with time zone | No | — |
| terminated_at | timestamp with time zone | No | — |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((state = ANY (ARRAY['REQUESTED'::text, 'PROVISIONING'::text, 'RUNNING'::text, 'STOPPED'::text, 'TERMINATED'::text, 'PREEMPTED'::text, 'FAILED'::text])))`
- `CHECK (((host_id IS NOT NULL) OR (state <> ALL (ARRAY['PROVISIONING'::text, 'RUNNING'::text, 'STOPPED'::text]))))`
- `CHECK (((subnet_id IS NULL) = (private_ip IS NULL)))`
- `FOREIGN KEY (created_by) REFERENCES app_user(user_id)`
- `FOREIGN KEY (host_id) REFERENCES cloud_host(host_id)`
- `FOREIGN KEY (load_balancer_id) REFERENCES load_balancer(load_balancer_id)`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `FOREIGN KEY (subnet_id) REFERENCES virtual_network(virtual_network_id)`
- `FOREIGN KEY (vm_configuration_id) REFERENCES vm_configuration(vm_configuration_id)`
- `NOT NULL created_at`
- `NOT NULL is_spot`
- `NOT NULL name`
- `NOT NULL project_id`
- `NOT NULL requested_at`
- `NOT NULL state`
- `NOT NULL updated_at`
- `NOT NULL vm_configuration_id`
- `NOT NULL vm_id`
- `PRIMARY KEY (vm_id)`

## virtual_network

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| virtual_network_id | bigint | Yes | Identity (auto-generated ID) |
| project_id | bigint | Yes | — |
| region_id | bigint | Yes | — |
| parent_network_id | bigint | No | — |
| name | text | Yes | — |
| cidr_block | cidr | Yes | — |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK (((parent_network_id IS NULL) OR (parent_network_id <> virtual_network_id)))`
- `FOREIGN KEY (parent_network_id) REFERENCES virtual_network(virtual_network_id)`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `FOREIGN KEY (region_id) REFERENCES cloud_region(region_id)`
- `NOT NULL cidr_block`
- `NOT NULL created_at`
- `NOT NULL name`
- `NOT NULL project_id`
- `NOT NULL region_id`
- `NOT NULL updated_at`
- `NOT NULL virtual_network_id`
- `PRIMARY KEY (virtual_network_id)`
- `UNIQUE (project_id, name)`

## vm_configuration

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| vm_configuration_id | bigint | Yes | Identity (auto-generated ID) |
| name | text | No | — |
| vcpu | integer | Yes | — |
| ram_gb | integer | Yes | — |
| os_family | text | Yes | — |
| os_image | text | Yes | — |
| is_catalog | boolean | Yes | false |
| created_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((os_family = ANY (ARRAY['LINUX'::text, 'WINDOWS'::text])))`
- `CHECK ((ram_gb > 0))`
- `CHECK ((vcpu > 0))`
- `NOT NULL created_at`
- `NOT NULL is_catalog`
- `NOT NULL os_family`
- `NOT NULL os_image`
- `NOT NULL ram_gb`
- `NOT NULL vcpu`
- `NOT NULL vm_configuration_id`
- `PRIMARY KEY (vm_configuration_id)`
- `UNIQUE (vcpu, ram_gb, os_image)`

## vm_request

| Column | Data type | Required | Default / generated value |
|---|---|---|---|
| vm_request_id | bigint | Yes | Identity (auto-generated ID) |
| project_id | bigint | Yes | — |
| requested_by | bigint | Yes | — |
| name | text | Yes | — |
| vcpu | integer | Yes | — |
| ram_gb | integer | Yes | — |
| storage_gb | integer | Yes | — |
| os_image | text | Yes | — |
| volume_type | text | Yes | — |
| region_id | bigint | No | — |
| max_hourly_budget | numeric(12,4) | No | — |
| status | text | Yes | 'PENDING'::text |
| reviewed_by | bigint | No | — |
| reviewed_at | timestamp with time zone | No | — |
| decision_reason | text | No | — |
| vm_id | bigint | No | — |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

Constraints and keys:

- `CHECK ((((status = 'PENDING'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (vm_id IS NULL)) OR ((status = 'APPROVED'::text) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (vm_id IS NOT NULL)) OR ((status = 'REJECTED'::text) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (vm_id IS NULL))))`
- `CHECK (((max_hourly_budget IS NULL) OR (max_hourly_budget >= (0)::numeric)))`
- `CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 100)))`
- `CHECK (((char_length(btrim(os_image)) >= 1) AND (char_length(btrim(os_image)) <= 200)))`
- `CHECK (((ram_gb >= 1) AND (ram_gb <= 4096)))`
- `CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])))`
- `CHECK (((storage_gb >= 1) AND (storage_gb <= 65536)))`
- `CHECK (((vcpu >= 1) AND (vcpu <= 256)))`
- `CHECK ((volume_type = ANY (ARRAY['SSD'::text, 'HDD'::text])))`
- `FOREIGN KEY (project_id) REFERENCES project(project_id)`
- `FOREIGN KEY (region_id) REFERENCES cloud_region(region_id)`
- `FOREIGN KEY (requested_by) REFERENCES app_user(user_id)`
- `FOREIGN KEY (reviewed_by) REFERENCES app_user(user_id)`
- `FOREIGN KEY (vm_id) REFERENCES virtual_machine(vm_id)`
- `NOT NULL created_at`
- `NOT NULL name`
- `NOT NULL os_image`
- `NOT NULL project_id`
- `NOT NULL ram_gb`
- `NOT NULL requested_by`
- `NOT NULL status`
- `NOT NULL storage_gb`
- `NOT NULL updated_at`
- `NOT NULL vcpu`
- `NOT NULL vm_request_id`
- `NOT NULL volume_type`
- `PRIMARY KEY (vm_request_id)`
- `UNIQUE (vm_id)`
