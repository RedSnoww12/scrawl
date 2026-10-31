// The other people on a board right now: their faces in the top bar, their pointers on the canvas,
// and the short comments anyone can type next to their own pointer (press /).
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Engine } from '../engine/engine';
import { MAX_COMMENT, type Cursor, type Peer, type Room, type Sharing } from '../lib/repos';
import { UiIcons } from './icons';

const COLORS = ['#e8590c', '#2b8a3e', '#1864ab', '#c2255c', '#7048e8', '#0c8599', '#e67700', '#5c940d'];
const SEND_EVERY = 60;     // ms between pointer updates, well under Realtime's rate limit
const COMMENT_FOR = 5000;  // ms a sent comment stays next to the pointer

/** Each person keeps the same color on every screen. */
export function colorFor(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

/** Name and picture from the Google account; the email stays private. */
export function profile(user: User): { name: string; avatar?: string } {
  const meta = (user.user_metadata || {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  return { name: meta.full_name || meta.name || '', avatar: meta.avatar_url || meta.picture };
}

const peerStyle = (userId: string) => ({ '--peer': colorFor(userId) }) as CSSProperties;
/** The comment next to your own pointer: being typed, or sent and fading out soon. */
interface MyComment { text: string; editing: boolean }

export function useRoom(engine: Engine | null, sharing: Sharing | undefined, boardId: string | undefined, user: User | null) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [comment, setComment] = useState<MyComment | null>(null);
  const roomRef = useRef<Room | null>(null);
  const mine = useRef<Cursor>({ x: null, y: 0, text: '' });
  const pointer = useRef<{ x: number; y: number } | null>(null); // on screen
  const ownEl = useRef<HTMLDivElement | null>(null);
  const sendTimer = useRef(0), lastSent = useRef(0), fadeTimer = useRef(0);

  // at most one update per SEND_EVERY, and always the latest one
  const send = useCallback(() => {
    clearTimeout(sendTimer.current);
    const wait = lastSent.current + SEND_EVERY - performance.now();
    if (wait > 0) { sendTimer.current = window.setTimeout(send, wait); return; }
    lastSent.current = performance.now();
    roomRef.current?.move({ ...mine.current });
  }, []);

  const placeOwn = useCallback((el: HTMLDivElement | null) => {
    ownEl.current = el;
    const p = pointer.current ?? { x: innerWidth / 2, y: innerHeight / 2 };
    if (el) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!sharing || !boardId || !user) return;
    let count = 0;
    const { name, avatar } = profile(user);
    const room = sharing.room(boardId, { userId: user.id, name: name || 'Someone', avatar }, {
      peers(list) {
        setPeers(list);
        if (list.length > count) send(); // show newcomers where we are without waiting for the next move
        count = list.length;
      },
      cursor: (key, c) => setCursors(cs => ({ ...cs, [key]: c })),
    });
    roomRef.current = room;
    return () => {
      room.leave(); roomRef.current = null;
      clearTimeout(sendTimer.current); clearTimeout(fadeTimer.current);
      mine.current = { ...mine.current, text: '' };
      setPeers([]); setCursors({}); setComment(null);
    };
  }, [sharing, boardId, userId, send]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow this person's pointer, in board coordinates so it lands on the same spot on every screen
  const live = !!(engine && sharing && boardId && userId);
  useEffect(() => {
    if (!live || !engine) return;
    const track = (x: number, y: number) => {
      pointer.current = { x, y };
      if (ownEl.current) ownEl.current.style.transform = `translate(${x}px, ${y}px)`;
      const v = engine.getView();
      mine.current = { ...mine.current, x: x / v.zoom - v.sx, y: y / v.zoom - v.sy };
      send();
    };
    const onMove = (e: PointerEvent) => track(e.clientX, e.clientY);
    // scrolling moves the board under a still pointer
    const onWheel = () => requestAnimationFrame(() => { if (pointer.current) track(pointer.current.x, pointer.current.y); });
    const gone = () => { mine.current = { ...mine.current, x: null }; send(); };
    const onHide = () => { if (document.visibilityState === 'hidden') gone(); };
    const root = document.documentElement;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('wheel', onWheel, { passive: true });
    root.addEventListener('pointerleave', gone);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerleave', gone);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [live, engine, send]);

  const say = useCallback((text: string) => {
    mine.current = { ...mine.current, text: text.slice(0, MAX_COMMENT) };
    send();
  }, [send]);
  const startComment = useCallback(() => {
    clearTimeout(fadeTimer.current);
    setComment({ text: '', editing: true }); say('');
  }, [say]);
  const typeComment = useCallback((text: string) => { setComment({ text, editing: true }); say(text); }, [say]);
  const cancelComment = useCallback(() => { clearTimeout(fadeTimer.current); setComment(null); say(''); }, [say]);
  // sent: leave it up a few seconds so the others can read it
  const sendComment = useCallback(() => {
    const text = mine.current.text.trim();
    if (!text) return cancelComment();
    setComment({ text, editing: false }); say(text);
    clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(cancelComment, COMMENT_FOR);
  }, [say, cancelComment]);

  // "/" starts a comment, like in most whiteboards
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[data-modal-open="true"]')) return;
      e.preventDefault(); startComment();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, startComment]);

  return { live, peers, cursors, comment, placeOwn, startComment, typeComment, sendComment, cancelComment };
}

export type RoomState = ReturnType<typeof useRoom>;

/** The faces of everyone else on the board, and the button that starts a comment. */
export function PeerStack({ room }: { room: RoomState }) {
  if (!room.live) return null;
  const people = [...new Map(room.peers.map(p => [p.userId, p])).values()]; // one face per person, however many tabs
  const shown = people.slice(0, 4);
  return (
    <div className="peers">
      {shown.length > 0 && (
        <div className="peer-faces" aria-label={`Also here: ${people.map(p => p.name).join(', ')}`} role="img">
          {shown.map(p => (
            <span key={p.userId} className="peer" style={peerStyle(p.userId)} title={p.name}>
              {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : (p.name[0] || '?').toUpperCase()}
            </span>
          ))}
          {people.length > shown.length && <span className="peer more" title={people.slice(4).map(p => p.name).join(', ')}>+{people.length - shown.length}</span>}
        </div>
      )}
      <button className="icon-btn island comment-btn" title="Comment next to your pointer ( / )" aria-label="Comment"
        aria-pressed={!!room.comment?.editing} onPointerDown={e => e.preventDefault()} onClick={room.startComment}>
        {UiIcons.comment}
      </button>
    </div>
  );
}

/** Everyone else's pointer, with their name or the comment they are typing, plus your own comment box. */
export function CursorLayer({ engine, room, me }: { engine: Engine; room: RoomState; me: string }) {
  const { peers, cursors, comment } = room;
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const shown = useRef(new Map<string, { x: number; y: number }>()); // eased positions, in board coordinates
  const cursorsRef = useRef(cursors);
  cursorsRef.current = cursors;
  const visible = peers.filter(p => cursors[p.key] && cursors[p.key].x !== null);
  const active = visible.length > 0;

  // redrawn every frame so pointers stay put on the board while this person pans and zooms
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const v = engine.getView();
      nodes.current.forEach((el, key) => {
        const c = cursorsRef.current[key];
        if (!c || c.x === null) return;
        const s = shown.current.get(key) ?? { x: c.x, y: c.y };
        s.x += (c.x - s.x) * 0.35; s.y += (c.y - s.y) * 0.35;
        shown.current.set(key, s);
        el.style.transform = `translate(${(s.x + v.sx) * v.zoom}px, ${(s.y + v.sy) * v.zoom}px)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, active]);

  const bind = (key: string) => (el: HTMLDivElement | null) => {
    if (el) nodes.current.set(key, el);
    else { nodes.current.delete(key); shown.current.delete(key); } // reappears where it is, not sliding from where it left
  };

  return (
    <>
      <div className="cursors" aria-hidden="true">
        {visible.map(p => {
          const text = cursors[p.key].text;
          return (
            <div key={p.key} ref={bind(p.key)} className="cursor" style={peerStyle(p.userId)}>
              <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 2l5.5 14 2.2-5.8L15.5 8z" /></svg>
              {text
                ? <div className="cursor-bubble"><span className="cursor-who">{p.name}</span>{text}</div>
                : <div className="cursor-name">{p.name}</div>}
            </div>
          );
        })}
      </div>
      {comment && (
        <div ref={room.placeOwn} className="cursor mine" style={peerStyle(me)}>
          {comment.editing
            ? <input className="cursor-bubble" autoFocus value={comment.text} maxLength={MAX_COMMENT}
                size={Math.min(40, Math.max(16, comment.text.length + 2))} placeholder="Say something…" aria-label="Comment next to your pointer"
                onChange={e => room.typeComment(e.target.value)} onBlur={room.sendComment}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); room.sendComment(); }
                  else if (e.key === 'Escape') { e.preventDefault(); room.cancelComment(); }
                }} />
            : <div className="cursor-bubble" role="status">{comment.text}</div>}
        </div>
      )}
    </>
  );
}
