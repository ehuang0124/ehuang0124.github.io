-- Stamp Atlas · Supabase setup (personal accounts, invite-only registration)
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run again: every statement is idempotent.
--
-- Model
--   profiles              one row per traveller, created only by a correct code
--   stamps                one row per traveller / place / month
--                         (owner fixed by trigger, month never in the future,
--                          companions limited to approved discoverable profiles)
--   custom_cities         traveller-added cities (same ids the page already uses)
--   atlas_access          the shared registration invite (bcrypt hash, never plain)
--   atlas_logins          who signed in, when, from which browser/address
--   atlas_login_attempts  failed guesses, used to slow brute force down
--
-- Accounts
--   1. Supabase Auth verifies each traveller's personal email and password;
--      new accounts must confirm ownership of the email address first.
--   2. On creation, atlas_prepare_signup checks the invite's bcrypt hash before
--      the confirmation mail is sent and remembers the address (no invite, no
--      password). When the link comes back confirmed, atlas_complete_signup
--      creates the profile required by RLS. atlas_redeem_code remains for
--      accounts that confirmed their address before that step existed.
--   3. Returning users call atlas_login, which requires a confirmed address and
--      an existing profile, and never checks an invite or creates a profile.
--   Rotate registration invites with atlas_rotate_code('your new code').
--   Password length is enforced by Supabase Auth settings (minimum 7).
--
-- Security
--   Anyone (including signed-out visitors) may read stamps, so the public map
--   shows the collection. Only a code-approved traveller may insert, change, or
--   delete their own row; `auth.uid() = user_id` is enforced by Postgres.
--   The code, the login log, and the attempt log are not readable through the
--   public API at all — only the dashboard (and these SECURITY DEFINER
--   functions) can see them.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables -----
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '旅人',
  avatar_url   text not null default '',
  discoverable boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table if not exists public.stamps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  place_key    text not null check (char_length(place_key) between 1 and 120),
  visit_month  date not null check (extract(day from visit_month) = 1),
  companions   uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, place_key, visit_month)
);

