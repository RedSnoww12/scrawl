import { createClient, type AuthError } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;

// Both values are public: they ship to every browser. Row-level security in supabase/schema.sql
// is what keeps each person's boards private. Environment variables override the defaults,
// including the NEXT_PUBLIC_* ones the Supabase ↔ Vercel integration creates.
export const SUPABASE_URL: string =
  env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'https://ytcjpjbqhmdftjiazfqz.supabase.co';
export const SUPABASE_KEY: string =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_HSMeislhf7QdkAtC2QvEAA_3D5h6Ffp';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export type SupabaseClient = typeof supabase;

// Ask Supabase first: with the provider switched off, the redirect would land on a bare JSON error page.
export async function signInWithGoogle(): Promise<{ error: Pick<AuthError, 'message'> | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
    const settings = res.ok ? ((await res.json()) as { external?: { google?: boolean } }) : null;
    if (settings && !settings.external?.google) return { error: { message: 'provider is not enabled' } };
  } catch { /* offline or blocked: let the redirect report it */ }
  // Google sends people back to the bare address: remember which board link they came from.
  const hash = window.location.hash.slice(1);
  try { if (hash) localStorage.setItem('scrawl.flag.return-to', JSON.stringify(hash)); } catch { /* storage blocked */ }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } },
  });
  return { error };
}
