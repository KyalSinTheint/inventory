-- A material request keeps its own training name and (optional) date instead of pointing at a saved
-- training: the same training can run again on other dates. Older requests keep their batch_id.
alter table public.material_requests alter column batch_id drop not null;
alter table public.material_requests add column if not exists training_name text;
alter table public.material_requests add column if not exists training_date date;
alter table public.material_requests drop constraint if exists material_requests_training_check;
alter table public.material_requests add constraint material_requests_training_check
  check (batch_id is not null or length(trim(coalesce(training_name, ''))) > 0);
