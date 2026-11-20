-- A training can be deleted (e.g. test entries): it is archived, so it leaves every list and picker,
-- while older requests, stock movements and deposits still show its name.
alter table public.batches add column if not exists archived boolean not null default false;
