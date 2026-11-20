-- Accounts are made inside the portal:
--   * the very first person sets up the System Administrator account (only while no active admin exists);
--   * after that only an administrator creates accounts (name, email, role, password) and can reset passwords.
-- Accounts are written to Supabase Authentication (auth.users) with the email already confirmed,
-- so they appear under Authentication → Users and can sign in at once. No confirmation emails are sent.

create extension if not exists pgcrypto;

-- Shared worker: makes a confirmed email + password login and its profile.
create or replace function public._portal_make_login(p_email text, p_password text, p_name text, p_role text)
returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'The password must be at least 8 characters.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter the person''s name.'; end if;
  if p_role not in ('staff', 'hod', 'finance', 'admin') then raise exception 'Unknown role.'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'An account with this email already exists.'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', trim(p_name)), now(), now(),
          '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());

  -- handle_new_user() has made the profile; set the name, role and switch it on.
  perform set_config('app.portal_account', 'on', true);
  update public.profiles set name = trim(p_name), role = p_role, active = true where id = v_id;
  perform set_config('app.portal_account', 'off', true);
  return v_id;
end $$;
revoke all on function public._portal_make_login(text, text, text, text) from public, anon, authenticated;

-- True until the first System Administrator exists (the sign-in page then offers first-time setup).
create or replace function public.portal_needs_setup() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where role = 'admin' and active)
$$;
grant execute on function public.portal_needs_setup() to anon, authenticated;

create or replace function public.setup_first_admin(p_email text, p_password text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('portal_first_admin'));
  if not public.portal_needs_setup() then raise exception 'The portal is already set up. Ask your System Administrator for an account.'; end if;
  return public._portal_make_login(p_email, p_password, p_name, 'admin');
end $$;
grant execute on function public.setup_first_admin(text, text, text) to anon, authenticated;

create or replace function public.admin_create_user(p_email text, p_password text, p_name text, p_role text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_role('admin') then raise exception 'Only the System Administrator can create accounts.'; end if;
  v_id := public._portal_make_login(p_email, p_password, p_name, p_role);
  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, details)
  select auth.uid(), (select name from public.profiles where id = auth.uid()), 'Create user', 'profile', v_id::text,
         lower(trim(p_email)) || ' as ' || p_role;
  return v_id;
end $$;
revoke all on function public.admin_create_user(text, text, text, text) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text) to authenticated;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.has_role('admin') then raise exception 'Only the System Administrator can reset passwords.'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'The password must be at least 8 characters.'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  if not found then raise exception 'Account not found.'; end if;
  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, details)
  select auth.uid(), (select name from public.profiles where id = auth.uid()), 'Reset password', 'profile', p_user::text,
         (select email from public.profiles where id = p_user);
end $$;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;

-- The account functions may switch on a brand-new profile (even the first admin's, who is "self").
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('app.portal_account', true), 'off') = 'on' then return new; end if;
  if new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'You cannot change your own role or status';
  end if;
  if new.email is distinct from old.email then raise exception 'Email is managed by authentication'; end if;
  return new;
end $$;
