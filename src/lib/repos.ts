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
  /** Be present on a board: see who else has it open, where their pointer is and what they are saying. */
  room(id: string, me: PeerInfo, on: RoomEvents): Room;
}

/** What other people see about you while you have a board open. */
export interface PeerInfo { userId: string; name: string; avatar?: string }
/** Someone with the board open right now, in one browser tab (`key`). */
export interface Peer extends PeerInfo { key: string }
/** A pointer on the board, in board coordinates; x null when it left the board. `text` is a comment typed next to it. */
export interface Cursor { x: number | null; y: number; text: string }
export interface RoomEvents { peers(list: Peer[]): void; cursor(key: string, c: Cursor): void }
export interface Room { move(c: Cursor): void; leave(): void }

// what arrives from other browsers is untrusted: keep only well-formed values
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
function readPeer(key: string, v: Record<string, unknown>): Peer | null {
  const userId = str(v.userId, 64), avatar = str(v.avatar, 500);
  if (!userId) return null;
  return { key, userId, name: str(v.name, 60) || 'Someone', avatar: avatar.startsWith('https://') ? avatar : undefined };
}
function readCursor(v: Record<string, unknown>): { key: string; c: Cursor } | null {
  const key = str(v.key, 40), x = num(v.x), y = num(v.y);
  if (!key) return null;
  return { key, c: { x: x === null || y === null ? null : x, y: y ?? 0, text: str(v.text, MAX_COMMENT) } };
}
export const MAX_COMMENT = 140;

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
        const channel = supabase.channel('board:' + id)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'boards', filter: 'id=eq.' + id },
            p => onSave(p.new as RemoteBoard))
          .subscribe();
        return () => { void supabase.removeChannel(channel); };
      },
      // A private channel per board: the policies in schema.sql let in only people who can open it.
      room(id, me, on) {
        const key = uid();
        let ready = false;
        const channel = supabase.channel('presence:' + id, { config: { private: true, presence: { key } } });
        channel
          .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState<Record<string, unknown>>();
            on.peers(Object.entries(state).flatMap(([k, metas]) => {
              const p = k !== key && metas[0] ? readPeer(k, metas[0]) : null;
              return p && p.userId !== me.userId ? [p] : []; // your other tabs are not other people
            }));
          })
          .on('broadcast', { event: 'cursor' }, ({ payload }) => {
            const m = payload && typeof payload === 'object' ? readCursor(payload as Record<string, unknown>) : null;
            if (m) on.cursor(m.key, m.c);
          })
          .subscribe(status => {
            ready = status === 'SUBSCRIBED';
            if (ready) void channel.track({ ...me });
          });
        return {
          move(c) { if (ready) void channel.send({ type: 'broadcast', event: 'cursor', payload: { key, ...c } }); },
          leave() { ready = false; void supabase.removeChannel(channel); },
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
