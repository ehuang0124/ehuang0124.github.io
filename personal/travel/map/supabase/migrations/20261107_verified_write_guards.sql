-- Follow-up for existing installations: the email gate must also cover
-- updates to an approved profile and the SECURITY DEFINER companion RPC.
-- Apply after 20261106_stamp_guards.sql and 20261106_require_verified_email.sql.
-- Idempotent; does not delete or rewrite any user data.

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id and public.atlas_is_traveller())
  with check (auth.uid() = id and public.atlas_is_traveller());

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

notify pgrst, 'reload schema';
