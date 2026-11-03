# Core entity relationships

This diagram shows the main approval/allocation relationships. See `database/TABLES_AND_COLUMNS.md` and migrations for the complete 27-table schema, additional constraints and column types.

```mermaid
erDiagram
  organization ||--o{ project : owns
  project ||--o{ vm_request : receives
  app_user ||--o{ vm_request : submits
  project ||--o{ virtual_machine : contains
  vm_configuration ||--o{ virtual_machine : configures
  cloud_region ||--o{ cloud_host : locates
  cloud_host o|--o{ virtual_machine : hosts
  virtual_machine o|--o| vm_request : results_in
  project {
    bigint project_id PK
    bigint organization_id FK
    text name
  }
  virtual_machine {
    bigint vm_id PK
    bigint project_id FK
    bigint vm_configuration_id FK
    bigint host_id FK
    text name
    text state
  }
  vm_configuration {
    bigint vm_configuration_id PK
    integer vcpu
    integer ram_gb
  }
  cloud_host {
    bigint host_id PK
    bigint region_id FK
    text hostname
  }
```

## Worked normalization example

Start with `VM(vm_id, vm_name, project_id, project_name, organization_id, config_id, vcpu, ram_gb)`, where config_id abbreviates vm_configuration_id.

- `vm_id → vm_name, project_id, config_id`
- `project_id → project_name, organization_id`
- `config_id → vcpu, ram_gb`

Atomic values give 1NF. The single-column key vm_id has no partial dependencies, so this example is in 2NF. Project and configuration facts depend transitively on vm_id. Separate `Project(project_id, project_name, organization_id)` and `VMConfiguration(config_id, vcpu, ram_gb)`, retaining their foreign keys in `VM(vm_id, vm_name, project_id, config_id)`. This removes those transitive dependencies and gives 3NF for the stated dependencies. The actual schema adds other relations and constraints.

Host and quota allocation counters are intentional derived state. Transactional routines and row locks maintain them; generated free-capacity columns calculate total minus allocated. Do not edit counters manually.
