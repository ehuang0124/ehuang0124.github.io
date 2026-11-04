// Stamp Atlas account configuration.
//
// Leave `supabaseUrl` empty to run the page in local mode: stamps stay in this
// browser's localStorage, exactly as before, and no network request is made.
// Fill in both values from Supabase → Project Settings → API to enable Google
// sign-in, cross-device sync, companions, and live updates.
//
// The anon key is a public browser key. Row Level Security in the SQL setup
// (see README.md) is what keeps other people from editing your records.
window.TravelAtlasConfig = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Flip to true (or append ?demo=1 to the URL) to try the signed-in interface
  // with four sample travellers and no backend. Leave false for the real page.
  demoMode: false
};
