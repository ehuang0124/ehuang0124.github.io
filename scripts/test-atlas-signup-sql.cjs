// Signup finishes on the confirmation link: invite checked before the mail,
// profile created only for the confirmed address that was approved.
// NODE_PATH=/tmp/atlas-test-deps/node_modules node scripts/test-atlas-signup-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

(async () => {
  const dir = path.join(__dirname, '../personal/travel/map/supabase');
  const setup = fs.readFileSync(path.join(dir, 'setup.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(dir, 'migrations/20261109_complete_signup_on_verify.sql'), 'utf8');
  for (const variant of ['setup.sql', 'migration on an existing install']) {
    const db = new PGlite({ extensions:{ pgcrypto } });
    try {
      await db.exec(`
        create role anon;
        create role authenticated;
        create schema auth;
        create schema extensions;
        create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        grant usage on schema auth to anon, authenticated;
        grant execute on function auth.uid() to anon, authenticated;
      `);
      await db.exec(setup);
      if (variant !== 'setup.sql') { await db.exec(migration); await db.exec(migration); }
      else await db.exec(setup);
      await db.exec(`grant usage on schema public to anon, authenticated;
        grant select, insert, update, delete on public.profiles to anon, authenticated;
        select public.atlas_rotate_code('correct-invite');`);
      const as = async (role, sub, sql, params) => {
        await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub || '']);
        await db.exec(`set role ${role}`);
        try { return (await db.query(sql, params)).rows[0]; }
        finally { await db.exec('reset role'); }
      };
      const prepare = (email, code, name) => as('anon', '', 'select public.atlas_prepare_signup($1, $2, $3) as r', [email, code, name]).then(row => row.r);
      const complete = sub => as('authenticated', sub, "select public.atlas_complete_signup('test') as r").then(row => row.r);
      const count = async table => (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;

      // Visitors cannot read or write the approval list directly.
      await db.exec('set role anon');
      await assert.rejects(db.query('select * from public.atlas_signup_approvals'), /permission denied/);
      await db.exec('reset role');
      await db.exec('set role authenticated');
      await assert.rejects(db.query("insert into public.atlas_signup_approvals (email, display_name) values ('x@y.z', 'x')"), /permission denied/);
      await db.exec('reset role');

      assert.equal((await prepare('not-an-email', 'correct-invite', 'A')).reason, 'invalid_email');
      assert.equal((await prepare('a@example.com', '', 'A')).reason, 'missing_code');
      assert.equal((await prepare('a@example.com', 'wrong', 'A')).reason, 'invalid_code');
      assert.equal(await count('atlas_signup_approvals'), 0, 'a wrong invite approves nothing');
      assert.equal((await prepare(' Alice@Example.com ', 'correct-invite', 'Alice')).ok, true);
      const stored = (await db.query('select * from public.atlas_signup_approvals')).rows;
      assert.deepEqual(stored.map(row => [row.email, row.display_name]), [['alice@example.com', 'Alice']]);
      assert(!JSON.stringify(stored).includes('correct-invite'), 'the invite itself is never stored');

      const alice = '11111111-1111-4111-8111-111111111111';
      await db.query("insert into auth.users (id, email) values ($1, 'alice@example.com')", [alice]);
      assert.equal((await complete(alice)).reason, 'email_unverified', 'an unconfirmed address cannot finish');
      assert.equal(await count('profiles'), 0);
      await db.query('update auth.users set email_confirmed_at = now() where id = $1', [alice]);
      const done = await complete(alice);
      assert.equal(done.ok, true, 'the confirmation link alone finishes the account');
      assert.equal(done.display_name, 'Alice');
      assert.equal(await count('atlas_signup_approvals'), 0, 'the approval is used up');
      assert.equal((await as('authenticated', alice, 'select public.atlas_is_traveller() as ok')).ok, true);
      assert.equal((await complete(alice)).ok, true, 'opening the link twice is harmless');
      assert.equal(await count('profiles'), 1);

      // A confirmed address that never passed the invite stays a visitor.
      const bob = '22222222-2222-4222-8222-222222222222';
      await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'bob@example.com', now())", [bob]);
      assert.equal((await complete(bob)).reason, 'not_approved');
      // Approval for another address does not transfer.
      await prepare('carol@example.com', 'correct-invite', 'Carol');
      assert.equal((await complete(bob)).reason, 'not_approved');

      // Rotating the invite voids approvals still waiting for a link.
      await prepare('bob@example.com', 'correct-invite', 'Bob');
      await db.query("update public.atlas_signup_approvals set created_at = now() - interval '1 minute'");
      await db.exec("update public.atlas_access set rotated_at = now()");
      assert.equal((await complete(bob)).reason, 'not_approved', 'a rotated invite voids waiting approvals');
      // Stale approvals expire.
      await prepare('bob@example.com', 'correct-invite', 'Bob');
      await db.exec("update public.atlas_access set rotated_at = now() - interval '30 days'");
      await db.query("update public.atlas_signup_approvals set created_at = now() - interval '8 days' where email = 'bob@example.com'");
      assert.equal((await complete(bob)).reason, 'not_approved', 'approvals expire after 7 days');
      await prepare('bob@example.com', 'correct-invite', 'Bob');
      assert.equal((await complete(bob)).ok, true);

      // Anonymous callers cannot complete anything.
      await db.exec('set role anon');
      await assert.rejects(db.query("select public.atlas_complete_signup('x')"), /permission denied/);
      await db.exec('reset role');

      // Wrong guesses still count toward the shared throttle.
      for (let i = 0; i < 8; i++) await prepare('d@example.com', 'nope', 'D');
      assert.equal((await prepare('d@example.com', 'correct-invite', 'D')).reason, 'throttled');
      console.log(`PASS signup SQL (${variant}): invite before mail, link finishes confirmed approved address only, rotation/expiry, no invite stored, throttle`);
    } finally {
      await db.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
