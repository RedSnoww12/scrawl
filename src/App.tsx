import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Workspace from './components/Workspace';
import SignIn, { friendlyAuthError } from './components/SignIn';
import { supabase, signInWithGoogle } from './lib/supabase';
import { localRepo, cloudRepo, prefs, type Repo } from './lib/repos';

// A Google redirect that failed comes back with ?error_description=… in the URL.
function readAuthError(): string {
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
  const msg = q.get('error_description') || h.get('error_description');
  if (msg) history.replaceState(null, '', location.pathname);
  return msg ? friendlyAuthError(msg) : '';
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined while we ask Supabase
  const [guest, setGuest] = useState(() => !!prefs.getFlag('guest'));
  const [authError, setSignInError] = useState(readAuthError);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;
  const repo: Repo = useMemo(() => (user ? cloudRepo(supabase) : localRepo), [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <div className="loading">Opening Scrawl…</div>;
  if (!user && !guest) {
    return <SignIn initialError={authError} onGuest={() => { prefs.setFlag('guest', true); setGuest(true); }} />;
  }
  return (
    <Workspace
      key={user ? user.id : 'guest'}
      repo={repo}
      user={user}
      onSignIn={async () => {
        const { error } = await signInWithGoogle();
        if (error) { setSignInError(friendlyAuthError(error.message)); prefs.setFlag('guest', false); setGuest(false); }
      }}
      onSignOut={async () => {
        await supabase.auth.signOut();
        prefs.setFlag('guest', false); setGuest(false);
      }}
    />
  );
}
