import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from './Dialogs';
import { UiIcons } from './icons';
import { boardLink, type BoardRow, type MemberRole, type ShareSettings, type Sharing, type Visibility } from '../lib/repos';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Opens the person's own mail app with the link filled in; nothing is sent from Scrawl. */
function mailto(email: string, boardName: string, link: string): string {
  const subject = `${boardName} on Scrawl`;
  const body = `I shared a Scrawl board with you:\n${link}\n\nSign in with Google as ${email} to open it.`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

interface ShareProps {
  board: BoardRow; sharing: Sharing; me: string;
  onClose: () => void; toast: (msg: string) => void; onVisibility: (v: Visibility) => void;
}

export function ShareDialog({ board, sharing, me, onClose, toast, onVisibility }: ShareProps) {
  const owner = board.role === 'owner';
  const link = boardLink(board.id);
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('edit');
  const [busy, setBusy] = useState(false);
  const [justInvited, setJustInvited] = useState('');

  useEffect(() => {
    if (!owner) return;
    sharing.get(board.id).then(setSettings, e => setError(`Could not load sharing: ${message(e)}`));
  }, [owner, sharing, board.id]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast('Link copied'); }
    catch { toast('This browser blocked copying. Select the link and copy it.'); }
  };

  const run = async (work: () => Promise<void>, next: ShareSettings) => {
    const before = settings;
    setSettings(next); setError('');
    try { await work(); }
    catch (e) { setSettings(before); setError(message(e)); }
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    const addr = email.trim().toLowerCase();
    if (!EMAIL.test(addr)) return setError('Type a full email address, like friend@gmail.com.');
    if (addr === me.toLowerCase()) return setError('That is you. You already own this board.');
    setBusy(true);
    const members = [...settings.members.filter(m => m.email !== addr), { email: addr, role }];
    await run(() => sharing.invite(board.id, addr, role), { ...settings, members });
    setBusy(false); setEmail(''); setJustInvited(addr);
  };

  const setLink = (visibility: Visibility, linkRole: MemberRole) => {
    if (!settings) return;
    void run(async () => { await sharing.setLink(board.id, visibility, linkRole); onVisibility(visibility); },
      { ...settings, visibility, link_role: linkRole });
  };

  return (
    <Modal title={`Share “${board.name}”`} width={520} onClose={onClose}>
      <div className="share">
        <div className="share-link">
          <input readOnly value={link} aria-label="Board link" onFocus={e => e.target.select()} />
          <button className="btn primary" onClick={copy}>{UiIcons.link} Copy link</button>
        </div>

        {!owner && (
          <p className="hint-text">
            Only the owner{board.owner_name || board.owner_email ? `, ${board.owner_name || board.owner_email},` : ''} can change who has access.
            The link works for people they invited, or for anyone if they turned the link on.
          </p>
        )}

        {owner && !settings && !error && <p className="hint-text">Loading…</p>}

        {owner && settings && (
          <>
            <section>
              <h3>General access</h3>
              <div className="access-row">
                <span className="access-icon">{settings.visibility === 'link' ? UiIcons.link : UiIcons.users}</span>
                <select aria-label="Who can open the link" value={settings.visibility} onChange={e => setLink(e.target.value as Visibility, settings.link_role)}>
                  <option value="private">Only people invited</option>
                  <option value="link">Anyone with the link</option>
                </select>
                {settings.visibility === 'link' && (
                  <select aria-label="What people with the link can do" value={settings.link_role} onChange={e => setLink('link', e.target.value as MemberRole)}>
                    <option value="view">can view</option>
                    <option value="edit">can edit</option>
                  </select>
                )}
              </div>
              <p className="hint-text">
                {settings.visibility === 'link'
                  ? 'Anyone signed in with Google who opens the link gets the board in their “Shared with me” list.'
                  : 'Only you and the people below can open this board, even with the link.'}
              </p>
            </section>

            <section>
              <h3>Invite by email</h3>
              <form className="invite" onSubmit={invite}>
                <input type="email" placeholder="friend@gmail.com" aria-label="Email address" value={email} autoComplete="off"
                  onChange={e => { setEmail(e.target.value); setError(''); }} />
                <select aria-label="Role" value={role} onChange={e => setRole(e.target.value as MemberRole)}>
                  <option value="edit">can edit</option>
                  <option value="view">can view</option>
                </select>
                <button className="btn primary" disabled={busy || !email.trim()}>Invite</button>
              </form>
              {justInvited && (
                <p className="hint-text invited">
                  {justInvited} can open it once they sign in with that Google address.{' '}
                  <a href={mailto(justInvited, board.name, link)}>Email them the link</a>
                </p>
              )}
            </section>

            <section>
              <h3>People with access</h3>
              <ul className="people">
                <li><span className="p-mail">{me} <em>(you)</em></span><span className="p-role">Owner</span></li>
                {settings.members.map(m => (
                  <li key={m.email}>
                    <span className="p-mail">{m.email}</span>
                    <a className="icon-btn" href={mailto(m.email, board.name, link)} aria-label={`Email the link to ${m.email}`} title="Email the link">{UiIcons.mail}</a>
                    <select aria-label={`Role for ${m.email}`} value={m.role}
                      onChange={e => {
                        const r = e.target.value as MemberRole;
                        void run(() => sharing.invite(board.id, m.email, r), { ...settings, members: settings.members.map(x => (x.email === m.email ? { ...x, role: r } : x)) });
                      }}>
                      <option value="edit">can edit</option>
                      <option value="view">can view</option>
                    </select>
                    <button className="icon-btn" aria-label={`Remove ${m.email}`} title="Remove access"
                      onClick={() => void run(() => sharing.removeMember(board.id, m.email), { ...settings, members: settings.members.filter(x => x.email !== m.email) })}>
                      {UiIcons.close}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {error && <p className="share-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
