-- v2: NRC as the trainee identifier, Internal / External trainees, training date, supporting documents,
-- item photos, invoice / Excel attachments, request remarks, batch branch (YGN / MDY / TGI) and category budgets.
-- Run after 20261112000000_ld_portal.sql. Safe to run more than once.

-- ------------------------------------------------------------------ inventory & requests
alter table public.items add column if not exists photo jsonb;
alter table public.stock_txns add column if not exists attachment jsonb;
alter table public.material_requests add column if not exists attachment jsonb;
alter table public.material_requests add column if not exists remarks text not null default '';

-- ------------------------------------------------------------------ batches: programs and branch
alter table public.batches drop constraint if exists batches_program_check;
alter table public.batches add constraint batches_program_check
  check (program in ('License', 'YCP', 'Product & Soft Skills', 'Corporate', 'Agency'));
alter table public.batches add column if not exists location text;
alter table public.batches drop constraint if exists batches_location_check;
alter table public.batches add constraint batches_location_check check (location is null or location in ('YGN', 'MDY', 'TGI'));
alter table public.batches drop constraint if exists batches_license_location_check;
alter table public.batches add constraint batches_license_location_check check (program <> 'License' or location is not null) not valid;

-- ------------------------------------------------------------------ deposits: NRC, type, training date, documents
alter table public.deposits add column if not exists nrc text;
alter table public.deposits add column if not exists trainee_type text not null default 'Internal';
alter table public.deposits add column if not exists training_date date;
alter table public.deposits add column if not exists documents jsonb not null default '[]'::jsonb;
-- Existing rows (if any) keep their agent code as a placeholder NRC until corrected.
alter table public.deposits disable trigger guard_deposit;
update public.deposits d set nrc = coalesce(d.nrc, d.agent_code),
  training_date = coalesce(d.training_date, (select b.start_date from public.batches b where b.id = d.batch_id), d.payment_date)
  where d.nrc is null or d.training_date is null;
alter table public.deposits enable trigger guard_deposit;
alter table public.deposits alter column nrc set not null;
alter table public.deposits alter column training_date set not null;
alter table public.deposits alter column agent_code drop not null;
alter table public.deposits drop constraint if exists deposits_agent_code_check;
alter table public.deposits drop constraint if exists deposits_nrc_check;
alter table public.deposits add constraint deposits_nrc_check check (length(trim(nrc)) > 0);
alter table public.deposits drop constraint if exists deposits_trainee_type_check;
alter table public.deposits add constraint deposits_trainee_type_check check (trainee_type in ('Internal', 'External'));
alter table public.deposits drop constraint if exists deposits_documents_check;
alter table public.deposits add constraint deposits_documents_check check (jsonb_typeof(documents) = 'array');

-- Same canonical form as the app: no spaces, Myanmar digits as 0-9, upper case.
create or replace function public.normalize_nrc(n text) returns text
language sql immutable as $$
  select upper(translate(regexp_replace(n, '\s+', '', 'g'), '၀၁၂၃၄၅၆၇၈၉', '0123456789'))
$$;

drop index if exists public.deposits_one_open_per_agent;
drop index if exists public.deposits_agent_idx;
create index if not exists deposits_agent_idx on public.deposits (lower(agent_code));
create index if not exists deposits_nrc_idx on public.deposits (public.normalize_nrc(nrc));
-- One open deposit per NRC ("System Auto Check" on registration).
create unique index if not exists deposits_one_open_per_nrc on public.deposits (public.normalize_nrc(nrc))
  where status not in ('Refunded', 'Forfeited');

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
  if (new.ref, new.batch_id, new.created_by, new.created_at)
     is distinct from (old.ref, old.batch_id, old.created_by, old.created_at) then
    raise exception 'Deposit ID and batch cannot be changed';
  end if;
  -- Trainee details and money fields can be corrected only while Held, and only by staff / HOD / admin.
  if (new.trainee_name, new.nrc, new.agent_code, new.trainee_type, new.training_date, new.amount, new.payment_date, new.voucher_ref)
     is distinct from (old.trainee_name, old.nrc, old.agent_code, old.trainee_type, old.training_date, old.amount, old.payment_date, old.voucher_ref) then
    if not (old.status = 'Held' and new.status = 'Held' and r in ('staff', 'hod', 'admin')) then
      raise exception 'Deposit details can only be corrected while Held';
    end if;
  end if;

  -- Supporting documents: append-only, and only while the deposit is open.
  if new.documents is distinct from old.documents then
    if r not in ('staff', 'hod', 'admin') then raise exception 'Not allowed to change documents'; end if;
    if old.status in ('Refunded', 'Forfeited', 'Reversal Request') then raise exception 'Documents cannot change on a closed deposit'; end if;
    if not (new.documents @> old.documents) then raise exception 'Documents can be added but not removed'; end if;
  end if;

  if new.documents is distinct from old.documents and (to_jsonb(new) - 'documents') = (to_jsonb(old) - 'documents') then
    null; -- only documents were added (checked above); nothing else on the row changed
  elsif old.status = 'Held' and new.status = 'Held' then
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
     (new.forfeit_reason, new.attachment, new.documents, new.hod_approved_by, new.finance_approved_by, new.finance_voucher_ref, new.closed_at)
     is distinct from (old.forfeit_reason, old.attachment, old.documents, old.hod_approved_by, old.finance_approved_by, old.finance_voucher_ref, old.closed_at) then
    raise exception 'Approved deposit records are immutable';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ expenses & budgets by category
alter table public.expenses add column if not exists budget_category text not null default 'General';
alter table public.expenses drop constraint if exists expenses_budget_category_check;
alter table public.expenses add constraint expenses_budget_category_check check (budget_category in
  ('YCP', 'License - YGN', 'License - MDY', 'License - TGI', 'Product & Soft Skills', 'Corporate', 'Agency', 'General'));

alter table public.budgets add column if not exists category text not null default 'Overall';
alter table public.budgets drop constraint if exists budgets_fiscal_year_key;
alter table public.budgets drop constraint if exists budgets_year_category_key;
alter table public.budgets add constraint budgets_year_category_key unique (fiscal_year, category);
alter table public.budgets drop constraint if exists budgets_category_check;
alter table public.budgets add constraint budgets_category_check check (category in
  ('Overall', 'YCP', 'License - YGN', 'License - MDY', 'License - TGI', 'Product & Soft Skills', 'Corporate', 'Agency', 'General'));
