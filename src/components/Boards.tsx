import { useEffect, useRef, useState, type RefObject } from 'react';
import { UiIcons } from './icons';
import type { BoardRow as Board } from '../lib/repos';

export function ago(ts: string | number): string {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}

interface RowProps { board: Board; current: boolean; onOpen: (id: string) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void }

function BoardRow({ board, current, onOpen, onRename, onDelete }: RowProps) {
  const [renaming, setRenaming] = useState(false);
  const [armed, setArmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (renaming) { inputRef.current?.focus(); inputRef.current?.select(); } }, [renaming]);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  const finish = (save: boolean) => {
    if (!renaming || !inputRef.current) return;
    setRenaming(false);
    const name = inputRef.current.value.trim().slice(0, 80);
    if (save && name && name !== board.name) onRename(board.id, name);
  };
  const n = board.shape_count ?? 0;
  return (
    <li className="board-row" aria-current={current}>
      {renaming ? (
        <input ref={inputRef} className="b-input" id={'rename-' + board.id} aria-label="Board name" defaultValue={board.name} maxLength={80}
          onKeyDown={e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') { e.stopPropagation(); finish(false); } }}
          onBlur={() => finish(true)} />
      ) : (
        <button className="board-open" onClick={() => onOpen(board.id)}>
          <span className="b-name">{board.name}</span>
          <span className="b-meta">{n} {n === 1 ? 'shape' : 'shapes'} · edited {ago(board.updated_at)}</span>
        </button>
      )}
      <button className="icon-btn" aria-label="Rename board" title="Rename" onClick={() => setRenaming(true)}>{UiIcons.pencil}</button>
      {armed
        ? <button className="icon-btn armed" aria-label="Confirm delete" onClick={() => onDelete(board.id)}>Delete?</button>
        : <button className="icon-btn" aria-label="Delete board" title="Delete" onClick={() => setArmed(true)}>{UiIcons.trash}</button>}
    </li>
  );
}

interface PanelProps extends Omit<RowProps, 'board' | 'current'> {
  panelRef: RefObject<HTMLDivElement | null>; boards: Board[]; currentId?: string; cloud: boolean; loading: boolean; onNew: () => void;
}

export function BoardsPanel({ panelRef, boards, currentId, cloud, loading, onOpen, onNew, onRename, onDelete }: PanelProps) {
  return (
    <div className="island" id="boardsPanel" ref={panelRef}>
      <div className="bp-head">
        <h2>{cloud ? 'Your boards' : 'Boards'}</h2>
        <button className="btn small primary" onClick={onNew}>New board</button>
      </div>
      <ul id="boardList">
        {boards.map(b => (
          <BoardRow key={b.id} board={b} current={b.id === currentId} onOpen={onOpen} onRename={onRename} onDelete={onDelete} />
        ))}
        {loading && !boards.length && <li className="b-meta" style={{ padding: '8px 10px' }}>Loading your boards…</li>}
      </ul>
      <p className="hint-text bp-foot">
        {cloud ? 'Saved to your account. Only you can see these boards.' : 'Kept in this browser only. Sign in with Google to keep boards online.'}
      </p>
    </div>
  );
}
