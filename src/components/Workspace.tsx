import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { createEngine, type Engine, type EngineCommand, type Snapshot } from '../engine/engine';
import { DEFAULT_STYLE, sampleScene, sanitizeElements, type SceneElement } from '../engine/scene';
import { localRepo, loadView, saveView, prefs, type BoardRow, type Repo } from '../lib/repos';
import { Toolbar, PropsPanel, Footer, useOutside } from './Chrome';
import { BoardsPanel } from './Boards';
import { ExportDialog, HelpDialog, Toast, download } from './Dialogs';
import { AccountButton } from './Account';
import { UiIcons } from './icons';
import { HINTS } from './config';
import { toggleTheme, isDark } from '../lib/theme';

type SaveState = 'saved' | 'saving' | 'error' | 'local';
type Popover = 'menu' | 'boards' | null;
type Dialog = 'export' | 'help' | null;
interface Current { id: string; name: string }
interface Pending { id: string; elements: SceneElement[] }

const EMPTY_SNAP: Snapshot = {
  tool: 'selection', locked: false, zoom: 1, grid: false, editing: false, canUndo: false, canRedo: false,
  selectionCount: 0, selectedTypes: [], values: DEFAULT_STYLE, style: DEFAULT_STYLE, isEmpty: true,
};
const SAVE_LABEL: Record<SaveState, string> = { saved: 'Saved', saving: 'Saving…', error: 'Not saved, retrying', local: 'In this browser' };
const slug = (name?: string) => (name || 'drawing').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'drawing';
const byNewest = (list: BoardRow[]) => [...list].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface WorkspaceProps { repo: Repo; user: User | null; onSignIn: () => void; onSignOut: () => void }

