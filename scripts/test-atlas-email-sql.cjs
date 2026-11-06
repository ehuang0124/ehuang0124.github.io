// Run the real schema/migration against embedded Postgres, including RLS.
// NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-email-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

(async () => {
  const db = new PGlite({ extensions:{ pgcrypto } });
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema extensions;
      create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    const dir = path.join(__dirname, '../personal/travel/map/supabase');
    const setup = fs.readFileSync(path.join(dir, 'setup.sql'), 'utf8');
    const migration = fs.readFileSync(path.join(dir, 'migrations/20261106_require_verified_email.sql'), 'utf8');
    await db.exec(setup);
    await db.exec(setup);
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(`
      grant usage on schema public to anon, authenticated;
      grant select, insert, update, delete on public.profiles, public.stamps, public.custom_cities to anon, authenticated;
      select public.atlas_rotate_code('correct-invite');
    `);
    const alice = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into auth.users (id) values ($1)', [alice]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice]);
    const redeem = async code => (await db.query('select public.atlas_redeem_code($1, $2, $3) as result', [code, 'Alice', 'test'])).rows[0].result;
    const login = async () => (await db.query("select public.atlas_login('test') as result")).rows[0].result;
    await db.exec('set role authenticated');
    assert.equal((await redeem('correct-invite')).reason, 'email_unverified', 'a correct invite cannot approve an unverified address');
    assert.equal((await login()).reason, 'email_unverified');
    assert.equal((await db.query('select public.atlas_is_traveller() as approved')).rows[0].approved, false);
    await assert.rejects(db.query("insert into public.stamps (user_id, place_key, visit_month) values ($1, 'countries:392', '2024-01-01')", [alice]), /row-level security/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.atlas_logins')).rows[0].n, 0);
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [alice]);
    await db.exec('set role authenticated');
    assert.equal((await redeem('wrong-invite')).reason, 'invalid_code');
    assert.equal((await redeem('correct-invite')).ok, true);
    assert.equal((await db.query('select public.atlas_is_traveller() as approved')).rows[0].approved, true);
    await db.query("insert into public.stamps (user_id, place_key, visit_month) values ($1, 'countries:392', '2024-01-01')", [alice]);
    await db.exec('reset role');
    // Even a previously approved profile cannot write if its email becomes unverified.
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [alice]);
    await db.exec('set role authenticated');
    assert.equal((await login()).reason, 'email_unverified');
    await db.exec("update public.profiles set display_name = 'forged'");
    await assert.rejects(db.query("insert into public.stamps (user_id, place_key, visit_month) values ($1, 'countries:392', '2024-02-01')", [alice]), /row-level security/);
    await db.exec('reset role');
    assert.equal((await db.query('select display_name from public.profiles')).rows[0].display_name, 'Alice');
    assert.equal((await db.query('select count(*)::int as n from public.stamps')).rows[0].n, 1);
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [alice]);
    await db.exec('set role authenticated');
    assert.equal((await login()).ok, true, 'verified approved users can still log in');
    console.log('PASS email SQL: unverified and unapproved sessions blocked, verified invite required, RLS, idempotency');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
