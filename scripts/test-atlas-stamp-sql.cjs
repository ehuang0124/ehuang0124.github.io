// Exercise the record guards and the companion "leave" function with embedded
// Postgres. The SQL is read verbatim from the deployable migration, so this test
// fails when the shipped rules drift from what the page expects.
//
// Install outside the checkout: npm install --prefix /tmp/atlas-test-deps @electric-sql/pglite
// Run: NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-stamp-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  try {
    // Fixtures mirror the deployed column names; the rules themselves are not
    // re-implemented here but read from the migration file.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create table public.profiles (
        id uuid primary key,
        display_name text not null default '旅人',
        avatar_url text default '',
        discoverable boolean not null default true
      );
      create function public.atlas_is_traveller() returns boolean language sql stable security definer as $$
        select exists (select 1 from public.profiles where id = auth.uid());
      $$;
      create table public.stamps (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null,
        place_key text not null,
        visit_month date not null check (extract(day from visit_month) = 1),
        companions uuid[] not null default '{}',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (user_id, place_key, visit_month)
      );
      alter table public.stamps enable row level security;
      create table public.custom_cities (
        id text primary key,
        user_id uuid not null,
        name text not null,
        iso text not null,
        lat double precision,
        lon double precision
      );
      alter table public.custom_cities enable row level security;
      -- The old public read policies, which the private-stamps migration replaces.
      create policy "stamps are public to read" on public.stamps for select to anon, authenticated using (true);
      create policy "custom cities are readable" on public.custom_cities for select to anon, authenticated using (true);
      grant select on public.profiles, public.stamps, public.custom_cities to anon, authenticated;
    `);
    const migrationPath = path.join(__dirname, '../personal/travel/map/supabase/migrations/20261106_stamp_guards.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8').replace(/^notify pgrst.*$/m, '');
    await db.exec(migration);
    await db.exec(migration); // Safe to rerun on an existing project.
    const followUp = fs.readFileSync(path.join(__dirname, '../personal/travel/map/supabase/migrations/20261107_verified_write_guards.sql'), 'utf8').replace(/^notify pgrst.*$/m, '');
    await db.exec(followUp);
    await db.exec(followUp);

    const alice = '00000000-0000-4000-8000-00000000000a';
    const bob = '00000000-0000-4000-8000-00000000000b';
    const carol = '00000000-0000-4000-8000-00000000000c';
    await db.exec(`
      insert into public.profiles (id, display_name, discoverable) values
        ('${alice}', 'Alice', true),
        ('${bob}', 'Bob', true),
        ('${carol}', 'Carol', false);
    `);
    const asUser = async (id, sql) => {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      await db.exec('set role authenticated');
      try { return await db.query(sql); }
      finally { await db.exec('reset role'); }
    };

    // A month in the future is refused.
    const future = new Date();
    future.setUTCMonth(future.getUTCMonth() + 2);
    const futureMonth = `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, '0')}-01`;
    await assert.rejects(
      db.query("insert into stamps (user_id, place_key, visit_month) values ($1,'countries:392',$2)", [alice, futureMonth]),
      /future/,
      'a visit month cannot be in the future'
    );

    // Companions must be approved travellers.
    await assert.rejects(
      db.query("insert into stamps (user_id, place_key, visit_month, companions) values ($1,'countries:392','2024-05-01',$2)", [alice, ['00000000-0000-4000-8000-0000000000ff']]),
      /approved travellers/,
      'an unknown id cannot be tagged'
    );
    // A traveller cannot tag themselves.
    await assert.rejects(
      db.query("insert into stamps (user_id, place_key, visit_month, companions) values ($1,'countries:392','2024-05-01',$2)", [alice, [alice]]),
      /their own companion/,
      'self-tagging is refused'
    );
    // Someone who turned tagging off is not tagged.
    await assert.rejects(
      db.query("insert into stamps (user_id, place_key, visit_month, companions) values ($1,'countries:392','2024-05-01',$2)", [alice, [carol]]),
      /does not allow being tagged/,
      'the discoverable setting is enforced by the database'
    );

    // A valid record with an approved companion is stored.
    const saved = await db.query(
      "insert into stamps (id, user_id, place_key, visit_month, companions) values ('11111111-1111-4111-8111-111111111111',$1,'countries:392','2024-05-01',$2) returning companions",
      [alice, [bob]]
    );
    assert.deepEqual(saved.rows[0].companions, [bob]);

    // An existing tag is untouched by an unrelated change, even if that
    // traveller later turns tagging off.
    await db.query("update profiles	set discoverable = false where id = $1", [bob]);
    await db.query("update stamps set updated_at = now() where id = '11111111-1111-4111-8111-111111111111'");
    await db.query("update profiles set discoverable = true where id = $1", [bob]);

    // A record never changes owner.
    await assert.rejects(
      db.query("update stamps set user_id = $1 where id = '11111111-1111-4111-8111-111111111111'", [bob]),
      /change owner/,
      'a stamp cannot move to another traveller'
    );

    // The tagged traveller can leave; nobody else can edit the record.
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec('set role anon');
    await assert.rejects(
      db.query("select public.atlas_leave_stamp('11111111-1111-4111-8111-111111111111')"),
      /permission denied/,
      'a signed-out visitor cannot call the function'
    );
    await db.exec('reset role');

    const notTagged = await asUser(carol, "select public.atlas_leave_stamp('11111111-1111-4111-8111-111111111111') as result");
    assert.equal(notTagged.rows[0].result.ok, false, 'an untagged traveller cannot change the record');
    assert.equal(notTagged.rows[0].result.reason, 'not_tagged');

    const owner = await asUser(alice, "select public.atlas_leave_stamp('11111111-1111-4111-8111-111111111111') as result");
    assert.equal(owner.rows[0].result.ok, false, 'the owner deletes a stamp instead of leaving it');
    assert.equal(owner.rows[0].result.reason, 'owner');

    const left = await asUser(bob, "select public.atlas_leave_stamp('11111111-1111-4111-8111-111111111111') as result");
    assert.equal(left.rows[0].result.ok, true, 'a tagged traveller removes their own tag');
    const row = (await db.query("select user_id, visit_month, companions from stamps where id = '11111111-1111-4111-8111-111111111111'")).rows[0];
    assert.deepEqual(row.companions, [], 'only the tag is removed');
    assert.equal(row.user_id, alice, 'the record still belongs to its owner');
    assert.equal(row.visit_month.toISOString().slice(0, 10), '2024-05-01', 'the visit itself is unchanged');

    // Private stamps: before the migration an anonymous visitor reads every
    // record; after it, only an approved traveller reads anything.
    await db.query("insert into custom_cities (id, user_id, name, iso) values ('custom-tainan', $1, 'Tainan', 'TW')", [alice]);
    const asAnon = async sql => {
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
      await db.exec('set role anon');
      try { return await db.query(sql); }
      finally { await db.exec('reset role'); }
    };
    assert.equal((await asAnon('select id from stamps')).rows.length, 1, 'the old policy let visitors read stamps');
    const privacy = fs.readFileSync(path.join(__dirname, '../personal/travel/map/supabase/migrations/20261110_private_stamps.sql'), 'utf8').replace(/^notify pgrst.*$/m, '');
    await db.exec(privacy);
    await db.exec(privacy); // Safe to rerun on an existing project.
    assert.equal((await asAnon('select id from stamps')).rows.length, 0, 'a signed-out visitor reads no stamps');
    assert.equal((await asAnon('select id from custom_cities')).rows.length, 0, 'a signed-out visitor reads no custom cities');
    const stranger = '00000000-0000-4000-8000-0000000000dd';
    assert.equal((await asUser(stranger, 'select id from stamps')).rows.length, 0, 'a session without an approved profile reads no stamps');
    assert.equal((await asUser(bob, 'select id from stamps')).rows.length, 1, 'an approved traveller still reads records for shared trips');
    assert.equal((await asUser(alice, 'select id from custom_cities')).rows.length, 1, 'an approved traveller reads custom cities');

    console.log('PASS stamp SQL: owner fixed, no future months, approved companions only, companion self-removal, stamps private to travellers');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