create table if not exists public.custom_cities (
  id         text primary key check (id ~ '^custom-[A-Za-z0-9-]{1,90}$'),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  iso        text not null check (iso ~ '^[A-Z]{2}$'),
  lat        double precision check (lat between -90 and 90),
  lon        double precision check (lon between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row holds the current sign-in code.
create table if not exists public.atlas_access (
  id         smallint primary key default 1 check (id = 1),
  code_hash  text not null,
  label      text,
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Who signed in. Readable only in the dashboard (Table Editor → atlas_logins).
create table if not exists public.atlas_logins (
  id           bigserial primary key,
  user_id      uuid not null,
  display_name text not null,
  user_agent   text not null default '',
  ip           text,
  created_at   timestamptz not null default now()
);

create table if not exists public.atlas_login_attempts (
  id         bigserial primary key,
  ip         text not null default '',
  ok         boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists stamps_place_idx on public.stamps (place_key, visit_month);
create index if not exists stamps_user_idx on public.stamps (user_id);
create index if not exists custom_cities_user_idx on public.custom_cities (user_id);
create index if not exists atlas_logins_user_idx on public.atlas_logins (user_id, created_at desc);
create index if not exists atlas_attempts_ip_idx on public.atlas_login_attempts (ip, created_at desc);
-- Companion lookups ("where was I tagged?") read the array itself.
create index if not exists stamps_companions_idx on public.stamps using gin (companions);

-- ------------------------------------------------------------- record guards -
-- Row Level Security decides who may write a row; these rules decide what a row
-- may say. They are enforced in Postgres, never only in the page.
--   * a record never changes owner, so nobody can take over somebody's visit,
--   * a month can never be in the future,
--   * every companion is an approved traveller who allows being tagged.
create or replace function public.atlas_guard_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_companion uuid;
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'a stamp cannot change owner' using errcode = '42501';
  end if;

  if new.visit_month > date_trunc('month', now())::date then
    raise exception 'a stamp cannot be in the future' using errcode = '22007';
  end if;

  for v_companion in select unnest(coalesce(new.companions, '{}'::uuid[])) loop
    if v_companion = new.user_id then
      raise exception 'a traveller cannot be their own companion' using errcode = '23514';
    end if;
    -- Only companions being added now are checked; an existing tag is untouched.
    if tg_op = 'UPDATE' and v_companion = any(coalesce(old.companions, '{}'::uuid[])) then
      continue;
    end if;
    if not exists (select 1 from public.profiles where id = v_companion) then
      raise exception 'companions must be approved travellers' using errcode = '23514';
    end if;
    if exists (select 1 from public.profiles where id = v_companion and discoverable = false) then
      raise exception 'this traveller does not allow being tagged' using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.atlas_guard_stamp() from public, anon, authenticated;

drop trigger if exists atlas_guard_stamp on public.stamps;
create trigger atlas_guard_stamp
  before insert or update on public.stamps
  for each row execute function public.atlas_guard_stamp();

-- A tagged traveller may take their own tag off somebody else's record. The
-- function only ever removes auth.uid(); it cannot edit the visit itself.
create or replace function public.atlas_leave_stamp(p_stamp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.stamps;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;
  -- This SECURITY DEFINER function writes outside ordinary RLS, so it must
  -- independently enforce the same confirmed, approved traveller gate.
  if not public.atlas_is_traveller() then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;
  select * into v_row from public.stamps where id = p_stamp_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_row.user_id = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'owner');
  end if;
  if not (v_uid = any(v_row.companions)) then
    return jsonb_build_object('ok', false, 'reason', 'not_tagged');
  end if;
  update public.stamps
     set companions = array_remove(companions, v_uid),
         updated_at = now()
   where id = p_stamp_id;
  return jsonb_build_object('ok', true, 'stamp_id', p_stamp_id);
end;
$$;

revoke all on function public.atlas_leave_stamp(uuid) from public, anon;
grant execute on function public.atlas_leave_stamp(uuid) to authenticated;

-- ------------------------------------------------------- access code plumbing -
-- A traveller is somebody whose profile row exists, and a profile row only
-- exists after `atlas_redeem_code` accepted the shared code.
create or replace function public.atlas_is_traveller()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from public.profiles as p
      join auth.users as u on u.id = p.id
     where p.id = auth.uid()
       and u.email_confirmed_at is not null
  );
$$;

grant execute on function public.atlas_is_traveller() to anon, authenticated;

-- Rotate the shared code. Call it from the SQL Editor (postgres only):
--   select public.atlas_rotate_code('a new code');
create or replace function public.atlas_rotate_code(p_code text, p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code text := btrim(coalesce(p_code, ''));
begin
  if char_length(v_code) < 6 then
    raise exception '通行碼至少要 6 個字元。';
  end if;
  insert into public.atlas_access (id, code_hash, label, rotated_at)
  values (1, crypt(v_code, gen_salt('bf', 11)), nullif(btrim(coalesce(p_label, '')), ''), now())
  on conflict (id) do update
    set code_hash  = excluded.code_hash,
        label      = coalesce(excluded.label, public.atlas_access.label),
        rotated_at = now();
  return jsonb_build_object('ok', true, 'rotated_at', now());
end;
$$;

revoke all on function public.atlas_rotate_code(text, text) from public, anon, authenticated;

-- Whether a code exists, without exposing the hash. Safe to call from the page
-- and from scripts/connect-supabase.cjs --check.
create or replace function public.atlas_access_status()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
              'configured', code_hash is not null and code_hash <> '',
              'rotated_at', rotated_at,
              'label', label)
       from public.atlas_access where id = 1),
    jsonb_build_object('configured', false, 'rotated_at', null, 'label', null));
$$;

grant execute on function public.atlas_access_status() to anon, authenticated;

-- Trade the shared code for a traveller identity.
-- Never raises: a wrong guess must still be recorded, so the caller gets
-- { "ok": false, "reason": … } instead of a rolled-back exception.
create or replace function public.atlas_redeem_code(
  p_code text,
  p_name text default '',
  p_user_agent text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_code       text := btrim(coalesce(p_code, ''));
  v_hash       text;
  v_name       text;
  v_headers    jsonb := '{}'::jsonb;
  v_ip         text;
  v_failures   integer;
  v_profile    public.profiles;
  v_max_fails  constant integer := 8;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;
  if not exists (
    select 1 from auth.users
     where id = v_uid and email_confirmed_at is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'email_unverified');
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));
  v_ip := left(coalesce(v_ip, ''), 45);

  -- Failed guesses per address, last 15 minutes.
  delete from public.atlas_login_attempts where created_at < now() - interval '7 days';
  select count(*) into v_failures
    from public.atlas_login_attempts
   where ip = v_ip and ok = false and created_at > now() - interval '15 minutes';
  if v_failures >= v_max_fails then
    return jsonb_build_object('ok', false, 'reason', 'throttled');
  end if;

  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_code');
  end if;

  select code_hash into v_hash from public.atlas_access where id = 1;
  if v_hash is null or v_hash = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_code_set');
  end if;

  if crypt(v_code, v_hash) <> v_hash then
    insert into public.atlas_login_attempts (ip, ok) values (v_ip, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  v_name := nullif(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), '');
  if v_name is null then v_name := '旅人'; end if;
  v_name := left(v_name, 40);

  insert into public.profiles (id, display_name, avatar_url, discoverable)
  values (v_uid, v_name, '', true)
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at   = now()
  returning * into v_profile;

  insert into public.atlas_logins (user_id, display_name, user_agent, ip)
  values (v_uid, v_profile.display_name, left(coalesce(p_user_agent, ''), 300), nullif(v_ip, ''));

  insert into public.atlas_login_attempts (ip, ok) values (v_ip, true);

  return jsonb_build_object(
    'ok', true,
    'user_id', v_profile.id,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'discoverable', v_profile.discoverable);
