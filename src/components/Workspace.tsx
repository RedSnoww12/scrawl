import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { createEngine, type Engine, type EngineCommand, type Snapshot } from '../engine/engine';
import { DEFAULT_STYLE, sampleScene, sanitizeElements, type SceneElement } from '../engine/scene';
import {
  ConflictError, localRepo, loadView, looksLikeBoardId, saveView, prefs,
  type BoardRow, type Folder, type RemoteBoard, type Repo, type Role,
} from '../lib/repos';
import { mergeScenes } from '../lib/merge';
import { Toolbar, PropsPanel, Footer, useOutside } from './Chrome';
import { BoardsPanel } from './Boards';
import { ShareDialog } from './Share';
import { ExportDialog, HelpDialog, Toast, download } from './Dialogs';
import { AccountButton } from './Account';
import { CursorLayer, PeerStack, useRoom } from './Presence';
import { UiIcons } from './icons';
import { HINTS } from './config';
import { toggleTheme, isDark } from '../lib/theme';

type SaveState = 'saved' | 'saving' | 'error' | 'local' | 'readonly';
type Popover = 'menu' | 'boards' | null;
type Dialog = 'export' | 'help' | null;
interface Current { id: string; name: string; role: Role }
/** Unsaved edits, with the server copy they were made on top of. */
interface Pending { id: string; elements: SceneElement[]; base: SceneElement[]; version?: number }

