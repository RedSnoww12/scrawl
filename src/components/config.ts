import { SHAPES, isLinear } from '../engine/scene';
import type { ElementType, Style, StyleKey, Tool } from '../engine/scene';

/** [tool, label, shortcut], or null for a divider */
export const TOOLS: ([Tool, string, string] | null)[] = [
  ['selection', 'Select', 'V or 1'], ['hand', 'Hand (pan)', 'H'], null,
  ['rectangle', 'Rectangle', 'R or 2'], ['diamond', 'Diamond', 'D or 3'], ['ellipse', 'Ellipse', 'O or 4'],
  ['arrow', 'Arrow', 'A or 5'], ['line', 'Line', 'L or 6'], ['freedraw', 'Draw', 'P or 7'],
  ['text', 'Text', 'T or 8'], ['image', 'Insert image', '9'], ['eraser', 'Eraser', 'E or 0'], null,
];

export const HINTS: Partial<Record<Tool, string>> = {
  selection: 'Click to select · Drag empty space to box-select · Double-click to write',
  hand: 'Drag to pan · Ctrl + scroll to zoom',
  rectangle: 'Drag to draw · Hold Shift for a square', diamond: 'Drag to draw · Hold Shift for equal sides',
  ellipse: 'Drag to draw · Hold Shift for a circle', arrow: 'Drag to draw · Hold Shift to snap to 15°',
  line: 'Drag to draw · Hold Shift to snap to 15°', freedraw: 'Drag to sketch freehand',
  text: 'Click anywhere to write · Esc to finish', eraser: 'Drag across shapes to erase them',
};

export const STROKES = ['#1f2328', '#c92a2a', '#2b8a3e', '#1864ab', '#e8590c', '#7048e8'];
export const FILLS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#e5dbff'];

/** A choice in a segmented control: value, label, icon key (or null), and text when there is no icon. */
export type SegChoice<K extends StyleKey> = [Style[K], string, string | null, string?];

type PanelBase<K extends StyleKey> = { key: K; label: string; applies: (t: ElementType) => boolean };
export type PanelItem =
  | (PanelBase<'stroke' | 'bg'> & { kind: 'swatch'; values: string[] })
  | (PanelBase<'opacity'> & { kind: 'range' })
  | { [K in StyleKey]: PanelBase<K> & { kind: 'seg'; values: SegChoice<K>[] } }[StyleKey];

// each property: which element types it applies to, and its choices
export const PANEL: PanelItem[] = [
  { key: 'stroke', label: 'Stroke', kind: 'swatch', values: STROKES, applies: t => t !== 'image' },
  { key: 'bg', label: 'Background', kind: 'swatch', values: FILLS, applies: t => SHAPES.has(t) },
  { key: 'fill', label: 'Fill', kind: 'seg', applies: t => SHAPES.has(t),
    values: [['hachure', 'Hatched', 'hachure'], ['cross-hatch', 'Cross-hatched', 'crosshatch'], ['solid', 'Solid', 'solid']] },
  { key: 'sw', label: 'Stroke width', kind: 'seg', applies: t => t !== 'text' && t !== 'image',
    values: [[1, 'Thin', 'sw1'], [2, 'Bold', 'sw2'], [4, 'Extra bold', 'sw4']] },
  { key: 'ss', label: 'Stroke style', kind: 'seg', applies: t => t !== 'text' && t !== 'image',
    values: [['solid', 'Solid', 'ssSolid'], ['dashed', 'Dashed', 'ssDashed'], ['dotted', 'Dotted', 'ssDotted']] },
  { key: 'rough', label: 'Sloppiness', kind: 'seg', applies: t => SHAPES.has(t) || isLinear(t),
    values: [[0, 'Architect', 'r0'], [1, 'Artist', 'r1'], [2, 'Cartoonist', 'r2']] },
  { key: 'round', label: 'Edges', kind: 'seg', applies: t => t === 'rectangle', values: [[false, 'Sharp', 'sharp'], [true, 'Round', 'round']] },
  { key: 'fontSize', label: 'Font size', kind: 'seg', applies: t => t === 'text',
    values: [[20, 'Small', null, 'S'], [28, 'Medium', null, 'M'], [36, 'Large', null, 'L'], [52, 'Extra large', null, 'XL']] },
  { key: 'opacity', label: 'Opacity', kind: 'range', applies: () => true },
];

/** [label, shortcut], or [heading] alone */
export const HELP: [string, string?][] = [
  ['Tools'], ['Select', 'V or 1'], ['Hand (pan)', 'H or hold Space'], ['Rectangle', 'R or 2'], ['Diamond', 'D or 3'], ['Ellipse', 'O or 4'],
  ['Arrow', 'A or 5'], ['Line', 'L or 6'], ['Draw', 'P or 7'], ['Text', 'T or 8'], ['Insert image', '9'], ['Eraser', 'E or 0'], ['Keep tool active', 'Q'],
  ['Editing'], ['Undo', 'Ctrl Z'], ['Redo', 'Ctrl ⇧ Z'], ['Copy / Cut / Paste', 'Ctrl C / X / V'], ['Duplicate', 'Ctrl D or Alt-drag'], ['Delete', 'Del'],
  ['Select all', 'Ctrl A'], ['Group / Ungroup', 'Ctrl G / Ctrl ⇧ G'], ['Bring forward / to front', 'Ctrl ] / Ctrl ⇧ ]'], ['Send backward / to back', 'Ctrl [ / Ctrl ⇧ ['],
  ['Nudge', 'Arrows (⇧ for 10)'], ['Write inside a shape', 'Double-click it'], ['Edit selected text', 'Enter'],
  ['View'], ['Zoom in / out', 'Ctrl + / Ctrl −'], ['Reset zoom', 'Ctrl 0'], ['Zoom to fit', '⇧ 1'], ['Zoom to selection', '⇧ 2'], ['Grid and snapping', 'G'],
  ['Dark mode', '⇧ Alt D'], ['Save / Open file', 'Ctrl S / Ctrl O'], ['Export image', 'Ctrl ⇧ E'],
  ['Together'], ['Comment next to your pointer', '/'], ['Send / discard the comment', 'Enter / Esc'],
];