export default function Workspace({ repo, user, onSignIn, onSignOut }: WorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null), editorRef = useRef<HTMLTextAreaElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [snap, setSnap] = useState<Snapshot>(EMPTY_SNAP);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [save, setSave] = useState<{ state: SaveState; error: string }>({ state: repo.kind === 'cloud' ? 'saved' : 'local', error: '' });
  const [popover, setPopover] = useState<Popover>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [stylesOpen, setStylesOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [clearArmed, setClearArmed] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const [, setThemeTick] = useState(0);

  const currentRef = useRef<Current | null>(null), pendingRef = useRef<Pending | null>(null);
  const timerRef = useRef(0), chainRef = useRef<Promise<void>>(Promise.resolve());
  const fileRef = useRef<HTMLInputElement>(null), imageRef = useRef<HTMLInputElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const boardsBtnRef = useRef<HTMLButtonElement>(null), boardsRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<(cmd: EngineCommand) => void>(() => {});
  const isCloud = repo.kind === 'cloud';

  const toastTimer = useRef(0);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg); clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 2800);
  }, []);

  // ---------- saving ----------
  // Edits queue up and go out one request at a time, so a slow save never lands after a newer one.
  const flush = useCallback((): Promise<void> => {
    clearTimeout(timerRef.current);
    chainRef.current = chainRef.current.then(async () => {
      const p = pendingRef.current;
      if (!p) return;
      pendingRef.current = null;
      try {
        const row = await repo.update(p.id, { elements: p.elements });
        setBoards(bs => byNewest(bs.map(b => (b.id === row.id ? row : b))));
        setSave(s => (pendingRef.current ? s : { state: isCloud ? 'saved' : 'local', error: '' }));
      } catch (e) {
        if (!pendingRef.current) pendingRef.current = p; // keep the newest copy for the retry
        setSave({ state: 'error', error: message(e) });
        clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(flush, 5000);
      }
    });
    return chainRef.current;
  }, [repo, isCloud]);

  const queueSave = useCallback((els: SceneElement[]) => {
    const cur = currentRef.current; if (!cur) return;
    pendingRef.current = { id: cur.id, elements: els };
    if (isCloud) setSave({ state: 'saving', error: '' });
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, isCloud ? 900 : 250);
  }, [flush, isCloud]);
  const queueSaveRef = useRef(queueSave);
  queueSaveRef.current = queueSave;

  // ---------- boards ----------
  const openBoard = useCallback(async (id: string, eng: Engine | null = engine) => {
    if (!eng) return;
    eng.flushText();
    await flush();
    let data;
    try { data = await repo.get(id); } catch (e) { toast(`Could not open the board: ${message(e)}`); return; }
    if (!data) { toast('That board no longer exists.'); return; }
    currentRef.current = { id: data.id, name: data.name };
    setCurrent({ id: data.id, name: data.name });
    eng.load({ elements: data.elements, view: loadView(data.id) });
    prefs.setFlag('active-' + repo.kind, data.id);
    try { if (location.hash.slice(1) !== data.id) history.replaceState(null, '', '#' + data.id); } catch { /* sandboxed */ }
    document.title = `${data.name} · Scrawl`;
    setPopover(null);
  }, [engine, flush, repo, toast]);

  const nextName = (list: BoardRow[]) => { let n = list.length + 1; while (list.some(b => b.name === `Board ${n}`)) n++; return `Board ${n}`; };
  const newBoard = useCallback(async (name?: string, elements: SceneElement[] = []): Promise<BoardRow | undefined> => {
    try {
      const row = await repo.create({ name: name || nextName(boards), elements });
      setBoards(bs => byNewest([row, ...bs]));
      await openBoard(row.id);
      return row;
    } catch (e) { toast(`Could not create the board: ${message(e)}`); }
  }, [repo, boards, openBoard, toast]);

  const renameBoard = useCallback(async (id: string, name: string) => {
    try {
      const row = await repo.update(id, { name });
      setBoards(bs => byNewest(bs.map(b => (b.id === id ? row : b))));
      if (currentRef.current?.id === id) {
        currentRef.current.name = name;
        setCurrent(c => (c ? { ...c, name } : c));
        document.title = `${name} · Scrawl`;
      }
    } catch (e) { toast(`Could not rename: ${message(e)}`); }
  }, [repo, toast]);

  const deleteBoard = useCallback(async (id: string) => {
    const b = boards.find(x => x.id === id);
    try {
      if (currentRef.current?.id === id) { pendingRef.current = null; clearTimeout(timerRef.current); }
      await repo.remove(id);
      const rest = boards.filter(x => x.id !== id);
      setBoards(rest);
      toast(`Deleted “${b?.name || 'board'}”`);
      if (currentRef.current?.id === id) {
        currentRef.current = null;
        if (rest.length) await openBoard(rest[0].id); else await newBoard('Board 1');
      }
    } catch (e) { toast(`Could not delete: ${message(e)}`); }
  }, [boards, repo, openBoard, newBoard, toast]);

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
  commandRef.current = cmd => {
    switch (cmd.type) {
      case 'toast': return toast(cmd.message);
      case 'style': prefs.set({ style: cmd.style, grid: cmd.grid }); return;
      case 'pick-image': return imageRef.current?.click();
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
    setEngine(eng);
    document.fonts?.ready.then(() => eng.remeasureText());
    return () => eng.destroy();
  }, []);

  // first load: list boards, make a welcome board for a brand-new account, open the right one
  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setLoadError('');
      try {
        let list = await repo.list();
        if (!list.length) list = [await repo.create({ name: 'Welcome board', elements: sampleScene() })];
        if (cancelled) return;
        setBoards(byNewest(list));
        const want = location.hash.slice(1), last = prefs.getFlag<string>('active-' + repo.kind);
        const id = list.some(b => b.id === want) ? want : list.some(b => b.id === last) && last ? last : list[0].id;
        await openBoard(id, engine);
        if (isCloud && user && localRepo.hasBoards() && !prefs.getFlag('imported-' + user.id)) setImportCount((await localRepo.list()).length);
      } catch (e) { if (!cancelled) setLoadError(message(e)); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, repo]);

  useEffect(() => { engine?.setReadOnly(!!loadError); }, [engine, loadError]);

  useEffect(() => {
    const onHash = () => { const id = location.hash.slice(1); if (id && id !== currentRef.current?.id && boards.some(b => b.id === id)) void openBoard(id); };
    const onHide = () => { if (document.visibilityState === 'hidden') { engine?.flushText(); void flush(); } };
    const onLeave = (e: BeforeUnloadEvent) => { if (pendingRef.current) { void flush(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('hashchange', onHash);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onLeave);
    return () => { window.removeEventListener('hashchange', onHash); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', onLeave); };
  }, [boards, engine, flush, openBoard]);

  const refs = useMemo(() => ({ menu: [menuBtnRef, menuRef], boards: [boardsBtnRef, boardsRef] }), []);
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

  return (
    <div className={stylesOpen ? 'props-open' : undefined} style={{ height: '100%' }}>
      <canvas id="board" ref={canvasRef} aria-label="Drawing canvas" />
      <textarea id="editor" ref={editorRef} hidden spellCheck={false} aria-label="Edit text" />

      <div id="topbar">
        <div className="island brand">
          <button ref={menuBtnRef} className="icon-btn" aria-label="Menu" aria-expanded={popover === 'menu'}
            onClick={() => setPopover(p => (p === 'menu' ? null : 'menu'))}>{UiIcons.menu}</button>
          <span className="brand-name">Scrawl</span>
          <button ref={boardsBtnRef} className="board-btn" aria-expanded={popover === 'boards'} title="Switch board"
            onClick={() => setPopover(p => (p === 'boards' ? null : 'boards'))}>
            <span>{current?.name || (loading ? 'Loading…' : 'Board')}</span>{UiIcons.chevron}
          </button>
          <span className="save-chip" data-state={save.state} title={save.error || saveLabel}>{saveLabel}</span>
        </div>
        {engine && <Toolbar snap={snap} engine={engine} />}
        <div className="right-cluster">
          <AccountButton user={user} onSignIn={onSignIn} onSignOut={async () => { engine?.flushText(); await flush(); onSignOut(); }} />
        </div>
      </div>

      {popover === 'menu' && engine && (
        <div className="island" id="menu" ref={menuRef}>
          {menuItem('Open file…', 'Ctrl O', () => { setPopover(null); fileRef.current?.click(); })}
          {menuItem('Save to file', 'Ctrl S', () => { setPopover(null); saveFile(); })}
          {menuItem('Export image…', 'Ctrl ⇧ E', () => { setPopover(null); commandRef.current({ type: 'export' }); })}
          {menuItem('Insert image', '9', () => { setPopover(null); imageRef.current?.click(); })}
          <hr />
          {menuItem(snap.grid ? 'Hide grid' : 'Show grid', 'G', () => engine.toggleGrid())}
          {menuItem(isDark() ? 'Light mode' : 'Dark mode', '⇧ Alt D', () => commandRef.current({ type: 'theme' }))}
          {menuItem('Keyboard shortcuts', '?', () => { setPopover(null); setDialog('help'); })}
          <hr />
          {menuItem(clearArmed ? 'Click again to erase everything' : 'Clear canvas', null, () => {
            if (!clearArmed) return setClearArmed(true);
            setClearArmed(false); setPopover(null); engine.clear(); toast('Canvas cleared. Ctrl Z brings it back.');
          }, 'danger')}
        </div>
      )}

      {popover === 'boards' && (
        <BoardsPanel panelRef={boardsRef} boards={boards} currentId={current?.id} cloud={isCloud} loading={loading}
          onOpen={id => (id === current?.id ? setPopover(null) : void openBoard(id))}
          onNew={async () => { const r = await newBoard(); if (r) toast('New board ready'); }}
          onRename={renameBoard} onDelete={deleteBoard} />
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

      {engine && <PropsPanel snap={snap} engine={engine} />}
      {engine && (
        <Footer snap={snap} engine={engine} hint={snap.editing ? 'Esc or click outside to finish writing' : HINTS[snap.tool] || ''}
          stylesOpen={stylesOpen} onToggleStyles={() => setStylesOpen(o => !o)} onHelp={() => setDialog('help')} />
      )}

      {dialog === 'export' && engine && (
        <ExportDialog engine={engine} hasSelection={snap.selectionCount > 0} fileName={slug(current?.name)} onClose={() => setDialog(null)} toast={toast} />
      )}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}

      <input type="file" ref={fileRef} accept=".scrawl,.json,application/json" hidden
        onChange={e => { void openFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input type="file" ref={imageRef} accept="image/*" hidden
        onChange={e => { engine?.insertImage(e.target.files?.[0]); e.target.value = ''; }} />
      <Toast message={toastMsg} />
    </div>
  );
}
