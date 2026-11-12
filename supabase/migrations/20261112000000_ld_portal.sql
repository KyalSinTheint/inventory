-- L&D Training Resource, Inventory & License Deposit Portal: schema, rules and security.
-- Run once in Supabase → SQL Editor (or `supabase db push`).
--
-- Security model
--  * Every table has Row Level Security. Only signed-in, *active* users can read anything.
--  * Roles (profiles.role): staff, hod, finance, admin. Finance is read-only except confirming refund payments.
--  * Stock balances change only through a trigger when a stock transaction is saved as Approved;
--    a CHECK constraint makes negative stock impossible (BRD rule 1).
--  * The deposit state machine is enforced by a trigger (BRD rules 2–4): attachments for refunds,
--    a reason for forfeiture, HOD + Finance for refunds, immutable approved records, reversal only via HOD.
--  * Every deposit state change is logged by a trigger with user, time and IP; audit_logs is insert-only.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ profiles & role helpers
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'staff' check (role in ('staff', 'hod', 'finance', 'admin')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.has_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = any (roles), false)
$$;

create or replace function public.request_ip() returns text
language sql stable as $$
  select nullif(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '')
$$;

-- New sign-ups get an inactive staff profile; an administrator activates them and assigns the role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Only admins change role / active; nobody changes their own role or email.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- SQL editor / service role
  if new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'You cannot change your own role or status';
  end if;
  if new.email is distinct from old.email then raise exception 'Email is managed by authentication'; end if;
  return new;
end $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- ------------------------------------------------------------------ master data
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null check (category in ('Refreshments', 'Training Materials', 'YCP Program', 'Office Supplies')),
  classification text not null check (classification in ('Consumable', 'Reusable Asset', 'Merchandise')),
  unit text not null default 'Piece',
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  min_level integer not null default 0 check (min_level >= 0),
  qty_on_hand integer not null default 0 constraint items_qty_on_hand_check check (qty_on_hand >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  program text not null check (program in ('Corporate', 'Agency', 'YCP', 'License')),
  start_date date,
  end_date date,
  budget numeric(16, 2) not null default 0 check (budget >= 0),
  status text not null default 'Planned' check (status in ('Planned', 'Active', 'Completed')),
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.settings (
  id text primary key default 'settings',
  retention_alert_months integer not null default 11 check (retention_alert_months > 0),
  service_term_months integer not null default 12,
  low_stock_warning_pct integer not null default 0,
  updated_at timestamptz not null default now(),
  check (service_term_months > retention_alert_months)
);
insert into public.settings (id) values ('settings') on conflict do nothing;

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  fiscal_year integer not null unique,
  amount numeric(16, 2) not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ inventory
create table if not exists public.stock_txns (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  type text not null check (type in ('IN', 'OUT', 'RETURN', 'ADJUST')),
  item_id uuid not null references public.items (id),
  qty integer not null check (qty <> 0 and (type = 'ADJUST' or qty > 0)),
  unit_cost numeric(14, 2) not null default 0,
  batch_id uuid references public.batches (id),
  request_id uuid,
  supplier text,
  invoice_no text,
  condition text check (condition in ('Good', 'Damaged', 'Lost')),
  reason text,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  check (type <> 'RETURN' or (condition is not null and batch_id is not null)),
  check (type <> 'IN' or (supplier is not null and invoice_no is not null))
);
create index if not exists stock_txns_item_idx on public.stock_txns (item_id, created_at);
create index if not exists stock_txns_batch_idx on public.stock_txns (batch_id);
create index if not exists stock_txns_status_idx on public.stock_txns (status);

create or replace function public.stock_delta(t public.stock_txns) returns integer
language sql immutable as $$
  select case t.type when 'IN' then t.qty when 'OUT' then -t.qty when 'ADJUST' then t.qty
    when 'RETURN' then case when t.condition = 'Good' then t.qty else 0 end end
$$;

-- Apply an approved transaction to the balance exactly once. The CHECK on items rejects negative stock
-- and rolls back the whole statement, so the transaction cannot be approved without enough stock.
create or replace function public.apply_stock_txn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'Pending' then raise exception 'Only pending transactions can be decided'; end if;
    if (new.type, new.item_id, new.qty, new.unit_cost, new.batch_id, new.condition, new.created_by)
       is distinct from (old.type, old.item_id, old.qty, old.unit_cost, old.batch_id, old.condition, old.created_by) then
      raise exception 'Transaction details cannot be changed after submission';
    end if;
  end if;
  if new.status = 'Approved' and (tg_op = 'INSERT' or old.status <> 'Approved') then
    perform set_config('app.stock_trigger', 'on', true);
    update public.items set qty_on_hand = qty_on_hand + public.stock_delta(new) where id = new.item_id;
    perform set_config('app.stock_trigger', 'off', true);
  end if;
  return new;
end $$;
drop trigger if exists apply_stock_txn on public.stock_txns;
create trigger apply_stock_txn after insert or update on public.stock_txns for each row execute function public.apply_stock_txn();

-- Nobody edits qty_on_hand directly: it only moves through approved transactions.
create or replace function public.guard_item_qty() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.stock_trigger', true), 'off') = 'on' or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.qty_on_hand := 0;
  elsif new.qty_on_hand is distinct from old.qty_on_hand then
    raise exception 'Quantity on hand changes only through approved stock transactions';
  end if;
  return new;
end $$;
drop trigger if exists guard_item_qty on public.items;
create trigger guard_item_qty before insert or update on public.items for each row execute function public.guard_item_qty();

create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  batch_id uuid not null references public.batches (id),
  purpose text not null default '',
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text
);

