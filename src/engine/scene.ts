// Scene model, geometry and rendering. Pure helpers with no app state.
import rough from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { RoughCanvas } from 'roughjs/bin/canvas';

export type ElementType = 'rectangle' | 'diamond' | 'ellipse' | 'line' | 'arrow' | 'freedraw' | 'text' | 'image';
export type Tool = ElementType | 'selection' | 'hand' | 'eraser';
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type Point = [number, number];
export interface Vec { x: number; y: number }
export interface Bounds { x: number; y: number; w: number; h: number }
export interface View { sx: number; sy: number; zoom: number }

export interface Style {
  stroke: string; bg: string; fill: FillStyle; sw: number; ss: StrokeStyle;
  rough: number; round: boolean; opacity: number; fontSize: number;
}
export type StyleKey = keyof Style;

export interface SceneElement {
  id: string; type: ElementType;
  x: number; y: number; w: number; h: number;
  stroke: string; bg: string; fill: FillStyle; sw: number; ss: StrokeStyle; rough: number; round: boolean; opacity: number;
  seed: number; v: number; groupIds: string[];
  points?: Point[];                                 // line, arrow, freedraw: relative to x, y
  text?: string; fontSize?: number; align?: 'left' | 'center'; // text
  src?: string;                                     // image: a data: URL
  // only while a new label is being typed
  _anchor?: Vec; _container?: string; _new?: boolean;
}

export const PAPER = '#fcfcfd';
export const ACCENT = '#2f5bea';
export const GRID = 20;
export const LH = 1.25;
export const SHAPES: ReadonlySet<string> = new Set(['rectangle', 'diamond', 'ellipse']);
export const isLinear = (t: string): boolean => t === 'line' || t === 'arrow';
export const uid = (): string => Math.random().toString(36).slice(2, 10);
export const rand = (): number => Math.floor(Math.random() * 2 ** 31);
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const fontStr = (fs: number): string => `${fs}px Kalam, "Comic Sans MS", cursive`;

export const DEFAULT_STYLE: Style = { stroke: '#1f2328', bg: 'transparent', fill: 'hachure', sw: 2, ss: 'solid', rough: 1, round: true, opacity: 100, fontSize: 28 };

const gen = rough.generator();
const mctx = document.createElement('canvas').getContext('2d')!;

