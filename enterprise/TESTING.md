# Validation and Test Plan

## Verified in this change
- Confirmed the additive architecture files exist in the branch tree.
- Confirmed the branch remains separate from `main`.
- Inspected the root README, entry HTML, primary JS, CSS, Vercel headers and security documentation as preliminary code review.

## Automated checks planned/enabled
- JavaScript syntax validation using Node.
- Structure and security-header smoke checks.
- GitHub Actions workflow to run checks on pushes and pull requests to this branch.

## Functional test checklist (requires staging credentials/data)
- Catalog rendering and filtering; product details/images.
- Guest/customer carts, persistence and cart merging.
- Signup, login, logout, recovery and session handling.
- Checkout/order creation, idempotency, error handling and payment/delivery selection.
- Admin login and every configuration area, authorization boundary, audit trail.
- Staff login and sales creation, discount rules and inventory impact.
- Realtime order/finance refresh and disconnect/reconnect behavior.
- Database RLS, RPC authorization, storage policies, migrations and rollback.
- Mobile/responsive UI, keyboard navigation, screen reader labels and performance.

Do not mark the checklist passed until tests run against a staging environment and are independently verified. Avoid using real customer/financial records.