create table if not exists public.physical_counts (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  lines jsonb not null,
  note text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ assets
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null unique,
  name text not null,
  serial_no text not null unique,
  category text not null,
  purchase_date date,
  cost numeric(14, 2) not null default 0,
  condition text not null check (condition in ('Good', 'Fair', 'Damaged')),
  status text not null check (status in ('Available', 'Checked Out', 'Maintenance', 'Damaged', 'Lost', 'Retired')),
  location text not null default '',
  holder text,
  batch_id uuid references public.batches (id),
  created_at timestamptz not null default now()
);

create table if not exists public.asset_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id),
  action text not null,
  condition text,
  holder text,
  batch_id uuid references public.batches (id),
  cost numeric(14, 2) not null default 0,
  note text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists asset_logs_asset_idx on public.asset_logs (asset_id);

-- ------------------------------------------------------------------ license deposits
create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  trainee_name text not null check (length(trim(trainee_name)) > 0),
  agent_code text not null check (length(trim(agent_code)) > 0),
  batch_id uuid not null references public.batches (id),
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null,
  voucher_ref text not null unique,
  status text not null default 'Held'
    check (status in ('Held', 'Refund Request', 'Refunded', 'Forfeiture Request', 'Forfeited', 'Reversal Request')),
  forfeit_reason text check (forfeit_reason in ('Course Incomplete', 'Service Period Not Met')),
  request_note text,
  attachment jsonb,
  requested_by uuid references public.profiles (id),
  requested_at timestamptz,
  hod_approved_by uuid references public.profiles (id),
  hod_approved_at timestamptz,
  finance_approved_by uuid references public.profiles (id),
  finance_approved_at timestamptz,
  finance_voucher_ref text,
  closed_at timestamptz,
  reversal_from text,
  reversal_reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists deposits_status_idx on public.deposits (status);
create index if not exists deposits_batch_idx on public.deposits (batch_id);
create index if not exists deposits_agent_idx on public.deposits (lower(agent_code));
-- One open deposit per agent code ("System Auto Check" on registration).
create unique index if not exists deposits_one_open_per_agent on public.deposits (lower(agent_code))
  where status not in ('Refunded', 'Forfeited');

