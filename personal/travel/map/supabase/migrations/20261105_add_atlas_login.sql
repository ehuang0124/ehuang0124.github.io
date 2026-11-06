-- Additive repair for projects deployed before atlas_login existed.
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

notify pgrst, 'reload schema';
