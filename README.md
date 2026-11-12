# L&D Training Resource, Inventory & License Deposit Portal

Web portal for **KBZ Life Insurance – L&D Department**, built from the BRD
*"BRT Training Resource Inventory Management Portal v2.2"*. One place to manage training refreshments,
materials, YCP merchandise, reusable assets, training budgets, and the full **License Class Deposit lifecycle**
(Held → Refunded / Forfeited).

Stack: React 19 + TypeScript + Vite + Tailwind CSS 4, with Supabase (Postgres, Auth, Storage) as the backend.
The theme is navy and silver, and the layout works on desktop, tablet and phone.

## Quick start (demo mode)

```bash
npm install
npm run dev        # http://localhost:3000
```

With no Supabase settings the app runs in **demo mode**. Data lives in your browser (`localStorage`), comes
pre-filled with the BRD master data plus sample batches, deposits and assets, and you pick a demo user
for each role on the sign-in page. *Settings → Reset demo data* restores the sample.

| Demo user | Role |
|---|---|
| Aye Aye Mon / Kyaw Zin Htet | L&D Staff |
| Daw Thida Win | L&D HOD |
| Hnin Wai Phyo | Finance / Auditor |
| Portal Admin | System Administrator |

Item names follow BRD section 8. **Unit costs, quantities, people and deposits are sample values.** Replace them
with real data before going live.

## Production setup (Supabase)

1. Create a Supabase project.
2. In **SQL Editor**, run `supabase/migrations/20261112000000_ld_portal.sql`. It creates the tables, rules,
   triggers, Row Level Security policies and the private `attachments` storage bucket. It is safe to run again.
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API).
4. `npm run build` and deploy `dist/` (a `vercel.json` is included; any static host works).
5. Sign up in the app, then make yourself the first administrator once in the SQL editor:
   ```sql
   update public.profiles set role = 'admin', active = true where email = 'you@kbzlife.com';
   ```
   After that, new sign-ups appear in **Users & Roles** as inactive L&D Staff for the admin to activate and assign a role.
6. Add your item master, batches and the FY budget, then record opening stock with **Stock in**.

## How the BRD maps to the portal

| BRD | Where |
|---|---|
| 7.1 Deposit registration, refund, forfeiture, retention alert | **License Deposits**, **Approvals**, dashboard *Deposit expiry alerts* |
| 7.2 Stock in / out / return, physical count, low-stock alerts | **Inventory** (tabs: stock, transactions, physical count), **Material Requests** |
| 7.3 Assets (unique ID, check-in/out, maintenance, damaged/lost) | **Assets** |
| 7.3 Budget & variance | **Budget & Expenses**, **Training Batches** |
| 6 Roles / RBAC | Navigation, buttons and database policies per role |
| 10 Approval matrix | **Approvals** inbox (HOD; Finance for refund payment) |
| 11 Dashboard widgets | **Dashboard** |
| 11 Five standard reports (Excel & PDF) | **Reports** |
| 12 Audit logging (user, time, IP) | **Audit Log**: deposit state changes and all activity |
| 13 Business rules 1–4 | Enforced in `src/lib/logic.ts` *and* in the database (see below) |
| 14 Data fields (DEP-2026-0001 etc.) | Deposit form and record |

### Deposit lifecycle

```
Register ──► Held ──► Refund Request ──(HOD approves)──(Finance confirms, voucher no.)──► Refunded
               │
               └────► Forfeiture Request ──(HOD approves)──► Forfeited  → non-refundable revenue ledger
                       reason: Course Incomplete | Service Period Not Met

Refunded / Forfeited are read-only. To change one: Reversal Request ──(HOD approves)──► Held
Rejecting any request sends the deposit back to Held (or back to its closed state, for a reversal).
```

* Refund requests need the Exam Pass Certificate attached. Forfeiture requests need a reason, an evidence note
  and a forfeiture notice.
* **Maker-checker:** nobody can approve something they submitted.
* **Retention alert:** a Held deposit is flagged from month 11 and marked *term ended* at month 12.
  Both are configurable in **Settings**.
* Registration checks for missing fields, a License batch that is not completed, an existing open deposit for
  the same agent code, and duplicate vouchers.

### Where the rules are enforced

The browser checks every rule so people get clear messages. In Supabase mode **the database enforces them
again**, so a modified client cannot bypass them:

* `items.qty_on_hand >= 0` CHECK. Balances change only through a trigger when a stock transaction is approved,
  and direct edits are rejected (rule 1).
* `guard_deposit` trigger: allowed transitions per role, required attachment and reason, immutable approved
  records, reversal only through the HOD (rules 2–4).
* `log_deposit_status` trigger writes every deposit state change with user, timestamp and IP from the request headers.
* `audit_logs` is insert-only, and the server stamps the user, time and IP.
* Row Level Security on every table. Finance/Auditor can read everything but write only the refund-payment
  confirmation. Inactive users see nothing.

## Decisions where the BRD was open

* **Finance role vs. refund approval.** Section 6 calls Finance read-only, while section 10 lists
  "L&D HOD & Finance" as refund approvers. Finance therefore has one write action: confirming that a refund
  the HOD already approved has been paid, with the payment voucher number.
* **"Agent code: unique"** is read as one *open* deposit per agent code. An agent who finished a past class can
  register for a new one.
* **Stock returns** are recorded straight away and need no approval (they are not in the approval matrix). Items in good
  condition go back on the shelf; damaged and lost ones are logged only. Write-offs go through an HOD-approved adjustment.
* **Physical count** variances become adjustment requests for the HOD to approve, not automatic corrections.
* **Budget actuals.** Batch actual = materials issued (net of good returns) at cost + expenses tagged to the batch.
  Department actual for a year = approved purchases (stock in) + all expenses. Opening balances are not counted as spend.

## Not included yet

* **Email alerts through Outlook SMTP** (BRD 15). Alerts and approval counts appear in the app (bell icon,
  dashboard, approvals badge). Sending email needs a server-side job, such as a Supabase Edge Function on a
  schedule with the company SMTP credentials.
* **Midnight backups** are handled by Supabase's automatic daily backups (paid plans, Project Settings →
  Database → Backups). Admins can also download a full JSON snapshot from **Settings**.
* **100,000+ records.** The app currently loads each table into the browser and searches there. That is fine
  for thousands of records. Before data reaches the BRD's 100k scale, move list pages to server-side paging and search
  (the indexes are already in the migration).
* Phase 2 items: the agent self-service portal and ERP / core-system integration.

## Development

```bash
npm run lint    # TypeScript check
npm test        # business-rule unit tests (deposit state machine, stock, budget, seed consistency)
npm run build
```

Code map: `src/lib/logic.ts` (rules) · `src/lib/store.tsx` (actions + audit) · `src/lib/db.ts`
(demo / Supabase adapters) · `src/pages/*` (screens) · `src/pages/reportSpecs.ts` (the five reports) ·
`supabase/migrations/` (schema & security).