create table if not exists public.deposit_status_log (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null references public.deposits (id),
  from_status text,
  to_status text not null,
  note text,
  attachment_name text,
  user_id uuid,
  user_name text not null default '',
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists deposit_status_log_dep_idx on public.deposit_status_log (deposit_id);

create or replace function public.guard_deposit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text := public.app_role();
  uid uuid := auth.uid();
  t text := old.status || ' → ' || new.status;
begin
  if uid is null then return new; end if; -- service role / SQL editor maintenance
  if r is null then raise exception 'Not an active portal user'; end if;

  -- Identity of the deposit never changes.
  if (new.ref, new.agent_code, new.batch_id, new.created_by, new.created_at)
     is distinct from (old.ref, old.agent_code, old.batch_id, old.created_by, old.created_at) then
    raise exception 'Deposit ID, agent code and batch cannot be changed';
  end if;
  -- Money fields can be corrected only while Held, and only by staff / HOD / admin.
  if (new.trainee_name, new.amount, new.payment_date, new.voucher_ref)
     is distinct from (old.trainee_name, old.amount, old.payment_date, old.voucher_ref) then
    if not (old.status = 'Held' and new.status = 'Held' and r in ('staff', 'hod', 'admin')) then
      raise exception 'Deposit details can only be corrected while Held';
    end if;
  end if;

  if old.status = 'Held' and new.status = 'Held' then
    if r not in ('staff', 'hod', 'admin') then raise exception 'Not allowed'; end if;
  elsif old.status = 'Held' and new.status = 'Refund Request' then
    if r not in ('staff', 'hod', 'admin') then raise exception 'Not allowed: %', t; end if;
    if new.attachment is null then raise exception 'Exam Pass Certificate attachment is required for a refund'; end if;
    new.requested_by := uid; new.requested_at := now();
    new.hod_approved_by := null; new.finance_approved_by := null;
  elsif old.status = 'Held' and new.status = 'Forfeiture Request' then
    if r not in ('staff', 'hod', 'admin') then raise exception 'Not allowed: %', t; end if;
    if new.forfeit_reason is null then raise exception 'Choose Course Incomplete or Service Period Not Met'; end if;
    if length(trim(coalesce(new.request_note, ''))) < 5 then raise exception 'An evidence note is required for forfeiture'; end if;
    if new.attachment is null then raise exception 'A forfeiture notice attachment is required'; end if;
    new.requested_by := uid; new.requested_at := now(); new.hod_approved_by := null;
  elsif old.status = 'Refund Request' and new.status = 'Refund Request' then
    if not (r = 'hod' and old.hod_approved_by is null and new.hod_approved_by = uid and old.requested_by <> uid) then
      raise exception 'Only another user with the HOD role can approve this refund';
    end if;
    new.hod_approved_at := now();
  elsif old.status = 'Refund Request' and new.status = 'Refunded' then
    if not (r = 'finance' and old.hod_approved_by is not null and new.finance_approved_by = uid) then
      raise exception 'Finance confirms a refund only after HOD approval';
    end if;
    if length(trim(coalesce(new.finance_voucher_ref, ''))) = 0 then raise exception 'Finance voucher reference is required'; end if;
    new.finance_approved_at := now(); new.closed_at := now();
  elsif old.status = 'Forfeiture Request' and new.status = 'Forfeited' then
    if not (r = 'hod' and new.hod_approved_by = uid and old.requested_by <> uid) then
      raise exception 'Only another user with the HOD role can approve this forfeiture';
    end if;
    new.hod_approved_at := now(); new.closed_at := now();
  elsif old.status in ('Refund Request', 'Forfeiture Request') and new.status = 'Held' then
    if not (r = 'hod' or (r = 'finance' and old.status = 'Refund Request' and old.hod_approved_by is not null)) then
      raise exception 'Not allowed to reject this request';
    end if;
  elsif old.status in ('Refunded', 'Forfeited') and new.status = 'Reversal Request' then
    if r not in ('staff', 'hod', 'admin') then raise exception 'Not allowed: %', t; end if;
    if length(trim(coalesce(new.reversal_reason, ''))) < 5 then raise exception 'A reversal reason is required'; end if;
    new.reversal_from := old.status; new.requested_by := uid; new.requested_at := now();
  elsif old.status = 'Reversal Request' and new.status = 'Held' then
    if not (r = 'hod' and old.requested_by <> uid) then raise exception 'Only another user with the HOD role can approve a reversal'; end if;
  elsif old.status = 'Reversal Request' and new.status = old.reversal_from then
    if r <> 'hod' then raise exception 'Only the HOD can reject a reversal'; end if;
  else
    raise exception 'Transition not allowed: %', t;
  end if;

  -- Approved records stay as approved (BRD rule 4): no other column may change on a closed deposit.
  if old.status in ('Refunded', 'Forfeited') and
     (new.forfeit_reason, new.attachment, new.hod_approved_by, new.finance_approved_by, new.finance_voucher_ref, new.closed_at)
     is distinct from (old.forfeit_reason, old.attachment, old.hod_approved_by, old.finance_approved_by, old.finance_voucher_ref, old.closed_at) then
    raise exception 'Approved deposit records are immutable';
  end if;
  return new;
end $$;
drop trigger if exists guard_deposit on public.deposits;
create trigger guard_deposit before update on public.deposits for each row execute function public.guard_deposit();

create or replace function public.guard_deposit_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.status <> 'Held' then raise exception 'New deposits start as Held'; end if;
  if not exists (select 1 from public.batches b where b.id = new.batch_id and b.program = 'License' and b.status <> 'Completed') then
    raise exception 'The batch must be an active License class';
  end if;
  if new.payment_date > current_date then raise exception 'Payment date cannot be in the future'; end if;
  new.created_by := auth.uid(); new.created_at := now();
  new.requested_by := null; new.hod_approved_by := null; new.finance_approved_by := null; new.closed_at := null;
  return new;
end $$;
drop trigger if exists guard_deposit_insert on public.deposits;
create trigger guard_deposit_insert before insert on public.deposits for each row execute function public.guard_deposit_insert();

-- Every state change is written to the history with user, time and IP.
create or replace function public.log_deposit_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := coalesce((select name from public.profiles where id = auth.uid()), 'system');
  note text;
begin
  if tg_op = 'UPDATE' and new.status = old.status and new.hod_approved_by is not distinct from old.hod_approved_by then
    return new;
  end if;
  note := case
    when tg_op = 'INSERT' then 'Deposit registered'
    when new.status = 'Reversal Request' then new.reversal_reason
    when old.status = 'Reversal Request' and new.status = 'Held' then 'Reversal approved by HOD'
    when old.status = 'Reversal Request' then new.reversal_reason
    when new.status = 'Refunded' then 'Paid on ' || coalesce(new.finance_voucher_ref, '')
    when new.status = 'Forfeited' or (new.status = 'Refund Request' and new.hod_approved_by is not null) then 'Approved by HOD'
    else new.request_note end;
  insert into public.deposit_status_log (deposit_id, from_status, to_status, note, attachment_name, user_id, user_name, ip)
  values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, note,
          case when tg_op = 'UPDATE' and new.attachment is distinct from old.attachment then new.attachment ->> 'name' end,
          auth.uid(), who, public.request_ip());
  return new;