end;
$$;

grant execute on function public.atlas_redeem_code(text, text, text) to anon, authenticated;

-- Returning-user login: no invite needed and no way to create a profile here.
create or replace function public.atlas_login(p_user_agent text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_headers jsonb := '{}'::jsonb;
  v_ip text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;
  if not exists (
    select 1 from auth.users
     where id = v_uid and email_confirmed_at is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'email_unverified');
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := left(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), 45);
  insert into public.atlas_logins (user_id, display_name, user_agent, ip)
  values (v_uid, v_profile.display_name, left(coalesce(p_user_agent, ''), 300), nullif(v_ip, ''));
  return jsonb_build_object(
    'ok', true, 'user_id', v_profile.id, 'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url, 'discoverable', v_profile.discoverable);
end;
$$;

revoke all on function public.atlas_login(text) from public, anon;
grant execute on function public.atlas_login(text) to authenticated;

-- ---------------------------------------------------------------- profiles ---
alter table public.profiles enable row level security;

drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- No insert or delete policy on purpose: a profile row is created only by
-- atlas_redeem_code(), i.e. only by somebody who knew the shared code.
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile delete" on public.profiles;

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id and public.atlas_is_traveller())
  with check (auth.uid() = id and public.atlas_is_traveller());

-- ---------------------------------------------------------------- stamps -----
alter table public.stamps enable row level security;

-- The public atlas: signed-out visitors read everything but write nothing.
drop policy if exists "stamps are public to read" on public.stamps;
create policy "stamps are public to read"
  on public.stamps for select
  to anon, authenticated
  using (true);

drop policy if exists "own stamps insert" on public.stamps;
create policy "own stamps insert"
  on public.stamps for insert
  to authenticated
  with check (auth.uid() = user_id and public.atlas_is_traveller());

drop policy if exists "own stamps update" on public.stamps;
create policy "own stamps update"
  on public.stamps for update
  to authenticated
  using (auth.uid() = user_id and public.atlas_is_traveller())
  with check (auth.uid() = user_id and public.atlas_is_traveller());

drop policy if exists "own stamps delete" on public.stamps;
create policy "own stamps delete"
  on public.stamps for delete
  to authenticated
  using (auth.uid() = user_id and public.atlas_is_traveller());

-- ---------------------------------------------------------------- cities -----
alter table public.custom_cities enable row level security;

drop policy if exists "custom cities are readable" on public.custom_cities;
create policy "custom cities are readable"
  on public.custom_cities for select
  to anon, authenticated
  using (true);

drop policy if exists "own cities insert" on public.custom_cities;
create policy "own cities insert"
  on public.custom_cities for insert
  to authenticated
  with check (auth.uid() = user_id and public.atlas_is_traveller());

drop policy if exists "own cities update" on public.custom_cities;
create policy "own cities update"
  on public.custom_cities for update
  to authenticated
  using (auth.uid() = user_id and public.atlas_is_traveller())
  with check (auth.uid() = user_id and public.atlas_is_traveller());

drop policy if exists "own cities delete" on public.custom_cities;
create policy "own cities delete"
  on public.custom_cities for delete
  to authenticated
  using (auth.uid() = user_id and public.atlas_is_traveller());

-- ------------------------------------------------- access code + login log --
-- Row Level Security on, no policies: the public API cannot read or write these
-- tables at all. The dashboard (Table Editor) still can, and so can the
-- SECURITY DEFINER functions above.
alter table public.atlas_access enable row level security;
alter table public.atlas_logins enable row level security;
alter table public.atlas_login_attempts enable row level security;

