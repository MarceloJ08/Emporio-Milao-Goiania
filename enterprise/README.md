# Enterprise Evolution — Empório Milão

This directory is an additive architecture and engineering roadmap. It does not replace or modify the production application.

## Principles
- Preserve existing functionality and data.
- Make changes additive, reversible, and reviewed.
- Keep the current TypeScript/JavaScript web app and Supabase/Postgres core as the primary platform.
- Introduce additional runtimes only for justified services, never as redundant rewrites.
- Secure-by-default, least privilege, observable, testable, accessible, and LGPD-aware.

See [architecture](ARCHITECTURE.md), [security](SECURITY.md), and the language/domain folders for responsibilities and adoption boundaries.

## Adoption
Implement in small pull requests; measure, test, review, and roll back if needed. This scaffold is documentation—not implementation of the listed services.