end $$;
drop trigger if exists log_deposit_status on public.deposits;
create trigger log_deposit_status after insert or update on public.deposits for each row execute function public.log_deposit_status();

-- ------------------------------------------------------------------ expenses & audit
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  batch_id uuid references public.batches (id),
  category text not null,
  description text not null,
  amount numeric(16, 2) not null check (amount > 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_name text not null default '',
  action text not null,
  entity text not null,
  entity_id text,
  details text not null default '',
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- The server, not the browser, decides who wrote an audit row, when and from where.
create or replace function public.stamp_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    new.user_name := coalesce((select name from public.profiles where id = auth.uid()), '');
  end if;
  new.ip := public.request_ip();
  new.created_at := now();
  return new;
end $$;
drop trigger if exists stamp_audit on public.audit_logs;
create trigger stamp_audit before insert on public.audit_logs for each row execute function public.stamp_audit();

-- Server timestamps and authorship on operational rows.
create or replace function public.stamp_row() returns trigger
language plpgsql as $$
begin
  new.created_at := now();
  if auth.uid() is not null and tg_table_name <> 'stock_txns' then new.created_by := auth.uid(); end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['stock_txns', 'material_requests', 'physical_counts', 'asset_logs', 'expenses'] loop
    execute format('drop trigger if exists stamp_row on public.%I', t);
    execute format('create trigger stamp_row before insert on public.%I for each row execute function public.stamp_row()', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ row level security
do $$ declare t text; begin
  foreach t in array array['profiles', 'items', 'batches', 'settings', 'budgets', 'stock_txns', 'material_requests', 'physical_counts',
                           'assets', 'asset_logs', 'deposits', 'deposit_status_log', 'expenses', 'audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "active users read" on public.%I', t);
    execute format('create policy "active users read" on public.%I for select to authenticated using (public.app_role() is not null)', t);
  end loop;
end $$;
-- A pending user may read their own profile (to see that they are waiting for activation).
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "admin manages profiles" on public.profiles;
create policy "admin manages profiles" on public.profiles for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "hod admin write items" on public.items;
create policy "hod admin write items" on public.items for insert to authenticated with check (public.has_role('hod', 'admin'));
drop policy if exists "hod admin update items" on public.items;
create policy "hod admin update items" on public.items for update to authenticated using (public.has_role('hod', 'admin'));

drop policy if exists "hod admin write batches" on public.batches;
create policy "hod admin write batches" on public.batches for insert to authenticated with check (public.has_role('hod', 'admin'));
drop policy if exists "hod admin update batches" on public.batches;
create policy "hod admin update batches" on public.batches for update to authenticated using (public.has_role('hod', 'admin'));

drop policy if exists "hod admin budgets" on public.budgets;
create policy "hod admin budgets" on public.budgets for insert to authenticated with check (public.has_role('hod', 'admin'));
drop policy if exists "hod admin update budgets" on public.budgets;
create policy "hod admin update budgets" on public.budgets for update to authenticated using (public.has_role('hod', 'admin'));

drop policy if exists "admin settings" on public.settings;
create policy "admin settings" on public.settings for update to authenticated using (public.has_role('admin'));

-- Stock: staff submit Pending transactions and record returns; only the HOD issues (approved OUT) and decides.
drop policy if exists "submit stock txns" on public.stock_txns;
create policy "submit stock txns" on public.stock_txns for insert to authenticated with check (
  (public.has_role('staff', 'hod', 'admin') and created_by = auth.uid()
     and (status = 'Pending' or (type = 'RETURN' and status = 'Approved' and decided_by = auth.uid())))
  or (public.has_role('hod') and type = 'OUT' and status = 'Approved' and decided_by = auth.uid()
      and exists (select 1 from public.material_requests r where r.id = request_id and r.status = 'Pending' and r.created_by <> auth.uid()))
);
drop policy if exists "hod decides stock txns" on public.stock_txns;
create policy "hod decides stock txns" on public.stock_txns for update to authenticated
  using (public.has_role('hod') and status = 'Pending' and created_by <> auth.uid())
  with check (status in ('Approved', 'Rejected') and decided_by = auth.uid());

drop policy if exists "submit requests" on public.material_requests;
create policy "submit requests" on public.material_requests for insert to authenticated
  with check (public.has_role('staff', 'hod', 'admin') and status = 'Pending');
drop policy if exists "resubmit or decide requests" on public.material_requests;
create policy "resubmit or decide requests" on public.material_requests for update to authenticated
  using ((created_by = auth.uid() and status = 'Rejected' and public.has_role('staff', 'hod', 'admin'))
         or (public.has_role('hod') and status = 'Pending' and created_by <> auth.uid()))
  with check ((created_by = auth.uid() and status = 'Pending') or (public.has_role('hod') and status in ('Approved', 'Rejected') and decided_by = auth.uid()));

drop policy if exists "record counts" on public.physical_counts;
create policy "record counts" on public.physical_counts for insert to authenticated with check (public.has_role('staff', 'hod', 'admin'));

drop policy if exists "record assets" on public.assets;
create policy "record assets" on public.assets for insert to authenticated with check (public.has_role('staff', 'hod', 'admin'));
drop policy if exists "update assets" on public.assets;
create policy "update assets" on public.assets for update to authenticated using (public.has_role('staff', 'hod', 'admin'));
drop policy if exists "record asset logs" on public.asset_logs;
create policy "record asset logs" on public.asset_logs for insert to authenticated with check (public.has_role('staff', 'hod', 'admin'));

-- Deposits: the guard_deposit trigger enforces who may make which transition. No deletes for anyone.
drop policy if exists "register deposits" on public.deposits;
create policy "register deposits" on public.deposits for insert to authenticated with check (public.has_role('staff', 'hod', 'admin'));
drop policy if exists "update deposits" on public.deposits;
create policy "update deposits" on public.deposits for update to authenticated using (public.has_role('staff', 'hod', 'admin', 'finance'));

drop policy if exists "record expenses" on public.expenses;
create policy "record expenses" on public.expenses for insert to authenticated with check (public.has_role('staff', 'hod', 'admin'));

drop policy if exists "write audit" on public.audit_logs;
create policy "write audit" on public.audit_logs for insert to authenticated with check (public.app_role() is not null);
-- deposit_status_log is written only by the trigger (security definer); there is no insert policy.

-- ------------------------------------------------------------------ attachments (private bucket)
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict (id) do nothing;
drop policy if exists "ld upload attachments" on storage.objects;
create policy "ld upload attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.has_role('staff', 'hod', 'admin'));
drop policy if exists "ld read attachments" on storage.objects;
create policy "ld read attachments" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.app_role() is not null);
