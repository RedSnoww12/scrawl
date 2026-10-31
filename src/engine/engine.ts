// The interactive canvas: owns the scene, the view, selection, history and input.
// React talks to it through the returned API and hears back through the callbacks.
import rough from 'roughjs';
import {
  ACCENT, GRID, LH, PAPER, SHAPES, DEFAULT_STYLE, isLinear, uid, rand, clamp, bounds, unionBounds, pad, hit,
  measure, makeEl, drawEl, cacheImage, sanitizeElements, exportCanvas, exportSvg,
} from './scene';
import type { Bounds, ElementType, ExportOptions, Point, SceneElement, Style, StyleKey, Tool, Vec, View } from './scene';

export const TOOL_KEYS: Record<string, Tool> = {
  v: 'selection', 1: 'selection', h: 'hand', r: 'rectangle', 2: 'rectangle', d: 'diamond', 3: 'diamond', o: 'ellipse', 4: 'ellipse',
  a: 'arrow', 5: 'arrow', l: 'line', 6: 'line', p: 'freedraw', 7: 'freedraw', t: 'text', 8: 'text', 9: 'image', e: 'eraser', 0: 'eraser',
};
const RESIZE_CURSORS: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="6" fill="white" stroke="black" stroke-width="1.5"/></svg>')}") 10 10, auto`;
const isField = (t: EventTarget | null): boolean =>
  t instanceof Element && t.matches('input, textarea, select, [contenteditable="true"]');

export type LayerOp = 'front' | 'back' | 'forward' | 'backward';

/** What the interface needs to render; sent after every change. */
export interface Snapshot {
  tool: Tool; locked: boolean; zoom: number; grid: boolean; editing: boolean;
  canUndo: boolean; canRedo: boolean;
  selectionCount: number; selectedTypes: ElementType[];
  values: Style; style: Style; isEmpty: boolean; readOnly: boolean;
}

/** Requests the engine cannot handle itself. */
export type EngineCommand =
  | { type: 'toast'; message: string }
  | { type: 'style'; style: Style; grid: boolean }
  | { type: 'pick-image' } | { type: 'pick-file' } | { type: 'open-file'; file: File }
  | { type: 'save-file' } | { type: 'export' } | { type: 'help' } | { type: 'theme' }
  | { type: 'escape' } | { type: 'canvas-pointerdown' };

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  editor: HTMLTextAreaElement;
  style?: Partial<Style>;
  onChange?: (snap: Snapshot) => void;
  onCommit?: (elements: SceneElement[]) => void;
  /**
   * The shapes being drawn, moved, resized or typed right now, many times a second, so other
   * people can watch. `done` comes once at the end with the final shapes; `dropped` are ids that
   * were in the gesture but are gone (a click too small to keep, a label left empty).
   */
  onLive?: (elements: SceneElement[], done: boolean, dropped: string[]) => void;
  onView?: (view: View) => void;
  onCommand?: (cmd: EngineCommand) => void;
}

type Handle = { name: string; x: number; y: number };
type Drag =
  | { mode: 'pan'; cx: number; cy: number; sx: number; sy: number }
  | { mode: 'create'; el: SceneElement; start: Vec }
  | { mode: 'move'; start: Vec; orig: Map<string, Vec>; moved: boolean }
  | { mode: 'resize'; h: string; start: Vec; B0: Bounds; orig: Map<string, SceneElement>; changed: boolean }
  | { mode: 'point'; el: SceneElement; idx: number; changed: boolean }
  | { mode: 'box'; start: Vec; cur: Vec; base: Set<string> }
  | { mode: 'erase' };