const EMPTY_SNAP: Snapshot = {
  tool: 'selection', locked: false, zoom: 1, grid: false, editing: false, canUndo: false, canRedo: false,
  selectionCount: 0, selectedTypes: [], values: DEFAULT_STYLE, style: DEFAULT_STYLE, isEmpty: true, readOnly: false,
};
const SAVE_LABEL: Record<SaveState, string> = { saved: 'Saved', saving: 'Saving…', error: 'Not saved, retrying', local: 'In this browser', readonly: 'View only' };
const slug = (name?: string) => (name || 'drawing').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'drawing';
const byNewest = (list: BoardRow[]) => [...list].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
const byName = (list: Folder[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const same = (a: SceneElement[], b: SceneElement[]) => JSON.stringify(a) === JSON.stringify(b);

interface WorkspaceProps { repo: Repo; user: User | null; onSignIn: () => void; onSignOut: () => void }

export default function Workspace({ repo, user, onSignIn, onSignOut }: WorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null), editorRef = useRef<HTMLTextAreaElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [snap, setSnap] = useState<Snapshot>(EMPTY_SNAP);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [save, setSave] = useState<{ state: SaveState; error: string }>({ state: repo.kind === 'cloud' ? 'saved' : 'local', error: '' });
  const [popover, setPopover] = useState<Popover>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [stylesOpen, setStylesOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [clearArmed, setClearArmed] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const [, setThemeTick] = useState(0);

  const currentRef = useRef<Current | null>(null), pendingRef = useRef<Pending | null>(null);
  const engineRef = useRef<Engine | null>(null), boardsRef = useRef<BoardRow[]>([]);
  // the last copy of the open board known to be on the server: what local edits are merged against
  const baseRef = useRef<SceneElement[]>([]), versionRef = useRef<number | undefined>(undefined);
  const timerRef = useRef(0), chainRef = useRef<Promise<void>>(Promise.resolve());
  const fileRef = useRef<HTMLInputElement>(null), imageRef = useRef<HTMLInputElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const boardsBtnRef = useRef<HTMLButtonElement>(null), boardsPanelRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<(cmd: EngineCommand) => void>(() => {});
  const lostRef = useRef<(id: string) => void>(() => {});
  const isCloud = repo.kind === 'cloud';
  const sharing = repo.sharing;
  boardsRef.current = boards;

  const toastTimer = useRef(0);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg); clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 3200);
  }, []);
  const okState = (): SaveState => (currentRef.current?.role === 'view' ? 'readonly' : isCloud ? 'saved' : 'local');

  // ---------- merging other people's edits ----------
  // Someone else saved `remote`: keep their changes, put this person's unsaved ones back on top.
  const rebase = useCallback((id: string, remote: SceneElement[], version: number | undefined, name?: string) => {
    const eng = engineRef.current, cur = currentRef.current;
    if (!eng || cur?.id !== id) return;
    const local = eng.getElements();
    const merged = mergeScenes(baseRef.current, local, remote);
    baseRef.current = remote; versionRef.current = version;
    if (!same(merged, local)) eng.applyRemote(merged);
    const p = pendingRef.current;
    if (p?.id === id) pendingRef.current = { id, elements: merged, base: remote, version };
    else if (!same(merged, remote)) pendingRef.current = { id, elements: merged, base: remote, version };
    if (name && name !== cur.name) {
      cur.name = name; setCurrent({ ...cur }); document.title = `${name} · Scrawl`;
    }
    setBoards(bs => bs.map(b => (b.id === id ? { ...b, name: name || b.name, version, shape_count: remote.length } : b)));
  }, []);

  // ---------- saving ----------
  // Edits queue up and go out one request at a time, so a slow save never lands after a newer one.
  // A save made on top of an outdated copy is refused by the server; then we merge and try again.
  const flush = useCallback((): Promise<void> => {
    clearTimeout(timerRef.current);
    chainRef.current = chainRef.current.then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const p = pendingRef.current;
        if (!p) return;
        pendingRef.current = null;
        try {
          const row = await repo.update(p.id, { elements: p.elements }, isCloud ? p.version : undefined);
          if (currentRef.current?.id === p.id && (versionRef.current ?? 0) <= (row.version ?? 0)) {
            baseRef.current = p.elements; versionRef.current = row.version;
          }
          const next = pendingRef.current as Pending | null; // edits made while this one was on its way
          if (next?.id === p.id) pendingRef.current = { ...next, base: p.elements, version: row.version };
          setBoards(bs => byNewest(bs.map(b => (b.id === row.id ? { ...b, ...row } : b))));
          setSave(s => (pendingRef.current ? s : { state: okState(), error: '' }));
          return;
        } catch (e) {
          if (e instanceof ConflictError) {
            let fresh;
            try { fresh = await repo.get(p.id); } catch (err) { e = err; fresh = undefined; }
            if (fresh === null) { lostRef.current(p.id); return; }
            if (fresh) {
              const remote = sanitizeElements(fresh.elements);
              const newest = (pendingRef.current as Pending | null)?.id === p.id ? pendingRef.current! : p;
              if (currentRef.current?.id === p.id) {
                if (fresh.role === 'view') { lostRef.current(p.id); return; }
                pendingRef.current = newest;
                rebase(p.id, remote, fresh.version, fresh.name);
                if (!pendingRef.current) pendingRef.current = { id: p.id, elements: engineRef.current?.getElements() ?? newest.elements, base: remote, version: fresh.version };
              } else {
                pendingRef.current = { id: p.id, elements: mergeScenes(newest.base, newest.elements, remote), base: remote, version: fresh.version };
              }
              continue;
            }
          }
          if (!pendingRef.current) pendingRef.current = p; // keep the newest copy for the retry
          setSave({ state: 'error', error: message(e) });
          clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(flush, 5000);
          return;
        }
      }
      timerRef.current = window.setTimeout(flush, 1500); // busy board: give the others a moment
    });
    return chainRef.current;
  }, [repo, isCloud, rebase]); // eslint-disable-line react-hooks/exhaustive-deps

  const queueSave = useCallback((els: SceneElement[]) => {
    const cur = currentRef.current; if (!cur || cur.role === 'view') return;
    const prev = pendingRef.current?.id === cur.id ? pendingRef.current : null;
    pendingRef.current = { id: cur.id, elements: els, base: prev?.base ?? baseRef.current, version: prev ? prev.version : versionRef.current };
    if (isCloud) setSave({ state: 'saving', error: '' });
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, isCloud ? 700 : 250);
  }, [flush, isCloud]);
  const queueSaveRef = useRef(queueSave);
  queueSaveRef.current = queueSave;

  // ---------- boards ----------
  /** Opens a board; false when it does not exist or is not shared with this person. */
  const openBoard = useCallback(async (id: string, eng: Engine | null = engine): Promise<boolean> => {
    if (!eng) return false;
    eng.flushText();
    await flush();
    let data;
    try { data = await repo.get(id); } catch (e) { toast(`Could not open the board: ${message(e)}`); return false; }
    if (!data) return false;
    const els = sanitizeElements(data.elements);
    currentRef.current = { id: data.id, name: data.name, role: data.role };
    baseRef.current = els; versionRef.current = data.version;
    setCurrent({ ...currentRef.current });
    eng.load({ elements: els, view: loadView(data.id) });
    setSave({ state: okState(), error: '' });
    prefs.setFlag('active-' + repo.kind, data.id);
    try { if (location.hash.slice(1) !== data.id) history.replaceState(null, '', '#' + data.id); } catch { /* sandboxed */ }
    document.title = `${data.name} · Scrawl`;
    setPopover(null);
    return true;
  }, [engine, flush, repo, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshList = useCallback(async () => {
    try { setBoards(byNewest(await repo.list())); } catch { /* keep the list we have */ }
  }, [repo]);

  /** Opens a board from a link: one of ours, or one someone shared. */
  const openFromLink = useCallback(async (id: string, eng: Engine | null = engine): Promise<boolean> => {
    const known = boardsRef.current.some(b => b.id === id);
    if (!known && !sharing) { toast('Sign in with Google to open boards shared with you.'); return false; }
    const ok = await openBoard(id, eng);
    if (!ok) toast(user?.email ? `That board was deleted or isn't shared with ${user.email}. Ask its owner to invite this address or turn on its link.` : 'That board no longer exists.');
    else if (!known) { await refreshList(); toast('Added to “Shared with me”'); }
    return ok;
  }, [engine, sharing, openBoard, refreshList, toast, user?.email]);

  const nextName = (list: BoardRow[]) => { let n = list.length + 1; while (list.some(b => b.name === `Board ${n}`)) n++; return `Board ${n}`; };
  const newBoard = useCallback(async (name?: string, elements: SceneElement[] = []): Promise<BoardRow | undefined> => {
    try {
      const row = await repo.create({ name: name || nextName(boards.filter(b => b.role === 'owner')), elements });
      setBoards(bs => byNewest([row, ...bs]));
      await openBoard(row.id);
      return row;
    } catch (e) { toast(`Could not create the board: ${message(e)}`); }
  }, [repo, boards, openBoard, toast]);

  /** Opens something else after the current board went away. */
  const openAnother = useCallback(async (rest: BoardRow[]) => {
    currentRef.current = null; setCurrent(null); pendingRef.current = null;
    const next = rest.find(b => b.role === 'owner') || rest[0];
    if (next) await openBoard(next.id); else await newBoard('Board 1');
  }, [openBoard, newBoard]);

  // the board was deleted, unshared, or turned view-only while we had unsaved edits
  lostRef.current = (id: string) => {
    const b = boardsRef.current.find(x => x.id === id);
    if (pendingRef.current?.id === id) pendingRef.current = null;
    setSave({ state: okState(), error: '' });
    void (async () => {
      const fresh = await repo.get(id).catch(() => undefined);
      if (fresh && currentRef.current?.id === id) {
        // still there, just view-only now: show the owner's copy
        currentRef.current = { id, name: fresh.name, role: fresh.role };
        setCurrent({ ...currentRef.current });
        baseRef.current = sanitizeElements(fresh.elements); versionRef.current = fresh.version;
        engineRef.current?.applyRemote(baseRef.current);
        setSave({ state: okState(), error: '' });
        toast('You can only view this board now. Your last changes were not saved.');
        return;
      }
      const rest = boardsRef.current.filter(x => x.id !== id);
      setBoards(rest);
      toast(`“${b?.name || 'This board'}” was deleted or is no longer shared with you.`);
      if (currentRef.current?.id === id) await openAnother(rest);
    })();
  };

  const renameBoard = useCallback(async (id: string, name: string) => {
    try {
      const row = await repo.update(id, { name });
      setBoards(bs => byNewest(bs.map(b => (b.id === id ? { ...b, ...row } : b))));
      if (currentRef.current?.id === id) {
        currentRef.current.name = name;
        setCurrent(c => (c ? { ...c, name } : c));
        document.title = `${name} · Scrawl`;
      }
    } catch (e) { toast(`Could not rename: ${message(e)}`); }
  }, [repo, toast]);

  const dropBoard = useCallback(async (id: string, how: 'delete' | 'leave') => {
    const b = boards.find(x => x.id === id);
    try {
      if (currentRef.current?.id === id) { pendingRef.current = null; clearTimeout(timerRef.current); }
      if (how === 'delete') await repo.remove(id); else await sharing?.leave(id);
      const rest = boards.filter(x => x.id !== id);
      setBoards(rest);
      toast(how === 'delete' ? `Deleted “${b?.name || 'board'}”` : `Removed “${b?.name || 'board'}” from your list`);
      if (currentRef.current?.id === id) await openAnother(rest);
    } catch (e) { toast(`Could not ${how === 'delete' ? 'delete' : 'remove'}: ${message(e)}`); }
  }, [boards, repo, sharing, openAnother, toast]);

  // ---------- folders ----------
  const folderOp = useCallback(async (work: () => Promise<void>, failed: string) => {
    try { await work(); } catch (e) { toast(`${failed}: ${message(e)}`); }
  }, [toast]);
  const createFolder = (name: string) => folderOp(async () => {
    const f = await repo.createFolder(name); setFolders(fs => byName([...fs, f]));
  }, 'Could not create the folder');
  const renameFolder = (id: string, name: string) => folderOp(async () => {
    await repo.renameFolder(id, name); setFolders(fs => byName(fs.map(f => (f.id === id ? { ...f, name } : f))));
  }, 'Could not rename the folder');
  const deleteFolder = (id: string) => folderOp(async () => {
    await repo.removeFolder(id);
    setFolders(fs => fs.filter(f => f.id !== id));
    setBoards(bs => bs.map(b => (b.folder_id === id ? { ...b, folder_id: null } : b)));
  }, 'Could not delete the folder');
  const moveBoard = (id: string, folderId: string | null) => folderOp(async () => {
    await repo.moveBoard(id, folderId);
    setBoards(bs => bs.map(b => (b.id === id ? { ...b, folder_id: folderId } : b)));
    const f = folders.find(x => x.id === folderId);
    toast(f ? `Moved to “${f.name}”` : 'Taken out of its folder');
  }, 'Could not move the board');

  // ---------- files ----------
  const saveFile = useCallback(() => {
    if (!engine) return;
    const name = currentRef.current?.name || 'Drawing';
    const blob = new Blob([JSON.stringify({ type: 'scrawl', version: 1, name, elements: engine.getElements() }, null, 1)], { type: 'application/json' });
    download(blob, slug(name) + '.scrawl.json'); toast(`Saved ${slug(name)}.scrawl.json`);
  }, [engine, toast]);
  const openFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text()) as { name?: unknown; elements?: unknown } | null;
      if (!d || !Array.isArray(d.elements)) throw new Error('not a scene');
      const name = String(d.name || file.name.replace(/(\.scrawl)?(\.json)?$/i, '')).slice(0, 80) || 'Imported board';
      const row = await newBoard(name, sanitizeElements(d.elements));
      if (row) toast(`Opened “${name}” as a new board`);
    } catch { toast('That file is not a Scrawl board. Choose a .scrawl.json file saved from Scrawl.'); }
  }, [newBoard, toast]);

  // ---------- engine ----------
  const readOnly = current?.role === 'view' || !!loadError;
  commandRef.current = cmd => {
    switch (cmd.type) {
      case 'toast': return toast(cmd.message);
      case 'style': prefs.set({ style: cmd.style, grid: cmd.grid }); return;
      case 'pick-image': return readOnly ? undefined : imageRef.current?.click();
      case 'pick-file': return fileRef.current?.click();
      case 'open-file': void openFile(cmd.file); return;
      case 'save-file': return saveFile();
      case 'export': return snap.isEmpty ? toast('Draw something first, then export it.') : setDialog('export');
      case 'help': return setDialog('help');
      case 'theme': toggleTheme(); return setThemeTick(t => t + 1);
      case 'escape': case 'canvas-pointerdown': setPopover(null); return setClearArmed(false);
    }
  };

  useEffect(() => {
    const p = prefs.get();
    const eng = createEngine({
      canvas: canvasRef.current!, editor: editorRef.current!, style: p.style,
      onChange: setSnap,
      onCommit: els => queueSaveRef.current(els),
      onView: v => { if (currentRef.current) saveView(currentRef.current.id, v); },
      onCommand: cmd => commandRef.current(cmd),
    });
    if (p.grid) eng.setGrid(true);
    engineRef.current = eng;
    setEngine(eng);
    document.fonts?.ready.then(() => eng.remeasureText());
    return () => { engineRef.current = null; eng.destroy(); };
  }, []);

  // first load: list boards and folders, make a welcome board for a brand-new account, open the right one
  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setLoadError('');
      try {
        let [list, fs] = await Promise.all([repo.list(), repo.folders()]);
        if (!list.some(b => b.role === 'owner')) list = [await repo.create({ name: 'Welcome board', elements: sampleScene() }), ...list];
        if (cancelled) return;
        setBoards(byNewest(list)); setFolders(byName(fs));
        boardsRef.current = list;
        const want = location.hash.slice(1), last = prefs.getFlag<string>('active-' + repo.kind);
        let opened = false;
        if (want && !list.some(b => b.id === want) && looksLikeBoardId(want)) opened = await openFromLink(want, engine);
        if (!opened) {
          const id = list.some(b => b.id === want) ? want : list.some(b => b.id === last) && last ? last : list[0].id;
          await openBoard(id, engine);
        }
        if (isCloud && user && localRepo.hasBoards() && !prefs.getFlag('imported-' + user.id)) setImportCount((await localRepo.list()).length);
      } catch (e) { if (!cancelled) setLoadError(message(e)); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, repo]);

  useEffect(() => { engine?.setReadOnly(readOnly); }, [engine, readOnly]);

  // live edits from the other people on this board
  const currentId = current?.id;
  const room = useRoom(engine, sharing, loadError ? undefined : currentId, user);
  useEffect(() => {
    if (!engine || !currentId || !sharing) return;
    let alive = true;
    const onSave = async (row: RemoteBoard) => {
      if (!alive || (versionRef.current !== undefined && row.version <= versionRef.current)) return; // our own save, or old news
      let elements = row.elements, version = row.version;
      if (elements === undefined) { // too big to travel with the notice: fetch it
        const fresh = await repo.get(currentId).catch(() => undefined);
        if (!fresh) return;
        elements = fresh.elements; version = fresh.version ?? version;
      }
      if (alive) rebase(currentId, sanitizeElements(elements), version, row.name);
    };
    const stop = sharing.subscribe(currentId, row => void onSave(row));
    return () => { alive = false; stop(); };
  }, [engine, currentId, sharing, repo, rebase]);

  useEffect(() => {
    const onHash = () => {
      const id = location.hash.slice(1);
      if (!id || id === currentRef.current?.id) return;
      if (boardsRef.current.some(b => b.id === id)) void openBoard(id);
      else if (looksLikeBoardId(id)) void openFromLink(id);
    };
    const onHide = () => { if (document.visibilityState === 'hidden') { engine?.flushText(); void flush(); } };
    const onLeave = (e: BeforeUnloadEvent) => { if (pendingRef.current) { void flush(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('hashchange', onHash);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onLeave);
    return () => { window.removeEventListener('hashchange', onHash); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', onLeave); };
  }, [engine, flush, openBoard, openFromLink]);

  const refs = useMemo(() => ({ menu: [menuBtnRef, menuRef], boards: [boardsBtnRef, boardsPanelRef] }), []);
  useOutside(popover === 'menu', refs.menu, () => { setPopover(null); setClearArmed(false); });
  useOutside(popover === 'boards', refs.boards, () => setPopover(null));
  useEffect(() => { if (!clearArmed) return; const t = setTimeout(() => setClearArmed(false), 3000); return () => clearTimeout(t); }, [clearArmed]);

  const importLocal = async () => {
    if (!user) return;
    const list = await localRepo.list();
    let n = 0;
    for (const b of list) {
      const d = await localRepo.get(b.id);
      const els = d ? sanitizeElements(d.elements) : [];
      if (!d || !els.length) continue;
      try { const row = await repo.create({ name: d.name, elements: els }); setBoards(bs => byNewest([row, ...bs])); n++; }
      catch (e) { toast(`Stopped copying: ${message(e)}`); break; }
    }
    prefs.setFlag('imported-' + user.id, true); setImportCount(0);
    toast(`Copied ${n} ${n === 1 ? 'board' : 'boards'} to your account`);
  };

  const menuItem = (label: ReactNode, kbd: string | null, onClick: () => void, cls?: string) => (
    <button className={cls} onClick={onClick}>{label} {kbd && <kbd>{kbd}</kbd>}</button>
  );
  const saveLabel = SAVE_LABEL[save.state];
  const currentRow = boards.find(b => b.id === current?.id);
  const shareRow = shareId ? boards.find(b => b.id === shareId) : undefined;

  return (
    <div className={stylesOpen ? 'props-open' : undefined} style={{ height: '100%' }}>
      <canvas id="board" ref={canvasRef} aria-label="Drawing canvas" />
      {engine && user && <CursorLayer engine={engine} room={room} me={user.id} />}
      <textarea id="editor" ref={editorRef} hidden spellCheck={false} aria-label="Edit text" />

      <div id="topbar">
        <div className="island brand">
          <button ref={menuBtnRef} className="icon-btn" aria-label="Menu" aria-expanded={popover === 'menu'}
            onClick={() => setPopover(p => (p === 'menu' ? null : 'menu'))}>{UiIcons.menu}</button>
          <span className="brand-name">Scrawl</span>
          <button ref={boardsBtnRef} className="board-btn" aria-expanded={popover === 'boards'} title="Switch board"
            onClick={() => setPopover(p => (p === 'boards' ? null : 'boards'))}>
            {current && current.role !== 'owner' && <span className="b-shared" title="Shared with you">{UiIcons.users}</span>}
            <span>{current?.name || (loading ? 'Loading…' : 'Board')}</span>{UiIcons.chevron}
          </button>
          <span className="save-chip" data-state={save.state} title={save.error || (save.state === 'readonly' ? 'The owner shared this board as view only' : saveLabel)}>{saveLabel}</span>
        </div>
        {engine && !readOnly && <Toolbar snap={snap} engine={engine} />}
        <div className="right-cluster">
          <PeerStack room={room} />
          {sharing && currentRow && (
            <button className="btn share-btn" onClick={() => setShareId(currentRow.id)}>
              {currentRow.role === 'owner' ? UiIcons.share : UiIcons.link}<span>{currentRow.role === 'owner' ? 'Share' : 'Link'}</span>
            </button>
          )}
          <AccountButton user={user} onSignIn={onSignIn} onSignOut={async () => { engine?.flushText(); await flush(); onSignOut(); }} />
        </div>
      </div>

      {popover === 'menu' && engine && (
        <div className="island" id="menu" ref={menuRef}>
          {menuItem('Open file…', 'Ctrl O', () => { setPopover(null); fileRef.current?.click(); })}
          {menuItem('Save to file', 'Ctrl S', () => { setPopover(null); saveFile(); })}
          {menuItem('Export image…', 'Ctrl ⇧ E', () => { setPopover(null); commandRef.current({ type: 'export' }); })}
          {!readOnly && menuItem('Insert image', '9', () => { setPopover(null); imageRef.current?.click(); })}
          <hr />
          {menuItem(snap.grid ? 'Hide grid' : 'Show grid', 'G', () => engine.toggleGrid())}
          {menuItem(isDark() ? 'Light mode' : 'Dark mode', '⇧ Alt D', () => commandRef.current({ type: 'theme' }))}
          {menuItem('Keyboard shortcuts', '?', () => { setPopover(null); setDialog('help'); })}
          {!readOnly && <hr />}
          {!readOnly && menuItem(clearArmed ? 'Click again to erase everything' : 'Clear canvas', null, () => {
            if (!clearArmed) return setClearArmed(true);
            setClearArmed(false); setPopover(null); engine.clear(); toast('Canvas cleared. Ctrl Z brings it back.');
          }, 'danger')}
        </div>
      )}

      {popover === 'boards' && (
        <BoardsPanel panelRef={boardsPanelRef} boards={boards} folders={folders} currentId={current?.id} cloud={isCloud} loading={loading}
          onOpen={id => (id === current?.id ? setPopover(null) : void openBoard(id))}
          onNew={async () => { const r = await newBoard(); if (r) toast('New board ready'); }}
          onRename={renameBoard} onDelete={id => dropBoard(id, 'delete')} onLeave={id => dropBoard(id, 'leave')}
          onShare={id => { setPopover(null); setShareId(id); }} onMove={moveBoard}
          onNewFolder={createFolder} onRenameFolder={renameFolder} onDeleteFolder={deleteFolder} />
      )}

      {importCount > 0 && user && (
        <div className="island banner" role="status">
          <p>This browser has {importCount} {importCount === 1 ? 'board' : 'boards'} from before you signed in. Copy {importCount === 1 ? 'it' : 'them'} to your account?</p>
          <div className="actions">
            <button className="btn small primary" onClick={importLocal}>Copy</button>
            <button className="btn small" onClick={() => { prefs.setFlag('imported-' + user.id, true); setImportCount(0); }}>Not now</button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="island banner" role="alert">
          <p>Could not load your boards: {loadError}</p>
          <div className="actions"><button className="btn small primary" onClick={() => location.reload()}>Try again</button></div>
        </div>
      )}

      {engine && !readOnly && <PropsPanel snap={snap} engine={engine} />}
      {engine && (
        <Footer snap={snap} engine={engine}
          hint={readOnly ? (current?.role === 'view' ? 'View only: drag to look around, scroll to zoom' : '') : snap.editing ? 'Esc or click outside to finish writing' : HINTS[snap.tool] || ''}
          stylesOpen={stylesOpen} onToggleStyles={() => setStylesOpen(o => !o)} onHelp={() => setDialog('help')} />
      )}

      {dialog === 'export' && engine && (
        <ExportDialog engine={engine} hasSelection={snap.selectionCount > 0} fileName={slug(current?.name)} onClose={() => setDialog(null)} toast={toast} />
      )}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {shareRow && sharing && (
        <ShareDialog board={shareRow} sharing={sharing} me={user?.email || ''} toast={toast} onClose={() => setShareId(null)}
          onVisibility={v => setBoards(bs => bs.map(b => (b.id === shareRow.id ? { ...b, visibility: v } : b)))} />
      )}

      <input type="file" ref={fileRef} accept=".scrawl,.json,application/json" hidden
        onChange={e => { void openFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input type="file" ref={imageRef} accept="image/*" hidden
        onChange={e => { engine?.insertImage(e.target.files?.[0]); e.target.value = ''; }} />
      <Toast message={toastMsg} />
    </div>
  );
}
