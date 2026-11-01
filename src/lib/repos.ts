// Two places boards can live, behind one interface.
import { uid } from '../engine/scene';
import type { SceneElement, Style, View } from '../engine/scene';
import type { SupabaseClient } from './supabase';

/** What the signed-in person may do with a board. */
export type Role = 'owner' | 'edit' | 'view';
export type Visibility = 'private' | 'link';
export type MemberRole = 'view' | 'edit';

/** One line in the board list. */
export interface BoardRow {
  id: string; name: string; updated_at: string; shape_count: number;
  role: Role; folder_id: string | null; version?: number;
  visibility?: Visibility; owner_name?: string | null; owner_email?: string | null;
}
/** A board with its drawing. */
export interface BoardData { id: string; name: string; elements: unknown; role: Role; version?: number }
export interface Folder { id: string; name: string }
export interface Member { email: string; role: MemberRole }
export interface ShareSettings { visibility: Visibility; link_role: MemberRole; members: Member[] }
/** A saved copy of a board, as another person's edit arrives. */
export interface RemoteBoard { name: string; elements?: unknown; version: number }

/** Someone else saved the board since we last loaded it (or we lost access to it). */
export class ConflictError extends Error {}

export interface Sharing {
  /** Your role on a board, adding it to your list when you came through its link. null: no access. */
  join(id: string): Promise<Role | null>;
  /** Take a shared board off your list. */
  leave(id: string): Promise<void>;
  get(id: string): Promise<ShareSettings>;
  setLink(id: string, visibility: Visibility, linkRole: MemberRole): Promise<void>;
  invite(id: string, email: string, role: MemberRole): Promise<void>;
  removeMember(id: string, email: string): Promise<void>;
  /** Hear about saves made by anyone (yourself included). Returns an unsubscribe function. */
  subscribe(id: string, onSave: (row: RemoteBoard) => void): () => void;
  /** Be present on a board as `userId`: see who else has it open, where their pointer is and what they are saying. */
  room(id: string, userId: string, on: RoomEvents): Room;
}

/** What other people see about you while you have a board open, looked up from your Google sign-in. */
export interface PeerInfo { userId: string; name: string; avatar?: string }
/** Someone with the board open right now, in one browser tab (`key`). */
export interface Peer extends PeerInfo { key: string }
/** A pointer on the board, in board coordinates; x null when it left the board. `text` is a comment typed next to it.
 *  `away`: that tab is in the background, so the person is still connected but not looking. */
export interface Cursor { x: number | null; y: number; text: string; away?: boolean }
/** Shapes someone is drawing, moving or typing right now. `els` is untrusted and not sanitized yet. */
export interface LiveEdit { els: unknown; done: boolean; dropped: string[] }
export interface RoomEvents { peers(list: Peer[]): void; cursor(key: string, c: Cursor): void; draw(key: string, e: LiveEdit): void }
export interface Room { move(c: Cursor): void; draw(els: SceneElement[], done: boolean, dropped: string[]): void; leave(): void }

// what arrives from other browsers is untrusted: keep only well-formed values
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
// only Google profile pictures: any other address would tell its server who has the board open
function googleAvatar(v: unknown): string | undefined {
  try {
    const u = new URL(str(v, 500));
    return u.protocol === 'https:' && /^lh[3-6]\.googleusercontent\.com$/.test(u.hostname) ? u.href : undefined;
  } catch { return undefined; }
}
function readCursor(payload: unknown): { key: string; c: Cursor } | null {
  if (!payload || typeof payload !== 'object') return null;
  const v = payload as Record<string, unknown>, key = str(v.key, 40), x = num(v.x), y = num(v.y);
  if (!key) return null;
  return { key, c: { x: x === null || y === null ? null : x, y: y ?? 0, text: str(v.text, MAX_COMMENT), away: v.away === true } };
}
export const MAX_COMMENT = 140;
// ms: a tab that went quiet this long is no longer shown. Browsers run a background tab's timers only
// about once a minute, so a person who switched tabs keeps beating, just slowly: give them room.
const HEARTBEAT = 10_000, STALE = 150_000;
const POLL = 5000; // ms between checks for new saves while live updates are down
// a channel that could not connect says why in the console, instead of the board silently going quiet
const report = (what: string) => (status: string, err?: Error) => {
  if (status !== 'SUBSCRIBED' && status !== 'CLOSED') console.warn('[scrawl live]', what, status, err?.message ?? '');
};

export interface Repo {
  kind: 'local' | 'cloud';
  /** newest first */
  list(): Promise<BoardRow[]>;
  get(id: string): Promise<BoardData | null>;
  create(board: { name: string; elements?: SceneElement[] }): Promise<BoardRow>;
  /** With `version`, the save only goes through if nobody else saved since; otherwise it throws ConflictError. */
  update(id: string, patch: { name?: string; elements?: SceneElement[] }, version?: number): Promise<Partial<BoardRow> & { id: string }>;
  remove(id: string): Promise<void>;
  folders(): Promise<Folder[]>;
  createFolder(name: string): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  removeFolder(id: string): Promise<void>;
  moveBoard(boardId: string, folderId: string | null): Promise<void>;
  sharing?: Sharing;
}

