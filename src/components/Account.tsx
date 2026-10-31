import { useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { GoogleG } from './icons';
import { useOutside } from './Chrome';

interface AccountProps { user: User | null; onSignIn: () => void; onSignOut: () => void }

export function AccountButton({ user, onSignIn, onSignOut }: AccountProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null), panelRef = useRef<HTMLDivElement>(null);
  const refs = useRef([btnRef, panelRef]).current;
  useOutside(open, refs, () => setOpen(false));

  if (!user) {
    return (
      <button className="btn signin-btn" onClick={onSignIn}>
        <span style={{ width: 18, height: 18, display: 'inline-grid' }}><GoogleG /></span> Sign in
      </button>
    );
  }
  const meta = (user.user_metadata || {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const name = meta.full_name || meta.name || user.email || '';
  const avatar = meta.avatar_url || meta.picture;
  return (
    <>
      <button ref={btnRef} className="avatar-btn" aria-label="Account" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="initial">{(name || '?')[0].toUpperCase()}</span>}
      </button>
      {open && (
        <div className="island" id="account" ref={panelRef}>
          <div className="acct-who">
            {avatar && <img src={avatar} alt="" referrerPolicy="no-referrer" />}
            <div><div className="acct-name">{name}</div><div className="acct-mail">{user.email}</div></div>
          </div>
          <p className="hint-text">Your boards are saved to this Google account. Only you and the people you share them with can see them.</p>
          <button className="btn" onClick={onSignOut}>Sign out</button>
        </div>
      )}
    </>
  );
}
