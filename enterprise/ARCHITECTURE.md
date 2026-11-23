# Architecture and Quality Evolution

## Baseline
Keep the existing storefront, administrative panel, Supabase/Postgres backend, current migrations, and deployment intact. No destructive rewrites or schema changes are part of this scaffold.

## Suggested modular layout
- `apps/`: storefront, admin, API entry points, future native client.
- `domains/`: commerce, operations, finance, administration, integration boundaries.
- `platform/`: shared contracts, observability, security, configuration.
- `database/`: migration ownership, policies, SQL routines and tests.
- `tests/`: unit, integration, end-to-end, regression, and security suites.
- `services/`: isolated runtime-specific services only where needed.

## Core responsibilities
- TypeScript: primary application logic, typed contracts and API orchestration.
- JavaScript: existing compatibility code; migrate gradually, not duplicatively.
- SQL: data integrity, database migrations, safe queries and RLS.
- HTML/CSS: semantic UI and design system.
- Python: analytics, batch jobs and automation where justified.
- Go: focused high-throughput or concurrency-heavy services.
- Java/C#: enterprise integration services only when requirements justify them.
- PHP/Ruby: isolated integration or legacy compatibility where applicable.
- Swift: native iOS client if a native app becomes a product requirement.
- C++: performance-critical native components only when profiling justifies them.

## Engineering gates
1. Feature/bug regression tests.
2. Type checking and linting.
3. Security review and authorization tests.
4. Database migration validation and rollback plan.
5. Accessibility, responsive and performance checks.
6. Preview deployment review before release.

## Change management
Use feature branches and pull requests. Prefer additive migration, compatibility, telemetry, gradual rollout, and explicit rollback. Keep the application operational during refactoring.