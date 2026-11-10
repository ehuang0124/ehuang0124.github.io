-- Stamps and custom cities are private to signed-in travellers.
-- Before this, "stamps are public to read" let any anonymous visitor read
-- every traveller's records. Now only a confirmed, approved traveller
-- (public.atlas_is_traveller()) can read them; anonymous reads return no rows
-- and realtime stops delivering them to signed-out browsers.
-- Writes are unchanged. Idempotent; does not delete or rewrite any user data.
-- Requires public.atlas_is_traveller() from setup.sql /
-- 20261106_require_verified_email.sql.

drop policy if exists "stamps are public to read" on public.stamps;
drop policy if exists "travellers read stamps" on public.stamps;
create policy "travellers read stamps"
  on public.stamps for select
  to authenticated
  using (public.atlas_is_traveller());

drop policy if exists "custom cities are readable" on public.custom_cities;
drop policy if exists "travellers read custom cities" on public.custom_cities;
create policy "travellers read custom cities"
  on public.custom_cities for select
  to authenticated
  using (public.atlas_is_traveller());