const store = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) || 'null') as T | null; } catch { return null; } },
  set(k: string, v: unknown): boolean { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k: string): void { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

// ---------- this browser (guest mode) ----------
interface LocalEntry { id: string; name: string; updated?: number; count?: number; folder?: string | null }
interface LegacyScene { elements?: unknown; view?: View }
const LIST = 'scrawl.boards', LEGACY = 'scrawl.scene.v1', FOLDERS = 'scrawl.folders';
const itemKey = (id: string) => 'scrawl.board.' + id;
const toRow = (b: LocalEntry): BoardRow => ({
  id: b.id, name: b.name, updated_at: new Date(b.updated || Date.now()).toISOString(), shape_count: b.count ?? 0,
  role: 'owner', folder_id: b.folder ?? null,
});

function localList(): LocalEntry[] {
  let list = store.get<LocalEntry[]>(LIST);
  if (!Array.isArray(list)) {
    list = [];
    const legacy = store.get<LegacyScene>(LEGACY); // a drawing saved before boards existed
    if (legacy && Array.isArray(legacy.elements)) {
      const b: LocalEntry = { id: uid(), name: 'My board', updated: Date.now(), count: legacy.elements.length };
      store.set(itemKey(b.id), { elements: legacy.elements });
      if (legacy.view) saveView(b.id, legacy.view);
      list = [b]; store.del(LEGACY);
    }
    store.set(LIST, list);
  }
  return list;
}
const localFolders = (): Folder[] => store.get<Folder[]>(FOLDERS) || [];

export const localRepo: Repo & { hasBoards(): boolean } = {
  kind: 'local',
  async list() { return localList().map(toRow).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); },
  async get(id) {
    const b = localList().find(x => x.id === id); if (!b) return null;
    const d = store.get<{ elements?: unknown }>(itemKey(id)) || {};
    return { id, name: b.name, elements: d.elements || [], role: 'owner' };
  },
  async create({ name, elements = [] }) {
    const list = localList(), b: LocalEntry = { id: uid(), name, updated: Date.now(), count: elements.length };
    if (!store.set(itemKey(b.id), { elements })) throw new Error('This browser is out of storage space.');
    list.unshift(b); store.set(LIST, list);
    return toRow(b);
  },
  async update(id, patch) {
    const list = localList(), b = list.find(x => x.id === id);
    if (!b) throw new Error('This board no longer exists.');
    if (patch.elements) {
      if (!store.set(itemKey(id), { elements: patch.elements })) throw new Error('This browser is out of storage space. Save the board to a file.');
      b.count = patch.elements.length;
    }
    if (patch.name) b.name = patch.name;
    b.updated = Date.now(); store.set(LIST, list);
    return toRow(b);
  },
  async remove(id) {
    store.set(LIST, localList().filter(x => x.id !== id)); store.del(itemKey(id)); store.del(viewKey(id));
  },
  async folders() { return localFolders(); },
  async createFolder(name) {
    const f = { id: uid(), name };
    store.set(FOLDERS, [...localFolders(), f]);
    return f;
  },
  async renameFolder(id, name) { store.set(FOLDERS, localFolders().map(f => (f.id === id ? { ...f, name } : f))); },
  async removeFolder(id) {
    store.set(FOLDERS, localFolders().filter(f => f.id !== id));
    store.set(LIST, localList().map(b => (b.folder === id ? { ...b, folder: null } : b)));
  },
  async moveBoard(boardId, folderId) {
    store.set(LIST, localList().map(b => (b.id === boardId ? { ...b, folder: folderId } : b)));
  },
  hasBoards() { return localList().some(b => (b.count ?? 0) > 0); },
};

