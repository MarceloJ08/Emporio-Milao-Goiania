# Domain Boundaries

## Storefront
Catalog browsing, product presentation, cart and customer checkout. Keep customer-facing behavior stable while isolating UI and business logic.

## Operations
Order processing, stock, warehouse operations, delivery and sales workflow. Protect consistency and audit sensitive adjustments.

## Administration
Configuration, roles, discount policy, staff and settings. Enforce authorization on the server and database.

## Finance
Sales summaries, invoicing workflows, revenue reports and reconciliations. Treat financial records as sensitive and audit changes.

## Integrations
External partners, ERP, payment providers and messaging. Use timeouts, retries, idempotency and isolated credentials.