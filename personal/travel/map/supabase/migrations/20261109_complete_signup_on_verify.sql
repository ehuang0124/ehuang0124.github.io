-- Finish account creation the moment the confirmation link is opened.
--
-- Before: sign up → open the link → come back and type password, name and
-- invite again → profile created.
-- After:  the invite is checked once, before the mail is sent
--         (atlas_prepare_signup), and the page calls atlas_complete_signup as
--         soon as the link brings back a confirmed session. The traveller is
--         signed in with no second form.
--
-- What is stored while the mail is on its way: the lower-cased address, the
-- chosen display name and a timestamp. Never the invite, never a password.
-- An approval only counts if
--   * the address on the confirmed Auth user matches it exactly,
--   * it is younger than 7 days, and
--   * it was made after the last atlas_rotate_code(), so rotating the invite
--     also voids approvals that were waiting for a link.
-- Email ownership is still proven by Supabase Auth; profiles are still only
-- created by SECURITY DEFINER functions. atlas_redeem_code stays for accounts
-- that were created before this migration.
--
-- Idempotent; does not alter any existing profile or stamp.

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
