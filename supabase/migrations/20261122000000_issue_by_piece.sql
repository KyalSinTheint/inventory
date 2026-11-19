-- Issue single pieces out of a pack (e.g. 5 sachets out of a 20-sachet pack).
-- Balances and movements are kept in units with 6 decimals: 5 sachets of a 20-pack = 0.25 Pack.
-- piece_qty records the number of pieces when a movement was entered that way.

alter table public.items alter column qty_on_hand type numeric(14, 6);
alter table public.stock_txns alter column qty type numeric(14, 6);
alter table public.stock_txns add column if not exists piece_qty integer;
alter table public.stock_txns drop constraint if exists stock_txns_piece_qty_check;
alter table public.stock_txns add constraint stock_txns_piece_qty_check check (piece_qty is null or piece_qty > 0);

drop function if exists public.stock_delta(public.stock_txns);
create function public.stock_delta(t public.stock_txns) returns numeric
language sql immutable as $$
  select case t.type when 'IN' then t.qty when 'OUT' then -t.qty when 'ADJUST' then t.qty
    when 'RETURN' then case when t.condition = 'Good' then t.qty else 0 end end
$$;

create or replace function public.apply_stock_txn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'Pending' then raise exception 'Only pending transactions can be decided'; end if;
    if (new.type, new.item_id, new.qty, new.piece_qty, new.unit_cost, new.batch_id, new.condition, new.created_by)
       is distinct from (old.type, old.item_id, old.qty, old.piece_qty, old.unit_cost, old.batch_id, old.condition, old.created_by) then
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
