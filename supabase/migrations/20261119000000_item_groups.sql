-- v5: "main item" group for each inventory item (Coffee, Tea, Badges …), shown as icon cards.
-- Null means the app works the group out from the item name. Safe to run more than once.
alter table public.items add column if not exists item_group text;