// ---------- the signed-in person's account ----------
const ROW = 'id,name,updated_at,shape_count,version,visibility';
function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export function cloudRepo(supabase: SupabaseClient): Repo {
  const boards = () => supabase.from('boards');
  const folders = () => supabase.from('folders');
  const join = async (id: string) => check<string | null>(await supabase.rpc('join_board', { b: id })) as Role | null;

  return {
    kind: 'cloud',
    async list() { return check<BoardRow[]>(await supabase.rpc('list_boards')); },
    async get(id) {
      const role = await join(id);
      if (!role) return null;
      const data = check<Omit<BoardData, 'role'> | null>(await boards().select('id,name,elements,version').eq('id', id).maybeSingle());
      return data && { ...data, role };
    },
    async create({ name, elements = [] }) {
      const row = check<BoardRow>(await boards().insert({ name, elements }).select(ROW).single());
      return { ...row, role: 'owner', folder_id: null };
    },
    async update(id, patch, version) {
      let q = boards().update(patch).eq('id', id);
      if (version !== undefined) q = q.eq('version', version);
      const row = check<BoardRow | null>(await q.select(ROW).maybeSingle());
      if (!row) throw new ConflictError('Someone else changed this board.');
      return row;
    },
    async remove(id) { check(await boards().delete().eq('id', id)); store.del(viewKey(id)); },

    async folders() { return check<Folder[]>(await folders().select('id,name').order('name')); },
    async createFolder(name) { return check<Folder>(await folders().insert({ name }).select('id,name').single()); },
    async renameFolder(id, name) { check(await folders().update({ name }).eq('id', id)); },
    async removeFolder(id) { check(await folders().delete().eq('id', id)); }, // its boards fall back to "no folder"
    async moveBoard(boardId, folderId) {
      check(await supabase.from('user_boards').upsert({ board_id: boardId, folder_id: folderId }, { onConflict: 'user_id,board_id' }));
    },

    sharing: {
      join,
      async leave(id) { check(await supabase.rpc('leave_board', { b: id })); store.del(viewKey(id)); },
      async get(id) {
        const [b, m] = await Promise.all([
          boards().select('visibility,link_role').eq('id', id).single(),
          supabase.from('board_members').select('email,role').eq('board_id', id).order('created_at'),
        ]);
        const row = check<{ visibility: Visibility; link_role: MemberRole }>(b);
        return { ...row, members: check<Member[]>(m) };
      },
      async setLink(id, visibility, linkRole) {
        check(await boards().update({ visibility, link_role: linkRole }).eq('id', id));
      },
      async invite(id, email, role) {
        check(await supabase.from('board_members').upsert({ board_id: id, email: email.trim().toLowerCase(), role }, { onConflict: 'board_id,email' }));
      },
      async removeMember(id, email) { check(await supabase.from('board_members').delete().eq('board_id', id).eq('email', email)); },
      subscribe(id, onSave) {
        // while the live channel is down, look for new saves now and then, so nobody has to edit to see them
        let poll = 0, seen = -1, open = true;
        const check = async () => {
          const { data } = await boards().select('name,version').eq('id', id).maybeSingle();
          const row = data as { name: string; version: number } | null;
          if (row && row.version !== seen) { if (seen >= 0) onSave(row); seen = row.version; }
        };
        const channel = supabase.channel('board:' + id)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'boards', filter: 'id=eq.' + id },
            p => onSave(p.new as RemoteBoard))
          .subscribe((status, err) => {
            clearInterval(poll); poll = 0;
            if (status === 'SUBSCRIBED' || !open) return;
            if (status !== 'CLOSED') console.warn('[scrawl live] board updates', status, err?.message ?? '');
            void check(); poll = window.setInterval(() => void check(), POLL);
          });
        return () => { open = false; clearInterval(poll); void supabase.removeChannel(channel); };
      },
      // Who is here comes from one shared channel per board; what each person does travels on their
      // own channels, which the policies in schema.sql let only them send on. So a pointer, a comment,
      // a name or a face is only shown once that person's own channel has spoken. Shapes being drawn
      // go on a second channel per person ('draw:…') that only people who may edit can send on.
      room(id, userId, on) {
        const tab = uid(), topic = 'presence:' + id;
        let alive = true, ready = false, penReady = false, last: Cursor = { x: null, y: 0, text: '' };
        let present = new Set<string>();                               // user ids the shared channel lists
        const people = new Map<string, PeerInfo>(), asked = new Set<string>();
        const heard = new Map<string, { userId: string; at: number }>(); // tab → its person, when it last spoke
        const listening = new Map<string, ReturnType<typeof supabase.channel>[]>();

        const publish = () => {
          if (!alive) return;
          const now = Date.now();
          for (const [k, h] of heard) if (now - h.at > STALE || !present.has(h.userId)) heard.delete(k);
          on.peers([...heard].flatMap(([key, h]) => { const p = people.get(h.userId); return p ? [{ ...p, key }] : []; }));
        };
        const lookUp = async (ids: string[]) => {
          ids.forEach(i => asked.add(i));
          const { data, error } = await supabase.rpc('board_people', { b: id, ids });
          if (error) { ids.forEach(i => asked.delete(i)); return; } // ask again on the next change
          for (const r of (data ?? []) as { user_id: string; name: string | null; avatar: string | null }[]) {
            people.set(r.user_id, { userId: r.user_id, name: str(r.name, 60) || 'Someone', avatar: googleAvatar(r.avatar) });
          }
          publish();
        };
        const lookUpMissing = () => {
          const unknown = [...present].filter(u => !people.has(u) && !asked.has(u));
          if (unknown.length) void lookUp(unknown);
        };
        const listen = (u: string) => {
          const ch = supabase.channel(`${topic}:${u}`, { config: { private: true } })
            .on('broadcast', { event: 'cursor' }, ({ payload }) => {
              const m = readCursor(payload);
              if (!m || !alive) return;
              const k = u + ':' + m.key; // keys are per sender, so nobody can take over someone else's tab
              const isNew = !heard.has(k);
              heard.set(k, { userId: u, at: Date.now() });
              on.cursor(k, m.c);
              if (isNew) publish();
            })
            .on('broadcast', { event: 'bye' }, ({ payload }) => {
              const m = readCursor(payload);
              if (m && heard.delete(u + ':' + m.key)) publish();
            })
            .subscribe(report('pointer of ' + u));
          const drawing = supabase.channel(`draw:${id}:${u}`, { config: { private: true } })
            .on('broadcast', { event: 'draw' }, ({ payload }) => {
              const v = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
              const key = str(v.key, 40);
              if (!key || !alive || !Array.isArray(v.els)) return;
              const dropped = Array.isArray(v.dropped) ? v.dropped.filter((d): d is string => typeof d === 'string').slice(0, 1000) : [];
              on.draw(u + ':' + key, { els: v.els, done: v.done === true, dropped });
            })
            .subscribe(report('drawing of ' + u));
          listening.set(u, [ch, drawing]);
        };

        const mine = supabase.channel(`${topic}:${userId}`, { config: { private: true } })
          .subscribe((status, err) => { ready = status === 'SUBSCRIBED'; if (ready) move(last); else report('my pointer')(status, err); });
        const move = (c: Cursor) => {
          last = c;
          if (ready) void mine.send({ type: 'broadcast', event: 'cursor', payload: { key: tab, ...c } });
        };
        const pen = supabase.channel(`draw:${id}:${userId}`, { config: { private: true } })
          .subscribe((status, err) => { penReady = status === 'SUBSCRIBED'; if (!penReady) report('my drawing')(status, err); });
        const draw = (els: SceneElement[], done: boolean, dropped: string[]) => {
          if (penReady) void pen.send({ type: 'broadcast', event: 'draw', payload: { key: tab, els, done, dropped } });
        };
        // Realtime only sends the list of who is here to clients that ask for it with `enabled`
        const shared = supabase.channel(topic, { config: { private: true, presence: { key: tab, enabled: true } } });
        shared
          .on('presence', { event: 'sync' }, () => {
            const state = shared.presenceState<{ userId?: unknown }>();
            const ids = new Set(Object.values(state).flat().map(m => str(m.userId, 64))
              .filter(u => u !== userId && looksLikeBoardId(u))); // your other tabs are not other people
            const arrived = [...ids].filter(u => !present.has(u));
            present = ids;
            for (const u of ids) if (!listening.has(u)) listen(u);
            for (const [u, chs] of listening) if (!ids.has(u)) { chs.forEach(ch => void supabase.removeChannel(ch)); listening.delete(u); }
            lookUpMissing();
            if (arrived.length) setTimeout(() => move(last), 1000); // once they listen, show them where we are
            publish();
          })
          .subscribe((status, err) => { if (status === 'SUBSCRIBED') void shared.track({ userId }); else report('who is here')(status, err); });
        const beat = window.setInterval(() => { move(last); lookUpMissing(); publish(); }, HEARTBEAT); // names that failed to load: try again

        return {
          move, draw,
          leave() {
            alive = false; clearInterval(beat);
            if (ready) void mine.send({ type: 'broadcast', event: 'bye', payload: { key: tab } });
            ready = penReady = false;
            [shared, mine, pen, ...[...listening.values()].flat()].forEach(ch => void supabase.removeChannel(ch));
          },
        };
      },
    },
  };
}

/** A board link anyone you shared it with can open. */
export const boardLink = (id: string) => `${location.origin}${location.pathname}#${id}`;
export const looksLikeBoardId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Pan and zoom are per device, so they stay in this browser for both kinds of board.
const viewKey = (id: string) => 'scrawl.view.' + id;
export function loadView(id: string): View | null {
  return store.get<View>(viewKey(id)) ?? store.get<LegacyScene>(itemKey(id))?.view ?? null; // older guest boards kept the view with the drawing
}
export function saveView(id: string, view: View): void { store.set(viewKey(id), view); }

export interface Prefs { style?: Partial<Style>; grid?: boolean }
export const prefs = {
  get: (): Prefs => store.get<Prefs>('scrawl.prefs') || {},
  set: (v: Prefs) => store.set('scrawl.prefs', v),
  getFlag: <T = unknown>(k: string): T | null => store.get<T>('scrawl.flag.' + k),
  setFlag: (k: string, v: unknown) => store.set('scrawl.flag.' + k, v),
};
