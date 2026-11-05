// Set the browser-only traveller passphrase used by the Stamp Atlas when no
// Supabase project is configured.
//
//   node scripts/set-atlas-passphrase.cjs "my new passphrase"
//   node scripts/set-atlas-passphrase.cjs "my new passphrase" --name "Eva Huang"
//
// The passphrase itself is never written to the repository: config.js only ever
// holds its SHA-256 hash. Re-run this whenever the passphrase should change.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const nameIndex = args.indexOf('--name');
const name = nameIndex >= 0 ? args[nameIndex + 1] : null;
const passphrase = args.filter((value, index) => index !== nameIndex && index !== nameIndex + 1)[0];

if (!passphrase || !passphrase.trim()) {
  console.error('Usage: node scripts/set-atlas-passphrase.cjs "passphrase" [--name "Traveller name"]');
  process.exit(1);
}

const configPath = path.join(__dirname, '..', 'personal/travel/map/config.js');
const source = fs.readFileSync(configPath, 'utf8');
const hash = crypto.createHash('sha256').update(passphrase.trim()).digest('hex');

if (!/passphraseHash:\s*'[0-9a-f]*'/i.test(source)) {
  console.error('config.js has no localGate.passphraseHash entry to update.');
  process.exit(1);
}

let next = source.replace(/passphraseHash:\s*'[0-9a-f]*'/i, `passphraseHash: '${hash}'`);
if (name && name.trim()) next = next.replace(/name:\s*'[^']*'/, `name: '${name.trim().replace(/'/g, "\\'")}'`);
fs.writeFileSync(configPath, next);

console.log(`Updated ${path.relative(process.cwd(), configPath)}`);
console.log(`  traveller: ${name ? name.trim() : '(unchanged)'}`);
console.log(`  sha256:    ${hash}`);
