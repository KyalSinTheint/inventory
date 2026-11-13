-- v3: deposits no longer collect a voucher reference; stock in no longer collects supplier / invoice number
-- (the invoice file attachment stays). Run after the earlier migrations. Safe to run more than once.

alter table public.deposits alter column voucher_ref drop not null;

-- Drop the unnamed CHECK that required supplier and invoice_no on stock in.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.stock_txns'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%supplier%' and pg_get_constraintdef(oid) ilike '%invoice_no%'
  loop
    execute format('alter table public.stock_txns drop constraint %I', c.conname);
  end loop;
end $$;
