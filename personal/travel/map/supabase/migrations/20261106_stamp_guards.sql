-- Stamp Atlas · additive repair for projects deployed before the record guards.
--
-- Run this file (or the whole ../setup.sql, which is idempotent) in
-- Supabase → SQL Editor → New query → Run.
--
-- What it adds:
--   * stamps the page cannot misuse:
--       - a record never changes owner,
--       - a visit month is never in the future,
--       - companions are approved travellers who allow being tagged,
--   * atlas_leave_stamp(), so a tagged traveller can remove their own tag from
--     somebody else's record without being able to edit that record,
--   * an index for "where was I tagged?" lookups.

create index if not exists stamps_companions_idx on public.stamps using gin (companions);

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

notify pgrst, 'reload schema';
