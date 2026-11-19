-- v6: main items (icon cards) that HOD / Admin can create, rename or give another icon.
-- A row whose id is a built-in id ('coffee', 'tea' …) overrides that built-in's name / icon;
-- any other id is a new main item. Run after the earlier migrations. Safe to run more than once.
create table if not exists public.item_groups (
  id text primary key,
  label text not null check (length(trim(label)) > 0),
  category text not null check (category in ('Refreshments', 'Training Materials', 'YCP Program', 'Office Supplies')),
  icon text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists item_groups_label_per_category on public.item_groups (category, lower(label));

alter table public.item_groups enable row level security;
drop policy if exists "active users read" on public.item_groups;
create policy "active users read" on public.item_groups for select to authenticated using (public.app_role() is not null);
drop policy if exists "hod admin write main items" on public.item_groups;
create policy "hod admin write main items" on public.item_groups for insert to authenticated with check (public.has_role('hod', 'admin'));
drop policy if exists "hod admin update main items" on public.item_groups;
create policy "hod admin update main items" on public.item_groups for update to authenticated using (public.has_role('hod', 'admin'));
drop policy if exists "hod admin delete main items" on public.item_groups;
create policy "hod admin delete main items" on public.item_groups for delete to authenticated
  using (public.has_role('hod', 'admin') and not exists (select 1 from public.items i where i.item_group = item_groups.id));
