# Tests and recorded review results

`review-results.json` contains actual local review output captured on 3 November 2026, using synthetic demonstration records. Counts depend on the current database. It is not evidence of a full automated test-suite run.

| Check | Expected | Observed |
| --- | --- | --- |
| VM/project/configuration JOIN | Matching project and configuration for each returned VM | Five rows returned |
| Group by VM state | One count per state present | Counts returned (see JSON) |
| Host capacity integrity | Zero invalid capacity counters | 0 |
| Request status integrity | Zero inconsistent pending/approved records | 0 |
| NOT EXISTS query | Projects without VM records | Project 6 returned |
| Temporary INSERT | One row with vcpu 2 | One row, vcpu 2 |
| Temporary UPDATE | Same row with vcpu 4 | One row, vcpu 4 |
| Temporary DELETE | Return the deleted row | One row returned |
| Temporary CHECK constraint | Reject vcpu 0 with SQLSTATE 23514 | 23514 |

Temporary CRUD and CHECK tests ran inside a transaction that was rolled back. They demonstrate PostgreSQL behavior on a temporary example table, not end-to-end VM validation. The app role cannot create this temporary table; use the schema-owner connection for the exercise in `database/queries.sql`.

## Automated tests

Actual suites are in [`backend/tests`](../backend/tests). Follow the root README to create a disposable database ending in `_test`, configure test URLs, and run `npm run migrate:test` then `npm test` from `backend`. The suites reset test data. Never point them at the working demonstration database.

Full-suite execution and clean-machine setup have not been verified for this submission update. Do not describe the targeted checks above as complete regression coverage.

Frontend validation on 3 November 2026: `npm --prefix frontend run build` passed TypeScript checking and Vite production compilation. Vite reported a large-bundle warning.

All 15 statements in database/queries.sql executed successfully against the local demo database on 3 November 2026. Its CRUD transaction rolled back; the temporary view ended with the database session.
