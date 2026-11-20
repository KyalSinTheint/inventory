-- A training named exactly after a standard program (e.g. "YCP") was saved with the default program
-- "Product & Soft Skills". Give it the program it is named after. (License is left alone: it needs a branch.)
update public.batches b
   set program = p.name
  from (values ('YCP'), ('Product & Soft Skills'), ('Corporate'), ('Agency')) as p(name)
 where lower(trim(b.name)) = lower(p.name) and b.program <> p.name;
