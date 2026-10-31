import { useEffect, type RefObject } from 'react';
import { ToolIcons, UiIcons, PropIcons } from './icons';
import { TOOLS, PANEL } from './config';
import type { Engine, Snapshot } from '../engine/engine';
import type { ElementType, Style, StyleKey } from '../engine/scene';

// Close a popover on any pointer press outside it (and outside its trigger).
export function useOutside(open: boolean, refs: RefObject<HTMLElement | null>[], onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (!refs.some(r => r.current && r.current.contains(e.target as Node))) onClose(); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [open, onClose, refs]);
}

interface EngineProps { snap: Snapshot; engine: Engine }

export function Toolbar({ snap, engine }: EngineProps) {
  return (
    <div className="island" id="tools" role="toolbar" aria-label="Tools">
      {TOOLS.map((t, i) => {
        if (!t) return <span className="sep" key={'sep' + i} />;
        const [id, label, key] = t;
        return (
          <button key={id} className="icon-btn" aria-label={label} title={`${label} — ${key}`}
            aria-pressed={snap.tool === id} onClick={() => engine.setTool(id)}>
            {ToolIcons[id]}
          </button>
        );
      })}
      <button className="icon-btn" aria-label="Keep tool active after drawing" title="Keep tool active — Q"
        aria-pressed={snap.locked} onClick={() => engine.toggleLock()}>
        {snap.locked ? ToolIcons.lock : ToolIcons.unlock}
      </button>
    </div>
  );
}

export function PropsPanel({ snap, engine }: EngineProps) {
  const types: ElementType[] = snap.selectionCount ? snap.selectedTypes
    : snap.tool === 'selection' || snap.tool === 'hand' || snap.tool === 'eraser' || snap.tool === 'image' ? [] : [snap.tool];
  if (!types.length) return null;
  const v = snap.values;
  // the panel lists keys of several value types; each control only ever sends its own key's values
  const set = (key: StyleKey, val: Style[StyleKey], record = true) => engine.setStyle(key, val as never, record);
  return (
    <aside className="island" id="props" aria-label="Shape properties">
      {PANEL.filter(p => types.some(p.applies)).map(p => (
        <section key={p.key}>
          <h3>{p.label}</h3>
          {p.kind === 'swatch' && (
            <div className="swatches">
              {p.values.map(c => (
                <button key={c} className={'swatch' + (c === 'transparent' ? ' none' : '')} style={c === 'transparent' ? undefined : { background: c }}
                  aria-label={c === 'transparent' ? 'No background' : c} title={c === 'transparent' ? 'None' : c}
                  aria-pressed={v[p.key] === c} onClick={() => set(p.key, c)} />
              ))}
              <label className="swatch custom" title="Custom color">
                <input type="color" id={`custom-${p.key}`} aria-label={`Custom ${p.label.toLowerCase()} color`}
                  value={/^#[0-9a-f]{6}$/i.test(v[p.key]) ? v[p.key] : '#000000'}
                  onInput={e => set(p.key, e.currentTarget.value, false)} onChange={e => set(p.key, e.currentTarget.value)} />
              </label>
            </div>
          )}
          {p.kind === 'seg' && (
            <div className="seg">
              {p.values.map(([val, label, icon, text]) => (
                <button key={String(val)} aria-label={label} title={label} aria-pressed={String(v[p.key]) === String(val)}
                  onClick={() => set(p.key, val)}>
                  {icon ? PropIcons[icon] : text}
                </button>
              ))}
            </div>
          )}
          {p.kind === 'range' && (
            <div className="range-row">
              <input type="range" id="opacity" min="10" max="100" step="5" aria-label="Opacity" value={v.opacity ?? 100}
                onInput={e => set('opacity', +e.currentTarget.value, false)} onChange={e => set('opacity', +e.currentTarget.value)} />
              <span>{v.opacity ?? 100}%</span>
            </div>
          )}
        </section>
      ))}
      {snap.selectionCount > 0 && (
        <>
          <section>
            <h3>Layers</h3>
            <div className="seg">
              <button aria-label="Send to back" title="Send to back — Ctrl ⇧ [" onClick={() => engine.layer('back')}>{PropIcons.back}</button>
              <button aria-label="Send backward" title="Send backward — Ctrl [" onClick={() => engine.layer('backward')}>{PropIcons.backward}</button>
              <button aria-label="Bring forward" title="Bring forward — Ctrl ]" onClick={() => engine.layer('forward')}>{PropIcons.forward}</button>
              <button aria-label="Bring to front" title="Bring to front — Ctrl ⇧ ]" onClick={() => engine.layer('front')}>{PropIcons.front}</button>
            </div>
          </section>
          <section>
            <h3>Actions</h3>
            <div className="seg">
              <button aria-label="Duplicate" title="Duplicate — Ctrl D" onClick={() => engine.duplicate()}>{PropIcons.dup}</button>
              <button aria-label="Group" title="Group — Ctrl G" onClick={() => engine.group()}>{PropIcons.group}</button>
              <button aria-label="Ungroup" title="Ungroup — Ctrl ⇧ G" onClick={() => engine.ungroup()}>{PropIcons.ungroup}</button>
              <button aria-label="Delete" title="Delete — Del" onClick={() => engine.deleteSel()}>{PropIcons.del}</button>
            </div>
          </section>
        </>
      )}
    </aside>
  );
}

interface FooterProps extends EngineProps { hint: string; stylesOpen: boolean; onToggleStyles: () => void; onHelp: () => void }

export function Footer({ snap, engine, hint, stylesOpen, onToggleStyles, onHelp }: FooterProps) {
  return (
    <div id="footer">
      <div className="cluster">
        <div className="island">
          <button className="icon-btn" aria-label="Zoom out" onClick={() => engine.zoomOut()}>{UiIcons.minus}</button>
          <button id="zoomLabel" title="Reset zoom" onClick={() => engine.resetZoom()}>{Math.round(snap.zoom * 100)}%</button>
          <button className="icon-btn" aria-label="Zoom in" onClick={() => engine.zoomIn()}>{UiIcons.plus}</button>
        </div>
        <div className="island">
          <button className="icon-btn" aria-label="Undo" disabled={!snap.canUndo} onClick={() => engine.undo()}>{UiIcons.undo}</button>
          <button className="icon-btn" aria-label="Redo" disabled={!snap.canRedo} onClick={() => engine.redo()}>{UiIcons.redo}</button>
        </div>
      </div>
      <div id="hint">{hint}</div>
      <div className="island" style={{ display: 'flex', padding: 2 }}>
        <button className="icon-btn" id="styleBtn" aria-label="Show style options" aria-pressed={stylesOpen} onClick={onToggleStyles}>{UiIcons.palette}</button>
        <button className="icon-btn" aria-label="Keyboard shortcuts" onClick={onHelp}>{UiIcons.help}</button>
      </div>
    </div>
  );
}
