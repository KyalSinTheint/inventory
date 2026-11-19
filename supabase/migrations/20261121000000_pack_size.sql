-- v7: pieces in one unit (1 Pack = 20 sachets) so the price per piece can be shown.
-- Safe to run more than once.
alter table public.items add column if not exists pack_qty integer;
alter table public.items add column if not exists piece_unit text;
alter table public.items drop constraint if exists items_pack_qty_check;
alter table public.items add constraint items_pack_qty_check check (pack_qty is null or pack_qty >= 2);
