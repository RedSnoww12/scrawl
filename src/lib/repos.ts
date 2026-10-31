// Two places boards can live, behind one interface.
import { uid } from '../engine/scene';
import type { SceneElement, Style, View } from '../engine/scene';
import type { SupabaseClient } from './supabase';

/** One line in the board list. */
export interface BoardRow { id: string; name: string; updated_at: string; shape_count: number }
/** A board with its drawing. */
export interface BoardData { id: string; name: string; elements: unknown }

export interface Repo {
  kind: 'local' | 'cloud';
  /** newest first */
  list(): Promise<BoardRow[]>;
  get(id: string): Promise<BoardData | null>;
  create(board: { name: string; elements?: SceneElement[] }): Promise<BoardRow>;
  update(id: string, patch: { name?: string; elements?: SceneElement[] }): Promise<BoardRow>;
  remove(id: string): Promise<void>;
}

const store = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) || 'null') as T | null; } catch { return null; } },
  set(k: string, v: unknown): boolean { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k: string): void { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

// ---------- this browser (guest mode) ----------
interface LocalEntry { id: string; name: string; updated?: number; count?: number }
interface LegacyScene { elements?: unknown; view?: View }
const LIST = 'scrawl.boards', LEGACY = 'scrawl.scene.v1';
const itemKey = (id: string) => 'scrawl.board.' + id;
const toRow = (b: LocalEntry): BoardRow => ({ id: b.id, name: b.name, updated_at: new Date(b.updated || Date.now()).toISOString(), shape_count: b.count ?? 0 });

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

export const localRepo: Repo & { hasBoards(): boolean } = {
  kind: 'local',
  async list() { return localList().map(toRow).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); },
  async get(id) {
    const b = localList().find(x => x.id === id); if (!b) return null;
    const d = store.get<{ elements?: unknown }>(itemKey(id)) || {};
    return { id, name: b.name, elements: d.elements || [] };
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
  hasBoards() { return localList().some(b => (b.count ?? 0) > 0); },
};

// ---------- the signed-in person's account ----------
const ROW = 'id,name,updated_at,shape_count';
function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export function cloudRepo(supabase: SupabaseClient): Repo {
  const boards = () => supabase.from('boards');
  return {
    kind: 'cloud',
    async list() { return check<BoardRow[]>(await boards().select(ROW).order('updated_at', { ascending: false })); },
    async get(id) { return check<BoardData | null>(await boards().select('id,name,elements').eq('id', id).maybeSingle()); },
    async create({ name, elements = [] }) { return check<BoardRow>(await boards().insert({ name, elements }).select(ROW).single()); },
    async update(id, patch) { return check<BoardRow>(await boards().update(patch).eq('id', id).select(ROW).single()); },
    async remove(id) { check(await boards().delete().eq('id', id)); store.del(viewKey(id)); },
  };
}

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
