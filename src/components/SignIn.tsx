import { useMemo, useState } from 'react';
import { GoogleG } from './icons';
import { exportSvg, sampleScene } from '../engine/scene';
import { signInWithGoogle } from '../lib/supabase';

export function friendlyAuthError(msg = ''): string {
  if (/provider is not enabled|unsupported provider/i.test(msg)) return 'Google sign-in is not set up for this app yet. The app owner needs to enable the Google provider in Supabase.';
  return msg ? `Sign-in did not work: ${msg}` : '';
}

interface SignInProps { onGuest: () => void; initialError?: string }

export default function SignIn({ onGuest, initialError }: SignInProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  // the welcome board, drawn by the same renderer the app uses
  const art = useMemo(() => {
    const svg = exportSvg(sampleScene(), { background: false });
    return svg ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : '';
  }, []);
  const google = async () => {
    setBusy(true); setError('');
    const { error: e } = await signInWithGoogle();
    if (e) { setBusy(false); setError(friendlyAuthError(e.message)); }
  };
  return (
    <main className="signin">
      <div className="island signin-card">
        <div className="signin-copy">
          <h1>Scrawl <em>it out.</em></h1>
          <p>A sketchy whiteboard for napkin ideas. Sign in and your boards follow you to any device. Each person sees only their own boards.</p>
          <button className="google-btn" onClick={google} disabled={busy}>
            <GoogleG /> {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>
          {error && <p className="signin-error" role="alert">{error}</p>}
          <button className="guest-link" onClick={onGuest}>Try it without an account</button>
          <p className="signin-note">Without an account, boards stay in this browser only.</p>
        </div>
        <div className="signin-art">{art && <img src={art} alt="A sample board: sketch the idea, check it still makes sense, ship it" />}</div>
      </div>
    </main>
  );
}