// ---------- geometry ----------
export function bounds(el: SceneElement): Bounds {
  if (el.points) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [px, py] of el.points) { x1 = Math.min(x1, px); y1 = Math.min(y1, py); x2 = Math.max(x2, px); y2 = Math.max(y2, py); }
    return { x: el.x + x1, y: el.y + y1, w: x2 - x1, h: y2 - y1 };
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}
export function unionBounds(els: SceneElement[]): Bounds {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const el of els) { const b = bounds(el); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
export const pad = (b: Bounds, p: number): Bounds => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });
function distSeg(p: Vec, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = clamp(l ? ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l : 0, 0, 1);
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
}
function nearPoly(p: Vec, pts: Point[], closed: boolean, tol: number): boolean {
  const n = pts.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) if (distSeg(p, pts[i], pts[(i + 1) % n]) <= tol) return true;
  return false;
}
function inPoly(p: Vec, pts: Point[]): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function hit(el: SceneElement, p: Vec, zoom: number): boolean {
  const tol = 8 / zoom + (el.sw || 0) / 2, b = bounds(el);
  if (p.x < b.x - tol || p.x > b.x + b.w + tol || p.y < b.y - tol || p.y > b.y + b.h + tol) return false;
  const filled = el.bg && el.bg !== 'transparent';
  const { x, y, w, h } = el;
  switch (el.type) {
    case 'text': case 'image': return true;
    case 'rectangle': return !!filled || nearPoly(p, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, tol);
    case 'diamond': {
      const pts: Point[] = [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
      return (!!filled && inPoly(p, pts)) || nearPoly(p, pts, true, tol);
    }
    case 'ellipse': {
      const rx = w / 2, ry = h / 2, n = Math.hypot((p.x - x - rx) / (rx || 1), (p.y - y - ry) / (ry || 1));
      return filled ? n <= 1.02 : Math.abs(n - 1) * Math.min(rx, ry) <= tol;
    }
    default: return nearPoly(p, (el.points ?? []).map(([px, py]): Point => [el.x + px, el.y + py]), false, tol);
  }
}

// ---------- elements ----------
export function measure(el: SceneElement): void {
  const fs = el.fontSize ?? DEFAULT_STYLE.fontSize;
  mctx.font = fontStr(fs);
  const lines = (el.text || '').split('\n');
  el.w = Math.max(4, ...lines.map(l => mctx.measureText(l).width));
  el.h = lines.length * fs * LH;
}
export function makeEl(type: ElementType, p: Vec, s: Style, over: Partial<SceneElement> = {}): SceneElement {
  const el: SceneElement = {
    id: uid(), type, x: p.x, y: p.y, w: 0, h: 0, stroke: s.stroke, bg: s.bg, fill: s.fill, sw: s.sw, ss: s.ss,
    rough: s.rough, round: s.round, opacity: s.opacity, seed: rand(), v: 0, groupIds: [], ...over,
  };
  if (isLinear(type) && !el.points) el.points = [[0, 0], [0, 0]];
  if (type === 'freedraw' && !el.points) el.points = [[0, 0]];
  if (type === 'text') { el.fontSize = el.fontSize || s.fontSize; el.text = el.text || ''; el.align = el.align || 'left'; measure(el); }
  return el;
}

// Anything from outside (files, pastes, the database) passes through here: known types,
// well-formed fields, and only embedded images, so a scene can never make the page fetch a URL.
const TYPES: ReadonlySet<string> = new Set<ElementType>(['rectangle', 'diamond', 'ellipse', 'line', 'arrow', 'freedraw', 'text', 'image']);
const COLOR = /^(#[0-9a-f]{3,8}|transparent)$/i;
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
export function sanitizeElements(list: unknown): SceneElement[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20000).flatMap((raw: unknown): SceneElement[] => {
    if (!raw || typeof raw !== 'object') return [];
    const o = raw as Record<string, unknown>;
    if (!TYPES.has(str(o.type))) return [];
    const el: SceneElement = {
      id: typeof o.id === 'string' && o.id.length <= 40 ? o.id : uid(), type: o.type as ElementType,
      x: num(o.x), y: num(o.y), w: Math.abs(num(o.w)), h: Math.abs(num(o.h)),
      stroke: COLOR.test(str(o.stroke)) ? str(o.stroke) : '#1f2328', bg: COLOR.test(str(o.bg)) ? str(o.bg) : 'transparent',
      fill: oneOf(o.fill, ['hachure', 'cross-hatch', 'solid'], 'hachure'),
      sw: clamp(num(o.sw, 2), 0.5, 20), ss: oneOf(o.ss, ['solid', 'dashed', 'dotted'], 'solid'),
      rough: clamp(num(o.rough, 1), 0, 3), round: !!o.round, opacity: clamp(num(o.opacity, 100), 0, 100),
      seed: Math.floor(num(o.seed, rand())), v: 0,
      groupIds: Array.isArray(o.groupIds) ? o.groupIds.filter((g): g is string => typeof g === 'string').slice(0, 20) : [],
    };
    if (isLinear(el.type) || el.type === 'freedraw') {
      const pts = Array.isArray(o.points)
        ? o.points.filter((p): p is unknown[] => Array.isArray(p) && p.length >= 2).map((p): Point => [num(p[0]), num(p[1])])
        : [];
      if (pts.length < (el.type === 'freedraw' ? 1 : 2)) return [];
      el.points = pts.slice(0, 50000);
    }
    if (el.type === 'text') {
      if (!str(o.text)) return [];
      el.text = str(o.text).slice(0, 10000); el.fontSize = clamp(num(o.fontSize, 28), 4, 400);
      el.align = o.align === 'center' ? 'center' : 'left'; measure(el);
    }
    if (el.type === 'image') {
      if (!/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(str(o.src))) return [];
      el.src = str(o.src);
    }
    return [el];
  });
}

// ---------- drawing ----------
const dcache = new Map<string, { key: string; d: Drawable[] }>();
const imgCache = new Map<string, HTMLImageElement>();
function roughOpts(el: SceneElement): Options {
  return {
    seed: el.seed, stroke: el.stroke, strokeWidth: el.sw, roughness: el.rough, bowing: 1,
    fill: el.bg === 'transparent' ? undefined : el.bg, fillStyle: el.fill, hachureGap: 4 + el.sw * 2.5, fillWeight: el.sw / 2,
    strokeLineDash: el.ss === 'dashed' ? [10, 8 + el.sw] : el.ss === 'dotted' ? [1.5, 6 + el.sw] : undefined,
    disableMultiStroke: el.ss !== 'solid', preserveVertices: true,
  };
}
function arrowHead(el: SceneElement): Point[] | null {
  const p = el.points!, tip = p[p.length - 1], prev = p[p.length - 2];
  const dx = tip[0] - prev[0], dy = tip[1] - prev[1], len = Math.hypot(dx, dy);
  if (len < 2) return null;
  const size = Math.min(len * 0.5, 10 + el.sw * 4), a = Math.atan2(dy, dx), spread = Math.PI / 7.5;
  return [
    [tip[0] - size * Math.cos(a - spread), tip[1] - size * Math.sin(a - spread)], tip,
    [tip[0] - size * Math.cos(a + spread), tip[1] - size * Math.sin(a + spread)],
  ];
}
export function drawables(el: SceneElement): Drawable[] {
  const key = [el.v, el.w, el.h, el.stroke, el.bg, el.fill, el.sw, el.ss, el.rough, el.round, el.seed, el.points?.length].join('|');
  const c = dcache.get(el.id);
  if (c && c.key === key) return c.d;
  const o = roughOpts(el), { w, h } = el;
  let d: Drawable[] = [];
  if (SHAPES.has(el.type) && (w < 1 || h < 1)) d = [];
  else if (el.type === 'rectangle') {
    if (el.round) {
      const r = Math.min(Math.min(w, h) * 0.25, 32);
      d = [gen.path(`M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0`, o)];
    } else d = [gen.rectangle(0, 0, w, h, o)];
  } else if (el.type === 'diamond') d = [gen.polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], o)];
  else if (el.type === 'ellipse') d = [gen.ellipse(w / 2, h / 2, w, h, o)];
  else if (isLinear(el.type) && el.points) {
    const lo: Options = { ...o, fill: undefined };
    d = [gen.linearPath(el.points, lo)];
    const head = el.type === 'arrow' ? arrowHead(el) : null;
    if (head) d.push(gen.linearPath(head, { ...lo, strokeLineDash: undefined }));
  }
  dcache.set(el.id, { key, d });
  return d;
}
export function freePath(pts: Point[]): string {
  if (pts.length < 3) { const a = pts[0], b = pts[pts.length - 1]; return `M ${a[0]} ${a[1]} L ${b[0] + 0.01} ${b[1]}`; }
  let s = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    s += ` Q ${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
  }
  const l = pts[pts.length - 1];
  return s + ` L ${l[0]} ${l[1]}`;
}
export function getImg(el: SceneElement, onLoad?: () => void): HTMLImageElement | null {
  let im = imgCache.get(el.id);
  if (!im || im.src !== el.src) {
    im = new Image();
    if (onLoad) im.onload = onLoad;
    im.src = el.src ?? '';
    imgCache.set(el.id, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
export function cacheImage(id: string, im: HTMLImageElement): void { imgCache.set(id, im); }
export function drawEl(c: CanvasRenderingContext2D, r: RoughCanvas, el: SceneElement, alpha = 1, onImageLoad?: () => void): void {
  c.save();
  c.globalAlpha = (el.opacity ?? 100) / 100 * alpha;
  c.translate(el.x, el.y);
  if (el.type === 'text') {
    const fs = el.fontSize ?? DEFAULT_STYLE.fontSize;
    c.font = fontStr(fs); c.fillStyle = el.stroke; c.textBaseline = 'top';
    const center = el.align === 'center';
    c.textAlign = center ? 'center' : 'left';
    (el.text ?? '').split('\n').forEach((ln, i) => c.fillText(ln, center ? el.w / 2 : 0, i * fs * LH + fs * 0.08));
  } else if (el.type === 'image') {
    const im = getImg(el, onImageLoad);
    if (im) c.drawImage(im, 0, 0, el.w, el.h);
    else { c.strokeStyle = '#aab'; c.setLineDash([6, 6]); c.strokeRect(0, 0, el.w, el.h); }
  } else if (el.type === 'freedraw') {
    c.strokeStyle = el.stroke; c.lineWidth = el.sw * 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
    if (el.ss === 'dashed') c.setLineDash([10, 8 + el.sw]); else if (el.ss === 'dotted') c.setLineDash([1, 6 + el.sw]);
    c.stroke(new Path2D(freePath(el.points ?? [[0, 0]])));
  } else drawables(el).forEach(d => r.draw(d));
  c.restore();
}

// ---------- export ----------
export interface ExportOptions { scale?: number; background?: boolean }
export function exportCanvas(els: SceneElement[], { scale = 2, background = true }: ExportOptions = {}): HTMLCanvasElement | null {
  if (!els.length) return null;
  const b = pad(unionBounds(els), 24);
  const off = document.createElement('canvas');
  off.width = Math.ceil(b.w * scale); off.height = Math.ceil(b.h * scale);
  const c = off.getContext('2d')!; c.scale(scale, scale); c.translate(-b.x, -b.y);
  if (background) { c.fillStyle = PAPER; c.fillRect(b.x, b.y, b.w, b.h); }
  const r = rough.canvas(off);
  els.forEach(el => drawEl(c, r, el));
  return off;
}
export function exportSvg(els: SceneElement[], { background = true }: ExportOptions = {}): string | null {
  if (!els.length) return null;
  const NS = 'http://www.w3.org/2000/svg', b = pad(unionBounds(els), 24);
  const make = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
  };
  const svg = make('svg', { xmlns: NS, width: b.w, height: b.h, viewBox: `${b.x} ${b.y} ${b.w} ${b.h}` });
  const style = make('style');
  style.textContent = '@import url("https://fonts.googleapis.com/css2?family=Kalam&display=swap");';
  svg.appendChild(style);
  if (background) svg.appendChild(make('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: PAPER }));
  const rs = rough.svg(svg);
  for (const el of els) {
    const g = make('g', { transform: `translate(${el.x} ${el.y})`, opacity: (el.opacity ?? 100) / 100 });
    if (el.type === 'text') {
      const fs = el.fontSize ?? DEFAULT_STYLE.fontSize;
      (el.text ?? '').split('\n').forEach((ln, i) => {
        const t = make('text', {
          x: el.align === 'center' ? el.w / 2 : 0, y: i * fs * LH + fs * 0.08,
          'dominant-baseline': 'text-before-edge', 'font-family': 'Kalam, Comic Sans MS, cursive', 'font-size': fs,
          fill: el.stroke, 'xml:space': 'preserve',
        });
        if (el.align === 'center') t.setAttribute('text-anchor', 'middle');
        t.textContent = ln; g.appendChild(t);
      });
    } else if (el.type === 'image') {
      g.appendChild(make('image', { href: el.src ?? '', width: el.w, height: el.h }));
    } else if (el.type === 'freedraw') {
      const path = make('path', { d: freePath(el.points ?? [[0, 0]]), fill: 'none', stroke: el.stroke, 'stroke-width': el.sw * 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      if (el.ss !== 'solid') path.setAttribute('stroke-dasharray', el.ss === 'dashed' ? `10 ${8 + el.sw}` : `1 ${6 + el.sw}`);
      g.appendChild(path);
    } else drawables(el).forEach(d => g.appendChild(rs.draw(d)));
    svg.appendChild(g);
  }
  return new XMLSerializer().serializeToString(svg);
}

// ---------- the welcome board ----------
export function sampleScene(): SceneElement[] {
  const base: Style = { ...DEFAULT_STYLE, rough: 1, sw: 2, ss: 'solid', opacity: 100, round: true, stroke: '#1f2328' };
  const els: SceneElement[] = [];
  const label = (box: SceneElement, text: string, fs = 24) => {
    const t = makeEl('text', { x: 0, y: 0 }, base, { text, fontSize: fs, align: 'center', stroke: box.stroke });
    t.x = box.x + box.w / 2 - t.w / 2; t.y = box.y + box.h / 2 - t.h / 2;
    const g = uid(); box.groupIds = [g]; t.groupIds = [g];
    els.push(box, t);
  };
  const title = makeEl('text', { x: 80, y: 30 }, base, { text: 'Saturday side-project, on a napkin', fontSize: 40 });
  els.push(title);
  els.push(makeEl('freedraw', { x: 84, y: 92 }, base, { stroke: '#e8590c', points: Array.from({ length: 70 }, (_, i): Point => [i * (title.w - 10) / 69, Math.sin(i * 0.45) * 2.5]) }));
  label(makeEl('rectangle', { x: 80, y: 160 }, base, { w: 220, h: 110, bg: '#ffec99', fill: 'hachure' }), 'Sketch the idea');
  label(makeEl('diamond', { x: 400, y: 140 }, base, { w: 230, h: 150, bg: '#a5d8ff', fill: 'cross-hatch', stroke: '#1864ab' }), 'Does it\nstill make sense?', 22);
  label(makeEl('ellipse', { x: 730, y: 160 }, base, { w: 220, h: 110, bg: '#b2f2bb', fill: 'solid', stroke: '#2b8a3e' }), 'Ship it!');
  els.push(makeEl('arrow', { x: 308, y: 215 }, base, { points: [[0, 0], [86, 0]] }));
  els.push(makeEl('arrow', { x: 636, y: 215 }, base, { points: [[0, 0], [88, 0]] }));
  els.push(makeEl('arrow', { x: 515, y: 296 }, base, { stroke: '#c92a2a', ss: 'dashed', points: [[0, 0], [-300, 80], [-325, -18]] }));
  els.push(makeEl('text', { x: 330, y: 360 }, base, { text: 'no? back to the napkin', fontSize: 20, stroke: '#c92a2a' }));
  els.push(makeEl('text', { x: 80, y: 450 }, base, { text: 'This board is a sample. Press 2 and drag to add a box,\nor double-click anywhere to write.', fontSize: 20, stroke: '#5d6577' }));
  return els;
}
