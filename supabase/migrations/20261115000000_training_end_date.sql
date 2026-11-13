-- v4: license deposits record a training start date (training_date) and a training end date.
-- Run after the earlier migrations. Safe to run more than once.

alter table public.deposits add column if not exists training_end_date date;

-- Existing deposits take the batch end date (or their start date when the batch has none).
alter table public.deposits disable trigger guard_deposit;
update public.deposits d
   set training_end_date = greatest(d.training_date,
         coalesce((select b.end_date from public.batches b where b.id = d.batch_id), d.training_date))
 where d.training_end_date is null;
alter table public.deposits enable trigger guard_deposit;

alter table public.deposits alter column training_end_date set not null;
alter table public.deposits drop constraint if exists deposits_training_dates_check;
alter table public.deposits add constraint deposits_training_dates_check check (training_end_date >= training_date);

-- Same rules as before; the training end date joins the details that can be corrected only while Held.
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
  if (new.trainee_name, new.nrc, new.agent_code, new.trainee_type, new.training_date, new.training_end_date, new.amount, new.payment_date, new.voucher_ref)
     is distinct from (old.trainee_name, old.nrc, old.agent_code, old.trainee_type, old.training_date, old.training_end_date, old.amount, old.payment_date, old.voucher_ref) then
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

