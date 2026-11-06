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
        avatar_url text default '', discoverable boolean default true,
        updated_at timestamptz default now()
      );
      create table public.atlas_logins (
        user_id uuid, display_name text, user_agent text, ip text,
        created_at timestamptz default now()
      );
      alter table public.atlas_logins enable row level security;
      grant select, insert, update, delete on public.atlas_logins to anon, authenticated;
      create table public.atlas_access (id smallint primary key, code_hash text not null);
      insert into public.atlas_access values (1, 'travel2n');
      create table public.atlas_login_attempts (ip text, ok boolean, created_at timestamptz default now());
      -- Only the test encryption fixture is simplified: a matching plaintext
      -- invite behaves like a matching bcrypt hash in the production function.
      create function extensions.crypt(p_code text, p_hash text) returns text language sql immutable as $$ select p_code $$;
    `);
    const schema = fs.readFileSync(path.join(__dirname, '../personal/travel/map/supabase/setup.sql'), 'utf8');
    const start = schema.indexOf('create or replace function public.atlas_login(');
    const end = schema.indexOf('grant execute on function public.atlas_login(text) to authenticated;', start);
    assert(start > 0 && end > start, 'deployable login function and grants exist');
    const loginSQL = schema.slice(start, end) + 'grant execute on function public.atlas_login(text) to authenticated;';
    await db.exec(loginSQL);
    await db.exec(loginSQL); // Safe to rerun on an existing project.
    const travellerStart = schema.indexOf('create or replace function public.atlas_is_traveller()');
    const travellerEnd = schema.indexOf('grant execute on function public.atlas_is_traveller() to anon, authenticated;', travellerStart);
    const redeemStart = schema.indexOf('create or replace function public.atlas_redeem_code(');
    const redeemEnd = schema.indexOf('grant execute on function public.atlas_redeem_code(text, text, text) to anon, authenticated;', redeemStart);
    assert(travellerStart > 0 && travellerEnd > travellerStart && redeemStart > 0 && redeemEnd > redeemStart, 'deployable verification gates exist');
    await db.exec(schema.slice(travellerStart, travellerEnd) + 'grant execute on function public.atlas_is_traveller() to anon, authenticated;');
    await db.exec(schema.slice(redeemStart, redeemEnd) + 'grant execute on function public.atlas_redeem_code(text, text, text) to anon, authenticated;');
    const login = async () => (await db.query("select public.atlas_login('test-browser') as result")).rows[0].result;
    const redeem = async (code = 'travel2n') => (await db.query('select public.atlas_redeem_code($1, $2, $3) as result', [code, 'Carol', 'test-browser'])).rows[0].result;
    const isTraveller = async () => (await db.query('select public.atlas_is_traveller() as result')).rows[0].result;
    assert.deepEqual(await login(), { ok:false, reason:'no_session' });
    await db.exec('set role anon');
    await assert.rejects(login, /permission denied/);
    await db.exec('reset role');
    const alice = '00000000-0000-4000-8000-000000000001';
    const bob = '00000000-0000-4000-8000-000000000002';
    await db.query('insert into auth.users (id, email_confirmed_at) values ($1, null), ($2, now())', [alice, bob]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice]);
    await db.exec('set role authenticated');
    assert.deepEqual(await login(), { ok:false, reason:'email_unverified' }, 'an unverified address cannot log in');
    await db.exec('reset role');
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [alice]);
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
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [alice]);
    await db.exec('set role authenticated');
    assert.deepEqual(await login(), { ok:false, reason:'email_unverified' }, 'an existing profile cannot bypass verification');
    await db.exec('reset role');
    assert.equal((await db.query('select * from atlas_logins')).rows.length, 1, 'unverified login is not recorded as a success');

    // Registration and the RLS helper use the same verification boundary.
    const carol = '00000000-0000-4000-8000-000000000003';
    await db.query('insert into auth.users (id, email_confirmed_at) values ($1, null)', [carol]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [carol]);
    await db.exec('set role authenticated');
    assert.equal(await isTraveller(), false);
    assert.deepEqual(await redeem(), { ok:false, reason:'email_unverified' }, 'an unverified address cannot redeem an invite');
    await db.exec('reset role');
    assert.equal((await db.query('select * from profiles')).rows.length, 2, 'unverified redemption creates no profile');
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [carol]);
    await db.exec('set role authenticated');
    assert.equal((await redeem('wrong-code')).reason, 'invalid_code');
    assert.equal(await isTraveller(), false, 'a confirmed address still needs the invite');
    const approved = await redeem();
    assert.equal(approved.ok, true);
    assert.equal(approved.user_id, carol);
    assert.equal(await isTraveller(), true, 'verified and approved traveller passes the RLS helper');
    await db.exec('reset role');
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [carol]);
    await db.exec('set role authenticated');
    assert.equal(await isTraveller(), false, 'losing email verification also closes the RLS write gate');
    await db.exec('reset role');
    assert.equal((await db.query('select * from profiles')).rows.length, 3, 'only the verified, invited account was added');
    console.log('PASS account SQL: idempotency, anonymous denial, verified-email registration/login/RLS gates, approved profiles, caller identity, private login log');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
