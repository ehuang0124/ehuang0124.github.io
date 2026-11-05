-- Stamp Atlas · Supabase setup
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run again: every statement is idempotent.
--
-- Model
--   profiles       one row per traveller (name + avatar from Google)
--   stamps         one row per traveller / place / month
--   custom_cities  traveller-added cities (same ids the page already uses)
--
-- Security
--   Anyone (including signed-out visitors) may read stamps, so the public map
--   shows the collection. Only the owner may insert, change, or delete a row:
--   `auth.uid() = user_id` is enforced by Postgres, not by the page.

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

create index if not exists stamps_place_idx on public.stamps (place_key, visit_month);
create index if not exists stamps_user_idx on public.stamps (user_id);
create index if not exists custom_cities_user_idx on public.custom_cities (user_id);

-- ---------------------------------------------------------------- profiles ---
alter table public.profiles enable row level security;

drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

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
  with check (auth.uid() = user_id);

drop policy if exists "own stamps update" on public.stamps;
create policy "own stamps update"
  on public.stamps for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own stamps delete" on public.stamps;
create policy "own stamps delete"
  on public.stamps for delete
  to authenticated
  using (auth.uid() = user_id);

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
  with check (auth.uid() = user_id);

drop policy if exists "own cities update" on public.custom_cities;
create policy "own cities update"
  on public.custom_cities for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own cities delete" on public.custom_cities;
create policy "own cities delete"
  on public.custom_cities for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------- realtime ----
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
