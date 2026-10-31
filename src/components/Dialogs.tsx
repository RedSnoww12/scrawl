import { useEffect, useRef, useState, type ReactNode } from 'react';
import { UiIcons } from './icons';
import { HELP } from './config';
import type { Engine } from '../engine/engine';

interface ModalProps { title: string; onClose: () => void; width?: number; children: ReactNode }

export function Modal({ title, onClose, width, children }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal" data-modal-open="true" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="island dialog" role="dialog" aria-label={title} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <header><h2>{title}</h2><button ref={closeRef} className="icon-btn" aria-label="Close" onClick={onClose}>{UiIcons.close}</button></header>
        {children}
      </div>
    </div>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" width={680} onClose={onClose}>
      <div className="help">
        {HELP.map(([a, k]) => (k ? <div key={a}><span>{a}</span><kbd>{k}</kbd></div> : <h4 key={a}>{a}</h4>))}
      </div>
    </Modal>
  );
}

export function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

interface ExportProps { engine: Engine; hasSelection: boolean; fileName: string; onClose: () => void; toast: (msg: string) => void }

export function ExportDialog({ engine, hasSelection, fileName, onClose, toast }: ExportProps) {
  const [bg, setBg] = useState(true);
  const [onlySel, setOnlySel] = useState(hasSelection);
  const [scale, setScale] = useState(2);
  const [preview, setPreview] = useState('');
  const opts = { background: bg, onlySelected: onlySel, scale };
  useEffect(() => {
    const c = engine.exportCanvas({ background: bg, onlySelected: onlySel, scale });
    setPreview(c ? c.toDataURL('image/png') : '');
  }, [engine, bg, onlySel, scale]);
  const png = () => engine.exportCanvas(opts)?.toBlob(b => { if (b) { download(b, fileName + '.png'); toast(`Exported ${fileName}.png`); } });
  const svg = () => { const s = engine.exportSvg(opts); if (s) { download(new Blob([s], { type: 'image/svg+xml' }), fileName + '.svg'); toast(`Exported ${fileName}.svg`); } };
  const copy = () => {
    const c = engine.exportCanvas(opts); if (!c) return;
    const blocked = () => toast('This browser blocked image copying. Use Download PNG instead.');
    try {
      const blob = new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('empty')))));
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => toast('Copied the image'), blocked);
    } catch { blocked(); }
  };
  return (
    <Modal title="Export image" onClose={onClose}>
      <div className="preview">{preview ? <img src={preview} alt="Preview of the exported drawing" /> : <span>Nothing to export yet</span>}</div>
      <div className="opts">
        <label><input type="checkbox" id="expBg" checked={bg} onChange={e => setBg(e.target.checked)} /> Paper background</label>
        <label><input type="checkbox" id="expSel" checked={onlySel} disabled={!hasSelection} onChange={e => setOnlySel(e.target.checked)} /> Only selected</label>
        <label>Scale <select id="expScale" value={scale} onChange={e => setScale(+e.target.value)}><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option></select></label>
      </div>
      <div className="actions">
        <button className="btn primary" onClick={png}>Download PNG</button>
        <button className="btn" onClick={svg}>Download SVG</button>
        <button className="btn" onClick={copy}>Copy PNG</button>
      </div>
    </Modal>
  );
}

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div id="toast" role="status">{message}</div>;
}