revoke all on table public.atlas_access from anon, authenticated;
revoke all on table public.atlas_logins from anon, authenticated;
revoke all on table public.atlas_login_attempts from anon, authenticated;

-- ---------------------------------------------------------------- realtime ----
-- ------------------------------------------------- signup on confirmation ---
-- See migrations/20261109_complete_signup_on_verify.sql: the invite is checked
-- before the mail is sent and the link alone finishes the account.
create table if not exists public.atlas_signup_approvals (
  email        text primary key
               check (email = lower(email) and char_length(email) between 3 and 320),
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);

-- Readable only through the functions below (and the dashboard).
alter table public.atlas_signup_approvals enable row level security;
revoke all on table public.atlas_signup_approvals from public, anon, authenticated;

-- Step 1, before signUp: trade the invite for a pending approval of one address.
-- Never raises, so a wrong guess is still recorded in atlas_login_attempts.
create or replace function public.atlas_prepare_signup(
  p_email text,
  p_code  text,
  p_name  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_email     text := lower(btrim(coalesce(p_email, '')));
  v_code      text := btrim(coalesce(p_code, ''));
  v_name      text;
  v_hash      text;
  v_headers   jsonb := '{}'::jsonb;
  v_ip        text;
  v_failures  integer;
  v_max_fails constant integer := 8;
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(v_email) > 320 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := left(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), 45);

  delete from public.atlas_login_attempts where created_at < now() - interval '7 days';
  select count(*) into v_failures
    from public.atlas_login_attempts
   where ip = coalesce(v_ip, '') and ok = false and created_at > now() - interval '15 minutes';
  if v_failures >= v_max_fails then
    return jsonb_build_object('ok', false, 'reason', 'throttled');
  end if;

  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_code');
  end if;

  select code_hash into v_hash from public.atlas_access where id = 1;
  if v_hash is null or v_hash = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_code_set');
  end if;

  if crypt(v_code, v_hash) <> v_hash then
    insert into public.atlas_login_attempts (ip, ok) values (coalesce(v_ip, ''), false);
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  v_name := nullif(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), '');
  v_name := left(coalesce(v_name, '旅人'), 40);

  delete from public.atlas_signup_approvals where created_at < now() - interval '7 days';
  insert into public.atlas_signup_approvals (email, display_name, created_at)
  values (v_email, v_name, now())
  on conflict (email) do update
    set display_name = excluded.display_name,
        created_at   = now();

  insert into public.atlas_login_attempts (ip, ok) values (coalesce(v_ip, ''), true);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.atlas_prepare_signup(text, text, text) from public;
grant execute on function public.atlas_prepare_signup(text, text, text) to anon, authenticated;

-- Step 2, after the link: a confirmed session with a waiting approval becomes
-- a traveller. Safe to call repeatedly; an existing profile is returned as is.
create or replace function public.atlas_complete_signup(p_user_agent text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_rotated  timestamptz;
  v_approval public.atlas_signup_approvals;
  v_profile  public.profiles;
  v_headers  jsonb := '{}'::jsonb;
  v_ip       text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;
  select lower(u.email) into v_email
    from auth.users as u
   where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'email_unverified');
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    select rotated_at into v_rotated from public.atlas_access where id = 1;
    select * into v_approval
      from public.atlas_signup_approvals
     where email = v_email
       and created_at > now() - interval '7 days'
       and (v_rotated is null or created_at >= v_rotated);
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'not_approved');
    end if;
    insert into public.profiles (id, display_name, avatar_url, discoverable)
    values (v_uid, v_approval.display_name, '', true)
    on conflict (id) do nothing;
    select * into v_profile from public.profiles where id = v_uid;
  end if;
  delete from public.atlas_signup_approvals where email = v_email;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := left(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), 45);
  insert into public.atlas_logins (user_id, display_name, user_agent, ip)
  values (v_uid, v_profile.display_name, left(coalesce(p_user_agent, ''), 300), nullif(v_ip, ''));

  return jsonb_build_object(
    'ok', true, 'user_id', v_profile.id, 'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url, 'discoverable', v_profile.discoverable);
end;
$$;

revoke all on function public.atlas_complete_signup(text) from public, anon;
grant execute on function public.atlas_complete_signup(text) to authenticated;

-- Live updates for every open tab and device.
alter table public.stamps replica identity full;
alter table public.custom_cities replica identity full;
alter table public.profiles replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.stamps; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.custom_cities; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
  end if;
end $$;

notify pgrst, 'reload schema';
