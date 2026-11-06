-- Require email ownership before approving or using a traveller account.
-- Existing approved users with confirmed addresses are unaffected.
-- Safe to rerun; this replaces functions only and does not alter travel data.

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
