// Stamp Atlas account configuration.
//
// Two ways to sign in, in this order of preference:
//
// 1. Supabase (a real backend, what this site now uses): a shared access code
//    checked by Postgres, real Row Level Security, cross-device sync,
//    companions, and a login log you can read in the Supabase dashboard.
//    The code lives in the database as a bcrypt hash, never in this file.
//
//      rotate it:  select public.atlas_rotate_code('a new code');
//                  (Supabase → SQL Editor, then Run)
//
// 2. `localGate` (no backend): while no project is configured, the page asks
//    for a traveller passphrase before it will stamp anything. Records stay in
//    this browser; the check runs in the page, so it keeps out casual visitors
//    but it is not a security boundary.
//
// Change the local passphrase with:  node scripts/set-atlas-passphrase.cjs "new one"
// The anon key is a public browser key. Row Level Security in the SQL setup
// (see README.md) is what keeps other people from editing your records.
window.TravelAtlasConfig = {
  supabaseUrl: 'https://osffsthnlmndwpxpxtou.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZmZzdGhubG1uZHdweHB4dG91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NDE3MTMsImV4cCI6MjEwOTQxNzcxM30.p0HFvS9BZ3rZ9Osbr7k8X6WxRdC4C-qtRT2J15C1y6w',
  // Flip to true (or append ?demo=1 to the URL) to try the signed-in interface
  // with four sample travellers and no backend. Leave false for the real page.
  demoMode: false,
  // Browser-only sign-in while there is no Supabase project.
  // passphraseHash is SHA-256 of the passphrase; the passphrase is never stored.
  localGate: {
    name: 'Eva Huang',
    passphraseHash: '7677b76916c7b2631025b054ec6b5b7415f7fa8e13e1ddb16e821ae36e79b562',
    hint: ''
  }
};
