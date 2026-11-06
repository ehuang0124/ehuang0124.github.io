// Exercise the actual returning-user function with embedded Postgres.
// Install outside the checkout: npm install --prefix /tmp/atlas-test-deps @electric-sql/pglite
// Run: NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-login-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  try {
    // Only the fixtures are simplified; the function and grants are read
    // verbatim from the deployable SQL, not reimplemented as a test double.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema extensions;
      create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create table public.profiles (
        id uuid primary key, display_name text not null,
        avatar_url text default '', discoverable boolean default true
      );
      create table public.atlas_logins (
        user_id uuid, display_name text, user_agent text, ip text,
        created_at timestamptz default now()
      );
      alter table public.atlas_logins enable row level security;
      grant select, insert, update, delete on public.atlas_logins to anon, authenticated;
    `);
    const schema = fs.readFileSync(path.join(__dirname, '../personal/travel/map/supabase/setup.sql'), 'utf8');
    const start = schema.indexOf('create or replace function public.atlas_login(');
    const end = schema.indexOf('grant execute on function public.atlas_login(text) to authenticated;', start);
    assert(start > 0 && end > start, 'deployable login function and grants exist');
    const loginSQL = schema.slice(start, end) + 'grant execute on function public.atlas_login(text) to authenticated;';
    await db.exec(loginSQL);
    await db.exec(loginSQL); // Safe to rerun on an existing project.
    const login = async () => (await db.query("select public.atlas_login('test-browser') as result")).rows[0].result;
    assert.deepEqual(await login(), { ok:false, reason:'no_session' });
    await db.exec('set role anon');
    await assert.rejects(login, /permission denied/);
    await db.exec('reset role');
    const alice = '00000000-0000-4000-8000-000000000001';
    const bob = '00000000-0000-4000-8000-000000000002';
    await db.query("insert into auth.users (id, email_confirmed_at) values ($1, now()), ($2, now())", [alice, bob]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice]);
    await db.exec('set role authenticated');
    assert.deepEqual(await login(), { ok:false, reason:'not_approved' });
    await db.exec('reset role');
    assert.equal((await db.query('select * from profiles')).rows.length, 0, 'login never approves an account');
    assert.equal((await db.query('select * from atlas_logins')).rows.length, 0, 'refused login is not recorded as a success');
    await db.query("insert into profiles (id, display_name) values ($1, 'Alice'), ($2, 'Bob')", [alice, bob]);
    await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ 'x-forwarded-for':'192.0.2.1, proxy' })]);
    await db.exec('set role authenticated');
    const result = await login();
    assert.equal(result.ok, true);
    assert.equal(result.user_id, alice, 'identity comes from auth.uid, never a supplied name or id');
    assert.equal(result.display_name, 'Alice');
    assert.equal((await db.query('select * from atlas_logins')).rows.length, 0, 'RLS hides the log even from the logged-in traveller');
    await assert.rejects(db.query("insert into atlas_logins (display_name) values ('forged')"), /row-level security/);
    await db.exec("update atlas_logins set display_name = 'forged'; delete from atlas_logins;");
    await db.exec('reset role');
    const logs = (await db.query('select * from atlas_logins')).rows;
    assert.equal(logs.length, 1);
    assert.equal(logs[0].user_id, alice);
    assert.equal(logs[0].user_agent, 'test-browser');
    assert.equal(logs[0].ip, '192.0.2.1');
    assert.equal((await db.query('select * from profiles')).rows.length, 2, 'login did not create a profile');
    console.log('PASS login SQL: idempotency, anonymous denial, approved-profile gate, caller identity, private append-only login log');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
