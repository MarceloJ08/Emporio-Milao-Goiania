# Security Roadmap

This is a set of proposed safeguards, not a claim that all are currently enabled.

## Identity and authorization
- Enforce server-side authorization and role/permission checks; never trust UI visibility alone.
- Apply least privilege to administrative, staff, customer and service identities.
- Require MFA for privileged users and review recovery flows.
- Review session lifetime, revocation and account recovery.

## Data and database
- Review Supabase/Postgres RLS on every exposed table and view.
- Avoid broad grants and service-role use in browser code.
- Protect personal and financial information; minimize collection and retention.
- Validate inputs, use parameterized queries and safe RPC boundaries.
- Review migrations for privilege, integrity, and rollback implications.

## Application security
- Rate-limit sensitive endpoints and abuse-prone workflows.
- Protect against CSRF where applicable, XSS, injection, SSRF and unsafe redirects.
- Store secrets only in approved environment/secret managers; never commit credentials.
- Add dependency, static-analysis and secret scans to CI.

## Audit and response
- Log administrative actions, financial adjustments, discounts, inventory changes and permission changes.
- Exclude passwords, tokens, and unnecessary sensitive data from logs.
- Establish alerting, incident response, backups, recovery testing and retention policies.

## Validation
Security controls require testing and periodic review. Do not represent this roadmap as certification or complete compliance with LGPD.