export function createEngine({ canvas, editor: ta, style: initialStyle, onChange, onCommit, onLive, onView, onCommand }: EngineOptions) {
  const ctx = canvas.getContext('2d')!;
  const rc = rough.canvas(canvas);
  let elements: SceneElement[] = [];
  const st = {
    tool: 'selection' as Tool, locked: false, zoom: 1, sx: 0, sy: 0, sel: new Set<string>(), grid: false,
    style: { ...DEFAULT_STYLE, ...initialStyle } as Style,
  };
  let drag: Drag | null = null;
  let pinch: { d0: number; z0: number; mid: Vec } | null = null;
  let editing: SceneElement | null = null;
  let spaceDown = false, readOnly = false;
  let lastWorld: Vec = { x: 200, y: 200 };
  const pointers = new Map<number, Vec>(), erasing = new Set<string>();
  const byId = (id: string) => elements.find(e => e.id === id);
  const selected = () => elements.filter(e => st.sel.has(e.id));
  const touch = (el: SceneElement) => { el.v = (el.v || 0) + 1; };
  const toast = (message: string) => onCommand?.({ type: 'toast', message });
  const hitTest = (p: Vec): SceneElement | null => {
    for (let i = elements.length - 1; i >= 0; i--) if (elements[i] !== editing && hit(elements[i], p, st.zoom)) return elements[i];
    return null;
  };
  const groupOf = (el: SceneElement): string[] => {
    const g = el.groupIds?.[el.groupIds.length - 1];
    return g ? elements.filter(e => e.groupIds?.includes(g)).map(e => e.id) : [el.id];
  };

  // ---------- notifications ----------
  let changeRaf = 0;
  function emit() {
    if (changeRaf) return;
    changeRaf = requestAnimationFrame(() => { changeRaf = 0; onChange?.(snapshot()); });
  }
  const pick = (el: SceneElement): Partial<Style> =>
    Object.fromEntries((Object.keys(DEFAULT_STYLE) as StyleKey[]).filter(k => el[k] !== undefined).map(k => [k, el[k]]));
  function snapshot(): Snapshot {
    const sel = selected();
    return {
      tool: st.tool, locked: st.locked, zoom: st.zoom, grid: st.grid, editing: !!editing,
      canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
      selectionCount: sel.length, selectedTypes: [...new Set(sel.map(e => e.type))],
      values: { ...st.style, ...(sel[0] ? pick(sel[0]) : {}) }, style: { ...st.style }, isEmpty: elements.length === 0, readOnly,
    };
  }
  let viewTimer = 0;
  function viewChanged() {
    positionEditor(); emit(); redraw();
    clearTimeout(viewTimer);
    viewTimer = window.setTimeout(() => onView?.({ sx: st.sx, sy: st.sy, zoom: st.zoom }), 300);
  }

  // ---------- other people's edits in progress ----------
  // Shown in place of the saved shape until their save brings the same shape, or they go quiet.
  // Never part of `elements`, so nothing here is saved or undone from this browser.
  const ghosts = new Map<string, { el: SceneElement; until: number }>();
  let ghostV = 0, ghostTimer = 0, ghostWake = Infinity;
  const shapeKey = (el: SceneElement) => JSON.stringify(el, (k, v) => (k === 'v' ? undefined : v));
  function setGhosts(els: SceneElement[], holdMs: number, dropped: string[] = []) {
    const until = performance.now() + holdMs;
    dropped.forEach(id => ghosts.delete(id));
    for (const el of els) { el.v = --ghostV; ghosts.set(el.id, { el, until }); } // a fresh v so the shape is redrawn, not taken from cache
    wakeAt(until);
    redraw();
  }
  /** Redraw when the first ghost expires, so it goes away even if nothing else happens. */
  function wakeAt(t: number) {
    if (t >= ghostWake) return;
    clearTimeout(ghostTimer); ghostWake = t;
    ghostTimer = window.setTimeout(() => { ghostWake = Infinity; redraw(); }, t - performance.now() + 50);
  }
  /** The ghost to draw for `real` (or for a shape only they have so far), dropping ones that are done. */
  function ghostFor(id: string, real: SceneElement | undefined, now: number): SceneElement | null {
    const g = ghosts.get(id);
    if (!g) return null;
    if (g.until < now || (real && shapeKey(real) === shapeKey(g.el))) { ghosts.delete(id); return null; }
    if (drag && st.sel.has(id)) return null; // what this person is dragging wins on their own screen
    return g.el;
  }

  // ---------- rendering ----------
  let raf = 0;
  function redraw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
  function render() {
    const dpr = devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight, z = st.zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    if (st.grid) {
      let step = GRID * z; while (step < 10) step *= 5;
      const ox = ((st.sx * z) % step + step) % step, oy = ((st.sy * z) % step + step) % step;
      ctx.fillStyle = '#c3c8d6';
      for (let x = ox; x < W; x += step) for (let y = oy; y < H; y += step) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * z * st.sx, dpr * z * st.sy);
    const view = { x: -st.sx, y: -st.sy, w: W / z, h: H / z };
    const now = performance.now(), placed = new Set<string>();
    const draw = (el: SceneElement) => {
      const b = pad(bounds(el), 20);
      if (b.x > view.x + view.w || b.y > view.y + view.h || b.x + b.w < view.x || b.y + b.h < view.y) return;
      drawEl(ctx, rc, el, erasing.has(el.id) ? 0.25 : 1, redraw);
    };
    for (const el of elements) {
      if (el === editing) continue;
      placed.add(el.id);
      draw((ghosts.size && ghostFor(el.id, el, now)) || el);
    }
    for (const id of [...ghosts.keys()]) {
      if (placed.has(id) || id === editing?.id) continue;
      const g = ghostFor(id, undefined, now);
      if (g) draw(g);
    }
    for (const g of ghosts.values()) wakeAt(g.until);
    drawSelection();
    if (drag && drag.mode === 'box') {
      const { start: a, cur: b } = drag;
      ctx.fillStyle = 'rgba(47,91,234,.07)'; ctx.strokeStyle = ACCENT; ctx.lineWidth = 1 / z;
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    }
  }
  const linearHandleMode = (): SceneElement | null => { const s = selected(); return s.length === 1 && isLinear(s[0].type) ? s[0] : null; };
  function handles(): Handle[] {
    const sel = selected();
    if (!sel.length || (drag && drag.mode !== 'resize' && drag.mode !== 'point')) return [];
    const lin = linearHandleMode();
    if (lin) return (lin.points ?? []).map((p, i) => ({ name: 'p' + i, x: lin.x + p[0], y: lin.y + p[1] }));
    const b = pad(unionBounds(sel), 6 / st.zoom), small = Math.min(b.w, b.h) * st.zoom < 40;
    const hs: [string, number, number][] = [['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['se', b.x + b.w, b.y + b.h], ['sw', b.x, b.y + b.h]];
    if (!small) hs.push(['n', b.x + b.w / 2, b.y], ['e', b.x + b.w, b.y + b.h / 2], ['s', b.x + b.w / 2, b.y + b.h], ['w', b.x, b.y + b.h / 2]);
    return hs.map(([name, x, y]) => ({ name, x, y }));
  }
  function drawSelection() {
    const sel = selected(); if (!sel.length) return;
    const z = st.zoom; ctx.lineWidth = 1 / z; ctx.strokeStyle = ACCENT;
    const lin = linearHandleMode();
    if (sel.length > 1) {
      ctx.setLineDash([4 / z, 4 / z]);
      sel.forEach(el => { const b = pad(bounds(el), 4 / z); ctx.strokeRect(b.x, b.y, b.w, b.h); });
      ctx.setLineDash([]);
    }
    if (!lin) { const b = pad(unionBounds(sel), 6 / z); ctx.strokeRect(b.x, b.y, b.w, b.h); }
    const s = 8 / z;
    for (const h of handles()) {
      ctx.fillStyle = '#fff'; ctx.beginPath();
      if (lin) ctx.arc(h.x, h.y, s * 0.6, 0, Math.PI * 2); else ctx.roundRect(h.x - s / 2, h.y - s / 2, s, s, 2 / z);
      ctx.fill(); ctx.stroke();
    }
  }

  // ---------- history ----------
  let undoStack: string[] = [], redoStack: string[] = [], lastSnap = '[]';
  function commit() {
    const s = JSON.stringify(elements);
    if (s === lastSnap) return;
    undoStack.push(lastSnap); if (undoStack.length > 150) undoStack.shift();
    redoStack = []; lastSnap = s;
    onCommit?.(elements.filter(el => el !== editing));
    emit();
  }
  function restore(snap: string) {
    elements = JSON.parse(snap) as SceneElement[]; lastSnap = snap;
    st.sel = new Set([...st.sel].filter(id => byId(id)));
    onCommit?.(elements); emit(); redraw();
  }
  function undo() { if (readOnly) return; if (editing) commitText(); const prev = undoStack.pop(); if (prev === undefined) return; redoStack.push(lastSnap); restore(prev); }
  function redo() { if (readOnly) return; const next = redoStack.pop(); if (next === undefined) return; undoStack.push(lastSnap); restore(next); }

  // ---------- view ----------
  const rect = () => canvas.getBoundingClientRect();
  const toWorld = (cx: number, cy: number): Vec => ({ x: cx / st.zoom - st.sx, y: cy / st.zoom - st.sy });
  const evWorld = (e: { clientX: number; clientY: number }): Vec => { const r = rect(); return toWorld(e.clientX - r.left, e.clientY - r.top); };
  const snap = (v: number) => (st.grid ? Math.round(v / GRID) * GRID : v);
  const snapPt = (p: Vec): Vec => ({ x: snap(p.x), y: snap(p.y) });
  function zoomTo(z: number, cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2) {
    z = clamp(z, 0.1, 10); const w = toWorld(cx, cy);
    st.zoom = z; st.sx = cx / z - w.x; st.sy = cy / z - w.y; viewChanged();
  }
  function zoomToFit(onlySel = false, maxZoom = 2) {
    const els = onlySel && st.sel.size ? selected() : elements;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!els.length) { st.zoom = 1; st.sx = 0; st.sy = 0; return viewChanged(); }
    const b = unionBounds(els), m = W < 700 ? 40 : 110;
    const z = clamp(Math.min((W - m * 2) / Math.max(b.w, 1), (H - m * 2.2) / Math.max(b.h, 1)), 0.1, maxZoom);
    st.zoom = z; st.sx = W / 2 / z - (b.x + b.w / 2); st.sy = H / 2 / z - (b.y + b.h / 2); viewChanged();
  }
  function resize() {
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr);
    render();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  // ---------- pointer ----------
  const setCursor = (c: string) => { canvas.style.cursor = c; };
  const toolCursor = () => spaceDown || st.tool === 'hand' ? 'grab' : st.tool === 'selection' ? 'default' : st.tool === 'text' ? 'text' : st.tool === 'eraser' ? ERASER_CURSOR : 'crosshair';
  function handleAt(p: Vec): Handle | null { const r = 9 / st.zoom; return handles().find(h => Math.abs(h.x - p.x) <= r && Math.abs(h.y - p.y) <= r) || null; }

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) return startPinch();
    if (pointers.size > 2) return;
    onCommand?.({ type: 'canvas-pointerdown' });
    if (editing) { commitText(); return; }
    canvas.setPointerCapture(e.pointerId);
    const p = evWorld(e);
    if (e.button === 1 || spaceDown || st.tool === 'hand' || readOnly) {
      drag = { mode: 'pan', cx: e.clientX, cy: e.clientY, sx: st.sx, sy: st.sy }; setCursor('grabbing'); return;
    }
    if (e.button !== 0) return;
    if (st.tool === 'selection') return startSelect(e, p);
    if (st.tool === 'eraser') { drag = { mode: 'erase' }; eraseAt(p); return; }
    if (st.tool === 'text') {
      const h = hitTest(p);
      if (h && h.type === 'text') editText(h); else newText(p);
      if (!st.locked) setTool('selection', true);
      return;
    }
    const sp = snapPt(p), el = makeEl(st.tool as ElementType, sp, st.style);
    elements.push(el); st.sel.clear();
    drag = { mode: 'create', el, start: sp };
    emit();
  }
  function startSelect(e: PointerEvent, p: Vec) {
    const h = st.sel.size ? handleAt(p) : null;
    if (h) {
      const sel = selected();
      if (h.name[0] === 'p') drag = { mode: 'point', el: sel[0], idx: +h.name.slice(1), changed: false };
      else drag = { mode: 'resize', h: h.name, start: p, B0: unionBounds(sel), orig: new Map(sel.map(el => [el.id, structuredClone(el)])), changed: false };
      return;
    }
    const target = hitTest(p);
    if (target) {
      const ids = groupOf(target);
      if (e.shiftKey) {
        const all = ids.every(id => st.sel.has(id));
        ids.forEach(id => (all ? st.sel.delete(id) : st.sel.add(id)));
      } else if (!st.sel.has(target.id)) st.sel = new Set(ids);
      if (st.sel.has(target.id)) {
        if (e.altKey) duplicate(0);
        drag = { mode: 'move', start: p, orig: new Map(selected().map(el => [el.id, { x: el.x, y: el.y }])), moved: false };
      }
    } else {
      if (!e.shiftKey) st.sel.clear();
      drag = { mode: 'box', start: p, cur: p, base: new Set(st.sel) };
    }
    emit(); redraw();
  }
  function onPointerMove(e: PointerEvent) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) return movePinch();
    const p = evWorld(e); lastWorld = p;
    if (!drag) {
      if (st.tool === 'selection' && !spaceDown && !readOnly) {
        const h = st.sel.size ? handleAt(p) : null;
        setCursor(h ? (h.name[0] === 'p' ? 'pointer' : RESIZE_CURSORS[h.name]) : hitTest(p) ? 'move' : 'default');
      }
      return;
    }
    switch (drag.mode) {
      case 'pan':
        st.sx = drag.sx + (e.clientX - drag.cx) / st.zoom; st.sy = drag.sy + (e.clientY - drag.cy) / st.zoom; viewChanged(); return;
      case 'create': moveCreate(e, p, drag); break;
      case 'move': {
        let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
        const first = drag.orig.values().next().value;
        if (st.grid && first) { dx = snap(first.x + dx) - first.x; dy = snap(first.y + dy) - first.y; }
        for (const [id, o] of drag.orig) { const el = byId(id); if (el) { el.x = o.x + dx; el.y = o.y + dy; } }
        drag.moved = dx !== 0 || dy !== 0; break;
      }
      case 'resize': moveResize(e, p, drag); break;
      case 'point': {
        const el = drag.el, pts = el.points!, other = pts[drag.idx === 0 ? 1 : 0];
        let q = { x: snap(p.x) - el.x, y: snap(p.y) - el.y };
        if (e.shiftKey) q = snapAngle(other, q);
        pts[drag.idx] = [q.x, q.y]; touch(el); drag.changed = true; break;
      }
      case 'box': {
        drag.cur = p;
        const a = drag.start, x1 = Math.min(a.x, p.x), y1 = Math.min(a.y, p.y), x2 = Math.max(a.x, p.x), y2 = Math.max(a.y, p.y);
        st.sel = new Set(drag.base);
        for (const el of elements) {
          const b = bounds(el);
          if (b.x >= x1 && b.y >= y1 && b.x + b.w <= x2 && b.y + b.h <= y2) groupOf(el).forEach(id => st.sel.add(id));
        }
        emit(); break;
      }
      case 'erase': eraseAt(p); break;
    }
    const live = gestureEls();
    if (live) onLive?.(live, false, []);
    redraw();
  }
  /** The shapes the current gesture is changing, or null when it changes none (yet). */
  function gestureEls(): SceneElement[] | null {
    if (editing) return [editing];
    switch (drag?.mode) {
      case 'create': case 'point': return [drag.el];
      case 'move': return drag.moved ? selected() : null;
      case 'resize': return drag.changed ? selected() : null;
      default: return null;
    }
  }
  /** The gesture is over: say what is left of the shapes it touched. */
  function liveDone(touched: SceneElement[] | null) {
    if (!touched) return;
    const kept = touched.filter(el => elements.includes(el));
    onLive?.(kept, true, touched.filter(el => !kept.includes(el)).map(el => el.id));
  }
  function snapAngle(origin: Point, q: Vec): Vec {
    const dx = q.x - origin[0], dy = q.y - origin[1], step = Math.PI / 12;
    const a = Math.round(Math.atan2(dy, dx) / step) * step, len = Math.hypot(dx, dy);
    return { x: origin[0] + Math.cos(a) * len, y: origin[1] + Math.sin(a) * len };
  }
  function moveCreate(e: PointerEvent, p: Vec, d: Extract<Drag, { mode: 'create' }>) {
    const el = d.el, q = snapPt(p), s = d.start;
    if (el.type === 'freedraw') {
      const pts = el.points!, last = pts[pts.length - 1], lx = p.x - el.x, ly = p.y - el.y;
      if (Math.hypot(lx - last[0], ly - last[1]) > 1.5 / st.zoom) pts.push([lx, ly]);
    } else if (isLinear(el.type)) {
      let r = { x: q.x - el.x, y: q.y - el.y };
      if (e.shiftKey) r = snapAngle([0, 0], r);
      el.points![1] = [r.x, r.y];
    } else {
      let dx = q.x - s.x, dy = q.y - s.y;
      if (e.shiftKey) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
      el.x = Math.min(s.x, s.x + dx); el.y = Math.min(s.y, s.y + dy); el.w = Math.abs(dx); el.h = Math.abs(dy);
    }
    touch(el);
  }
  function moveResize(e: PointerEvent, p: Vec, d: Extract<Drag, { mode: 'resize' }>) {
    const { h, B0, start, orig } = d;
    const dx = p.x - start.x, dy = p.y - start.y;
    const ax = h.includes('w') ? B0.x + B0.w : B0.x, ay = h.includes('n') ? B0.y + B0.h : B0.y;
    let sx = 1, sy = 1;
    if (h.includes('e') && B0.w > 0.5) sx = (B0.w + dx) / B0.w;
    if (h.includes('w') && B0.w > 0.5) sx = (B0.w - dx) / B0.w;
    if (h.includes('s') && B0.h > 0.5) sy = (B0.h + dy) / B0.h;
    if (h.includes('n') && B0.h > 0.5) sy = (B0.h - dy) / B0.h;
    const hasText = [...orig.values()].some(o => o.type === 'text');
    if (e.shiftKey || hasText) {
      const s = h.length === 2 ? Math.max(Math.abs(sx), Math.abs(sy)) : (h === 'n' || h === 's' ? Math.abs(sy) : Math.abs(sx));
      sx = Math.sign(sx || 1) * s; sy = Math.sign(sy || 1) * s;
    }
    if (hasText) { sx = Math.abs(sx); sy = Math.abs(sy); }
    const mx = (v: number) => ax + (v - ax) * sx, my = (v: number) => ay + (v - ay) * sy;
    for (const [id, o] of orig) {
      const el = byId(id); if (!el) continue;
      if (o.points) {
        el.x = mx(o.x); el.y = my(o.y); el.points = o.points.map(([px, py]): Point => [px * sx, py * sy]);
      } else {
        const x1 = mx(o.x), x2 = mx(o.x + o.w), y1 = my(o.y), y2 = my(o.y + o.h);
        el.x = Math.min(x1, x2); el.y = Math.min(y1, y2); el.w = Math.abs(x2 - x1); el.h = Math.abs(y2 - y1);
        if (o.type === 'text') { el.fontSize = Math.max(6, (o.fontSize ?? DEFAULT_STYLE.fontSize) * Math.abs(sy)); measure(el); el.x = Math.min(x1, x2); }
      }
      touch(el);
    }
    d.changed = true;
  }
  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (!drag) return;
    const touched = gestureEls();
    const d = drag; drag = null;
    switch (d.mode) {
      case 'pan': setCursor(toolCursor()); break;
      case 'create': {
        const el = d.el, b = bounds(el);
        const tiny = el.type === 'freedraw' ? false : isLinear(el.type) ? Math.hypot(b.w, b.h) < 4 : el.w < 4 && el.h < 4;
        if (tiny) { elements = elements.filter(x => x !== el); break; }
        if (el.type !== 'freedraw') { st.sel = new Set([el.id]); if (!st.locked) setTool('selection', true); }
        commit(); break;
      }
      case 'move': if (d.moved) commit(); break;
      case 'resize': case 'point': if (d.changed) commit(); break;
      case 'erase':
        if (erasing.size) { elements = elements.filter(el => !erasing.has(el.id)); erasing.clear(); commit(); }
        break;
    }
    liveDone(touched);
    emit(); redraw();
  }
  function eraseAt(p: Vec) { for (const el of elements) if (hit(el, p, st.zoom)) groupOf(el).forEach(id => erasing.add(id)); }
  function startPinch() {
    if (drag && drag.mode === 'create') { const el = drag.el; elements = elements.filter(x => x !== el); liveDone([el]); }
    drag = null;
    const [a, b] = [...pointers.values()], r = rect();
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: st.zoom, mid: toWorld((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top) };
    redraw();
  }
  function movePinch() {
    if (!pinch) return;
    const [a, b] = [...pointers.values()], r = rect();
    const z = clamp(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, 0.1, 10);
    const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
    st.zoom = z; st.sx = cx / z - pinch.mid.x; st.sy = cy / z - pinch.mid.y; viewChanged();
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const r = rect();
    if (e.ctrlKey || e.metaKey) zoomTo(st.zoom * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      st.sx -= dx / st.zoom; st.sy -= dy / st.zoom; viewChanged();
    }
  }
  function onDblClick(e: MouseEvent) {
    if (st.tool !== 'selection' || readOnly) return;
    const p = evWorld(e), h = hitTest(p);
    if (h && h.type === 'text') return editText(h);
    // an outlined shape still counts as a container when you double-click inside it
    const box = h && SHAPES.has(h.type) ? h : [...elements].reverse().find(el => SHAPES.has(el.type) &&
      p.x >= el.x && p.x <= el.x + el.w && p.y >= el.y && p.y <= el.y + el.h);
    if (box) return newText({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, box);
    newText(p);
  }

  // ---------- text ----------
  function newText(p: Vec, container: SceneElement | null = null) {
    const el = makeEl('text', p, st.style, { align: container ? 'center' : 'left', stroke: container ? container.stroke : st.style.stroke, opacity: 100 });
    if (container) { el._anchor = { x: p.x, y: p.y }; el._container = container.id; }
    else el.y = p.y - (el.fontSize ?? DEFAULT_STYLE.fontSize) * LH / 2;
    el._new = true;
    elements.push(el);
    editText(el);
  }
  function editText(el: SceneElement) {
    editing = el; st.sel.clear();
    ta.value = el.text ?? ''; ta.hidden = false;
    ta.style.textAlign = el.align === 'center' ? 'center' : 'left';
    if (el.align === 'center' && !el._anchor) el._anchor = { x: el.x + el.w / 2, y: el.y + el.h / 2 };
    positionEditor(); emit(); redraw();
    ta.focus();
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
  }
  function positionEditor() {
    if (!editing) return;
    const el = editing, z = st.zoom, r = rect(), fs = el.fontSize ?? DEFAULT_STYLE.fontSize;
    if (el._anchor) { el.x = el._anchor.x - el.w / 2; el.y = el._anchor.y - el.h / 2; }
    const extra = el.align === 'center' ? 0 : fs;
    Object.assign(ta.style, {
      left: r.left + (el.x + st.sx) * z + 'px', top: r.top + (el.y + st.sy) * z + 'px',
      fontSize: fs * z + 'px', lineHeight: String(LH), color: el.stroke,
      width: (el.w + extra + 4) * z + 'px', height: Math.max(el.h, fs * LH) * z + 'px',
    });
  }
  const onEditorInput = () => {
    if (!editing) return;
    editing.text = ta.value; measure(editing); positionEditor();
    if (editing.text.trim()) onLive?.([editing], false, []);
  };
  const onEditorBlur = () => commitText();
  const onEditorKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commitText(); }
  };
  function commitText() {
    if (!editing) return;
    const el = editing; editing = null; ta.hidden = true;
    el.text = ta.value.replace(/\s+$/, '');
    if (!el.text.trim()) elements = elements.filter(x => x !== el);
    else {
      measure(el);
      if (el._anchor) { el.x = el._anchor.x - el.w / 2; el.y = el._anchor.y - el.h / 2; }
      const box = el._container ? byId(el._container) : undefined;
      if (box && el._new) { const g = uid(); el.groupIds = [g, ...(box.groupIds || [])]; box.groupIds = [g, ...(box.groupIds || [])]; }
      delete el._anchor; delete el._container; delete el._new;
      touch(el); st.sel = new Set([el.id]);
    }
    commit(); liveDone([el]); emit(); redraw();
  }

  // ---------- actions ----------
  function setTool(t: Tool, keepSel = false) {
    if (t === 'image') { onCommand?.({ type: 'pick-image' }); return; }
    if (editing && t !== 'selection') commitText();
    st.tool = t;
    if (t !== 'selection' && !keepSel) st.sel.clear();
    setCursor(toolCursor()); emit(); redraw();
  }
  function deleteSel() { if (!st.sel.size) return; elements = elements.filter(el => !st.sel.has(el.id)); st.sel.clear(); commit(); redraw(); }
  function cloneEls(els: SceneElement[], offset: number): SceneElement[] {
    const gmap = new Map<string, string>();
    return els.map(el => {
      const c = structuredClone(el); c.id = uid(); c.seed = rand(); c.x += offset; c.y += offset;
      c.groupIds = (c.groupIds || []).map(g => { if (!gmap.has(g)) gmap.set(g, uid()); return gmap.get(g)!; });
      return c;
    });
  }
  function duplicate(offset = 16) {
    const clones = cloneEls(selected(), offset);
    if (!clones.length) return;
    elements.push(...clones); st.sel = new Set(clones.map(c => c.id));
    if (offset !== 0) commit(); // alt-drag commits when the drag ends
    emit(); redraw();
  }
  function selectAll() { setTool('selection', true); st.sel = new Set(elements.map(e => e.id)); emit(); redraw(); }
  function group() {
    const sel = selected(); if (sel.length < 2) return;
    const g = uid(); sel.forEach(el => (el.groupIds = el.groupIds || []).push(g)); commit(); toast('Grouped');
  }
  function ungroup() {
    const sel = selected(); let changed = false;
    const outer = new Set(sel.map(el => el.groupIds?.[el.groupIds.length - 1]).filter(Boolean));
    sel.forEach(el => { if (el.groupIds?.length && outer.has(el.groupIds[el.groupIds.length - 1])) { el.groupIds.pop(); changed = true; } });
    if (changed) { commit(); toast('Ungrouped'); }
  }
  function layer(op: LayerOp) {
    if (!st.sel.size) return;
    const isSel = (el: SceneElement) => st.sel.has(el.id);
    if (op === 'front') elements = [...elements.filter(e => !isSel(e)), ...elements.filter(isSel)];
    else if (op === 'back') elements = [...elements.filter(isSel), ...elements.filter(e => !isSel(e))];
    else if (op === 'forward') {
      for (let i = elements.length - 2; i >= 0; i--) if (isSel(elements[i]) && !isSel(elements[i + 1])) [elements[i], elements[i + 1]] = [elements[i + 1], elements[i]];
    } else {
      for (let i = 1; i < elements.length; i++) if (isSel(elements[i]) && !isSel(elements[i - 1])) [elements[i], elements[i - 1]] = [elements[i - 1], elements[i]];
    }
    commit(); redraw();
  }
  function nudge(dx: number, dy: number) { selected().forEach(el => { el.x += dx; el.y += dy; }); commit(); redraw(); }
  function pasteEls(els: SceneElement[]) {
    const clones = cloneEls(els, 0), b = unionBounds(clones);
    clones.forEach(c => { c.x += lastWorld.x - (b.x + b.w / 2); c.y += lastWorld.y - (b.y + b.h / 2); });
    elements.push(...clones); setTool('selection', true); st.sel = new Set(clones.map(c => c.id)); commit(); redraw();
  }
  const APPLIES: Record<StyleKey, (t: ElementType) => boolean> = {
    stroke: t => t !== 'image', bg: t => SHAPES.has(t), fill: t => SHAPES.has(t),
    sw: t => t !== 'text' && t !== 'image', ss: t => t !== 'text' && t !== 'image',
    rough: t => SHAPES.has(t) || isLinear(t), round: t => t === 'rectangle', fontSize: t => t === 'text', opacity: () => true,
  };
  function setStyle<K extends StyleKey>(key: K, value: Style[K], record = true) {
    st.style[key] = value;
    for (const el of selected()) {
      if (!APPLIES[key](el.type)) continue;
      (el as unknown as Style)[key] = value;
      if (key === 'fontSize') {
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2; measure(el);
        if (el.align === 'center') { el.x = cx - el.w / 2; el.y = cy - el.h / 2; }
      }
      touch(el);
    }
    if (record) commit();
    onCommand?.({ type: 'style', style: { ...st.style }, grid: st.grid });
    emit(); redraw();
  }
  function insertImage(file: File | null | undefined, at: Vec | null = null) {
    if (!file || !file.type.startsWith('image/')) return;
    const center = at || toWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const fr = new FileReader();
    fr.onload = () => {
      const src = String(fr.result), im = new Image();
      im.onload = () => {
        const s = Math.min(1, 480 / Math.max(im.naturalWidth, im.naturalHeight));
        const w = im.naturalWidth * s, h = im.naturalHeight * s;
        const el = makeEl('image', { x: center.x - w / 2, y: center.y - h / 2 }, st.style, { w, h, src, opacity: 100 });
        cacheImage(el.id, im);
        elements.push(el); setTool('selection', true); st.sel = new Set([el.id]); commit(); redraw();
      };
      im.src = src;
    };
    fr.readAsDataURL(file);
  }

  // ---------- clipboard & drop ----------
  let internalClip: SceneElement[] | null = null;
  function copySel(e: ClipboardEvent): boolean {
    if (isField(e.target) || !st.sel.size || readOnly || !e.clipboardData) return false;
    internalClip = selected().map(el => structuredClone(el));
    e.clipboardData.setData('text/plain', JSON.stringify({ type: 'scrawl/clipboard', elements: selected() }));
    e.preventDefault();
    return true;
  }
  const onCopy = (e: ClipboardEvent) => { if (copySel(e)) toast('Copied'); };
  const onCut = (e: ClipboardEvent) => { if (copySel(e)) deleteSel(); };
  function onPaste(e: ClipboardEvent) {
    if (isField(e.target) || readOnly) return;
    e.preventDefault();
    const file = [...(e.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'));
    if (file) return insertImage(file, lastWorld);
    const text = e.clipboardData?.getData('text/plain') || '';
    try {
      const d = JSON.parse(text) as { type?: string; elements?: unknown };
      if (d.type === 'scrawl/clipboard' && Array.isArray(d.elements)) { const els = sanitizeElements(d.elements); if (els.length) return pasteEls(els); }
    } catch { /* plain text */ }
    if (text.trim()) {
      const el = makeEl('text', lastWorld, st.style, { text: text.replace(/\r/g, '').slice(0, 5000), opacity: 100 });
      elements.push(el); st.sel = new Set([el.id]); commit(); redraw(); return;
    }
    if (internalClip) pasteEls(internalClip);
  }
  const onDragOver = (e: DragEvent) => e.preventDefault();
  function onDrop(e: DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0]; if (!f) return;
    const r = rect();
    if (f.type.startsWith('image/')) insertImage(f, toWorld(e.clientX - r.left, e.clientY - r.top));
    else onCommand?.({ type: 'open-file', file: f });
  }

  // ---------- keyboard ----------
  function onKeyDown(e: KeyboardEvent) {
    if (isField(e.target) || document.querySelector('[data-modal-open="true"]')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); if (!spaceDown) { spaceDown = true; if (!drag) setCursor('grab'); } return; }
    if (mod) {
      const acts: Record<string, () => void> = {
        z: () => (e.shiftKey ? redo() : undo()), y: redo, d: () => duplicate(), a: selectAll,
        g: () => (e.shiftKey ? ungroup() : group()), s: () => onCommand?.({ type: 'save-file' }), o: () => onCommand?.({ type: 'pick-file' }),
        '=': () => zoomTo(st.zoom * 1.2), '+': () => zoomTo(st.zoom * 1.2), '-': () => zoomTo(st.zoom / 1.2), 0: () => zoomTo(1),
      };
      if (readOnly && !['s', 'o', '=', '+', '-', '0'].includes(k) && !(k === 'e' && e.shiftKey)) return; // view only: no editing shortcuts
      if (e.code === 'BracketRight') { e.preventDefault(); return layer(e.shiftKey ? 'front' : 'forward'); }
      if (e.code === 'BracketLeft') { e.preventDefault(); return layer(e.shiftKey ? 'back' : 'backward'); }
      if (k === 'e' && e.shiftKey) { e.preventDefault(); return onCommand?.({ type: 'export' }); }
      if (acts[k]) { e.preventDefault(); acts[k](); }
      return;
    }
    if (e.shiftKey && e.altKey && e.code === 'KeyD') { e.preventDefault(); return onCommand?.({ type: 'theme' }); }
    if (e.shiftKey && e.code === 'Digit1') return zoomToFit();
    if (e.shiftKey && e.code === 'Digit2') return zoomToFit(true);
    if (e.key === '?') return onCommand?.({ type: 'help' });
    if (readOnly) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return deleteSel(); }
    if (e.key === 'Escape') { onCommand?.({ type: 'escape' }); st.sel.clear(); setTool('selection'); return; }
    if (e.key === 'Enter') { const s = selected(); if (s.length === 1 && s[0].type === 'text') { e.preventDefault(); editText(s[0]); } return; }
    if (e.key.startsWith('Arrow') && st.sel.size) {
      e.preventDefault(); const n = e.shiftKey ? 10 : 1;
      return nudge(e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0);
    }
    if (e.altKey || e.shiftKey) return;
    if (k === 'q') return toggleLock();
    if (k === 'g') return toggleGrid();
    if (TOOL_KEYS[k] !== undefined) setTool(TOOL_KEYS[k]);
  }
  function onKeyUp(e: KeyboardEvent) { if (e.key === ' ') { spaceDown = false; if (!drag) setCursor(toolCursor()); } }
  const onBlur = () => { spaceDown = false; };
  function toggleLock() { st.locked = !st.locked; toast(st.locked ? 'Tool stays active after drawing' : 'Tool returns to Select after drawing'); emit(); }
  function toggleGrid() { st.grid = !st.grid; onCommand?.({ type: 'style', style: { ...st.style }, grid: st.grid }); emit(); redraw(); }

  // ---------- wiring ----------
  // [target, event, handler, options]; handlers are typed per event above
  const listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [
    [canvas, 'pointerdown', onPointerDown as EventListener], [canvas, 'pointermove', onPointerMove as EventListener],
    [canvas, 'pointerup', onPointerUp as EventListener], [canvas, 'pointercancel', onPointerUp as EventListener],
    [canvas, 'wheel', onWheel as EventListener, { passive: false }], [canvas, 'dblclick', onDblClick as EventListener],
    [ta, 'input', onEditorInput], [ta, 'blur', onEditorBlur], [ta, 'keydown', onEditorKey as EventListener],
    [document, 'copy', onCopy as EventListener], [document, 'cut', onCut as EventListener], [document, 'paste', onPaste as EventListener],
    [window, 'dragover', onDragOver as EventListener], [window, 'drop', onDrop as EventListener],
    [window, 'keydown', onKeyDown as EventListener], [window, 'keyup', onKeyUp as EventListener], [window, 'blur', onBlur],
  ];
  listeners.forEach(([t, n, f, o]) => t.addEventListener(n, f, o));
  resize(); setCursor(toolCursor());

  return {
    // scene
    load({ elements: els = [], view = null }: { elements?: unknown; view?: View | null } = {}) {
      if (editing) { editing = null; ta.hidden = true; }
      elements = sanitizeElements(els); lastSnap = JSON.stringify(elements); undoStack = []; redoStack = [];
      st.sel.clear(); erasing.clear(); ghosts.clear(); drag = null;
      if (view && Number.isFinite(view.zoom)) { st.sx = view.sx; st.sy = view.sy; st.zoom = clamp(view.zoom, 0.1, 10); viewChanged(); }
      else zoomToFit(false, 1);
      emit(); redraw();
    },
    /** Someone else's saved copy: swap the shapes in place, keeping the view and the text being typed. */
    applyRemote(els: unknown) {
      const next = sanitizeElements(els);
      if (editing) { const i = next.findIndex(el => el.id === editing!.id); if (i >= 0) next[i] = editing; else next.push(editing); }
      elements = next; lastSnap = JSON.stringify(elements);
      undoStack = []; redoStack = []; // undoing would roll back the other person's work too
      st.sel = new Set([...st.sel].filter(id => byId(id)));
      emit(); redraw();
    },
    /** Someone else's edit in progress: show `els` for up to `holdMs`, unless their save catches up first. */
    showLive: (els: unknown, holdMs: number, dropped: string[] = []) => setGhosts(sanitizeElements(els), holdMs, dropped),
    clearLive() { ghosts.clear(); redraw(); },
    getElements: (): SceneElement[] => elements.filter(el => el !== editing),
    getView: (): View => ({ sx: st.sx, sy: st.sy, zoom: st.zoom }),
    flushText: () => commitText(),
    selected,
    // tools & style
    setTool, toggleLock, toggleGrid, setStyle,
    setGrid(on: boolean) { st.grid = !!on; emit(); redraw(); },
    setReadOnly(on: boolean) { readOnly = !!on; if (on) { st.sel.clear(); st.tool = 'hand'; } else st.tool = 'selection'; setCursor(toolCursor()); emit(); redraw(); },
    // editing
    undo, redo, deleteSel, duplicate: () => duplicate(), group, ungroup, layer, insertImage, selectAll,
    clear() { elements = []; st.sel.clear(); commit(); redraw(); },
    // view
    zoomIn: () => zoomTo(st.zoom * 1.2), zoomOut: () => zoomTo(st.zoom / 1.2), resetZoom: () => zoomTo(1), zoomToFit,
    // export
    exportCanvas: ({ onlySelected, ...opts }: ExportOptions & { onlySelected?: boolean } = {}) =>
      exportCanvas(onlySelected && st.sel.size ? selected() : elements, opts),
    exportSvg: ({ onlySelected, ...opts }: ExportOptions & { onlySelected?: boolean } = {}) =>
      exportSvg(onlySelected && st.sel.size ? selected() : elements, opts),
    snapshot,
    remeasureText() { elements.forEach(el => { if (el.type === 'text') measure(el); }); redraw(); },
    destroy() {
      listeners.forEach(([t, n, f, o]) => t.removeEventListener(n, f, o));
      ro.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(changeRaf); clearTimeout(viewTimer); clearTimeout(ghostTimer);
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
