-- L&D staff may add a new training by name while making a request or expense (no budget).
-- Editing a training and setting its budget stay with HOD / Admin.
drop policy if exists "hod admin write batches" on public.batches;
drop policy if exists "write batches" on public.batches;
create policy "write batches" on public.batches for insert to authenticated
  with check (public.has_role('hod', 'admin') or (public.has_role('staff') and budget = 0));
