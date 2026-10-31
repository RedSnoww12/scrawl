import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { UiIcons } from './icons';
import { prefs, type BoardRow as Board, type Folder } from '../lib/repos';

export function ago(ts: string | number): string {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}

/** A name that turns into a text field while it is being renamed. */
function NameField({ value, max, label, onDone }: { value: string; max: number; label: string; onDone: (name: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const name = ref.current?.value.trim().slice(0, max) || '';
    onDone(save && name && name !== value ? name : null);
  };
  return (
    <input ref={ref} className="b-input" aria-label={label} defaultValue={value} maxLength={max}
      onKeyDown={e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') { e.stopPropagation(); finish(false); } }}
      onBlur={() => finish(true)} />
  );
}

/** Two-step delete: the first click arms it, the second (within 3 s) confirms. */
function ConfirmButton({ label, confirm, onConfirm }: { label: string; confirm: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return armed
    ? <button className="chip danger armed" onClick={onConfirm}>{confirm}</button>
    : <button className="chip danger" onClick={() => setArmed(true)}>{label}</button>;
}

const roleText = { owner: 'Owner', edit: 'can edit', view: 'view only' } as const;

interface Actions {
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onLeave: (id: string) => void;
  onShare: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void;
}
interface RowProps extends Actions { board: Board; current: boolean; folders: Folder[]; cloud: boolean }

function BoardRow({ board, current, folders, cloud, onOpen, onRename, onDelete, onLeave, onShare, onMove }: RowProps) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const n = board.shape_count ?? 0, mine = board.role === 'owner';
  const meta: ReactNode = mine
    ? <>{n} {n === 1 ? 'shape' : 'shapes'} · edited {ago(board.updated_at)}{board.visibility === 'link' && <span className="b-tag" title="Anyone with the link can open it">{UiIcons.link} link</span>}</>
    : <>{board.owner_name || board.owner_email || 'Shared'} · {roleText[board.role]} · {ago(board.updated_at)}</>;
  return (
    <li className="board-row" aria-current={current}>
      <div className="row-main">
        {renaming ? (
          <NameField value={board.name} max={80} label="Board name" onDone={name => { setRenaming(false); if (name) onRename(board.id, name); }} />
        ) : (
          <button className="board-open" onClick={() => onOpen(board.id)}>
            <span className="b-name">{!mine && <span className="b-shared" title="Shared with you">{UiIcons.users}</span>}{board.name}</span>
            <span className="b-meta">{meta}</span>
          </button>
        )}
        <button className="icon-btn" aria-label={`Actions for ${board.name}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>{UiIcons.more}</button>
      </div>
      {open && (
        <div className="row-actions">
          {board.role !== 'view' && <button className="chip" onClick={() => { setOpen(false); setRenaming(true); }}>Rename</button>}
          {cloud && <button className="chip" onClick={() => { setOpen(false); onShare(board.id); }}>{mine ? 'Share…' : 'Copy link'}</button>}
          <label className="chip select-chip">
            {UiIcons.folder}
            <select aria-label="Folder" value={board.folder_id || ''} onChange={e => { setOpen(false); onMove(board.id, e.target.value || null); }}>
              <option value="">No folder</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          {mine
            ? <ConfirmButton label="Delete" confirm="Delete?" onConfirm={() => onDelete(board.id)} />
            : <ConfirmButton label="Remove from my list" confirm="Remove?" onConfirm={() => onLeave(board.id)} />}
        </div>
      )}
    </li>
  );
}

interface FolderProps { folder: Folder; count: number; collapsed: boolean; searching: boolean; onToggle: () => void; onRename: (name: string) => void; onDelete: () => void; children: ReactNode }

function FolderGroup({ folder, count, collapsed, searching, onToggle, onRename, onDelete, children }: FolderProps) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  return (
    <li className="folder">
      <div className="row-main folder-head">
        {renaming ? (
          <NameField value={folder.name} max={60} label="Folder name" onDone={name => { setRenaming(false); if (name) onRename(name); }} />
        ) : (
          <button className="folder-toggle" disabled={searching} aria-expanded={!collapsed} onClick={onToggle}>
            <span className="chev" data-collapsed={collapsed}>{UiIcons.chevron}</span>
            {UiIcons.folder}<span className="f-name">{folder.name}</span><span className="f-count">{count}</span>
          </button>
        )}
        <button className="icon-btn" aria-label={`Actions for folder ${folder.name}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>{UiIcons.more}</button>
      </div>
      {open && (
        <div className="row-actions">
          <button className="chip" onClick={() => { setOpen(false); setRenaming(true); }}>Rename</button>
          <ConfirmButton label="Delete folder" confirm="Delete? Boards stay" onConfirm={() => { setOpen(false); onDelete(); }} />
        </div>
      )}
      {!collapsed && <ul className="folder-list">{children}{!count && <li className="b-empty">Empty. Move a board here from its ⋯ menu.</li>}</ul>}
    </li>
  );
}

type Filter = 'all' | 'mine' | 'shared';

interface PanelProps extends Actions {
  panelRef: RefObject<HTMLDivElement | null>; boards: Board[]; folders: Folder[]; currentId?: string; cloud: boolean; loading: boolean;
  onNew: () => void;
  onNewFolder: (name: string) => void; onRenameFolder: (id: string, name: string) => void; onDeleteFolder: (id: string) => void;
}

export function BoardsPanel({ panelRef, boards, folders, currentId, cloud, loading, onNew, onNewFolder, onRenameFolder, onDeleteFolder, ...actions }: PanelProps) {
  const [filter, setFilter] = useState<Filter>(() => (cloud && prefs.getFlag<Filter>('board-filter')) || 'all');
  const [collapsed, setCollapsed] = useState<string[]>(() => prefs.getFlag<string[]>('folders-collapsed') || []);
  const [naming, setNaming] = useState(false);
  const [search, setSearch] = useState('');
  const pickFilter = (f: Filter) => { setFilter(f); prefs.setFlag('board-filter', f); };
  const toggle = (id: string) => setCollapsed(c => {
    const next = c.includes(id) ? c.filter(x => x !== id) : [...c, id];
    prefs.setFlag('folders-collapsed', next);
    return next;
  });

  const sharedCount = boards.filter(b => b.role !== 'owner').length;
  const query = search.trim().toLowerCase();
  const shown = boards.filter(b => (filter === 'all' || (filter === 'mine') === (b.role === 'owner')) && b.name.toLowerCase().includes(query));
  const known = new Set(folders.map(f => f.id));
  const loose = shown.filter(b => !b.folder_id || !known.has(b.folder_id));
  const row = (b: Board) => <BoardRow key={b.id} board={b} current={b.id === currentId} folders={folders} cloud={cloud} {...actions} />;

  return (
    <div className="island" id="boardsPanel" ref={panelRef}>
      <div className="bp-head">
        <h2>Boards</h2>
        <div className="bp-head-actions">
          <button className="icon-btn" aria-label="New folder" title="New folder" onClick={() => setNaming(true)}>{UiIcons.folderPlus}</button>
          <button className="btn small primary" onClick={onNew}>New board</button>
        </div>
      </div>
      {cloud && (
        <div className="seg bp-filter" role="tablist" aria-label="Show">
          {([['all', 'All'], ['mine', 'Mine'], ['shared', `Shared${sharedCount ? ` · ${sharedCount}` : ''}`]] as const).map(([f, label]) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => pickFilter(f)}>{label}</button>
          ))}
        </div>
      )}
      <label className="bp-search">
        <span>Search boards</span>
        <input type="search" value={search} placeholder="Board name" onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setSearch(''); } }} />
      </label>
      <ul id="boardList">
        {naming && (
          <li className="folder"><div className="row-main folder-head">
            <NameField value="" max={60} label="New folder name" onDone={name => { setNaming(false); if (name) onNewFolder(name); }} />
          </div></li>
        )}
        {folders.map(f => {
          const inside = shown.filter(b => b.folder_id === f.id);
          if ((filter !== 'all' || query) && !inside.length) return null;
          return (
            <FolderGroup key={f.id} folder={f} count={inside.length} collapsed={!query && collapsed.includes(f.id)} searching={!!query} onToggle={() => toggle(f.id)}
              onRename={name => onRenameFolder(f.id, name)} onDelete={() => onDeleteFolder(f.id)}>
              {inside.map(row)}
            </FolderGroup>
          );
        })}
        {folders.length > 0 && loose.length > 0 && <li className="bp-section">Not in a folder</li>}
        {loose.map(row)}
        {loading && !boards.length && <li className="b-empty">Loading your boards…</li>}
        {!loading && query && !shown.length && <li className="b-empty">No boards match your search.</li>}
        {!loading && !query && filter === 'shared' && !sharedCount && (
          <li className="b-empty">Nothing shared with you yet. When someone shares a board with your Google address or sends you its link, it shows up here.</li>
        )}
      </ul>
      <p className="hint-text bp-foot">
        {cloud ? 'Saved to your account. Use Share to invite people or turn on a link.' : 'Kept in this browser only. Sign in with Google to keep boards online and share them.'}
      </p>
    </div>
  );
}
