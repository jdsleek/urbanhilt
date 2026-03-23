# Staff access, POS, and transactions

## Roles

| Login | Purpose |
|--------|---------|
| **Admin** (`/admin/`) | Full control: products, all orders, staff profiles, discounts, overrides. |
| **Staff PIN** (`/staff-access.html`) | Store floor: POS, staff hub, customer checkout assist (when `REQUIRE_STAFF_CHECKOUT=true`). |

### Access roles (Admin → Sales staff → **Access role**)

- **Staff** — POS / in-person checkout, mark payment verified, approve awaiting website orders, **own** transactions, print receipts.
- **Supervisor** — Everything staff has, plus **all** transactions, **cancel** confirmed orders (inventory restored), **record refunds** (full refund restores stock), **sales-by-staff** report (90 days).

Staff still use a **PIN** (not a separate password). Change role in admin; staff must **sign in again** for a new JWT to pick up role changes.

## Flows

1. **Website order + `REQUIRE_STAFF_CHECKOUT=true`**  
   Order is `awaiting_staff` (no stock yet). Staff: verify payment if needed → approve sale (POS sidebar or staff hub). Stock deducts on approval.

2. **POS / staff Bearer checkout**  
   Order is `pending` immediately; stock deducts on create.

3. **Cancellation**  
   - **Awaiting staff:** no stock to restore.  
   - **Pending / processing (supervisor or admin):** stock restored, order `cancelled`, reason stored.

4. **Refunds (supervisor)**  
   - **Full:** order → `refunded`, stock restored, `order_refunds` row.  
   - **Partial:** amount logged; **stock is not auto-adjusted** (fix counts in admin if needed).

5. **Receipts**  
   Staff hub or POS **Last receipt** → `/receipt.html?order=UH-…` (requires staff session). Optional env: `STORE_RECEIPT_NAME`, `STORE_RECEIPT_TAGLINE`.

## API (Bearer staff JWT)

Base: `/api/staff`

| Method | Path | Notes |
|--------|------|--------|
| POST | `/login` | `{ pin }` |
| GET | `/me` | Profile + `permissions` |
| GET | `/awaiting-orders` | Queue |
| GET | `/transactions?scope=mine\|all&status=&limit=` | `all` = supervisor |
| GET | `/orders/:id` | Detail + refund rows |
| GET | `/receipt-data?order_number=` | For print view |
| GET | `/reports/sales-by-staff` | Supervisor |
| POST | `/orders/:id/cancel` | `{ reason }` |
| POST | `/orders/:id/refund` | `{ amount, reason, full? }` — supervisor |

## Pages

- `/staff-access.html` — PIN entry  
- `/staff-portal.html` — transactions, awaiting queue, cancelled/refunded, reports  
- `/pos.html` — catalog + cart + quick confirm tools  
- `/receipt.html?order=…` — print-friendly receipt  
