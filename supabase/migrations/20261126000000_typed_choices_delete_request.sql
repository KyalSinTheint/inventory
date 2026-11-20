-- People may type their own inventory categories and training programs (the standard ones are still offered).
alter table public.items drop constraint if exists items_category_check;
alter table public.item_groups drop constraint if exists item_groups_category_check;
alter table public.assets drop constraint if exists assets_category_check;
alter table public.batches drop constraint if exists batches_program_check;
alter table public.items add constraint items_category_check check (length(trim(category)) > 0);
alter table public.item_groups add constraint item_groups_category_check check (length(trim(category)) > 0);
alter table public.batches add constraint batches_program_check check (length(trim(program)) > 0);

-- The requester may delete their own request while it is waiting or rejected (an approved one has issued stock).
-- The portal writes what the request held to the audit log first.
drop policy if exists "delete own open requests" on public.material_requests;
create policy "delete own open requests" on public.material_requests for delete to authenticated
  using (created_by = auth.uid() and status in ('Pending', 'Rejected') and public.app_role() is not null);
